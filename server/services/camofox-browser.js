// Camofox Browser 集成 - 用于绕过反爬检测
// Camofox 是基于 Camoufox (Firefox 魔改版) 的 REST API 浏览器
// API: http://localhost:9377

const http = require('http');
const https = require('https');

const CAMOFOX_URL = process.env.CAMOFOX_URL || 'http://localhost:9377';
const API_KEY = process.env.CAMOFOX_API_KEY || '';

let _sessionId = null;
let _lastActivity = Date.now();
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟无活动后清理

/**
 * HTTP 请求包装
 */
function camofoxRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CAMOFOX_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 9377,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    if (API_KEY) {
      options.headers['X-API-Key'] = API_KEY;
    }
    
    const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * 获取或创建会话
 */
async function getSessionId() {
  // 检查会话是否过期
  if (_sessionId && Date.now() - _lastActivity < SESSION_TIMEOUT_MS) {
    return _sessionId;
  }
  
  // 创建新会话
  try {
    const resp = await camofoxRequest('POST', '/sessions');
    _sessionId = resp.sessionId;
    _lastActivity = Date.now();
    return _sessionId;
  } catch (e) {
    console.error('[camofox] Failed to create session:', e.message);
    return null;
  }
}

/**
 * 创建标签页
 */
async function createTab(userId = 'acms-agent') {
  try {
    const sessionId = await getSessionId();
    if (!sessionId) throw new Error('No session');
    
    const resp = await camofoxRequest('POST', `/tabs?userId=${userId}`, {
      sessionId
    });
    _lastActivity = Date.now();
    return resp;
  } catch (e) {
    console.error('[camofox] Failed to create tab:', e.message);
    return null;
  }
}

/**
 * 导航到 URL
 */
async function navigate(tabId, url, userId = 'acms-agent') {
  try {
    const resp = await camofoxRequest('POST', `/tabs/${tabId}/navigate?userId=${userId}`, {
      url
    });
    _lastActivity = Date.now();
    return resp;
  } catch (e) {
    console.error('[camofox] Failed to navigate:', e.message);
    return null;
  }
}

/**
 * 获取页面快照（主要内容）
 */
async function getSnapshot(tabId, userId = 'acms-agent') {
  try {
    const resp = await camofoxRequest('GET', `/tabs/${tabId}/snapshot?userId=${userId}&full=true`);
    _lastActivity = Date.now();
    return resp;
  } catch (e) {
    console.error('[camofox] Failed to get snapshot:', e.message);
    return null;
  }
}

/**
 * 获取页面标题
 */
async function getTitle(tabId, userId = 'acms-agent') {
  try {
    const resp = await camofoxRequest('GET', `/tabs/${tabId}/title?userId=${userId}`);
    _lastActivity = Date.now();
    return resp.title;
  } catch (e) {
    return null;
  }
}

/**
 * 获取页面纯文本内容
 */
async function getText(tabId, userId = 'acms-agent') {
  try {
    const resp = await camofoxRequest('GET', `/tabs/${tabId}/text?userId=${userId}`);
    _lastActivity = Date.now();
    return resp.text || '';
  } catch (e) {
    return '';
  }
}

/**
 * 抓取网页内容（主入口）
 */
async function fetchPage(url, options = {}) {
  const { max_length = 5000, userId = 'acms-agent' } = options;
  
  let tab = null;
  try {
    // 创建标签页
    tab = await createTab(userId);
    if (!tab || !tab.tabId) {
      return { error: 'Failed to create tab', url };
    }
    
    const tabId = tab.tabId;
    
    // 导航
    const navResp = await navigate(tabId, url, userId);
    if (navResp?.error) {
      return { error: navResp.error, url };
    }
    
    // 等待页面加载
    await new Promise(r => setTimeout(r, 3000));
    
    // 获取快照
    const snapshot = await getSnapshot(tabId, userId);
    const title = await getTitle(tabId, userId);
    
    // 提取内容
    let content = '';
    if (snapshot?.snapshot) {
      // 清理快照格式，提取纯文本
      content = snapshot.snapshot
        .replace(/\[([^\]]+)\]\s*/g, '$1')  // 移除元素类型前缀
        .replace(/\s+/g, ' ')  // 合并空白
        .trim();
    }
    
    // 截断
    if (content.length > max_length) {
      content = content.substring(0, max_length) + '...[已截断]';
    }
    
    return {
      ok: true,
      url,
      finalUrl: snapshot?.url || url,
      title: title || 'Unknown',
      content,
      length: content.length,
      fetchedAt: new Date().toISOString(),
    };
    
  } catch (e) {
    console.error('[camofox] Fetch error:', e.message);
    return { error: e.message, url };
  } finally {
    // 关闭标签页
    if (tab?.tabId) {
      try {
        await camofoxRequest('DELETE', `/tabs/${tab.tabId}?userId=${userId}`);
      } catch (e) {}
    }
  }
}

/**
 * 检查 Camofox 是否可用
 */
async function isAvailable() {
  try {
    const resp = await camofoxRequest('GET', '/health');
    return resp?.ok === true;
  } catch (e) {
    return false;
  }
}

/**
 * 启动 Camofox 服务器（如果未运行）
 */
async function startServer() {
  // 检查是否已运行
  const available = await isAvailable();
  if (available) {
    return { ok: true, message: 'Camofox already running' };
  }
  
  // 尝试启动
  try {
    const { spawn } = require('child_process');
    const path = require('path');
    
    // 找 camofox-browser 的 bin
    const binPath = path.join(__dirname, '../../node_modules/@askjo/camofox-browser/bin/camofox-browser.js');
    
    const server = spawn('node', [binPath], {
      stdio: 'pipe',
      detached: true,
      env: { ...process.env, CAMOFOX_PORT: '9377' }
    });
    
    server.unref(); // 不阻塞进程退出
    
    // 等待启动
    await new Promise(r => setTimeout(r, 5000));
    
    const available2 = await isAvailable();
    if (available2) {
      return { ok: true, message: 'Camofox started' };
    } else {
      return { ok: false, message: 'Camofox failed to start' };
    }
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

module.exports = {
  fetchPage,
  isAvailable,
  startServer,
  // 内部 API（供测试）
  createTab,
  navigate,
  getSnapshot,
  getTitle,
  getText,
  camofoxRequest,
};
