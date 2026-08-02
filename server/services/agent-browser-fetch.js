// ACMS agent-browser 抓取工具（v0.78）
//
// 使用 agent-browser CLI 访问网页，绕过百度等反爬检测
// 不依赖 Hermes，任何机器 npm install -g agent-browser 即可
//
// 关键：通过 Python wrapper 调用（避免 Windows pipe hang）

const { spawn } = require('child_process');
const path = require('path');

const WRAPPER = path.join(__dirname, 'agent-browser-wrapper.py');
const DEFAULT_TIMEOUT = 45000;

// 执行 agent-browser 命令（通过 Python wrapper）
function runAgentBrowser(args, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve) => {
    const child = spawn('python', [WRAPPER, args], {
      encoding: 'utf8',
      timeout: timeout,
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        resolve({ success: false, error: stderr || `exit code ${code}`, output: stdout.trim() });
      }
    });
    
    child.on('error', (err) => {
      resolve({ success: false, error: err.message, output: '' });
    });
    
    // 超时
    setTimeout(() => {
      child.kill();
      resolve({ success: false, error: 'timeout', output: '' });
    }, timeout);
  });
}

// 执行单条命令
async function execOne(args, timeout = 15000) {
  const result = await runAgentBrowser(args, timeout);
  if (!result.success) {
    throw new Error(`agent-browser ${args} 失败: ${result.error}`);
  }
  return result.output;
}

// 打开页面
async function open(url, timeout = DEFAULT_TIMEOUT) {
  console.log(`[browser] 打开: ${url}`);
  await execOne(`open "${url}"`, timeout);
  // 等待页面加载
  await execOne('wait 2000', 5000);
}

// 获取页面快照（用于结构化操作，识别 ref）
async function snapshot() {
  return await execOne('snapshot -c', 10000);
}

// 获取页面正文（v0.79: 真实文本，比 snapshot 的无障碍树更适合 AI 阅读）
//   agent-browser 的 `read` 命令输出 agent-friendly 的可读文本
//   旧: snapshot 返回 "- generic - generic [ref=e1] clickable" 无障碍树
//   新: read 返回页面真实文本（百度百科等反爬站也能拿到正文）
async function readText() {
  return await execOne('read', 30000);
}

// 获取页面标题
async function getTitle() {
  return await execOne('get title', 5000);
}

// 获取页面 URL
async function getUrl() {
  return await execOne('get url', 5000);
}

// 关闭浏览器
async function close() {
  try {
    await execOne('close --all', 5000);
  } catch {}
}

// v0.80: 用 agent-browser 搜索 BingCN（冗余 fallback，当 puppeteer 引擎全失败时使用）
//   agent-browser 能过部分 puppeteer 被限的 BingCN 请求
//   返回格式与 browserSearchBingCn 一致: { results: [{title, url, snippet}] }
//   注意：agent-browser 启动较慢（~200ms 首调用），适合做 fallback 而非主路径
async function searchBingCn(query, maxResults = 15) {
  try {
    // 1. 打开搜索页（超时 15s，比 puppeteer 的 30s 短）
    await open(`https://cn.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-Hans`, 15000);
    await execOne('wait 2000', 5000);  // wait 命令需要更长超时

    // 2. 获取无障碍树
    const snapOutput = await execOne('snapshot -c', 10000);

    // 3. 解析无障碍树提取搜索结果
    const results = parseBingCnA11yTree(snapOutput, maxResults);

    if (results.length === 0) {
      return { error: 'agent-browser BingCN 未返回结果', results: [] };
    }
    console.log(`[web-search] agent-browser BingCN: ${results.length} 条`);
    return { results };
  } catch (e) {
    return { error: `agent-browser BingCN 失败: ${e.message}`, results: [] };
  }
}

