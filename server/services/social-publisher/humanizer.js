// ACMS social-publisher — humanizer.js
// ======================================
// 行为模拟：让 LLM 操作的浏览器像真人，避免被风控
// 参考 humanized-social-publisher（GitHub ⭐42）核心思想
//
// 设计原则（简版，PR 5 再扩展）：
//   1. 步间停顿：每步操作间随机 800-2000ms（不要 0ms 机械感）
//   2. 人类打字：每个字符 80-200ms 随机（不要瞬时整段）
//   3. 点击前悬停：先 mouseMove 再 click（避免机器人特征）
//   4. 滚动模拟：分多步 scroll（不要一次滚到底）
//
// 复用：所有调用走 ba.*（browser-agent），零新依赖

'use strict';

const ba = require('../browser-agent');

// ── 通用等待（min/max 区间随机）──
async function wait(min = 1000, max = 3000) {
  const ms = min + Math.random() * (max - min);
  await new Promise(r => setTimeout(r, ms));
  return ms;
}

// ── 人类打字（每个字符 80-200ms）──
async function typeLikeHuman(text, selector) {
  if (!text || !selector) return { ok: false, error: 'missing_args' };
  // 先点击聚焦
  await ba.click(selector);
  await wait(200, 500);
  // 逐字输入
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    await ba.typeText(selector, char);
    // 中文不分字符（typeText 整段提交），所以每"段"停顿
    // 对英文/数字：每字符停
    if (/[\x00-\x7F]/.test(char)) {
      await wait(80, 200);
    } else {
      await wait(50, 120);
    }
  }
  return { ok: true, chars: text.length };
}

// ── 类人点击（先悬停再点击）──
async function clickLikeHuman(selector) {
  if (!selector) return { ok: false, error: 'missing_selector' };
  // 随机短悬停（如果有 mouseMove 能力）
  await wait(150, 400);
  return await ba.click(selector);
}

// ── 类人滚动（分多步）──
async function scrollLikeHuman(deltaY, steps = null) {
  if (typeof deltaY !== 'number') return { ok: false, error: 'missing_deltaY' };
  const numSteps = steps || (5 + Math.floor(Math.random() * 5));
  const stepSize = Math.floor(deltaY / numSteps);
  for (let i = 0; i < numSteps; i++) {
    await ba.mouseWheel ? await ba.mouseWheel(stepSize) : null;
    await wait(50, 150);
  }
  return { ok: true, steps: numSteps };
}

// ── 输入框清空（更"人"的方式：全选 + 删除）──
async function clearInput(selector) {
  if (!selector) return { ok: false };
  await ba.click(selector);
  await wait(200, 400);
  // Ctrl+A 全选
  await ba.press('Control+a');
  await wait(100, 200);
  // Delete 删除
  await ba.press('Delete');
  await wait(200, 400);
  return { ok: true };
}

// ── 模拟阅读停顿（看完一段再操作）──
async function readingPause(textLength = 200) {
  // 假设人读 200 字/分钟 → 1 字/300ms
  const ms = Math.min(3000, Math.max(500, textLength * 50));
  await wait(ms, ms + 500);
  return ms;
}

// ── v0.118 PR 5-3: 鼠标轨迹模拟（贝塞尔曲线 / 起点终点 + 控制点）──
// 真人鼠标从 A 到 B 不会走直线，会走弧线
// 用二项贝塞尔：B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
async function mouseTrajectory(fromX, fromY, toX, toY, steps = 20) {
  // 控制点：在中点附近随机偏移
  const cx = (fromX + toX) / 2 + (Math.random() - 0.5) * 100;
  const cy = (fromY + toY) / 2 + (Math.random() - 0.5) * 100;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * fromX + 2 * (1 - t) * t * cx + t * t * toX;
    const y = (1 - t) * (1 - t) * fromY + 2 * (1 - t) * t * cy + t * t * toY;
    // 每步之间小停顿
    if (ba.mouseMove) {
      await ba.mouseMove(Math.round(x), Math.round(y));
    }
    await wait(5, 15);
  }
}

// ── v0.118 PR 5-3: 真实随机偏差（避免重复模式）──
// 大部分 LLM 操作的浏览器时间间隔过于规律，加随机扰动
function jitter(base, percent = 0.3) {
  return base * (1 + (Math.random() - 0.5) * 2 * percent);
}

// ── 真实滚动（PR 5-3：分多步 + 加速 + 回弹）──
async function naturalScroll(targetY, currentY = 0) {
  const delta = targetY - currentY;
  if (Math.abs(delta) < 50) return { ok: true, skipped: true };
  const direction = delta > 0 ? 1 : -1;
  const absDelta = Math.abs(delta);
  // 分 N 步，每步大小 = 平均 + 随机 ±30%
  const steps = Math.max(5, Math.min(20, Math.floor(absDelta / 80)));
  for (let i = 0; i < steps; i++) {
    const stepSize = jitter(absDelta / steps);
    if (ba.mouseWheel) {
      await ba.mouseWheel(direction * stepSize);
    }
    await wait(30, 120);
  }
  // 偶尔回弹一下（模拟人滚过头回看）
  if (Math.random() < 0.3) {
    await wait(300, 600);
    if (ba.mouseWheel) {
      await ba.mouseWheel(-direction * jitter(50, 0.5));
    }
  }
  return { ok: true, steps, direction };
}

module.exports = {
  wait,
  typeLikeHuman,
  clickLikeHuman,
  scrollLikeHuman,
  naturalScroll,
  clearInput,
  readingPause,
  mouseTrajectory,
  jitter,
};
