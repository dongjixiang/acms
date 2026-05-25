// 项目交付物打包服务 — 流式 zip 打包
const archiver = require('archiver');

/**
 * 创建工作区 zip 流
 * @param {string} workspacePath - 工作区绝对路径
 * @returns {Archiver} archiver zip stream
 */
function createWorkspaceBundle(workspacePath) {
  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') console.warn('[Bundle] 文件缺失:', err.path);
    else throw err;
  });

  archive.on('error', (err) => { throw err; });

  // 添加整个目录树，跳过常见忽略项
  archive.glob('**/*', {
    cwd: workspacePath,
    ignore: ['node_modules/**', '.git/**', '__pycache__/**', '*.log', '.DS_Store'],
    dot: false,
  });

  archive.finalize();
  return archive;
}

module.exports = { createWorkspaceBundle };
