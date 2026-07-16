// Workspace 服务 — 项目交付物文件管理
const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', 'workspaces');

// v0.45: 隔离工作区根目录（scratch 目录）
const SCRATCH_ROOT = path.join(__dirname, '..', '..', 'scratch');

/**
 * 创建 agent 的隔离 scratch 工作区
 * 返回 { workspacePath, cleanup } — cleanup 函数用于执行完后合并结果
 */
function createScratchWorkspace(agentId, projectId) {
  const agentDir = path.join(SCRATCH_ROOT, `${projectId}_${agentId}_${Date.now()}`);
  fs.mkdirSync(agentDir, { recursive: true });

  // 复制项目 workspace 到 scratch（agent 从这里开始工作）
  const projectSlug = projectId;
  const srcWs = path.join(WORKSPACE_ROOT, projectSlug);
  if (fs.existsSync(srcWs)) {
    copyRecursive(srcWs, agentDir);
  }

  return {
    workspacePath: agentDir,
    agentId,
    projectId,
    cleanup: function() {
      // 清理 scratch 目录
      try {
        const { execSync } = require('child_process');
        execSync(`rm -rf "${agentDir}"`, { stdio: 'pipe' });
      } catch (e) {
        // Windows cleanup
        try { require('fs').rmSync(agentDir, { recursive: true, force: true }); } catch (_) {}
      }
    },
  };
}

/**
 * 递归复制目录
 */
function copyRecursive(src, dest) {
  const entries = require('fs').readdirSync(src);
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const stat = require('fs').statSync(srcPath);
    if (stat.isDirectory()) {
      require('fs').mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      require('fs').copyFileSync(srcPath, destPath);
    }
  }
}

// 默认跳过的目录（构建产物 / 依赖 / 版本控制）
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn',
  'dist', 'build', '.next', '.nuxt', 'out', 'target',
  '__pycache__', '.venv', 'venv', '.env',
  '.cache', '.parcel-cache',
]);

class WorkspaceService {

  /**
   * 初始化项目工作区 — 创建完整目录结构 + README
   */
  init(projectSlug) {
    const wsPath = path.join(WORKSPACE_ROOT, projectSlug);
    if (fs.existsSync(wsPath)) return wsPath;

    const dirs = ['requirements', 'exports', 'code', 'deploy', 'wiki'];
    for (const d of dirs) {
      fs.mkdirSync(path.join(wsPath, d), { recursive: true });
    }

    // 自动生成 README.md
    const readme = '# ' + projectSlug + '\n\n> ACMS 项目工作区 — 自动生成于 ' + new Date().toISOString().split('T')[0] + '\n\n## 📂 目录说明\n\n| 目录 | 用途 |\n|------|------|\n| requirements/ | 需求文档（AI 自动保存） |\n| exports/ | 导出文件（.docx / .pdf） |\n| code/ | 代码（Agent 产出 / 原型） |\n| deploy/ | 部署配置 |\n| wiki/ | 项目知识库（默认 Wiki 路径） |\n\n## 📝 备注\n\n（可自由编辑，ACMS 不会覆盖此区域）\n';
    fs.writeFileSync(path.join(wsPath, 'README.md'), readme, 'utf-8');

    // v0.48: 自动套 .gitignore 模板（已有则跳过，保护子项目手动配置）
    const gitignorePath = path.join(wsPath, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      const tplPath = path.join(__dirname, '..', '..', 'templates', 'workspace-gitignore.template');
      if (fs.existsSync(tplPath)) {
        fs.copyFileSync(tplPath, gitignorePath);
      }
    }

    return wsPath;
  }

  /**
   * 获取项目工作区路径
   */
  getPath(projectSlug) {
    return path.join(WORKSPACE_ROOT, projectSlug);
  }

  /**
   * v0.X: getProjectRoot 别名（修复 task-agent.js agent_typescheck 引用缺失）
   */
  getProjectRoot(projectSlug) {
    return this.getPath(projectSlug);
  }

