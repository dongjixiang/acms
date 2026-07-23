// ACMS — 终端 WebSocket 服务
// 基于 ws + node-pty，提供 bash 终端会话
// 路径: /ws/terminal (同一 wsServer 的新路径)
// 协议：纯文本双向流，特殊消息用 JSON
//   stdin → PTY: 普通文本字符串（包括 \r \n 等控制字符）
//   PTY → stdout: 普通文本字符串
//   特殊: '{"type":"resize","cols":80,"rows":24}' → PTY resize
//   特殊: '{"type":"init","cwd":"/path"}' → 初始工作目录
const { WebSocketServer } = require('ws');

var pty = null;
try {
  pty = require('node-pty');
} catch (e) {
  console.warn('[TerminalWS] node-pty 不可用，终端功能将被禁用:', e.message);
}

// ── 检测可用的 shell ──
function detectShell() {
  if (process.env.SHELL) return process.env.SHELL;

  if (process.platform === 'win32') {
    // 尝试 git-bash 的 bash
    var paths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      process.env.LOCALAPPDATA + '\\Programs\\Git\\bin\\bash.exe',
    ];
    for (var i = 0; i < paths.length; i++) {
      try {
        require('fs').accessSync(paths[i]);
        return paths[i];
      } catch (e) { /* 继续 */ }
    }
    return 'powershell.exe'; // fallback
  }

  return '/bin/bash';
}

var SHELL = detectShell();
console.log('[TerminalWS] Shell:', SHELL);

// ── 激活的终端会话 ──
var activeTerminals = {};

function spawnTerminal(ws, cwd) {
  if (!pty) {
    ws.send(JSON.stringify({ type: 'error', message: 'node-pty 不可用' }));
    ws.close();
    return;
  }

  try {
    var term = pty.spawn(SHELL, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.cwd(),
      env: Object.assign({}, process.env, {
        TERM: 'xterm-256color',
        // Windows 下强制 bash 模式（对 git-bash 有效）
        ...(process.platform === 'win32' ? { MSYSTEM: 'MINGW64' } : {}),
      }),
    });

    var termId = term.pid;
    activeTerminals[termId] = { term: term, ws: ws };

    // PTY → WS (stdout)
    term.onData(function(data) {
      try {
        if (ws.readyState === 1) ws.send(data);
      } catch (e) { /* 连接已关闭 */ }
    });

    // WS → PTY (stdin)
    ws.on('message', function(data) {
      try {
        var msg = typeof data === 'string' ? data : data.toString();

        // 检查特殊 JSON 消息
        if (msg.length > 2 && (msg[0] === '{' || msg[0] === '[')) {
          try {
            var json = JSON.parse(msg);
            if (json.type === 'resize' && json.cols && json.rows) {
              term.resize(json.cols, json.rows);
              return;
            }
            if (json.type === 'init' && json.cwd) {
              // init 在 spawn 时已处理，忽略后续
              return;
            }
          } catch (e) { /* 不是 JSON，当作普通输入 */ }
        }

        term.write(msg);
      } catch (e) {
        console.error('[TerminalWS] message error:', e.message);
      }
    });

    // 连接关闭
    ws.on('close', function() {
      try { term.kill(); } catch (e) { /* 进程已结束 */ }
      delete activeTerminals[termId];
    });

    // 进程退出
    term.onExit(function(ev) {
      try {
        if (ws.readyState === 1) {
          ws.send('\r\n[进程退出，退出码: ' + ev.exitCode + ']');
          ws.send('\r\n[关闭此窗口或按任意键继续]');
        }
      } catch (e) { /* ignore */ }
    });

    return termId;
  } catch (e) {
    console.error('[TerminalWS] spawn error:', e.message);
    try {
      ws.send(JSON.stringify({ type: 'error', message: '启动终端失败: ' + e.message }));
    } catch (e2) { /* ignore */ }
    ws.close();
  }
}

// ── 设置 WS 服务器 ──
function setupTerminalWS(httpServer) {
  if (!pty) {
    console.warn('[TerminalWS] 跳过初始化（node-pty 未安装）');
    return;
  }

  // 使用独立的 HTTP server + 单独端口避免与主 WS 服务器的 WebSocket 扩展协商冲突
  var config = require('../config');
  var termPort = config.termWSPort || 3302;

  var termHttp = require('http').createServer();
  var wss = new WebSocketServer({ server: termHttp, perMessageDeflate: false });

  wss.on('connection', function(ws, req) {
    // 从 URL 查询参数读取初始 cwd
    var url = require('url');
    var params = url.parse(req.url, true).query;
    var cwd = params.cwd || process.cwd();

    console.log('[TerminalWS] 新终端连接, cwd:', cwd);
    spawnTerminal(ws, cwd);
  });

  termHttp.listen(termPort, function() {
    console.log('[TerminalWS] ws://localhost:' + termPort + ' 就绪');
  });

  return wss;
}

module.exports = { setupTerminalWS, spawnTerminal, activeTerminals, detectShell };
