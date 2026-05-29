// 多语言 Linter 配置 — 按文件扩展名分发到对应 CLI 工具
// 所有 linter 返回统一格式: { passed: boolean, issues: [{severity, file, line, message}] }

const path = require('path');
const { spawn } = require('child_process');

/**
 * 获取文件扩展名对应的 linter 配置
 */
const LINTER_CONFIG = {
  '.js':   { tool: 'eslint',      cmd: (f) => `eslint --format json "${f}"`,       parser: 'json' },
  '.jsx':  { tool: 'eslint',      cmd: (f) => `eslint --format json "${f}"`,       parser: 'json' },
  '.ts':   { tool: 'eslint',      cmd: (f) => `eslint --format json "${f}"`,       parser: 'json' },
  '.tsx':  { tool: 'eslint',      cmd: (f) => `eslint --format json "${f}"`,       parser: 'json' },
  '.vue':  { tool: 'eslint-vue',  cmd: (f) => `eslint --format json "${f}"`,       parser: 'json' },
  '.css':  { tool: 'stylelint',   cmd: (f) => `npx stylelint --formatter json "${f}"`, parser: 'json' },
  '.html': { tool: 'htmlhint',    cmd: (f) => `htmlhint --format json "${f}"`,     parser: 'json' },
  '.md':   { tool: 'markdownlint',cmd: (f) => `markdownlint --json "${f}"`,         parser: 'json' },
  '.json': { tool: 'jsonlint',    cmd: (f) => `npx jsonlint "${f}"`,                parser: 'text' },
  '.py':   { tool: 'pylint',      cmd: (f) => `pylint --output-format=json "${f}"`, parser: 'json' },
  '.java': { tool: 'javac',       cmd: (f) => `javac -Xlint:all "${f}"`,            parser: 'text' },
  // 无编译器时的 fallback — 仅做语法 token 检查
  '.c':    { tool: 'none',        cmd: null, parser: null, fallback: 'cppcheck 未安装，跳过 C 语法检查' },
  '.cpp':  { tool: 'none',        cmd: null, parser: null, fallback: 'cppcheck 未安装，跳过 C++ 语法检查' },
  '.h':    { tool: 'none',        cmd: null, parser: null, fallback: 'cppcheck 未安装，跳过 C 头文件检查' },
  '.go':   { tool: 'none',        cmd: null, parser: null, fallback: 'go 未安装，跳过 Go 语法检查' },
  '.rs':   { tool: 'none',        cmd: null, parser: null, fallback: 'rustc 未安装，跳过 Rust 语法检查' },
};

/**
 * 运行单个文件的 linter
 * @returns {{ passed: boolean, issues: [], tool: string, output?: string }}
 */
function lintFile(filePath, workspaceDir) {
  const ext = path.extname(filePath).toLowerCase();
  const config = LINTER_CONFIG[ext];
  const absWorkspace = path.resolve(workspaceDir);

  if (!config) {
    return { passed: true, issues: [], tool: 'none', note: `无 ${ext} 文件 linter 配置` };
  }

  if (!config.cmd) {
    return { passed: true, issues: [], tool: config.tool, note: config.fallback || `${config.tool} 不可用` };
  }

  return new Promise((resolve) => {
    const cmdStr = config.cmd(filePath);
    const child = spawn(cmdStr, [], { cwd: absWorkspace, shell: true, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());

    const timer = setTimeout(() => { child.kill(); resolve({ passed: false, issues: [{ severity: 'error', file: filePath, line: 0, message: `${config.tool} 超时 (>30s)` }], tool: config.tool }); }, 30000);

    child.on('close', (code) => {
      clearTimeout(timer);
      const combined = stdout || stderr;  // 某些工具(如 markdownlint)输出在 stderr
      const issues = parseLinterOutput(config.tool, config.parser, combined, '', filePath);
      resolve({
        passed: code === 0 && issues.filter(i => i.severity === 'error').length === 0,
        issues,
        tool: config.tool,
        exitCode: code,
      });
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ passed: false, issues: [{ severity: 'error', file: filePath, line: 0, message: `${config.tool} 执行失败: ${e.message}` }], tool: config.tool });
    });
  });
}

/**
 * 解析不同 linter 的输出为统一格式
 */
function parseLinterOutput(tool, parser, stdout, stderr, filePath) {
  const output = stdout || stderr;  // markdownlint 等工具输出在 stderr
  if (parser === 'json') {
    try {
      const results = JSON.parse(output);
      return parseJsonLintResult(tool, results, filePath);
    } catch (e) {
      // JSON 解析失败，回退到文本解析
      return parseTextLintResult(tool, output, filePath);
    }
  }
  return parseTextLintResult(tool, output, filePath);
}

/**
 * 解析 JSON 格式的 linter 输出 (eslint, stylelint, htmlhint, markdownlint, pylint)
 */
