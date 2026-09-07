const path = require('path');
// 直接测 buildLlmPrompt 输出
const { buildLlmPrompt } = require('./server/services/geo-prompt-llm.js');
const brand = {
  id: 'brand_mtfzuv2f_h2rx',
  name: '卡司通展览',
  domain: 'kintocn.com',
  industry: 'exhibition',
  aliases: ['KINTOCN', 'Kinto展', '上海卡司通'],
};

const out = buildLlmPrompt(brand);
// 截取地域相关段（"地域定位" + 前后 + 硬约束）
const lines = out.split('\n');
const startIdx = lines.findIndex(l => l.includes('Unbranded 句式模板'));
const endIdx = lines.findIndex(l => l.startsWith('要求：') || l.startsWith('Requirement:'));
console.log('=== 地域相关 LLM 输入段 ===');
console.log(lines.slice(startIdx, endIdx + 2).join('\n'));
