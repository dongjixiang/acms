// ACMS · 视频拼接服务（v0.22.65）
//   把剧本多个分镜头 mp4 合成一条完整视频（用户 2026-09-13 报「3 段视频是割裂的，怎么连到一起」）
//
// 两种模式：
//   1) transition:'none'  → concat demuxer + `-c copy`（无损、秒级）
//      前提：各段同模型同参数生成（编码一致）。实测 3×5.04s → 15.14s / 5.7MB / <1s
//      失败时自动降级到 filter concat 重编码（兜住参数不一致的情况）
//   2) transition:'fade'  → xfade 交叉溶解（重编码，几秒；实测 3 段各 0.4s 重叠 → 14.33s）
//
// ffmpeg：本机 WinGet 安装的 8.1.1（PATH 可见）。全部走 execFile 数组传参（不拼 shell）
//   → 资产路径含中文/空格/全角标点也安全（ACMS 的 asset_path 由 prompt 派生，必含中文）
//
// 音频：concat 模式随流复制；xfade 模式默认丢弃（-an）—— 分镜头目前无音轨，
//   将来接 BGM/配音时在 xfade 分支加 `-i bgm.mp3 -shortest` 混流即可。
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

const WORKSPACE_ROOT = config.workspaceRoot;
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

function run(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs || 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, error: (err.message || String(err)) + ' | ' + String(stderr || '').slice(-600) });
      resolve({ ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

/** 探测单个视频时长（秒）；失败返回 null */
async function probeDuration(file) {
  const r = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], 20000);
  if (!r.ok) return null;
  const n = parseFloat(r.stdout.trim());
  return isNaN(n) ? null : n;
}

/** concat demuxer 的 list 文件：file '<abs>'（单引号需转义成 '\''） */
function writeConcatList(files, listPath) {
  const body = files.map((f) => "file '" + String(f).replace(/'/g, "'\\''") + "'").join('\n') + '\n';
  fs.writeFileSync(listPath, body, 'utf8');
}

/**
 * 拼接视频
 * @param {string[]} inputFiles 绝对路径（按顺序）
 * @param {string} outFile 绝对路径（必须已存在父目录）
 * @param {{transition?:'none'|'fade', transitionDuration?:number}} opts
 * @returns {Promise<{ok:boolean, mode?:string, outFile?:string, duration?:number, size?:number, error?:string}>}
 */
async function concatVideos(inputFiles, outFile, opts = {}) {
  const files = (inputFiles || []).filter((f) => f && fs.existsSync(f));
  if (files.length < 2) return { ok: false, error: '至少需要 2 个存在的视频文件（当前 ' + files.length + '）' };
  const transition = opts.transition === 'fade' ? 'fade' : 'none';
  const d = Math.max(0.1, Math.min(1.5, parseFloat(opts.transitionDuration) || 0.4));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const durations = [];
  for (const f of files) durations.push(await probeDuration(f));
  const allKnown = durations.every((x) => x && x > 0);

  // ── 模式 1：无损（concat demuxer + copy）──
  if (transition === 'none') {
    const listPath = path.join(path.dirname(outFile), '.concat_' + crypto.randomBytes(4).toString('hex') + '.txt');
    try {
      writeConcatList(files, listPath);
      const args = ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', outFile];
      const r = await run(FFMPEG, args);
      if (r.ok && fs.existsSync(outFile) && fs.statSync(outFile).size > 1024) {
        const dur = await probeDuration(outFile);
        console.log(`[video-compose] 无损拼接 ${files.length} 段 → ${path.basename(outFile)} (${dur ? dur.toFixed(2) + 's' : '?'})`);
        return { ok: true, mode: 'lossless', outFile, duration: dur, size: fs.statSync(outFile).size };
      }
      console.warn('[video-compose] 无损拼接失败，降级重编码:', r.error || '输出为空');
    } finally {
      try { fs.unlinkSync(listPath); } catch (e) { /* 忽略 */ }
    }
    // 降级：filter concat（重编码，参数不一致也能拼）
    const inputs = [];
    files.forEach((f) => inputs.push('-i', f));
    const labels = files.map((_, i) => `[${i}:v]`).join('');
    const filter = `${labels}concat=n=${files.length}:v=1:a=0[v]`;
    const r2 = await run(FFMPEG, [...inputs, '-filter_complex', filter, '-map', '[v]', '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile]);
    if (!r2.ok) return { ok: false, error: 'concat 失败: ' + r2.error };
    const dur2 = await probeDuration(outFile);
    console.log(`[video-compose] filter-concat ${files.length} 段 → ${path.basename(outFile)} (${dur2 ? dur2.toFixed(2) + 's' : '?'})`);
    return { ok: true, mode: 'filter-concat', outFile, duration: dur2, size: fs.statSync(outFile).size };
  }

  // ── 模式 2：xfade 交叉溶解 ──
  if (!allKnown) return { ok: false, error: 'ffprobe 无法读取某段时长，无法计算 xfade 偏移' };
  const inputs = [];
  files.forEach((f) => inputs.push('-i', f));
  let filter = '';
  let acc = files[0] ? '[0:v]' : '';
  let accDur = durations[0];
  for (let i = 1; i < files.length; i++) {
    const offset = Math.max(0, accDur - d);          // 上一段累加时长 - 过渡时长
    const out = i === files.length - 1 ? '[v]' : `[v${i}]`;
    filter += `${acc}${[`[${i}:v]`]}xfade=transition=fade:duration=${d.toFixed(3)}:offset=${offset.toFixed(3)}${out};`;
    acc = out;
    accDur = accDur + durations[i] - d;
  }
  filter = filter.replace(/;$/, '');
  const r = await run(FFMPEG, [...inputs, '-filter_complex', filter, '-map', '[v]', '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile]);
  if (!r.ok) return { ok: false, error: 'xfade 失败: ' + r.error };
  const dur = await probeDuration(outFile);
  console.log(`[video-compose] xfade(${d}s) ${files.length} 段 → ${path.basename(outFile)} (${dur ? dur.toFixed(2) + 's' : '?'})`);
  return { ok: true, mode: 'xfade', outFile, duration: dur, size: fs.statSync(outFile).size };
}

/**
 * 生成合成输出路径（写进项目 workspace，和分镜头同一目录规则）
 *   workspaces/{slug}/assets/{date}/final_{n}seg_{hash}.mp4
 */
function buildOutputPath(projectSlug, segmentCount, transition) {
  const dateStr = new Date().toISOString().split('T')[0];
  const dir = path.join(WORKSPACE_ROOT, projectSlug, 'assets', dateStr);
  fs.mkdirSync(dir, { recursive: true });
  const hash = crypto.randomBytes(4).toString('hex');
  const fileName = `final_${segmentCount}seg_${transition}_${hash}.mp4`;
  return { absPath: path.join(dir, fileName), assetPath: `assets/${dateStr}/${fileName}` };
}

/** 相对 asset_path → 绝对路径（asset_path 存的是相对项目 workspace 的路径） */
function resolveAssetPath(projectSlug, assetPath) {
  if (!assetPath) return null;
  return path.join(WORKSPACE_ROOT, projectSlug, String(assetPath).replace(/\//g, path.sep));
}

module.exports = { concatVideos, buildOutputPath, resolveAssetPath, probeDuration, WORKSPACE_ROOT };