// 解析 BingCN 无障碍树 → 搜索结果列表
// 树格式: "- generic\n  - list\n    - listitem [level=1]\n      - link \"域名\" [ref=xxx]\n        - StaticText \"https://url\"\n      - heading \"标题\" [level=2]\n        - link \"标题\" [ref=xxx]\n      - paragraph\n        - StaticText \"摘要\""
function parseBingCnA11yTree(snapText, maxResults) {
  if (!snapText || typeof snapText !== 'string') return [];

  const results = [];
  const lines = snapText.split('\n');
  let i = 0;

  // 逐行扫描，找 listitem 块
  while (i < lines.length && results.length < maxResults) {
    const line = lines[i];

    // 匹配 listitem 开始（用空格前缀计算深度）
    if (line.trim().startsWith('- listitem')) {
      const item = { domain: '', url: '', title: '', snippet: '' };
      // 用前导空格数计算深度
      const prefixMatch = line.match(/^[ ]*/);
      const depth = prefixMatch ? prefixMatch[0].length : 0;
      i++;

      // 消费这个 listitem 的所有子行
      while (i < lines.length) {
        const cur = lines[i];
        const curPrefixMatch = cur.match(/^[ ]*/);
        const curDepth = curPrefixMatch ? curPrefixMatch[0].length : 0;

        // 严格小于才结束（等于说明是同级新 listitem）
        if (curDepth < depth && cur.trim().startsWith('-')) {
          break;
        }
        // 等于 depth 且是 listitem，也结束（下一个兄弟节点）
        if (curDepth === depth && cur.trim().startsWith('- listitem')) {
          break;
        }

        // 提取域名（listitem 内第一个 link 是域名，heading 内的 link 是标题——不能覆盖）
        if (cur.includes('- link') && !item.domain) {
          const linkMatch = cur.match(/- link "([^"]+)"/);
          if (linkMatch) item.domain = linkMatch[1];
        }

        // URL 在 link 的子 StaticText 中（含 https://）
        if (cur.includes('StaticText') && /https?:\/\//.test(cur)) {
          const urlMatch = cur.match(/StaticText\s+"((?:https?:\/\/|about:\/)[^"]+)"/);
          if (urlMatch) item.url = urlMatch[1];
        }

        // 标题在 heading 下
        if (cur.includes('- heading')) {
          const headMatch = cur.match(/heading "([^"]+)"/);
          if (headMatch) item.title = headMatch[1];
        }

        // 摘要在 paragraph 的子 StaticText 中（需要是 paragraph 的直接子行）
        if (cur.includes('- paragraph')) {
          item.pendingParagraph = true;
        } else if (item.pendingParagraph && cur.includes('StaticText') && /https?:\/\//.test(cur)) {
          // paragraph 下第一个 StaticText 如果是 URL，跳过
          item.pendingParagraph = false;
        } else if (item.pendingParagraph && cur.includes('StaticText')) {
          const snippetMatch = cur.match(/StaticText\s+"([^"]+)"/);
          if (snippetMatch && snippetMatch[1].length > 10) {
            item.snippet = snippetMatch[1];
          }
          item.pendingParagraph = false;
        } else if (cur.trim().startsWith('-') && !cur.includes('paragraph') && !cur.includes('heading')) {
          // 其他块结束，清除 pending
          item.pendingParagraph = false;
        }

        i++;
      }

      // 过滤无效结果
      // v0.87c: URL 缺失时用域名构造（新版 agent-browser snapshot 不输出 StaticText URL，
      //   只有 link 标签里的域名）——之前 item.url 永远空 → 全部被过滤 → ab-bingcn 永远 0 条
      if (!item.url && item.domain) {
        const d = item.domain.toLowerCase().replace(/^www\./, '');
        if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)) {
          item.url = 'https://' + d + '/';
        }
      }
      if (item.url && item.title && item.title.length >= 3) {
        // 过滤 Bing/微软自家链接
        if (item.url.includes('bing.com/') || item.url.includes('microsoft.com/')) {
          i++;
          continue;
        }
        // 过滤广告标记
        if (/看看元宝|抢购|限时|钜惠|推广/i.test(item.title)) {
          i++;
          continue;
        }
        results.push({
          title: item.title.slice(0, 200),
          url: item.url.split('?')[0].slice(0, 500), // 去掉追踪参数
          snippet: (item.snippet || '').slice(0, 300),
        });
      } else {
        // 没有 URL 的 listitem（如导航菜单）跳过
        i++;
      }
      continue;
    }

    i++;
  }

  return results;
}

// 主抓取函数
async function fetchPage(url, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    waitMs = 2000,
  } = options;

  // 打开页面
  await open(url, timeout);
  
  // 等待
  if (waitMs > 0) {
    await execOne(`wait ${waitMs}`, 5000);
  }

  // v0.79: 用 `read` 命令拿真实正文（替代 snapshot 的无障碍树）
  const title = await getTitle();
  const urlResult = await getUrl();
  const text = await readText();

  return {
    url: urlResult,
    title: title,
    snapshot: text,  // 保持字段名向后兼容（url-fetch.js 读 .snapshot）
  };
}

// 检测是否是百度安全验证页
function isBaiduSecurityCheck(snapshot) {
  return snapshot.includes('百度安全验证') || 
         snapshot.includes('BIOC_OPTIONS') ||
         snapshot.includes('请确认您是真人');
}

module.exports = {
  fetchPage,
  open,
  snapshot,
  readText,
  getTitle,
  getUrl,
  close,
  isBaiduSecurityCheck,
  runAgentBrowser,
  searchBingCn,
  parseBingCnA11yTree,
};
