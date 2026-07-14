// 项目 API 路由
const express = require('express');
const router = express.Router();
const projectStore = require('../stores/project-store');
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const eventBus = require('../services/event-bus');

// 创建项目
router.post('/', (req, res) => {
  const { name, slug, description, wikiVaultPath, wikiDocsPath } = req.body;
  if (!name) return res.status(400).json({ error: 'MISSING_NAME' });
  const project = projectStore.create({ name, slug, description, wikiVaultPath, wikiDocsPath });
  res.status(201).json(project);
});

// 项目列表
router.get('/', (req, res) => {
  const all = projectStore.list();
  // 过滤掉系统项目（如 ACMS 自我改进）
  const projects = all.filter(p => !p.system_project);
  res.json(projects);
});

// 项目详情
router.get('/:id', (req, res) => {
  const project = projectStore.getById(req.params.id);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

  const members = projectStore.getMembers(req.params.id);
  const environments = projectStore.getEnvironments(req.params.id);
  const repos = projectStore.getRepos(req.params.id);
  const configs = projectStore.getAllConfigs(req.params.id);
  const reqStats = reqStore.getStats(req.params.id);

  res.json({ ...project, members, environments, repos, configs, reqStats });
});

// ────────────────────────────────────────────────────────────
// GET /api/projects/:id/git-status
// v0.46: Workspace Git 状态可视化 — PM 派任务前能看出 "这个 workspace 能 commit 吗"
//   包含: 是否 git repo / branch / last commit / uncommitted / .gitignore 覆盖 / 历史 commit 成功率
// ────────────────────────────────────────────────────────────
const { spawn } = require('child_process');
const path = require('path');
const WORKSPACE_ROOT = path.join(__dirname, '..', '..', 'workspaces');

