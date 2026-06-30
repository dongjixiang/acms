// ACMS · 剧本辅助（v0.22，2026-06-28）
//   用户输入一句话创意 + 目标时长 → LLM 生成 3 个短视频剧本选项
//   用户挑一个 → 剧本信息提交到对话框（写 supplement_history + 填入输入框）
//   用户不满意 → 「换一批」重新生成
//
// 字段：requirement.assist_screenplay（status / screenplays / picked / logline / error）

const { callLLMWithRetry } = require('../json-extractor');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');

function pickDefaultLlm() {
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

const SCREENPLAY_PROMPT = `你是 ACMS 系统的「剧本助手」。根据用户的一句话创意 + 目标时长 + 艺术风格，生成 3 个**风格/角度明显不同**的短视频剧本。

## 每个剧本字段
- title (≤12 字)：剧本名（抓眼球的）
- logline (≤30 字)：一句话剧情简介
- characters: [{name, desc}]：1-3 个角色
  - name：角色名（中英文都可，如"擎天柱"、"Optimus"、"威震天"）
  - desc (≤50 字)：**关键！必须包含视觉特征描述**——外观/颜色/标志物/IP 名称
    - ✅ 好例："红蓝配色卡车头变机器人、汽车人领袖 G1 经典造型"（35 字）
    - ✅ 好例："钢铁侠红金机甲、胸口弧反应堆发光"（17 字）
    - ❌ 差例："汽车人领袖"（无视觉特征）
    - ❌ 差例："霸气的反派"（无视觉特征）
    - **如果用户输入含知名 IP 名（如擎天柱/超人/蜘蛛侠/皮卡丘/路飞/柯南/甄嬛等），desc 必须写明 IP 来源 + 视觉特征！**
- setting (≤40 字)：场景设定（时间/地点/氛围，含视觉元素）
  - ✅ 好例："赛博坦星球表面、火山熔岩背景、机械废墟"
  - ✅ 好例："霍格沃茨魔法大厅、漂浮蜡烛、石墙浮雕"
- scenes: [{time, shot, dialogue, action}]：分镜
  - 时长字段示例："0-5s"、"5-15s"、"15-25s"
  - shot: 镜头描述（≤25 字，景别+构图）
  - dialogue: 对白（≤40 字，无对白可写"——"）
  - action: 动作/事件（≤30 字）
  - 场数与时长匹配：30s → 4-5 场；60s → 6-8 场；15s → 3 场
- shot_tips (≤40 字)：拍摄建议（设备/运镜/风格/情绪）

## 艺术风格 art_style（重要！）
用户会指定一个 art_style（写实摄影/3D 渲染/G1 动画/日漫/国风水墨），所有 3 个剧本必须使用**同一个 art_style**（保证用户后续生成的图片风格一致）。
在 desc 和 setting 里**不能暗示其他风格**——如果 art_style 是"写实摄影"，不要写"动漫风格的 XX"。

## 风格要求
- 3 个剧本**剧情角度**明显不同（如：治愈系、悬疑、搞笑；或：文艺、节奏紧凑、留白）
- 故事要**有起承转合**（不必完整，但有钩子）
- 角色要有**冲突/欲望**，不能只是"介绍产品"
- 对白要**自然口语化**，避免广告腔
- **如果用户输入含知名 IP，所有角色 desc 必须包含 IP 视觉锚定信息**（不是只写 IP 名）

## 输出格式（严格 JSON）
{"screenplays":[
  {"title":"...","logline":"...","characters":[{"name":"...","desc":"..."}],"setting":"...","scenes":[{"time":"...","shot":"...","dialogue":"...","action":"..."}],"shot_tips":"..."},
  ...（共 3 个）
]}

不要任何额外文字、markdown 代码块、解释。`;

/**
 * 根据时长决定场数
 */
function calcSceneCount(targetSeconds) {
  if (targetSeconds <= 15) return 3;
  if (targetSeconds <= 30) return 5;
  if (targetSeconds <= 60) return 7;
  return 9;
}

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  let idea = (opts.idea || '').trim();
  let targetSeconds = parseInt(opts.target_seconds) || 30;
  // v0.22.31: 接受 art_style 参数（剧本级共享，写实/3D/G1/日漫/国风水墨）
  const artStyle = opts.art_style || 'photorealistic';
  // v0.22: 换一批时如果 body 没带 idea/target/art_style，从旧 assist_screenplay 读（fallback）
  if (opts.forceRegenerate) {
    try {
      const existing = JSON.parse(req.assist_screenplay || 'null');
      if (existing) {
        if (!idea && existing.idea) idea = existing.idea;
        if (!opts.target_seconds && existing.target_seconds) targetSeconds = existing.target_seconds;
        // v0.22.31: 换一批时也保留 art_style（保持风格一致）
        if (!opts.art_style && existing.art_style) artStyle = existing.art_style;
      }
    } catch { /* 静默降级 */ }
  }
  const sceneCount = calcSceneCount(targetSeconds);

  if (!idea) {
    reqStore.update(requirementId, {
      assist_screenplay: JSON.stringify({
        status: 'failed',
        error: 'NO_IDEA',
        idea: '',
        generated_at: new Date().toISOString(),
      }),
    });
    return;
  }

  // 换一批：把已生成的旧剧本喂给 LLM 让它避免重复
  let previousScreenplays = [];
  if (opts.forceRegenerate) {
    try {
      const existing = JSON.parse(req.assist_screenplay || 'null');
      if (existing && Array.isArray(existing.screenplays)) {
        previousScreenplays = existing.screenplays;
      }
    } catch { /* 静默降级 */ }
  }

  reqStore.update(requirementId, {
    assist_screenplay: JSON.stringify({
      status: 'generating',
      idea,
      target_seconds: targetSeconds,
      scene_count: sceneCount,
      // v0.22.31: 剧本级艺术风格（前端 sp.art_style 读这个字段，buildCharacterPrompt 用作硬约束）
      art_style: artStyle,
      screenplays: [],
      picked: null,
      // v0.22.8: 资源存储 — 角色图/场景图/分镜头视频
      assets: { characters: {}, scenes: {} },
      scene_videos: {},
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
      regenerate_count: opts.forceRegenerate
        ? ((JSON.parse(req.assist_screenplay || '{}').regenerate_count || 0) + 1)
        : 0,
    }),
  });
  console.log(`[assist:screenplay] ${requirementId} 开始生成${opts.forceRegenerate ? '（换一批）' : ''}: "${idea.slice(0, 30)}..." ${targetSeconds}s · ${artStyle}`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const userParts = [
      `创意描述: ${idea}`,
      `目标时长: ${targetSeconds} 秒（建议 ${sceneCount} 场分镜）`,
      // v0.22.31: 把 art_style 传给 LLM（剧本 prompt 已要求用统一风格）
      `艺术风格: ${artStyle}（所有 3 个剧本必须使用此风格）`,
      opts.role ? `用户角色: ${opts.role}` : '',
    ];
    if (previousScreenplays.length > 0) {
      userParts.push('---');
      userParts.push('【已换过的剧本】（用户觉得都不符合，请给出明显不同的剧情角度，但艺术风格保持不变）：');
      previousScreenplays.forEach((s, i) => {
        userParts.push(`#${i + 1}: ${s.title || ''}（logline: ${s.logline || ''}）`);
      });
      userParts.push('请确保新剧本在剧情角度/切入点上与已换过的有明显差异，但艺术风格保持用户指定的 art_style。');
    }
    const messages = [
      { role: 'system', content: SCREENPLAY_PROMPT },
      { role: 'user', content: userParts.filter(Boolean).join('\n') },
    ];

    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.85,  // 高一点鼓励多样性
      maxTokens: 3000,    // 3 个剧本，场数多，要大
      jsonMode: true,
      serviceName: 'assist:screenplay',
    });
    if (!Array.isArray(parsed.screenplays)) throw new Error('LLM 返回缺少 screenplays 字段');
    // v0.22.31: 放宽切片限制（原 desc slice 30 太短，砍掉视觉特征 → "擎天柱"+"汽车人领袖"两个空描述）
    //   name 30 / desc 80（含视觉特征）/ setting 80 / shot 50 / dialogue 80 / action 60 / shot_tips 80
    const screenplays = parsed.screenplays.slice(0, 3).map(sp => ({
      title: String(sp.title || '').slice(0, 30),
      logline: String(sp.logline || '').slice(0, 80),
      characters: Array.isArray(sp.characters) ? sp.characters.slice(0, 3).map(c => ({
        name: String(c.name || '').slice(0, 20),
        desc: String(c.desc || '').slice(0, 80),
      })) : [],
      setting: String(sp.setting || '').slice(0, 80),
      scenes: Array.isArray(sp.scenes) ? sp.scenes.slice(0, sceneCount + 1).map(sc => ({
        time: String(sc.time || '').slice(0, 15),
        shot: String(sc.shot || '').slice(0, 50),
        dialogue: String(sc.dialogue || '').slice(0, 80),
        action: String(sc.action || '').slice(0, 60),
      })) : [],
      shot_tips: String(sp.shot_tips || '').slice(0, 80),
    }));

    reqStore.update(requirementId, {
      assist_screenplay: JSON.stringify({
        status: 'done',
        idea,
        target_seconds: targetSeconds,
        scene_count: sceneCount,
        // v0.22.31: 持久化 art_style
        art_style: artStyle,
        screenplays,
        picked: null,
        assets: { characters: {}, scenes: {} },
        scene_videos: {},
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:screenplay] ${requirementId} 完成, ${screenplays.length} 个剧本 · ${artStyle}`);
  } catch (e) {
    console.error(`[assist:screenplay] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_screenplay: JSON.stringify({
        status: 'failed',
        idea,
        target_seconds: targetSeconds,
        scene_count: sceneCount,
        // v0.22.31: 失败时也保存 art_style（前端可读）
        art_style: artStyle,
        screenplays: [],
        picked: null,
        assets: { characters: {}, scenes: {} },
        scene_videos: {},
        error: e.message,
        generated_at: new Date().toISOString(),
        used: false,
      }),
    });
  }
}

