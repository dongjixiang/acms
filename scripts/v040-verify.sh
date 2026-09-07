#!/bin/bash
# ACMS GEO v0.40 端到端验证脚本（多多家手工 start.bat 后一键跑）
# 用法：bash scripts/v040-verify.sh

set -e

BASE="http://localhost:3300"
API_KEY="dev-key-001"
BRAND_EX="brand_mtfzuv2f_h2rx"  # 卡司通展览，industry=exhibition

echo "=========================================="
echo "ACMS GEO v0.40 验证脚本"
echo "=========================================="
echo ""

# === 检查 1: server 加载了 v0.40 新代码 ===
echo "[1/3] 验证 server 是否加载 v0.40 新代码（LLM_CALL_FAILED 透传）"
echo "      期望: error=LLM_CALL_FAILED + message 含 Connect Timeout"
echo "      旧版: error=PARSE_FAILED（说明 server 没重启）"
echo ""

RESP=$(curl -s -X POST "$BASE/api/geo/queries/ai-generate" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "{\"brand_id\":\"$BRAND_EX\",\"replace\":false}")
echo "  返回: $RESP"
echo ""

if echo "$RESP" | grep -q '"error":"LLM_CALL_FAILED"'; then
  echo "  ✅ PASS: server 已加载 v0.40 新代码（LLM_CALL_FAILED 透传生效）"
elif echo "$RESP" | grep -q '"error":"PARSE_FAILED"'; then
  echo "  ❌ FAIL: server 还是老代码（PARSE_FAILED）"
  echo "     多多：start.bat 重启 3300 后再跑此脚本"
  exit 1
else
  echo "  ⚠️ UNKNOWN: 返回状态非预期，检查返回内容"
fi
echo ""

# === 检查 2: buildLlmPrompt 输出含行业差异化段（直接调模块，不经 server）===
echo "[2/3] 验证 buildLlmPrompt 行业差异化段注入（直接 require 模块）"
echo ""

cd "$(dirname "$0")/.."
node -e "
const m = require('./server/services/geo-prompt-llm');
const out = m.buildLlmPrompt({name:'卡司通展览', industry:'exhibition'});
console.log('  prompt 长度:', out.length);
const checks = [
  ['行业差异化段',     out.includes('行业差异化（v0.40）')],
  ['展会行业 label',   out.includes('展览/展台/会展')],
  ['exhibition 行业特化 unbranded', out.includes('exhibition 报价参考') || out.includes('exhibition 案例')],
  ['行业关键词调色板', out.includes('上海/北京/广州')],
  ['意图权重 30/25/30/15', out.includes('信息型 (informational): **30%**') && out.includes('排错型 (troubleshooting): **15%**')],
  ['回归 v0.31 RTF',  out.includes('【Role — 角色】') && out.includes('【Task — 任务】') && out.includes('【Format — 输出格式】')],
  ['回归 v0.31 四类意图', out.includes('informational') && out.includes('comparative') && out.includes('implementation') && out.includes('troubleshooting')],
];
for (const [name, ok] of checks) {
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + name);
}
" 2>&1 | grep -v "^\[DB\]"
echo ""

# === 检查 3: 单测 ===
echo "[3/3] 跑 v040 单测"
echo ""
node --test server/services/__tests__/v040-industry-guidance.test.js 2>&1 | tail -8
echo ""

echo "=========================================="
echo "验证完成"
echo "=========================================="
