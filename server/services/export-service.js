// Markdown → docx 导出服务 (Pandoc wrapper)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_WIN = process.platform === 'win32';
const BIN_EXT = IS_WIN ? '.exe' : '';

/**
 * 查找 pandoc 可执行文件 (跨平台)
 * 优先级: 包管理器路径 → 系统标准路径 → PATH
 */
function findPandoc() {
  // ── Windows 包管理器路径 ──
  if (IS_WIN) {
    // Winget 安装目录
    const wingetDir = path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft', 'WinGet', 'Packages',
      'JohnMacFarlane.Pandoc_Microsoft.Winget.Source_8wekyb3d8bbwe'
    );
    try {
      const entries = fs.readdirSync(wingetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('pandoc-')) {
          const bin = path.join(wingetDir, entry.name, `pandoc${BIN_EXT}`);
          if (fs.existsSync(bin)) return bin;
        }
      }
    } catch (e) { /* not in winget dir */ }

    // Chocolatey / 默认安装路径
    const defaultWin = `C:\\Program Files\\Pandoc\\pandoc${BIN_EXT}`;
    if (fs.existsSync(defaultWin)) return defaultWin;
  }

  // ── Linux / macOS 标准路径 ──
  const nixPaths = ['/usr/bin/pandoc', '/usr/local/bin/pandoc'];
  for (const p of nixPaths) {
    if (fs.existsSync(p)) return p;
  }

  // ── 系统 PATH 查找 (跨平台) ──
  try {
    const cmd = IS_WIN ? 'where pandoc 2>nul' : 'which pandoc 2>/dev/null';
    const result = require('child_process').execSync(cmd, { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result.split('\n')[0].trim())) {
      return result.split('\n')[0].trim();
    }
  } catch (e) { /* not in PATH */ }

  return null;
}

/**
 * 将 Markdown 文本转换为 docx Buffer
 * @param {string} markdown - Markdown 内容
 * @param {object} options - { title }
 * @returns {Promise<Buffer>} docx 文件的二进制内容
 */
function mdToDocx(markdown, options = {}) {
  return new Promise((resolve, reject) => {
    const pandocPath = findPandoc();
    if (!pandocPath) {
      return reject(new Error(
        'Pandoc 未安装或不可用。\n' +
        'Windows: winget install --id JohnMacFarlane.Pandoc -e\n' +
        'Linux:   sudo apt install pandoc         (Debian/Ubuntu)\n' +
        '         或访问 https://pandoc.org/installing.html'
      ));
    }

    const args = ['--from', 'markdown+smart', '--to', 'docx', '-o', '-'];
    if (options.title) args.push('--metadata', `title=${options.title}`);

    const pandoc = spawn(pandocPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';

    pandoc.stdout.on('data', (d) => chunks.push(d));
    pandoc.stderr.on('data', (d) => { stderr += d.toString(); });

    pandoc.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`Pandoc exited with code ${code}: ${stderr}`));
    });

    pandoc.on('error', (e) => reject(new Error(`Pandoc 执行失败: ${e.message}`)));
    pandoc.stdin.write(markdown, 'utf-8');
    pandoc.stdin.end();
  });
}

module.exports = { mdToDocx };