/**
 * 用户选了某个剧本 → 标记 + 写聊天流（让 LLM 看到）
 */
function markPicked(requirementId, idx) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_screenplay || 'null'); } catch { assist = null; }
  if (!assist || !Array.isArray(assist.screenplays) || !assist.screenplays[idx]) return null;

  assist.used = true;
  assist.picked = idx;
  assist.picked_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });

  // 写聊天流（按 P11 教训：结果必须出现在聊天流中）
  writeScreenplayChatEntry(requirementId, assist.screenplays[idx], {
    idea: assist.idea,
    target_seconds: assist.target_seconds,
    idx,
    total: assist.screenplays.length,
  });

  return assist;
}

/**
 * 把选中的剧本写入 supplement_history
 *  - role: 'system'（P11 教训）
 *  - source: 'screenplay_result'（前端检测）
 *  - text: 结构化 JSON（按 P11 JSON 格式）
 */
function writeScreenplayChatEntry(reqId, screenplay, meta = {}) {
  const req = reqStore.getById(reqId);
  if (!req) return;
  let history;
  try { history = JSON.parse(req.supplement_history || '[]'); } catch { history = []; }
  if (!Array.isArray(history)) history = [];

  // v0.22.15: 读当前 assist_screenplay 拿 assets/scene_videos（之前有 scope 泄漏 bug）
  let currentAssist = null;
  try { currentAssist = JSON.parse(req.assist_screenplay || 'null'); } catch { currentAssist = null; }

  // 移除同 idea 的旧 screenplay_result 卡片（避免换剧本后多卡并存）
  history = history.filter(e => {
    if (e.source !== 'screenplay_result') return true;
    try {
      const old = JSON.parse(e.text || '{}');
      return old.idea !== meta.idea;
    } catch { return true; }
  });

  // 移除同 idea 的旧 loading 卡片
  history = history.filter(e => {
    if (e.source !== 'screenplay_precheck') return true;
    try {
      const old = JSON.parse(e.text || '{}');
      return old.idea !== meta.idea;
    } catch { return true; }
  });

  const card = {
    type: 'screenplay_card',
    idea: meta.idea || '',
    target_seconds: meta.target_seconds || 30,
    picked_idx: meta.idx ?? 0,
    total: meta.total || 1,
    screenplay,
    // v0.22.13: 把当前资源状态也写进 card（前端聊天流卡片可读完整状态 + 交互）
    assets: (currentAssist?.assets) || { characters: {}, scenes: {} },
    scene_videos: (currentAssist?.scene_videos) || {},
    // v0.22.20: 把 project_id 写进 card（之前漏了，聊天流卡片拼本地 URL 时 fallback 到 'default' → 404）
    project_id: req.project_id || null,
    saved_at: new Date().toISOString(),
  };

  history.push({
    role: 'system',
    text: JSON.stringify(card),
    at: new Date().toISOString(),
    source: 'screenplay_result',
  });

  reqStore.update(reqId, { supplement_history: JSON.stringify(history) });
}