  /**
   * 保存需求 Markdown 文档
   */
  saveRequirementDoc(projectSlug, reqId, title, content) {
    const dir = path.join(WORKSPACE_ROOT, projectSlug, 'requirements');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
    const filePath = path.join(dir, `${reqId}-${safeTitle}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * 保存导出文件（docx / pdf）
   */
  saveExport(projectSlug, filename, buffer) {
    const dir = path.join(WORKSPACE_ROOT, projectSlug, 'exports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  /**
   * 保存代码文件
   */
  saveCode(projectSlug, relativePath, content) {
    const fullPath = path.join(WORKSPACE_ROOT, projectSlug, 'code', relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
  }

  /**
   * 列出工作区文件（递归，树形结构）
   * @param {string} projectSlug
   * @param {object} [options] - { showAll: true } 不过滤目录
   */
  listFiles(projectSlug, options = {}) {
    const wsPath = path.join(WORKSPACE_ROOT, projectSlug);
    if (!fs.existsSync(wsPath)) return [];

    const result = [];
    const showAll = options.showAll === true;

    const walk = (dir, prefix = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const relPath = prefix ? `${prefix}/${e.name}` : e.name;

        if (e.isDirectory()) {
          // 跳过已知的构建产物/依赖目录（除非 showAll）
          if (!showAll && SKIP_DIRS.has(e.name)) continue;
          walk(path.join(dir, e.name), relPath);
        } else {
          // v0.26 fix (#3): 默认跳过 _* 临时文件（agent 任务不应把 _tmp_*.js 当参考代码）
          //   根因：T-MRDO0ECU agent 一直搜 GameState 命中 _tmp_part2.js，浪费 3 轮追无关代码
          if (!showAll && e.name.startsWith('_')) continue;
          const stat = fs.statSync(path.join(dir, e.name));
          result.push({
            name: e.name,
            path: relPath,
            size: stat.size,
            modified: stat.mtime.toISOString(),
            type: path.extname(e.name).toLowerCase(),
          });
        }
      }
    };

    walk(wsPath);
    return result;
  }

  /**
   * 读取文件内容
   */
  readFile(projectSlug, relativePath) {
    const safe = path.normalize(relativePath).replace(/^(\.\.(\/|\\))+/, '');
    const fullPath = path.join(WORKSPACE_ROOT, projectSlug, safe);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf-8');
  }

  /**
   * 写入文件到工作区
   */
  writeFile(projectSlug, relativePath, content) {
    const safe = path.normalize(relativePath).replace(/^(\.\.(\/|\\))+/, '');
    const fullPath = path.join(WORKSPACE_ROOT, projectSlug, safe);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return { path: relativePath, size: Buffer.byteLength(content, 'utf-8'), written: true };
  }

  /**
   * 删除工作区文件
   */
  deleteFile(projectSlug, relativePath) {
    const safe = path.normalize(relativePath).replace(/^(\.\.(\/|\\))+/, '');
    const fullPath = path.join(WORKSPACE_ROOT, projectSlug, safe);
    if (!fs.existsSync(fullPath)) return { deleted: false, reason: 'not_found' };
    // 禁止删除目录
    if (fs.statSync(fullPath).isDirectory()) return { deleted: false, reason: 'is_directory' };
    fs.unlinkSync(fullPath);
    return { deleted: true, path: relativePath };
  }

  /**
   * 在工作区执行 shell 命令（沙箱）
   */
  exec(projectSlug, { cwd = '', cmd = '', timeout = 30000 }) {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const wsPath = path.join(WORKSPACE_ROOT, projectSlug);
      const workDir = cwd ? path.join(wsPath, cwd) : wsPath;

      // 安全检查：工作目录必须在 workspace 内
      if (!workDir.startsWith(wsPath)) {
        return resolve({ stdout: '', stderr: 'Security: cwd outside workspace', exitCode: -1 });
      }

      // 命令白名单
      const ALLOWED = ['node', 'npm', 'npx', 'python', 'python3', 'pytest',
        'pip', 'git', 'ls', 'dir', 'cat', 'echo', 'mkdir', 'cp', 'mv',
        'tsc', 'go', 'cargo', 'make', 'cmake', 'docker', 'kubectl'];
      const cmdBase = cmd.split(/\s+/)[0].replace(/^.*[/\\]/, '');
      if (!ALLOWED.includes(cmdBase)) {
        return resolve({ stdout: '', stderr: `Security: command not allowed: ${cmdBase}`, exitCode: -1 });
      }

      // 禁止危险参数
      const dangerous = ['rm -rf', 'sudo', '> /dev', '| sh', '; rm', '&& rm'];
      for (const d of dangerous) {
        if (cmd.includes(d)) {
          return resolve({ stdout: '', stderr: `Security: dangerous pattern: ${d}`, exitCode: -1 });
        }
      }

      const child = spawn(cmd, [], {
        cwd: workDir, shell: true, timeout,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '', stderr = '';
      child.stdout.on('data', d => stdout += d.toString());
      child.stderr.on('data', d => stderr += d.toString());

      const timer = setTimeout(() => { child.kill(); }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout: stdout.substring(0, 200000), stderr: stderr.substring(0, 200000), exitCode: code });
      });

      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ stdout: '', stderr: e.message, exitCode: -1 });
      });
    });
  }
}

module.exports = new WorkspaceService();

// v0.45: 隔离工作区工具（导出到 module.exports 之外）
module.exports.createScratchWorkspace = createScratchWorkspace;
module.exports.copyRecursive = copyRecursive;
