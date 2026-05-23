// Workspace 服务 — 项目交付物文件管理
const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', 'workspaces');

class WorkspaceService {

  /**
   * 初始化项目工作区 — 创建完整目录结构 + README
   */
  init(projectSlug) {
    const wsPath = path.join(WORKSPACE_ROOT, projectSlug);
    if (fs.existsSync(wsPath)) return wsPath;

    const dirs = ['requirements', 'exports', 'code', 'deploy'];
    for (const d of dirs) {
      fs.mkdirSync(path.join(wsPath, d), { recursive: true });
    }

    // 自动生成 README.md
    const readme = `# ${projectSlug}\n\n> ACMS 项目工作区 — 自动生成于 ${new Date().toISOString().split('T')[0]}\n\n## 📂 目录说明\n\n| 目录 | 用途 |\n|------|------|\n| requirements/ | 需求文档（AI 自动保存） |\n| exports/ | 导出文件（.docx / .pdf） |\n| code/ | 代码（Agent 产出 / 原型） |\n| deploy/ | 部署配置 |\n\n## 📝 备注\n\n（可自由编辑，ACMS 不会覆盖此区域）\n`;
    fs.writeFileSync(path.join(wsPath, 'README.md'), readme, 'utf-8');

    return wsPath;
  }

  /**
   * 获取项目工作区路径
   */
  getPath(projectSlug) {
    return path.join(WORKSPACE_ROOT, projectSlug);
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
   */
  listFiles(projectSlug) {
    const wsPath = path.join(WORKSPACE_ROOT, projectSlug);
    if (!fs.existsSync(wsPath)) return [];

    const result = [];
    const walk = (dir, prefix = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const relPath = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
          walk(path.join(dir, e.name), relPath);
        } else {
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
        resolve({ stdout: stdout.substring(0, 50000), stderr: stderr.substring(0, 50000), exitCode: code });
      });

      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ stdout: '', stderr: e.message, exitCode: -1 });
      });
    });
  }
}

module.exports = new WorkspaceService();