/**
 * v0.22.8: 设置角色图或场景图（image_gen 完成后调用）
 *   payload: { asset_type: 'character' | 'scene', asset_key, options: [3 张], picked_idx: 0 }
 *   options[i] = { image_url_output, asset_path, mime, size }
 */
function setAsset(requirementId, payload) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_screenplay || 'null'); } catch { assist = null; }
  if (!assist) return null;
  if (!assist.assets) assist.assets = { characters: {}, scenes: {} };

  const { asset_type, asset_key, options, picked_idx } = payload;
  const idx = picked_idx || 0;
  if (asset_type === 'character') {
    if (!assist.assets.characters) assist.assets.characters = {};
    assist.assets.characters[asset_key] = {
      options: options || [],
      picked_idx: idx,
      image_url_output: options?.[idx]?.image_url_output || null,
      asset_path: options?.[idx]?.asset_path || null,
      mime: options?.[idx]?.mime || null,
      saved_at: new Date().toISOString(),
    };
  } else if (asset_type === 'scene') {
    if (!assist.assets.scenes) assist.assets.scenes = {};
    const k = String(asset_key);
    assist.assets.scenes[k] = {
      options: options || [],
      picked_idx: idx,
      image_url_output: options?.[idx]?.image_url_output || null,
      asset_path: options?.[idx]?.asset_path || null,
      mime: options?.[idx]?.mime || null,
      saved_at: new Date().toISOString(),
    };
  } else {
    return null;
  }

  reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });

  // v0.22.20: 同步重写聊天流 screenplay_result 卡片
  //   之前 setAsset 只更新了 assist_screenplay.assets，但聊天流那张卡片是 markPicked 时写一次的
  //   → 聊天流卡片永远显示空 assets（0/1）。现在 setAsset 之后立即重写聊天流卡片
  if (assist.used && assist.picked !== null && assist.picked !== undefined) {
    try {
      writeScreenplayChatEntry(requirementId, assist.screenplays[assist.picked], {
        idea: assist.idea,
        target_seconds: assist.target_seconds,
        idx: assist.picked,
        total: assist.screenplays.length,
      });
    } catch (e) {
      console.warn(`[assist:screenplay] ${requirementId} setAsset 后重写聊天流卡片失败:`, e.message);
    }
  }

  return assist;
}