function runGit(cwd, cmd) {
  return new Promise(resolve => {
    const child = spawn(cmd, [], { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => resolve({ exitCode: code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

router.get('/:id/git-status', async (req, res) => {
  const project = projectStore.getById(req.params.id);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });
  const slug = project.slug || project.name;
  const wsPath = path.join(WORKSPACE_ROOT, slug);

  try {
    // 1. 是否 git repo
    const isRepo = await runGit(wsPath, 'git rev-parse --is-inside-work-tree');

    if (isRepo.exitCode !== 0) {
      return res.json({
        projectId: req.params.id,
        workspacePath: wsPath,
        isGitRepo: false,
        warning: 'NOT_A_GIT_REPO',
        warningMsg: 'workspace 不是 git 仓库, agent 改动无法提交到 git history',
        suggestion: `在 workspace 跑 \`git init\` 初始化独立 git 仓库, 或 \`git clone <remote>\``,
      });
    }

    // 2. branch + last commit + status
    const branch = await runGit(wsPath, 'git rev-parse --abbrev-ref HEAD');
    const lastCommit = await runGit(wsPath, 'git log -1 --format="%H|%h|%s|%an|%ad" --date=iso');
    const statusShort = await runGit(wsPath, 'git status --porcelain');
    const statusLines = statusShort.stdout.split('\n').filter(Boolean);

    // 解析 last commit
    let lastCommitInfo = null;
    if (lastCommit.exitCode === 0 && lastCommit.stdout) {
      const [hash, short, subject, author, date] = lastCommit.stdout.replace(/"/g, '').split('|');
      lastCommitInfo = { hash, short, subject, author, date };
    }

    // 3. 检查父目录 .gitignore 覆盖 (走路径向上找)
    const path = require('path');
    const fs = require('fs');
    const ignoreRules = [];
    let currentDir = wsPath;
    let depth = 0;
    while (currentDir && depth < 5) {
      const parentGitignore = path.join(currentDir, '.gitignore');
      if (fs.existsSync(parentGitignore)) {
        const content = fs.readFileSync(parentGitignore, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          // 检查规则是否覆盖 wsPath
          // 简单匹配: 通配符 + 路径前缀
          const relWsPath = path.relative(currentDir, wsPath).replace(/\\/g, '/');
          if (relWsPath === trimmed ||
              trimmed === relWsPath.split('/')[0] ||
              (trimmed.endsWith('/') && relWsPath.startsWith(trimmed)) ||
              relWsPath.split('/').some(seg => seg.match(new RegExp('^' + trimmed.replace(/\*/g, '.*') + '$')))) {
            ignoreRules.push({ file: parentGitignore, rule: trimmed, dir: path.basename(currentDir) });
          }
        }
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
      depth++;
    }

    // 4. 历史 commit 成功率 (从 events 表查 agent_git_commit 成功数)
    // v0.46 简化: 通过 events 表查 task.submitted 后的 task.review 状态
    //   commit 成功 = git log 显示新 hash; 失败 = task rejected
    const { collection } = require('../db/connection');
    let recentCommitStats = { total: 0, success: 0, failed: 0, successRate: null };
    try {
      const tasksCol = collection('tasks');
      const tasks = tasksCol.find(t => {
        try {
          const d = typeof t.doc === 'string' ? JSON.parse(t.doc) : t.doc;
          return d.project_id === req.params.id && d.assigned_to;
        } catch { return false; }
      });
      for (const t of tasks) {
        const d = typeof t.doc === 'string' ? JSON.parse(t.doc) : t.doc;
        // 看 submissions 里 git commit 成功与否
        const subs = typeof d.submissions === 'string' ? JSON.parse(d.submissions || '[]') : (d.submissions || []);
        for (const s of subs) {
          if (s.steps && typeof s.steps === 'string' && s.steps.includes('git commit')) {
            recentCommitStats.total++;
            if (s.steps.includes('exit=0') && s.commitHash) {
              recentCommitStats.success++;
            } else {
              recentCommitStats.failed++;
            }
          }
        }
      }
      if (recentCommitStats.total > 0) {
        recentCommitStats.successRate = Math.round(recentCommitStats.success / recentCommitStats.total * 100);
      }
    } catch (e) { /* ignore history error */ }

    // 5. 评估健康度 + 警告
    const uncommitted = statusLines.length;
    const isCoveredByGitignore = ignoreRules.length > 0;
    let warning = null, warningMsg = null, suggestion = null;

    if (isCoveredByGitignore) {
      warning = 'WORKSPACE_GITIGNORED';
      warningMsg = `workspace 被父目录 .gitignore 覆盖 (${ignoreRules.map(r => r.rule).join(', ')}), agent 改文件不会被 commit`;
      suggestion = '在 workspace 内 `git init` 初始化独立 git 仓库, 摆脱父目录 .gitignore 影响';
    } else if (uncommitted > 0) {
      warning = 'UNCOMMITTED_CHANGES';
      warningMsg = `${uncommitted} 个文件未提交`;
      suggestion = '运行 `git add -A && git commit -m "..."` 提交';
    } else if (recentCommitStats.failed > recentCommitStats.success && recentCommitStats.total >= 3) {
      warning = 'COMMIT_FAILING';
      warningMsg = `最近 ${recentCommitStats.total} 次 commit, ${recentCommitStats.failed} 次失败 (${recentCommitStats.successRate}%)`;
      suggestion = '检查 git 状态 / 父目录 .gitignore 覆盖 / agent_git_commit 工具的 shell 转义';
    }

    res.json({
      projectId: req.params.id,
      workspacePath: wsPath,
      isGitRepo: true,
      branch: branch.stdout || 'main',
      lastCommit: lastCommitInfo,
      uncommittedFiles: uncommitted,
      uncommittedSample: statusLines.slice(0, 5),
      ignoreRules,
      recentCommitStats,
      warning,
      warningMsg,
      suggestion,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[projects] git-status error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 更新项目
router.patch('/:id', (req, res) => {
  const project = projectStore.update(req.params.id, req.body);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });
  res.json(project);
});

// 添加成员
router.post('/:id/members', (req, res) => {
  projectStore.addMember(req.params.id, req.body);
  res.json({ success: true });
});

// 添加环境
router.post('/:id/environments', (req, res) => {
  const rowId = projectStore.addEnvironment(req.params.id, req.body);
  res.status(201).json({ id: rowId });
});

// 添加仓库
router.post('/:id/repos', (req, res) => {
  const rowId = projectStore.addRepo(req.params.id, req.body);
  res.status(201).json({ id: rowId });
});

// 设置配置
router.post('/:id/configs', (req, res) => {
  projectStore.setConfig(req.params.id, req.body);
  res.json({ success: true });
});

// 删除配置
router.delete('/:id/configs/:key', (req, res) => {
  const { collection } = require('../db/connection');
  collection('project_configs').remove(c => c.project_id === req.params.id && c.key === req.params.key);
  res.json({ success: true });
});

// 删除项目（级联删除关联数据）
router.delete('/:id', (req, res) => {
  const { collection } = require('../db/connection');
  const project = projectStore.getById(req.params.id);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

  collection('project_members').remove(m => m.project_id === req.params.id);
  collection('project_environments').remove(e => e.project_id === req.params.id);
  collection('project_repos').remove(r => r.project_id === req.params.id);
  collection('project_configs').remove(c => c.project_id === req.params.id);
  collection('requirements').remove(r => r.project_id === req.params.id);
  collection('tasks').remove(t => t.project_id === req.params.id);
  collection('clarification_threads').remove(c => {
    const foundReq = collection('requirements').findOne(r => r.id === c.requirement_id);
    return !foundReq || foundReq.project_id === req.params.id;
  });
  collection('projects').remove(p => p.id === req.params.id);
  res.json({ success: true, message: `项目 ${project.name} 已删除` });
});

module.exports = router;
