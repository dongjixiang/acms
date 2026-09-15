// v0.22.75 「✏️ 打磨」回写测试 —— appendOption 服务层
//   真库测试（建临时 REQ + 写真实 asset 文件），跑完自清理，不留痕迹
//   跑法：cd acms/server && node scripts/polish-append-test.js
//
// 覆盖：追加候选 / picked 指向新图 / polished 标记 / asset_path 约定 / 真实落盘 /
//       DB 读回一致 / 连续追加迭代 / magic bytes 定 mime / 4 个错误分支 / 清理

const path = require('path');
const fs = require('fs');
const { collection } = require('../db/connection');
const reqStore = require('../stores/requirement-store');
const imageGen = require('../services/assists/image-gen');
const config = require('../config');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (extra !== undefined ? '  \u2192 ' + JSON.stringify(extra) : '')); }
}

// 1x1 透明 PNG / 1x1 JPEG —— 用来验 magic bytes 定 mime（不信前端声明的 mime）
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const TEST_ID = 'REQ-POLISHTEST-' + Date.now().toString(36).toUpperCase();
const createdFiles = [];

function mkAssist() {
  const mk = (n) => ({
    image_url_output: 'https://example.com/' + n + '.png',
    asset_path: 'assets/2026-09-14/' + n + '.png',
    workspace_path: 'default/assets/2026-09-14/' + n + '.png',
    mime: 'image/png', size: 100,
  });
  const a = mk('a');
  return {
    status: 'done', prompt: '测试原图', project_id: null, size: '1024x1024', n: 3,
    options: [a, mk('b'), mk('c')],
    picked_idx: 0,
    image_url_output: a.image_url_output, asset_path: a.asset_path,
    workspace_path: a.workspace_path, mime: a.mime,
    generated_at: new Date().toISOString(),
  };
}

function cleanup() {
  try { collection('requirements').remove(r => r.id === TEST_ID); } catch (e) { /* ignore */ }
  createdFiles.forEach(f => { try { fs.unlinkSync(f); } catch (e) { /* ignore */ } });
}

(async function main() {
  console.log('=== v0.22.75 打磨回写 appendOption 测试 ===\n');
  cleanup();

  collection('requirements').insert({
    id: TEST_ID, project_id: null, title: '打磨回写测试', status: 'draft',
    assist_image: JSON.stringify(mkAssist()), created_at: new Date().toISOString(),
  });
  ok(!!reqStore.getById(TEST_ID), '临时 REQ 已建立（隔离测试数据，跑完删除）');

  console.log('\n[1] 追加打磨图（第 4 张）');
  const r1 = imageGen.appendOption(TEST_ID, { dataUrl: TINY_PNG, sourceIdx: 0, label: '打磨' });
  ok(r1 && r1.ok === true, 'appendOption 返回 ok:true', r1 && r1.error);
  if (r1 && r1.ok) {
    ok(r1.idx === 3, '新候选索引 = 3（第 4 张）', r1.idx);
    ok(r1.assist.options.length === 4, 'options 长度 3 → 4', r1.assist.options.length);
    ok(r1.assist.picked_idx === 3, 'picked_idx 指向新图（打磨后自然想用它）', r1.assist.picked_idx);
    ok(r1.assist.options[0].asset_path === 'assets/2026-09-14/a.png', '原图候选未被改动（追加非覆盖）');

    const opt = r1.option;
    ok(opt.polished === true, '✓ polished 标记（前端据此打角标）');
    ok(opt.source_idx === 0, 'source_idx 记录来源候选', opt.source_idx);
    ok(opt.label === '打磨', 'label = 打磨', opt.label);
    ok(opt.image_url_output === '', '打磨图无 CDN 地址（本地图，前端走 asset 路径）', opt.image_url_output);

    // ⚠️ P201 坑 3：asset_path 必须是「相对 workspace」的 assets/ 开头，
    //    不能含 projectSlug —— 否则前端再拼一次 = 404 破图
    ok(/^assets\//.test(opt.asset_path), 'asset_path 以 assets/ 开头（不含 slug 前缀）', opt.asset_path);
    ok(opt.workspace_path === 'default/' + opt.asset_path, 'workspace_path = default/ + asset_path', opt.workspace_path);
    ok(opt.mime === 'image/png', 'mime 由 magic bytes 定为 image/png', opt.mime);

    const abs = path.join(config.workspaceRoot, opt.workspace_path);
    createdFiles.push(abs);
    ok(fs.existsSync(abs), '打磨图真实落盘到 workspace', abs);
    ok(fs.existsSync(abs) && fs.statSync(abs).size > 0, '落盘文件非空');

    ok(r1.assist.asset_path === opt.asset_path, 'assist.asset_path 同步为新图（legacy 字段）');
    ok(r1.assist.workspace_path === opt.workspace_path, 'assist.workspace_path 同步为新图');
  }

  console.log('\n[2] DB 读回一致（不是只改了内存）');
  const fromDb = imageGen.getAssist(TEST_ID);
  ok(fromDb && fromDb.options.length === 4, '重新读库仍是 4 张候选', fromDb && fromDb.options.length);
  ok(fromDb && fromDb.options[3] && fromDb.options[3].polished === true, '第 4 张带 polished 标记');

  console.log('\n[3] 可连续追加（多次打磨迭代）');
  const r2 = imageGen.appendOption(TEST_ID, { dataUrl: TINY_JPEG, sourceIdx: 3, label: '打磨 2' });
  ok(r2 && r2.ok === true && r2.idx === 4, '第二次追加 → idx 4', r2 && r2.idx);
  ok(r2 && r2.option.mime === 'image/jpeg', 'JPEG magic bytes → image/jpeg', r2 && r2.option.mime);
  ok(r2 && /\.jpg$/.test(r2.option.asset_path), 'JPEG 扩展名 .jpg', r2 && r2.option.asset_path);
  if (r2 && r2.ok) createdFiles.push(path.join(config.workspaceRoot, r2.option.workspace_path));

  console.log('\n[4] 错误分支');
  ok(imageGen.appendOption('REQ-NOT-EXIST-XXX', { dataUrl: TINY_PNG }).error === 'REQ_NOT_FOUND', '不存在的 REQ → REQ_NOT_FOUND');
  ok(imageGen.appendOption(TEST_ID, { dataUrl: 'not-a-data-url' }).error === 'BAD_DATA_URL', '非法 dataUrl → BAD_DATA_URL');
  ok(imageGen.appendOption(TEST_ID, {}).error === 'BAD_DATA_URL', '缺 dataUrl → BAD_DATA_URL');
  ok(imageGen.appendOption(TEST_ID, { dataUrl: 'data:image/png;base64,' }).error === 'EMPTY_IMAGE', '空图 → EMPTY_IMAGE');

  const EMPTY_ID = TEST_ID + '-EMPTY';
  collection('requirements').insert({ id: EMPTY_ID, title: 't', assist_image: JSON.stringify({ status: 'done', options: [] }) });
  ok(imageGen.appendOption(EMPTY_ID, { dataUrl: TINY_PNG }).error === 'NO_OPTIONS', 'options 为空 → NO_OPTIONS');
  collection('requirements').remove(r => r.id === EMPTY_ID);

  console.log('\n[5] 清理');
  cleanup();
  ok(!reqStore.getById(TEST_ID), '临时 REQ 已删除');
  const leftover = createdFiles.filter(f => fs.existsSync(f));
  ok(leftover.length === 0, '落盘测试文件已删除', leftover);

  console.log('\n=== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 ===');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e); cleanup(); process.exit(1); });
