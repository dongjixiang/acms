// ACMS · 剧本连续性静态校验（v0.X continuity_bible，warn-only 不阻塞）
//   抽出来独立成模块：纯函数无副作用，方便测试（不依赖 stores/db）
//
// 检测三类问题：
//   ① 凭空出现（phantom_prop）       scene.props_present 含未登记 + 前序场也未出现的关键道具
//   ② 未回收伏笔（unresolved_setup）scene.props_setup 中的道具在后续 1~3 场内未被引用/回收
//   ③ 未登记伏笔（unregistered_setup）scene.props_setup 中的道具未在 continuity_props 登记
//
// 触发条件：仅当 LLM 输出含 continuity_props 或 props_* 字段时才校验
//   老剧本（无新字段）→ 全跳过，返回 []
//
// 匹配策略：substring 长度 ≥2 的中文 token 匹配
//   "长剑" in "长剑（林风持）"  → 命中
//   "长剑" in "那把长剑"        → 命中
//   "长剑" not in "剑鞘"        → 不命中（视为不同道具）

/**
 * 校验单个剧本的连续性，返回 [{ code, scene_idx, prop, message }]（空 = 无问题）
 * @param {object} sp - 已 parse 过的剧本（含 continuity_props / continuity_state / scenes[].props_*）
 * @returns {Array<{code:string, scene_idx:number, prop:string, message:string}>}
 */
function validateScreenplayContinuity(sp) {
  const warnings = [];
  if (!sp || typeof sp !== 'object') return warnings;

  const props = Array.isArray(sp.continuity_props) ? sp.continuity_props : [];
  const scenes = Array.isArray(sp.scenes) ? sp.scenes : [];

  // 没启用 continuity_bible → 跳过（避免对老剧本刷屏）
  if (props.length === 0 && scenes.every(s => !s.props_present?.length && !s.props_setup?.length && !s.props_resolve?.length)) {
    return warnings;
  }

  // 工具：去标点后的字符串
  function tokenOf(s) {
    return String(s || '').replace(/[\s\u3000\u3001\u3002\uff0c\uff01\uff1f\u300a\u300b\u300c\u300d\u300e\u300f\uff08\uff09\u3010\u3011\uff5b\uff5d\u201c\u201d\u2018\u2019:：;；"'"「」（）]/g, '').trim();
  }
  // 工具：a 是否与 b 有 ≥2 字符子串重叠
  function hasOverlap(a, b) {
    const ta = tokenOf(a);
    const tb = tokenOf(b);
    if (!ta || !tb) return false;
    if (ta === tb) return true;
    const shorter = ta.length <= tb.length ? ta : tb;
    const longer = ta.length <= tb.length ? tb : ta;
    if (shorter.length < 2) return false;
    return longer.indexOf(shorter) >= 0;
  }

  // 关键道具登记台账
  const registeredLabels = props.map(p => String(p.label || '').trim()).filter(Boolean);

  // 跨场已出现道具（动态累加）
  const seenLabels = new Set();

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const present = Array.isArray(sc.props_present) ? sc.props_present : [];
    const setup = Array.isArray(sc.props_setup) ? sc.props_setup : [];

    // ① 检测凭空出现
    for (const p of present) {
      const tp = tokenOf(p);
      if (!tp || tp.length < 2) continue;  // ≤1 字符视为噪声
      const inRegistry = registeredLabels.some(l => hasOverlap(l, tp));
      const seenBefore = Array.from(seenLabels).some(l => hasOverlap(l, tp));
      if (!inRegistry && !seenBefore) {
        warnings.push({
          code: 'phantom_prop',
          scene_idx: i,
          prop: p,
          message: `第 ${i + 1} 场出现道具「${p}」，但 continuity_props 未登记且前序场也未出现（凭空出现风险）`,
        });
      }
      seenLabels.add(tp);
    }

    // ③ 检测 setup 中的道具是否在 continuity_props 登记
    for (const s of setup) {
      const ts = tokenOf(s);
      if (!ts || ts.length < 2) continue;
      const inRegistry = registeredLabels.some(l => hasOverlap(l, ts));
      if (!inRegistry) {
        warnings.push({
          code: 'unregistered_setup',
          scene_idx: i,
          prop: s,
          message: `第 ${i + 1} 场埋设伏笔「${s}」但 continuity_props 未登记，建议先登记再埋伏笔`,
        });
      }
    }
  }

  // ② 检测未回收伏笔：N+1..N+3 范围内是否被引用/回收
  for (let i = 0; i < scenes.length; i++) {
    const setup = Array.isArray(scenes[i].props_setup) ? scenes[i].props_setup : [];
    if (setup.length === 0) continue;

    const windowEnd = Math.min(scenes.length - 1, i + 3);
    for (const s of setup) {
      const ts = tokenOf(s);
      if (!ts || ts.length < 2) continue;
      let resolved = false;
      for (let j = i + 1; j <= windowEnd; j++) {
        const sc = scenes[j];
        const candidates = [
          ...(Array.isArray(sc.props_present) ? sc.props_present : []),
          ...(Array.isArray(sc.props_resolve) ? sc.props_resolve : []),
        ];
        if (candidates.some(c => hasOverlap(c, ts))) { resolved = true; break; }
      }
      if (!resolved) {
        warnings.push({
          code: 'unresolved_setup',
          scene_idx: i,
          prop: s,
          message: `第 ${i + 1} 场埋设的「${s}」在后续 1~3 场内未引用也未回收（伏笔可能丢失）`,
        });
      }
    }
  }

  return warnings;
}

module.exports = { validateScreenplayContinuity };