/**
 * v0.22.8: 设置分镜头视频（video assist 完成后调用）
 *   payload: { scene_idx, video_id, video_url, asset_path, status, raw }
 */
function setSceneVideo(requirementId, sceneIdx, payload) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_screenplay || 'null'); } catch { assist = null; }
  if (!assist) return null;
  if (!assist.scene_videos) assist.scene_videos = {};

  assist.scene_videos[String(sceneIdx)] = {
    video_id: payload.video_id || null,
    video_url: payload.video_url || null,
    asset_path: payload.asset_path || null,
    status: payload.status || 'pending',
    created_at: new Date().toISOString(),
  };

  reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });

  // v0.22.20: 同步重写聊天流 screenplay_result 卡片（让分镜头视频也及时回显）
  if (assist.used && assist.picked !== null && assist.picked !== undefined) {
    try {
      writeScreenplayChatEntry(requirementId, assist.screenplays[assist.picked], {
        idea: assist.idea,
        target_seconds: assist.target_seconds,
        idx: assist.picked,
        total: assist.screenplays.length,
      });
    } catch (e) {
      console.warn(`[assist:screenplay] ${requirementId} setSceneVideo 后重写聊天流卡片失败:`, e.message);
    }
  }

  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_screenplay || 'null'); } catch { return null; }
}

module.exports = {
  name: '短视频剧本（3 个剧本选项 + 角色/场景/分镜头资源联动）',
  field: 'assist_screenplay',
  runAssistJob,
  markPicked,
  setAsset,        // v0.22.8: 角色/场景图写入
  setSceneVideo,   // v0.22.8: 分镜头视频写入
  getAssist,
  writeScreenplayChatEntry,
};
