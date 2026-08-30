// ============================================================
// qwen-probe-heartbeat.js — v0.118.6 心跳探测实测（120 服务器）
// 验证两个关键假设：
//   1. CLI 空闲时 get_usage_info control_request 会回 control_response
//   2. CLI 正在生成超大 write_file input（长静默）期间，心跳仍然被处理
//      → 若成立，无事件守护的"心跳存活判定"有效，写大文件不再误杀
// 跑法：cd /root/acms && node /tmp/qwen-probe-heartbeat.js
// ============================================================
const path = require('path');
process.chdir('/root/acms');
const fs = require('fs');
const crypto = require('crypto');

const { QwenSession } = require('/root/acms/server/services/qwen-worker');
const modelStore = require('/root/acms/server/stores/model-store');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const models = modelStore.list().filter((m) => m.name && /agnes/i.test(m.name));
  if (!models.length) { console.log('FAIL: 未找到 agnes 模型'); process.exit(1); }
  const model = models[0];
  const apiKey = modelStore.getDecryptedKey(model.id);
  console.log(`[probe] model=${model.name} id=${model.id} type=${model.authType || 'openai'}`);
  console.log(`[probe] baseUrl=${model.baseUrl}`);
  if (!apiKey || apiKey.length < 8) { console.log('FAIL: apiKey 解密失败'); process.exit(1); }

  const tmp = '/tmp/qwen-probe-hb';
  fs.mkdirSync(tmp, { recursive: true });

  const s = new QwenSession({
    model: model.model,
    authType: model.authType || 'openai',
    baseUrl: model.baseUrl,
    apiKey,
    cwd: tmp,
    sessionId: crypto.randomUUID(),
    enableMcp: false,
  });

  // 收集流式事件时间戳（验证"长静默"是否真的存在）
  const events = [];
  const t0 = Date.now();
  s.onEvent = (evt) => {
    const t = Date.now() - t0;
    if (evt.type === 'tool_use_start') events.push(`t=${t}ms tool_use_start ${evt.tool_name}`);
    else if (evt.type === 'tool_use_end') events.push(`t=${t}ms tool_use_end ${evt.tool_name} inputLen=${JSON.stringify(evt.input || {}).length}`);
    else if (evt.type === 'tool_result') events.push(`t=${t}ms tool_result ${(evt.content || '').slice(0, 40)}`);
    else if (evt.type === 'result') events.push(`t=${t}ms result ${evt.result && evt.result.subtype}`);
  };

  try {
    await s.start();
    console.log(`[probe] session ready (${Date.now() - t0}ms)`);

    // ---------- 测试 1：空闲心跳 ----------
    console.log('\n[probe] === 测试 1: 空闲心跳 ===');
    const idleAck = await new Promise((resolve) => {
      let done = false;
      const fin = (ok) => { if (!done) { done = true; resolve(ok); } };
      s._probeAckCb = () => fin(true);
      s._sendControl({ subtype: 'get_usage_info' });
      setTimeout(() => fin(false), 4000);
    });
    console.log(`[probe] 空闲心跳: ${idleAck ? '✅ ACK' : '❌ 无响应'}`);

    // ---------- 测试 2：生成期间心跳 ----------
    console.log('\n[probe] === 测试 2: 生成大文件期间心跳 ===');
    const askP = s.ask(
      '请创建中文版文件 docs/intro.md，内容为 ACMS（智能体协同管理系统）的完整详细介绍文档，'
      + '至少 2000 行，包含：系统架构、核心功能、Agent 机制、工具系统、MCP 集成、部署运维、'
      + '使用场景、FAQ 等章节，每章展开详细写。请一次性用 write_file 写完整个文件。',
      { timeoutMs: 600000 }
    );

    // 等待 tool_use_start（write_file 的 input 开始生成）
    let gotStart = false;
    const startWait = Date.now();
    while (!gotStart && Date.now() - startWait < 180000) {
      if (events.some((e) => e.includes('tool_use_start'))) { gotStart = true; break; }
      await sleep(500);
    }
    console.log(`[probe] tool_use_start 在 ${Date.now() - startWait}ms 出现`);

    if (gotStart) {
      // 生成期间连续发 3 次心跳，每次间隔 30s（模拟守护的周期性探测）
      for (let i = 1; i <= 3; i++) {
        await sleep(20000);  // 等 input 生成进行中
        const ack = await new Promise((resolve) => {
          let done = false;
          const fin = (ok) => { if (!done) { done = true; resolve(ok); } };
          s._probeAckCb = () => fin(true);
          s._sendControl({ subtype: 'get_usage_info' });
          setTimeout(() => fin(false), 4000);
        });
        const el = Date.now() - t0;
        console.log(`[probe] 生成中心跳 #${i} (t=${el}ms): ${ack ? '✅ ACK' : '❌ 无响应'}`);
      }
    } else {
      console.log('[probe] 未等到 tool_use_start（可能模型直接返回文本），改为等 result');
    }

    // 等结果（最多 8 分钟）
    const result = await Promise.race([askP, sleep(480000).then(() => 'timeout')]);
    if (result !== 'timeout') {
      console.log(`\n[probe] ask 完成: subtype=${result.subtype} is_error=${result.is_error} result=${(result.result || '').slice(0, 100)}`);
    } else {
      console.log('\n[probe] ask 超时（测试窗口结束，手动关闭）');
    }
    console.log('\n[probe] 事件时间线:');
    events.forEach((e) => console.log('  ' + e));
    const outFile = path.join(tmp, 'docs', 'intro.md');
    if (fs.existsSync(outFile)) {
      console.log(`[probe] ✅ 产物存在: ${outFile} ${fs.statSync(outFile).size} bytes`);
    } else {
      console.log(`[probe] 产物检查: ${outFile} 不存在`);
    }
    s.close();
    process.exit(0);
  } catch (e) {
    console.error('[probe] FAIL:', e.message);
    try { s.close(); } catch (e2) {}
    process.exit(1);
  }
})().catch((e) => { console.error('[probe] 崩溃:', e); process.exit(1); });