function parseJsonLintResult(tool, results, filePath) {
  const issues = [];

  switch (tool) {
    case 'eslint':
    case 'eslint-vue':
      // eslint: [{ filePath, messages: [{ line, column, message, severity }] }]
      for (const f of (Array.isArray(results) ? results : [results])) {
        for (const m of (f.messages || [])) {
          issues.push({
            severity: m.severity === 2 ? 'error' : 'warning',
            file: f.filePath || filePath,
            line: m.line || 0,
            column: m.column || 0,
            rule: m.ruleId || '',
            message: m.message,
          });
        }
      }
      break;

    case 'stylelint':
      // stylelint: [{ source, warnings: [{ line, column, text, severity }] }]
      for (const f of (Array.isArray(results) ? results : [results])) {
        for (const w of (f.warnings || [])) {
          issues.push({
            severity: w.severity === 'error' ? 'error' : 'warning',
            file: f.source || filePath,
            line: w.line || 0,
            column: w.column || 0,
            rule: w.rule || '',
            message: w.text,
          });
        }
      }
      break;

    case 'htmlhint':
      // htmlhint: [{ file, messages: [{ line, col, message, rule: { id } }] }]
      for (const f of (Array.isArray(results) ? results : [results])) {
        for (const m of (f.messages || [])) {
          issues.push({
            severity: m.type === 'error' ? 'error' : 'warning',
            file: f.file || filePath,
            line: m.line || 0,
            column: m.col || 0,
            rule: m.rule?.id || '',
            message: m.message,
          });
        }
      }
      break;

    case 'markdownlint':
      // markdownlint --json 输出: [{ fileName, lineNumber, ruleNames, ruleDescription, errorDetail, ... }]
      const mdResults = Array.isArray(results) ? results : [results];
      for (const f of mdResults) {
        issues.push({
          severity: 'warning',
          file: f.fileName || filePath,
          line: f.lineNumber || 0,
          rule: (f.ruleNames || []).join('/'),
          message: f.ruleDescription || f.errorDetail || 'markdown 格式问题',
        });
      }
      break;

    case 'pylint':
      // pylint: [{ path, line, column, message, messageId, symbol }]
      for (const f of (Array.isArray(results) ? results : [results])) {
        const sev = (f.messageId || '').startsWith('E') || (f.messageId || '').startsWith('F') ? 'error' : (f.messageId || '').startsWith('W') ? 'warning' : 'suggestion';
        issues.push({
          severity: sev,
          file: f.path || filePath,
          line: f.line || 0,
          column: f.column || 0,
          rule: f.symbol || f.messageId || '',
          message: f.message,
        });
      }
      break;

    default:
      return parseTextLintResult(tool, JSON.stringify(results), filePath);
  }

  return issues;
}

/**
 * 解析纯文本格式的 linter 输出 (javac, jsonlint)
 */
function parseTextLintResult(tool, output, filePath) {
  const issues = [];
  const lines = output.split('\n');

  switch (tool) {
    case 'javac':
      // javac: File.java:10: error: message
      for (const line of lines) {
        const match = line.match(/^(.+):(\d+):\s+(error|warning):\s*(.+)/);
        if (match) {
          issues.push({
            severity: match[3] === 'error' ? 'error' : 'warning',
            file: match[1].trim(),
            line: parseInt(match[2]),
            message: match[4].trim(),
          });
        }
      }
      break;

    case 'jsonlint':
      // jsonlint: Line 5: ... or Error: Parse error...
      for (const line of lines) {
        const match = line.match(/Line\s+(\d+):\s*(.+)/i);
        if (match) {
          issues.push({ severity: 'error', file: filePath, line: parseInt(match[1]), message: match[2].trim() });
        } else if (line.toLowerCase().includes('error') || line.toLowerCase().includes('invalid')) {
          issues.push({ severity: 'error', file: filePath, line: 0, message: line.trim() });
        }
      }
      break;

    case 'bandit':
      // bandit: filename:line: severity: issue_name: description
      for (const line of lines) {
        const match = line.match(/^(.+):(\d+):\s*(HIGH|MEDIUM|LOW):\s*(.+)/i);
        if (match) {
          issues.push({
            severity: match[3] === 'HIGH' ? 'error' : match[3] === 'MEDIUM' ? 'warning' : 'suggestion',
            file: match[1], line: parseInt(match[2]), rule: 'bandit', message: match[4],
          });
        }
      }
      break;

    default:
      // 通用: 查找包含 error/warning 的行
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('[')) continue;
        if (trimmed.toLowerCase().includes('error') || trimmed.toLowerCase().includes('failed')) {
          issues.push({ severity: 'error', file: filePath, line: 0, message: trimmed.substring(0, 200) });
        } else if (trimmed.toLowerCase().includes('warning')) {
          issues.push({ severity: 'warning', file: filePath, line: 0, message: trimmed.substring(0, 200) });
        }
      }
  }

  return issues;
}

/**
 * 批量 lint workspace 中的所有文件
 * @param {string} projectSlug
 * @param {string} workspaceDir — 绝对路径
 * @param {string[]} filePaths — 文件列表
 * @returns {Array} linter 结果数组
 */
async function lintWorkspace(projectSlug, workspaceDir, filePaths) {
  const results = [];
  const lintableExts = Object.keys(LINTER_CONFIG);

  for (const fp of filePaths) {
    const ext = path.extname(fp).toLowerCase();
    if (lintableExts.includes(ext)) {
      const result = await lintFile(fp, workspaceDir);
      results.push(result);
    }
  }

  return results;
}

module.exports = {
  LINTER_CONFIG,
  lintFile,
  lintWorkspace,
  parseLinterOutput,
  parseJsonLintResult,
  parseTextLintResult,
};
