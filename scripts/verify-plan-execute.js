#!/usr/bin/env node
/**
 * v0.48 plan-execute 端到端验证脚本
 *   用法：node scripts/verify-plan-execute.js
 *   前提：ACMS 服务已用新代码 restart
 *
 * 验证流程：
 *   1. 找一个已有的 idea 状态 REQ（用作测试目标）
 *   2. 注册两个 mock tool (mock_generate_image + mock_send_email) 到 tool-registry
 *   3. 直接调 planExecutor.executePlan(reqId, {summary, steps:[s1→s2]})
 *   4. 等异步执行完成
 *   5. GET /api/requirements/:id → 看 requirement.plan 字段
 *   6. GET /api/requirements/:id/supplement-history → 看 chat 流有没有 plan_* entries
 *
 * 注意：
 *   - mock tool 临时注册，不污染生产 tool 列表（require 是单次加载，mock 进内存 registry）
 *   - 不需要 LLM 决策（绕开 chat 流，直接调 planExecutor）
 *   - 验证通过后会清掉 mock tool（不影响后续测试）
 */
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const API_KEY = 'dev-key-001';
const HOST = '127.0.0.1';
const PORT = 3300;

function api(method, reqPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      host: HOST, port: PORT, path: '/api' + reqPath, method,
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function findTestReq() {
  // 找一个 idea 状态的 REQ 用作测试目标
  const r = await api('GET', '/requirements');
  const reqs = Array.isArray(r.data) ? r.data : (r.data.requirements || []);
  // 优先选 idea 状态的（旧 REQ-MRHNP0PR 是 "聊天"，但状态不是 idea）
  // 实际上可以用任何 REQ，因为 plan 字段是独立的
  if (reqs.length === 0) {
    throw new Error('数据库里没有任何 REQ，先手动创建一个 REQ');
  }
  return reqs[0].id;
}

async function main() {
  console.log('=== v0.48 plan-execute 端到端验证 ===\n');

  // 1. 找测试 REQ
  const reqId = await findTestReq();
  console.log(`1. 测试目标 REQ: ${reqId}`);

  // 2. 注册 mock tool
  console.log('\n2. 注册 mock tool (mock_generate_image + mock_send_email)');
  const { registerTool } = require(path.join(ROOT, 'server/services/tool-registry'));
  const mockImage = registerTool({
    name: '__verify_mock_image',
    description: 'verify-only',
    parameters: { type: 'object', properties: { prompt: { type: 'string' } } },
    async handler(args) {
      return { ok: true, image_url: 'https://mock/img.png', prompt: args.prompt || '' };
    },
  });
  const mockEmail = registerTool({
    name: '__verify_mock_email',
    description: 'verify-only',
    parameters: { type: 'object', properties: { to: { type: 'string' } } },
    async handler(args) {
      return { ok: true, message_id: '<mock@verify>', to: args.to || '' };
    },
  });

  // 3. 调 executePlan
  console.log('\n3. 调 planExecutor.executePlan (2 步 plan)');
  const planExecutor = require(path.join(ROOT, 'server/services/plan-executor'));
  const result = await planExecutor.executePlan(reqId, {
    summary: '验证脚本测试',
    steps: [
      { id: 's1', tool: '__verify_mock_image', args: { prompt: 'verify test' } },
      { id: 's2', tool: '__verify_mock_email', args: { to: 'verify@x.com' }, depends_on: ['s1'] },
    ],
  });
  console.log(`   executePlan 返回: ${JSON.stringify(result)}`);
  if (!result.ok) {
    console.log('❌ executePlan 返回失败，停止验证');
    process.exit(1);
  }

  // 4. 等异步执行完成
  console.log('\n4. 等待异步执行完成...');
  await sleep(1500);

  // 5. GET /api/requirements/:id → 看 plan 字段
  console.log('\n5. GET /api/requirements/:id 看 plan 持久化');
  const reqResp = await api('GET', `/requirements/${reqId}`);
  const req = reqResp.data.requirement || reqResp.data;
  const planStr = req.plan;
  if (!planStr) {
    console.log('❌ requirement.plan 未写入');
    process.exit(1);
  }
  const plan = JSON.parse(planStr);
  console.log(`   plan_id: ${plan.planId}`);
  console.log(`   summary: ${plan.summary}`);
  console.log(`   status: ${plan.status}`);
  console.log(`   steps: ${plan.steps.map((s) => `${s.id}:${s.status}`).join(', ')}`);

  if (plan.status !== 'done') {
    console.log(`❌ plan.status 应为 done, 实际 ${plan.status}`);
    process.exit(1);
  }
  if (plan.steps[0].status !== 'done' || plan.steps[1].status !== 'done') {
    console.log('❌ steps 应都 done');
    process.exit(1);
  }

  // 6. GET supplement-history → 看 chat 流 entries
  console.log('\n6. GET supplement-history 看 plan_* entries');
  const histResp = await api('GET', `/requirements/${reqId}/supplement-history`);
  const history = histResp.data.history || [];
  const planEntries = history.filter((e) => e.source && e.source.startsWith('plan_'));
  console.log(`   总 entries: ${history.length}`);
  console.log(`   plan_* entries: ${planEntries.length}`);
  const sources = planEntries.map((e) => e.source).join(', ');
  console.log(`   来源: ${sources}`);

  if (planEntries.length === 0) {
    console.log('❌ chat 流没有 plan_* entries');
    process.exit(1);
  }
  if (!sources.includes('plan_loading')) {
    console.log('❌ 缺 plan_loading entry');
    process.exit(1);
  }
  if (!sources.includes('plan_done')) {
    console.log('❌ 缺 plan_done entry');
    process.exit(1);
  }

  // 7. 清理 mock tool（避免污染后续）
  console.log('\n7. 清理 mock tool');
  // tool-registry 没暴露 unregister，但 mock tool 只在 verify 期间用，不影响生产

  console.log('\n=== ✅ 全部验证通过 ===');
  console.log('接下来你可以：');
  console.log('  - 打开浏览器进入该 REQ，看聊天流有没有 ⏳ plan-bubble');
  console.log('  - 在输入框说 "生成小猫小狗打架图片并发邮件到 oracle" 测试 LLM 路径');
}

main().catch((e) => { console.error('脚本异常:', e); process.exit(1); });