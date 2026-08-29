#!/usr/bin/env node
// ACMS GEO 配置脚本（Phase 0 — v0.2 复用 modelStore）
// 用途：查看 GEO 引擎配置状态 + 备选修改 API Key（优先在 admin AI 模型管理里改）
// 路径：scripts/configure-geo.js
//
// 使用：
//   node scripts/configure-geo.js --list                       # 列出所有引擎配置状态
//   node scripts/configure-geo.js deepseek --set-key sk-xxx   # 修改 DeepSeek key
//
// v0.2 修订（2026-08-29）：直接复用 modelStore 的加密 key，不另存

const GEO_CONFIG = require('../server/services/geo-config');
const readline = require('readline');

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer);
  }));
}

async function listStatus() {
  const status = GEO_CONFIG.getProviderStatus();
  console.log('\n=== GEO 引擎配置状态（复用 modelStore）===\n');
  for (const [provider, info] of Object.entries(status)) {
    if (info.configured) {
      console.log(`✅ ${provider.padEnd(20)} ${info.model_name} (${info.model_field}) @ ${info.base_url}`);
      console.log(`   key: ${info.key_preview} (${info.key_length} chars) | model_id: ${info.model_id}`);
    } else {
      console.log(`⚠️  ${provider.padEnd(20)} ${info.reason || '未配置'}`);
    }
  }
  const configuredCount = Object.values(status).filter(s => s.configured).length;
  console.log(`\n当前 ${configuredCount}/${Object.keys(status).length} 个引擎已配置。`);
  console.log('\n提示: 优先在系统管理 → AI 模型管理里配置/修改 API Key，GEO 自动复用。');
  console.log('     仅在需要 GEO 专用 key（跟 LLM 用不同 key）时用本脚本。\n');
}

async function setKey(provider, apiKey) {
  if (!apiKey || apiKey.length < 8) {
    console.error('❌ API Key 太短（至少 8 字符）');
    process.exit(1);
  }
  try {
    const result = GEO_CONFIG.setApiKey(provider, apiKey);
    console.log(`\n✅ ${result.provider} API Key 已更新（${result.length} 字符）`);
    console.log(`   同步影响: 关联模型 ${result.model_id} 的 LLM 调用也会用新 key`);
    console.log(`\n   测试: 重启 ACMS 后用小吉说 "用 geo_list_engines 列出配置"`);
  } catch (e) {
    console.error(`❌ 更新失败: ${e.message}`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
ACMS GEO 配置脚本（v0.2 — 复用 modelStore）

用法:
  node scripts/configure-geo.js --list                                  列出所有引擎配置状态
  node scripts/configure-geo.js <provider> --set-key <apiKey>           修改 API Key

示例:
  node scripts/configure-geo.js deepseek --set-key sk-xxxxxxxxxxxxxxxx

支持的 provider:
  deepseek (Phase 0)
  openai / anthropic / perplexity / google / copilot / grok / google_ai_mode (Phase 1)

【推荐】优先在系统管理 → AI 模型管理里配置，LLM 和 GEO 自动共享 key。
`);
    return;
  }
  if (args[0] === '--list' || args[0] === '-l') {
    await listStatus();
    return;
  }
  // 解析 <provider> --set-key <key>
  const provider = args[0];
  const setKeyIdx = args.indexOf('--set-key');
  if (setKeyIdx !== -1 && args[setKeyIdx + 1]) {
    await setKey(provider, args[setKeyIdx + 1]);
    return;
  }
  console.error('❌ 用法: <provider> --set-key <apiKey>');
  process.exit(1);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});