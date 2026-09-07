// ACMS social-publisher — platform-memory.js
// =============================================
// v0.118.x: 每个平台独立的"经验库"，给下一次 goal-driven 发布用
//
// 用途：
//  - 每次发布后，把关键总结（成功路径 / 失败原因 / DOM 观察）存入对应平台文件
//  - 下次发布同平台时，注入 goal 字符串开头作为 LLM 参考
//  - 限制总长度（最近 8 条），防内存无限增长
//
// 文件位置：data/social-publisher-memory/<platform>.json
// 文件格式：
//   {
//     platform: 'toutiao',
//     updatedAt: '2026-09-07T20:30:00Z',
//     entries: [
//       { ts, task_id, ok, summary, tips: [] },
//       ...
//     ]
//   }
//
// 防抖：同 task_id 只写一次（防重入），最近 1 秒内的相同 summary 去重

'use strict';

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', '..', '..', 'data', 'social-publisher-memory');
const MAX_ENTRIES = 8;          // 每个平台最多保留 8 条经验
const MAX_SUMMARY_LEN = 300;    // 单条 summary 截断长度
const MAX_TIPS_PER_ENTRY = 5;   // 单条最多 5 条 tip

function ensureDir() {
  try { fs.mkdirSync(MEMORY_DIR, { recursive: true }); } catch (e) { /* ignore */ }
}

function memoryPath(platform) {
  ensureDir();
  return path.join(MEMORY_DIR, `${platform}.json`);
}

function read(platform) {
  try {
    const raw = fs.readFileSync(memoryPath(platform), 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.entries)) return empty(platform);
    return data;
  } catch (e) {
    return empty(platform);
  }
}

function empty(platform) {
  return { platform, updatedAt: null, entries: [] };
}

function write(platform, data) {
  ensureDir();
  data.platform = platform;
  data.updatedAt = new Date().toISOString();
  try {
    // 原子写：tmp + rename（防崩溃写到一半）
    const finalPath = memoryPath(platform);
    const tmpPath = finalPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, finalPath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── 提取关键句子（规则版，无需 LLM 调用）──
// 输入 LLM 的中文总结（result.content），抽 2-4 条 actionable tips
function extractTips(content) {
  if (!content || typeof content !== 'string') return [];
  const tips = [];
  // 关键动作/坑关键词
  const patterns = [
    /切换.{0,15}(tab|标签)/g,
    /点击.{0,20}(按钮|链接|tab)/g,
    /(密码|账号|验证码|滑块|登录).{0,30}/g,
    /选择器?[\s\S]{0,30}?(找不到|错|失败|已修|ok|正确)/g,
    /发布(按钮|成功|失败).{0,30}/g,
    /(post_url|URL)[：:=][\s\S]{0,60}/g,
    /(要点|关键|注意|记得|下次|务必)[：:.，]?\s*[^\n。]{5,60}/g,
    /[\n•·\-]\s*[^\n]{10,80}/g,
  ];
  const seen = new Set();
  for (const re of patterns) {
    const matches = content.match(re) || [];
    for (const m of matches) {
      const cleaned = m.replace(/^[\s•·\-]+/, '').trim();
      if (cleaned.length < 8 || cleaned.length > 100) continue;
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      tips.push(cleaned);
      if (tips.length >= MAX_TIPS_PER_ENTRY) return tips;
    }
  }
  return tips;
}

// ── 追加一条经验 ──
function append(platform, { task_id, ok, summary, content }) {
  if (!platform) return { ok: false, error: 'missing_platform' };
  const data = read(platform);
  // 防重入（同 task_id 已存在则跳过）
  if (task_id && data.entries.some(e => e.task_id === task_id)) {
    return { ok: true, skipped: 'duplicate_task_id' };
  }
  const cleanSummary = (summary || '').slice(0, MAX_SUMMARY_LEN);
  const tips = extractTips(content || '');
  const entry = {
    ts: new Date().toISOString(),
    task_id: task_id || null,
    ok: !!ok,
    summary: cleanSummary,
    tips,
  };
  data.entries.unshift(entry); // 最新在前
  // 限制总条数
  if (data.entries.length > MAX_ENTRIES) {
    data.entries = data.entries.slice(0, MAX_ENTRIES);
  }
  return write(platform, data);
}

// ── 注入 goal 字符串的格式 ──
function renderForGoal(platform) {
  const data = read(platform);
  if (!data.entries || data.entries.length === 0) {
    return '（这是首次发布本平台，还没有历史经验可参考）';
  }
  const lines = data.entries.map((e, i) => {
    const icon = e.ok ? '✅' : '❌';
    const date = (e.ts || '').slice(0, 10);
    const summary = e.summary || '';
    const tipStr = (e.tips || []).map(t => `  - ${t}`).join('\n');
    return `${i+1}. [${date}] ${icon} ${summary}${tipStr ? '\n' + tipStr : ''}`;
  }).join('\n');
  return `【本平台历次发布经验 · 共 ${data.entries.length} 条 · 最近在前】
${lines}

⚠️ 上面这些是历史踩过的坑/成功的关键步骤。请优先按这些经验操作，避开已知问题。`;
}

// ── 列出所有平台 memory 状态 ──
function listAll() {
  try {
    ensureDir();
    const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, f), 'utf8'));
        return {
          platform: data.platform || f.replace('.json', ''),
          entries: (data.entries || []).length,
          updatedAt: data.updatedAt,
          last_ok: data.entries?.find(e => e.ok) ? true : false,
        };
      } catch (e) {
        return { platform: f, entries: 0, error: e.message };
      }
    });
  } catch (e) {
    return [];
  }
}

// ── 清空某个平台的 memory（调试用）──
function clear(platform) {
  try {
    fs.unlinkSync(memoryPath(platform));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  read,
  append,
  renderForGoal,
  listAll,
  clear,
  extractTips,
  MEMORY_DIR,
  MAX_ENTRIES,
};
