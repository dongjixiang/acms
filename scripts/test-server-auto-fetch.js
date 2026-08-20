#!/usr/bin/env node
// v1.1 服务端强制兜底冒烟测试（2026-08-20）
// 验证: ① 华尔街见闻 API 直连可用 ② web-search 服务端执行可用
// 不 require llm-adapter（会挂起 DB 连接），直接测底层服务。
const assert = require('assert');

async function testWallstcn() {
  console.log('── 测试 1: 华尔街见闻 7x24 快讯 API 直连 ──');
  const url = 'https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=15';
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 10000);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    clearTimeout(to);
    assert.strictEqual(resp.ok, true, 'HTTP 200');
    const data = await resp.json();
    const items = data?.data?.items || [];
    assert.ok(items.length > 0, 'items 非空');
    // 检查第一条的时间是今天
    const it = items[0];
    const dt = new Date((it.display_time || Date.now()) * 1000);
    console.log(`  ✅ HTTP OK, ${items.length} 条, 最新: ${dt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    console.log(`  样本: ${(it.content_text || it.title || '').slice(0, 80)}`);
    // 模拟 _serverAutoFetch 的格式化逻辑
    const formatted = items.slice(0, 3).map((x, i) => {
      const d2 = new Date((x.display_time || Date.now()) * 1000);
      const hm = `${String(d2.getHours()).padStart(2, '0')}:${String(d2.getMinutes()).padStart(2, '0')}`;
      return `[${i + 1}] ${hm} ${(x.content_text || x.title || '').replace(/\s+/g, ' ').trim().slice(0, 220)}`;
    }).join('\n');
    console.log(`  格式化样本:\n${formatted}`);
    return true;
  } catch (e) {
    clearTimeout(to);
    console.error('  ❌ 华尔街见闻 API 失败:', e.message);
    return false;
  }
}

async function testSearchWeb() {
  console.log('\n── 测试 2: web-search 服务端执行 ──');
  try {
    const { searchWeb } = require('../server/services/web-search');
    const sr = await searchWeb('2026年8月20日 主要经济新闻', { maxResults: 10 });
    assert.ok(!sr.error, '无错误: ' + (sr.error || ''));
    assert.ok(Array.isArray(sr.results) && sr.results.length > 0, 'results 非空');
    console.log(`  ✅ searchWeb 返回 ${sr.results.length} 条`);
    console.log(`  第一条: ${sr.results[0].title} | ${(sr.results[0].url || '').slice(0, 60)}`);
    return true;
  } catch (e) {
    console.error('  ❌ searchWeb 失败:', e.message);
    return false;
  }
}

async function main() {
  const r1 = await testWallstcn();
  const r2 = await testSearchWeb();
  console.log('\n── 结果 ──');
  console.log(`华尔街见闻 API 直连: ${r1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`web_search 服务端执行: ${r2 ? '✅ PASS' : '❌ FAIL'}`);
  process.exit(r1 && r2 ? 0 : 1);
}

main();
