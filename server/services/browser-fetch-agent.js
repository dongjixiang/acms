// 浏览器辅助抓取 — agent-browser CLI（v0.79，2026-08-01）
//
// 使用 agent-browser CLI（Hermes 同款），绕过百度等反爬检测。
// agent-browser 使用 CDP 直接控制 Chrome，比 Puppeteer 更难检测。
//
// 架构：
//   - 每次 fetch 启动一个临时 agent-browser session
//   - 返回 title + text + html
//
// 依赖：
//   npm install -g agent-browser  或  npx agent-browser

const { execSync, spawn } = require('child_process');
const path = require('path');
const os = require('os');

const BROWSER_TIMEOUT_MS = 45000;

/**
 * 执行 agent-browser 命令
 */
function runAgentBrowser(args, timeout = BROWSER_TIMEOUT_MS) {
  const cmd = ['npx', 'agent-browser', ...args];
  const opts = {
    encoding: 'utf8',
    timeout: timeout,
    maxBuffer: 10 * 1024 * 1024, // 10MB
  };
  
  try {
    return execSync(cmd.join(' '), opts);
  } catch (e) {
    const stderr = (e.stderr || '').slice(0, 500);
    const stdout = (e.stdout || '').slice(0, 500);
    throw new Error(`agent-browser ${args[0]} failed: ${e.message.slice(0, 100)} | stderr: ${stderr} | stdout: ${stdout}`);
  }
}

/**
 * 通过 agent-browser 抓取 URL 内容
 */
async function browserFetch(url) {
  const sessionName = `acms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    // 1. 打开页面
    runAgentBrowser(['open', url, '--session', sessionName]);
    
    // 2. 等待 JS 渲染 + 反爬验证
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 3. 获取快照
    const snapshotOutput = runAgentBrowser(['snapshot', '-i', '--json', '--session', sessionName]);
    
    // 4. 提取标题
    let title = '';
    try {
      const navResult = JSON.parse(runAgentBrowser(['open', url, '--json', '--session', sessionName]));
      title = navResult?.data?.title || '';
    } catch (e) {}
    
    // 5. 如果没有从导航获取到标题，从快照中提取
    if (!title) {
      try {
        const snapData = JSON.parse(snapshotOutput);
        const snapshot = snapData?.data?.snapshot || '';
        // 提取 heading 1 作为标题
        const titleMatch = snapshot.match(/heading "[^"]+" \[level=1/);
        if (titleMatch) {
          // 尝试从 snapshot 中提取标题文本
          const lines = snapshot.split('\n');
          for (const line of lines) {
            if (line.includes('heading "') && line.includes('[level=1')) {
              const match = line.match(/heading "([^"]+)"/);
              if (match) {
                title = match[1];
                break;
              }
            }
          }
        }
      } catch (e) {}
    }
    
    // 6. 获取页面文本内容
    let text = '';
    try {
      const snapData = JSON.parse(snapshotOutput);
      text = snapData?.data?.snapshot || '';
      // 清理格式，提取纯文本
      text = text
        .replace(/\[ref=e\d+\]/g, '')
        .replace(/\[level=\d+\]/g, '')
        .replace(/\[onclick\]/g, '')
        .replace(/\[cursor:[^\]]+\]/g, '')
        .replace(/\[href="[^\]"]*"\]/g, '')
        .replace(/\[ref=e\d+\]/g, '')
        .replace(/- (generic|link|button|heading|textbox|term|listitem) /g, '  ')
        .replace(/\[([^\]]+)\]\s*/g, '$1 ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (e) {}
    
    // 7. 关闭 session
    try {
      runAgentBrowser(['close', '--session', sessionName], 5000);
    } catch (e) {}
    
    return {
      title: title.slice(0, 200),
      text: text,
      html: '',
      screenshot: null,
      screenshotFormat: null,
      finalUrl: url,
      htmlLength: text.length,
    };
  } catch (e) {
    // 确保清理
    try {
      runAgentBrowser(['close', '--session', sessionName], 3000);
    } catch (e2) {}
    
    return { error: `agent-browser 抓取失败: ${e.message.slice(0, 200)}` };
  }
}

/**
 * 通过 agent-browser 搜索
 */
async function browserSearch(query, maxResults = 8) {
  const sessionName = `acms_search_${Date.now()}`;
  const url = `https://www.sogou.com/web?query=${encodeURIComponent(query)}`;
  
  try {
    runAgentBrowser(['open', url, '--session', sessionName]);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const snapshotOutput = runAgentBrowser(['snapshot', '-i', '--json', '--session', sessionName]);
    const snapData = JSON.parse(snapshotOutput);
    const snapshot = snapData?.data?.snapshot || '';
    
    // 解析搜索结果
    const results = [];
    const lines = snapshot.split('\n');
    
    for (const line of lines) {
      if (results.length >= maxResults) break;
      
      // 匹配标题行
      const titleMatch = line.match(/heading "([^"]+)" \[level=\d+/);
      if (titleMatch) {
        const title = titleMatch[1];
        if (title.length < 4) continue;
        
        // 找对应的 URL
        const urlMatch = line.match(/href="([^"]+)"/);
        const resultUrl = urlMatch ? urlMatch[1] : '';
        
        results.push({
          title: title.slice(0, 200),
          url: resultUrl,
          snippet: '',
        });
      }
    }
    
    // 关闭 session
    try {
      runAgentBrowser(['close', '--session', sessionName], 3000);
    } catch (e) {}
    
    return { results, error: null };
  } catch (e) {
    try {
      runAgentBrowser(['close', '--session', sessionName], 3000);
    } catch (e2) {}
    
    return { results: [], error: e.message };
  }
}

// 导出
module.exports = {
  browserFetch,
  browserSearch,
};
