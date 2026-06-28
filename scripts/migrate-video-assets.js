#!/usr/bin/env node
// v0.22.7: 迁移脚本 — 把历史生成的视频从 Agnes CDN 下载到本地 workspace
//   之前 queryAssistJob 不下载视频（只有 URL），现在做了本地保存
//   跑这个脚本处理已有 REQ 的 assist_video 数据
//
// 用法: node scripts/migrate-video-assets.js [--dry-run]
//   默认：处理所有 status=done + video_url 有 + asset_path 没的 REQ
//   --dry-run: 只打印不真下载
//   --limit N: 最多处理 N 个（测试用）

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const WORKSPACE_ROOT = path.join(__dirname, '..', 'workspaces');
const DB_PATH = path.join(__dirname, '..', 'data', 'acms.db');

const dryRun = process.argv.includes('--dry-run');
const limitIdx = process.argv.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : Infinity;
console.log(dryRun ? '=== DRY RUN 模式 ===' : '=== 实际下载 ===');
if (limit !== Infinity) console.log(`限制: 最多 ${limit} 个`);

function getProjectSlugForReq(reqRec) {
  try {
    const projectStore = require('../server/stores/project-store');
    const proj = projectStore.getByReqId(reqRec.id);
    if (proj?.slug) return proj.slug;
    if (proj?.id) return proj.id;
  } catch (e) { /* fallback to default */ }
  return 'default';
}

function saveVideoAsset(projectSlug, buffer, prompt) {
  const dateStr = new Date().toISOString().split('T')[0];
  const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
  const assetsDir = path.join(WORKSPACE_ROOT, projectSlug, 'assets', dateStr);
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  const safePrompt = (prompt || 'video').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').substring(0, 40);
  const fileName = `${safePrompt}_${hash}.mp4`;
  const filePath = path.join(assetsDir, fileName);
  if (!dryRun) fs.writeFileSync(filePath, buffer);
  return `assets/${dateStr}/${fileName}`;
}

async function downloadOne(url) {
  const c = new AbortController();
  const tid = setTimeout(() => c.abort(), 60000);
  try {
    const resp = await fetch(url, { signal: c.signal });
    clearTimeout(tid);
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    const buffer = Buffer.from(await resp.arrayBuffer());
    return { ok: true, buffer };
  } catch (e) {
    clearTimeout(tid);
    return { ok: false, error: e.message };
  }
}

(async () => {
  const db = new Database(DB_PATH);
  const rows = db.prepare("SELECT id, doc FROM requirements WHERE doc LIKE '%assist_video%' AND doc LIKE '%video_url%'").all();
  console.log('找到 ' + rows.length + ' 个 REQ 有 assist_video 数据\n');

  let processed = 0, skipped = 0, failed = 0;
  for (const r of rows) {
    if (processed >= limit) break;
    let d;
    try { d = JSON.parse(r.doc); } catch { skipped++; continue; }
    let video;
    try { video = JSON.parse(d.assist_video || 'null'); } catch { skipped++; continue; }
    if (!video || !video.video_url) { skipped++; continue; }
    if (video.asset_path) { skipped++; continue; }
    if (video.status === 'failed') { skipped++; continue; }

    const url = video.video_url;
    if (!url || !url.startsWith('http')) { skipped++; continue; }

    const slug = getProjectSlugForReq(d);
    console.log(`[${processed + skipped + failed + 1}/${rows.length}] ${r.id} | ${video.status} | slug=${slug} | ${url.slice(0, 50)}...`);

    if (dryRun) { processed++; continue; }

    const result = await downloadOne(url);
    if (!result.ok) {
      console.log(`  ❌ ${result.error}`);
      failed++;
      continue;
    }

    const assetPath = saveVideoAsset(slug, result.buffer, video.prompt || '');
    video.asset_path = assetPath;
    video.local_size = result.buffer.length;
    video.saved_at = new Date().toISOString();
    d.assist_video = JSON.stringify(video);
    db.prepare('UPDATE requirements SET doc = ? WHERE id = ?').run(JSON.stringify(d), r.id);
    console.log(`  ✅ 已保存 ${assetPath} (${(result.buffer.length/1024).toFixed(1)}KB)`);
    processed++;
  }

  console.log(`\n=== 完成 ===`);
  console.log(`处理: ${processed} | 跳过: ${skipped} | 失败: ${failed}`);
})();
