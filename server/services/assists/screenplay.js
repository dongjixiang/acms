// ACMS · 剧本辅助（v0.22，2026-06-28）
//   用户输入一句话创意 + 目标时长 → LLM 生成 3 个短视频剧本选项
//   用户挑一个 → 剧本信息提交到对话框（写 supplement_history + 填入输入框）
//   用户不满意 → 「换一批」重新生成
//
// 字段：requirement.assist_screenplay（status / screenplays / picked / logline / error）

const { callLLMWithRetry } = require('../json-extractor');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');
// 🆕 v0.X continuity_bible: 抽到独立模块（纯函数，无 server 依赖，方便测试）
const { validateScreenplayContinuity } = require('./screenplay-continuity');

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
- 🔒 **非人形角色纪律（v0.22.X fix：「老拖车画成人」根因）**
  当角色**不是人类**（车辆 / 动物 / 机械 / 物件 / 建筑 / 植物 / 食物 / 自然物 / 光影等）时：
  - desc **只写视觉特征**（颜色 / 材质 / 体型 / 装饰 / 标志物），**禁止人类词汇**
  - ❌ 禁用词（人格 / 人性描述）：沧桑 / 老成 / 长者 / 稳重 / 经验丰富 / 严肃 / 冷静 / 急躁 / 活泼 / 善良 / 凶狠
    - 想表达「老」→ 用物理词：划痕 / 锈斑 / 磨损 / 褪色 / 掉漆 / 老旧外壳
    - 想表达「性格 / 气质」→ 用行为词：慢速 / 警觉 / 沉稳姿态 / 急促 / 抖动
  - ✅ 好例：「白色小型货车、圆润车头大灯、绿色条纹装饰、可爱卡通造型」（纯视觉）
  - ❌ 差例：「棕色重型拖车、沧桑车身划痕、**经验丰富的长者形象**」（「沧桑」「长者」把 LLM 带偏 → 画成老人）
  - ✅ 差例修复：「棕色重型拖车、车身锈斑划痕、黄色警示灯、老旧磨损外壳」（全视觉）
  - 人类角色（人/拟人化人）正常用外貌词即可（发型/发色/衣服/表情），无需套用此纪律
- setting (≤40 字)：场景设定（时间/地点/氛围，含视觉元素）—— **全剧基调**
  - ✅ 好例："赛博坦星球表面、火山熔岩背景、机械废墟"
  - ✅ 好例："霍格沃茨魔法大厅、漂浮蜡烛、石墙浮雕"
- 🆕 continuity_props: 全剧关键道具/物品清单（按出现先后登记；**只登有剧情意义的，杂物不登**）
  [{ key, label, first_intro, status_in_end, note }]
  - key（≤10 字）：道具 ID（英文短词/拼音，如 "sword"/"letter"/"denglong"）
  - label（≤15 字）：道具中文名（如"长剑"/"密信"/"红纱灯"）
  - first_intro：第几场首次出现（整数 1~sceneCount）
  - status_in_end：结尾状态，"carry"/"lost"/"broken"/"left"（仍在/丢失/毁坏/留下）
  - note（≤40 字）：道具剧情作用简述
- 🆕 continuity_state: 全剧世界/角色状态追踪（**只登跨场变化的字段**；无变化可省略）
  { "world_time": "黄昏→夜晚→黎明", "weather": "晴→雨→晴", "character_states": { "林风": { "injury": "第 3 场左肩中箭; 第 6 场痊愈", "costume": "黑衣（第 5 场换青衫）", "location": "破庙→山道→客栈" } } }
- scenes: [{characters, time, shot, dialogue, action, scene_location, props_present, props_setup, props_resolve}]：分镜
  - 🆕 v0.X fix: characters: [name1, name2] 必填（出场角色名，从上面的 characters 数组里挑）
    之前没有这个字段 → buildSceneVideoPrompt 不知道谁出场 → 生图 LLM 自己脑补 → 画出"不在剧本里的人物"
  - 时长字段示例："0-5s"、"5-15s"、"15-25s"
  - shot: 镜头描述（≤25 字，景别+构图）
  - dialogue: 对白（≤40 字，无对白可写"——"）
  - action: 动作/事件（≤30 字）—— 🆕 必须写明"谁在做这个动作"（用具体角色名，不要用"两人""某人"）
    - ✅ 好例："君子与玉兰相视而笑"
    - ❌ 差例："两人相视而笑"（生图 LLM 不知道是哪两个人）
  - 🆕 scene_location（≤20 字）：本场具体地点/环境（**独立于全局 setting**）
    - 同一场地点变化写"破庙内殿 → 后院"；单场景全剧可与 setting 相同
  - 🆕 props_present（≤6 项，每项 ≤15 字）：本场出现的所有关键道具
    - **必须从 continuity_props 或前一场的 props_present/props_resolve 派生**（禁止凭空出现）
  - 🆕 props_setup（≤3 项，每项 ≤15 字）：本场为未来场埋伏笔的道具
  - 🆕 props_resolve（≤3 项，每项 ≤15 字）：本场回收/移除的道具（如"长剑丢失"）
  - 场数与时长匹配：30s → 4-5 场；60s → 6-8 场；15s → 3 场
- shot_tips (≤40 字)：拍摄建议（设备/运镜/风格/情绪）

## 连续性与科学性纪律（v0.X fix：3 个症状的根因修复）

### 1. 顺序：先列道具清单，再写分镜
- scenes[] 之前**必须先输出** continuity_props 和 continuity_state（这两个字段不能为空）
- 写每个 scene 时，先看 continuity_props 决定哪些道具本场该出现，再写 action / props_present

### 2. 场景间硬约束
- **禁止凭空出现**：未在 continuity_props 登记的关键物品，不得在本场 props_present 出现（除非剧情明确要求"凭空出现"作为转折，且在 note 里说明）
- **伏笔必回收**：scene N 的 props_setup 中的道具，必须在 scene N+1 ~ N+3 之间的某个 scene 出现在 props_present（被引用）或 props_resolve（被回收）
- **角色状态跨场一致**：连续性体现在 scene.action 描述中（如"林风因中箭而捂住左肩"），由 continuity_state 兜底登记

### 3. 科学/历史/常识纪律
- 用户创意涉及已知历史时期（如战国/唐朝/民国）/ 科学主题（如化学反应/物理实验）/ 物理规则时，必须符合基本事实
- **不确定时写"年代未明示"/"材质未明示"**，禁止凭印象编造（如不要凭空给宋朝人物加 iPhone / 给古代医馆塞心电图机）
- 现代物品出现在历史/古典场景必须有合理解释（穿越 / 科幻设定除外），由用户在 idea 里说明
- 道具的材质/工艺必须符合时代背景（如战国铜剑不会出现现代钢材的光泽）

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
  {"title":"...","logline":"...","characters":[{"name":"...","desc":"..."}],"setting":"...","continuity_props":[{"key":"...","label":"...","first_intro":1,"status_in_end":"carry","note":"..."}],"continuity_state":{"world_time":"...","weather":"...","character_states":{"角色名":{"injury":"...","costume":"..."}}},"scenes":[{"characters":["..."],"time":"...","shot":"...","dialogue":"...","action":"...","scene_location":"...","props_present":["..."],"props_setup":["..."],"props_resolve":["..."]}],"shot_tips":"..."},
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

// 🆕 v0.X continuity_bible: 校验函数抽到独立模块 ./screenplay-continuity.js（纯函数便于测试）

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
      // 🆕 v0.X continuity_bible: 全剧关键道具登记（防御式，老剧本可能没这字段 → 空数组兜底）
      continuity_props: Array.isArray(sp.continuity_props) ? sp.continuity_props.slice(0, 30).map(p => ({
        key: String(p?.key || '').slice(0, 10),
        label: String(p?.label || '').slice(0, 15),
        first_intro: Number.isInteger(p?.first_intro) ? p.first_intro : 1,
        status_in_end: ['carry', 'lost', 'broken', 'left'].includes(p?.status_in_end) ? p.status_in_end : 'carry',
        note: String(p?.note || '').slice(0, 40),
      })) : [],
      // 🆕 v0.X continuity_bible: 全剧世界/角色状态快照（防御式，LLM 字段不全也兜底为 {}）
      continuity_state: (sp.continuity_state && typeof sp.continuity_state === 'object' && !Array.isArray(sp.continuity_state))
        ? {
            world_time: String(sp.continuity_state.world_time || '').slice(0, 60),
            weather: String(sp.continuity_state.weather || '').slice(0, 60),
            character_states: (sp.continuity_state.character_states && typeof sp.continuity_state.character_states === 'object' && !Array.isArray(sp.continuity_state.character_states))
              ? Object.fromEntries(Object.entries(sp.continuity_state.character_states).slice(0, 8).map(([k, v]) => [
                  String(k || '').slice(0, 20),
                  (v && typeof v === 'object' && !Array.isArray(v))
                    ? {
                        injury: String(v.injury || '').slice(0, 60),
                        costume: String(v.costume || '').slice(0, 60),
                        location: String(v.location || '').slice(0, 60),
                      }
                    : {},
                ]))
              : {},
          }
        : { world_time: '', weather: '', character_states: {} },
      scenes: Array.isArray(sp.scenes) ? sp.scenes.slice(0, sceneCount + 1).map(sc => ({
        // 🆕 v0.X fix: 保留 characters 字段（场景出场角色名数组，从 sp.characters 里挑）
        //   之前 L37 schema 没这字段 → buildSceneVideoPrompt 不知道谁出场 → 生图 LLM 脑补"不在剧本里的人物"
        characters: Array.isArray(sc.characters) ? sc.characters.slice(0, 5).map(n => String(n || '').slice(0, 20)) : [],
        time: String(sc.time || '').slice(0, 15),
        shot: String(sc.shot || '').slice(0, 50),
        dialogue: String(sc.dialogue || '').slice(0, 80),
        action: String(sc.action || '').slice(0, 60),
        // 🆕 v0.X continuity_bible: 每场独立地点（防御式，空字符串兜底，UI 下游 fallback 到 sp.setting）
        scene_location: String(sc.scene_location || '').slice(0, 20),
        // 道具三态：防御式空数组兜底（never null）
        props_present: Array.isArray(sc.props_present) ? sc.props_present.slice(0, 6).map(p => String(p || '').slice(0, 15)).filter(Boolean) : [],
        props_setup: Array.isArray(sc.props_setup) ? sc.props_setup.slice(0, 3).map(p => String(p || '').slice(0, 15)).filter(Boolean) : [],
        props_resolve: Array.isArray(sc.props_resolve) ? sc.props_resolve.slice(0, 3).map(p => String(p || '').slice(0, 15)).filter(Boolean) : [],
      })) : [],
      shot_tips: String(sp.shot_tips || '').slice(0, 80),
    }));

    // 🆕 v0.X continuity_bible: 逐剧本跑静态校验（warn-only，不阻塞；写入 assist_screenplay.warnings 供前端展示）
    const screenplayWarnings = screenplays.map(sp => ({
      sp_idx: screenplays.indexOf(sp),
      warnings: validateScreenplayContinuity(sp),
    })).filter(s => s.warnings.length > 0);
    if (screenplayWarnings.length > 0) {
      console.log(`[assist:screenplay] ${requirementId} 连续性校验告警:`,
        screenplayWarnings.map(s => `#${s.sp_idx}=${s.warnings.length}`).join(', '));
    }

    reqStore.update(requirementId, {
      assist_screenplay: JSON.stringify({
        status: 'done',
        idea,
        target_seconds: targetSeconds,
        scene_count: sceneCount,
        // v0.22.31: 持久化 art_style
        art_style: artStyle,
        screenplays,
        // 🆕 v0.X continuity_bible: 连续性校验告警（[{sp_idx, warnings:[...]}], 不阻塞）
        warnings: screenplayWarnings,
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

  const prevPicked = assist.picked;
  assist.used = true;
  assist.picked = idx;
  assist.picked_at = new Date().toISOString();
  // v0.22.68: 换剧本 → 已生成的首帧图作废
  //   原因：scene_frames 只按「场次索引」存（0/1/2…），不区分是哪个剧本的分镜 →
  //   换剧本后旧首帧图会被当成新剧本的首帧（画面完全不对）。宁可清掉让用户重生成。
  if (prevPicked !== null && prevPicked !== undefined && prevPicked !== idx) {
    assist.scene_frames = {};
    console.log(`[assist:screenplay] ${requirementId} 剧本切换 ${prevPicked}→${idx}，已清空首帧图`);
  }
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
    // 🆕 v0.X bug fix: chat 流路径 art_style 必须写入 card
    //   之前没传 → renderFromChatEntry 拿不到 → buildCharacterPrompt 永远 fallback photorealistic
    //   选了"国风水墨"却出"写实摄影"。从 currentAssist（= req.assist_screenplay 反序列化）读，
    //   7 个 writeScreenplayChatEntry 调用点都不用改。
    art_style: currentAssist?.art_style || meta.art_style || 'photorealistic',
    // v0.22.13: 把当前资源状态也写进 card（前端聊天流卡片可读完整状态 + 交互）
    assets: (currentAssist?.assets) || { characters: {}, scenes: {} },
    scene_videos: (currentAssist?.scene_videos) || {},
    // v0.22.20: 把 project_id 写进 card（之前漏了，聊天流卡片拼本地 URL 时 fallback 到 'default' → 404）
    project_id: req.project_id || null,
    // v0.22.65: 合成后的完整视频（compose_final）也要进卡片，否则聊天流卡片看不到成片
    final_video: (currentAssist?.final_video) || null,
    // v0.22.67: 首帧图（每场一张）+ 视频选项（时长/画幅）——聊天流卡片也要能渲染
    scene_frames: (currentAssist?.scene_frames) || {},
    // v0.22.73: 没设置过也带上生效默认值 → 前端显示的就是真实在用的模型
    video_opts: (currentAssist?.video_opts) || defaultVideoOpts(currentAssist),
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

/**
 * v0.22.X: 用户在剧本视图 textarea 改了视频 prompt → 持久化到 sp.scenes[scene_idx].video_prompt_override
 *   解决「改完 prompt 点重做按钮没生效 + 刷新后提示词恢复原样」的两个 bug：
 *     ① 之前 textarea 的 value 只活在 DOM 里，刷新后 renderSelectedScreenplay 又用 buildSceneVideoPrompt 默认填回
 *     ② 之前 hasVideo=true 分支根本不渲染「重做」按钮（只显示 video），用户改完无法触发重新生成
 *   现在：onblur 自动持久化 + L520-531 分支补「🔄 重做镜头」按钮
 *
 *   payload: { scene_idx, value }
 *     - scene_idx: 整数（前端拿 sp.scenes 数组索引传过来）
 *     - value: 字符串（防御式切片 4000 字符，避免用户粘了一本书进来撑爆存储）
 *
 *   sp_idx 不从前端传 —— 永远从 assist.picked 推导（之前 L707 注释明确：screenplays[] 长度恒为 1 → picked=0；
 *   picked 是用户在 3 个候选剧本里选中的那个，sp_idx == picked 唯一合法值；前端传错会导致写到错剧本）
 *
 *   返回 { success, scene_idx, value_length }（前端 toast + poll 用）
 */
function setSceneVideoPrompt(requirementId, payload = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return { error: 'REQ_NOT_FOUND' };
  let assist;
  try { assist = JSON.parse(req.assist_screenplay || 'null'); } catch { assist = null; }
  if (!assist) return { error: 'NO_ASSIST' };

  // 防御式 sp_idx：从 picked 推导（不信任前端传的 sp_idx）
  const spIdx = Number.isInteger(assist.picked) && assist.picked >= 0 ? assist.picked : 0;
  if (!Array.isArray(assist.screenplays) || !assist.screenplays[spIdx]) {
    return { error: 'NO_SCREENPLAY', picked: assist.picked };
  }
  const sp = assist.screenplays[spIdx];

  // 防御式 scene_idx：整数 + scenes[idx] 存在
  const sceneIdx = Number(payload.scene_idx);
  if (!Number.isInteger(sceneIdx) || sceneIdx < 0 || !Array.isArray(sp.scenes) || !sp.scenes[sceneIdx]) {
    return { error: 'INVALID_SCENE_IDX', scene_idx: payload.scene_idx, scene_count: Array.isArray(sp.scenes) ? sp.scenes.length : 0 };
  }

  // 防御式 value：字符串 + 长度切片（4000 字符够 2-3 段密集镜头描述，再长就异常）
  const value = String(payload.value == null ? '' : payload.value).slice(0, 4000);

  sp.scenes[sceneIdx].video_prompt_override = value;

  reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });

  // 同步重写聊天流 screenplay_result 卡片（screenplay 字段是引用，会自动带上 video_prompt_override）
  //   之前 setSceneVideo 同样的处理 —— 这里照搬
  if (assist.used && assist.picked !== null && assist.picked !== undefined) {
    try {
      writeScreenplayChatEntry(requirementId, assist.screenplays[assist.picked], {
        idea: assist.idea,
        target_seconds: assist.target_seconds,
        idx: assist.picked,
        total: assist.screenplays.length,
      });
    } catch (e) {
      console.warn(`[assist:screenplay] ${requirementId} setSceneVideoPrompt 后重写聊天流卡片失败:`, e.message);
    }
  }

  return { success: true, scene_idx: sceneIdx, value_length: value.length };
}

/**
 * v0.22.X: 用户在剧本视图改了首帧图 prompt（架构补全 —— 之前只有 video_prompt_override，
 *   首帧图链路根本没 textarea + 持久化，导致用户改 prompt 期望影响首帧图但视频侧悄悄吃掉）。
 *   payload: { scene_idx, value }
 *     - sp_idx 不传（同 video_prompt_override，永远从 assist.picked 推导）
 *     - 持久化到 sp.scenes[scene_idx].scene_frame_prompt_override
 *   下次点「🔄 重生成首帧」时，screenplayGenSceneFrame 会把 override 当作 payload.prompt 传给 use 路由
 */
function setSceneFramePrompt(requirementId, payload = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return { error: 'REQ_NOT_FOUND' };
  let assist;
  try { assist = JSON.parse(req.assist_screenplay || 'null'); } catch { assist = null; }
  if (!assist) return { error: 'NO_ASSIST' };

  const spIdx = Number.isInteger(assist.picked) && assist.picked >= 0 ? assist.picked : 0;
  if (!Array.isArray(assist.screenplays) || !assist.screenplays[spIdx]) {
    return { error: 'NO_SCREENPLAY', picked: assist.picked };
  }
  const sp = assist.screenplays[spIdx];

  const sceneIdx = Number(payload.scene_idx);
  if (!Number.isInteger(sceneIdx) || sceneIdx < 0 || !Array.isArray(sp.scenes) || !sp.scenes[sceneIdx]) {
    return { error: 'INVALID_SCENE_IDX', scene_idx: payload.scene_idx };
  }

  const value = String(payload.value == null ? '' : payload.value).slice(0, 4000);

  sp.scenes[sceneIdx].scene_frame_prompt_override = value;

  reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });

  if (assist.used && assist.picked !== null && assist.picked !== undefined) {
    try {
      writeScreenplayChatEntry(requirementId, assist.screenplays[assist.picked], {
        idea: assist.idea,
        target_seconds: assist.target_seconds,
        idx: assist.picked,
        total: assist.screenplays.length,
      });
    } catch (e) {
      console.warn(`[assist:screenplay] ${requirementId} setSceneFramePrompt 后重写聊天流卡片失败:`, e.message);
    }
  }

  return { success: true, scene_idx: sceneIdx, value_length: value.length };
}

/**
 * v0.22.77: 「✏️ 打磨」首帧图回写
 *
 *   为什么是**覆盖**、而不是像 image_gen 那样追加候选：
 *     首帧图是「这一场的起始定格」，按场次索引存**单值**（scene_frames[sceneIdx]），
 *     下游「生成视频」直接读它当本段 first_frame / 上一段的 last_frame → 段间衔接。
 *     追加候选会让「这一场到底用哪张」变含糊，还得连带改视频链路。
 *   资产安全：原图备份到 prev（只留一层）→ 支持「↩️ 还原」。
 *
 *   payload: { scene_idx, dataUrl }                     ← 打磨回写
 *            { scene_idx, action:'revert_scene_frame' }  ← 还原上一版
 *   返回更新后的 assist（与 setSceneVideo 一致，前端拿它刷新卡片）
 */
function polishSceneFrame(requirementId, payload = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) throw new Error('需求不存在');
  let assist;
  try { assist = JSON.parse(req.assist_screenplay || 'null'); } catch { assist = null; }
  if (!assist) throw new Error('剧本数据不存在');
  if (assist.picked === null || assist.picked === undefined) throw new Error('请先选一个剧本');

  const sceneIdx = parseInt(payload.scene_idx, 10) || 0;
  const key = String(sceneIdx);
  const cur = (assist.scene_frames || {})[key];
  if (!cur) throw new Error('这一场还没有首帧图，请先生成一张再打磨');

  const rewrite = () => {
    try {
      writeScreenplayChatEntry(requirementId, assist.screenplays[assist.picked], {
        idea: assist.idea, target_seconds: assist.target_seconds,
        idx: assist.picked, total: assist.screenplays.length,
      });
    } catch (e) {
      console.warn(`[assist:screenplay] ${requirementId} 打磨后重写聊天流卡片失败:`, e.message);
    }
  };

  // ── 分支 1：还原到上一版 ──
  if (payload.action === 'revert_scene_frame') {
    if (!cur.prev) throw new Error('没有可还原的版本');
    const restored = Object.assign({}, cur.prev);
    delete restored.backed_up_at;
    restored.restored_at = new Date().toISOString();
    assist.scene_frames[key] = restored;
    reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });
    rewrite();
    console.log(`[assist:screenplay] ${requirementId} 场${sceneIdx + 1} 首帧图已还原到上一版`);
    return assist;
  }

  // ── 分支 2：保存打磨图 ──
  const m = String(payload.dataUrl || '').match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]*)$/i);
  if (!m) throw new Error('图片数据格式不正确');
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length) throw new Error('图片内容为空');
  if (buffer.length > 30 * 1024 * 1024) throw new Error('图片过大（>30MB）');

  // magic bytes 定 mime/ext（与其它链路同源，别信前端声明的 mime）
  let ext = '.png', mime = 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) { ext = '.jpg'; mime = 'image/jpeg'; }
  else if (buffer[0] === 0x89 && buffer[1] === 0x50) { ext = '.png'; mime = 'image/png'; }
  else if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') { ext = '.webp'; mime = 'image/webp'; }

  const videoSvc = require('./video');
  const slug = videoSvc.getProjectDirForReq(req);
  const fsMod = require('fs');
  const pathMod = require('path');
  const cryptoMod = require('crypto');
  const dateStr = new Date().toISOString().split('T')[0];
  const hash = cryptoMod.createHash('md5').update(buffer).digest('hex').substring(0, 8);
  const assetsDir = pathMod.join(require('../../config').workspaceRoot, slug, 'assets', dateStr);
  fsMod.mkdirSync(assetsDir, { recursive: true });
  const fileName = `frame_polish_${hash}${ext}`;
  fsMod.writeFileSync(pathMod.join(assetsDir, fileName), buffer);
  const assetPath = `assets/${dateStr}/${fileName}`;   // 相对 workspace，不含 slug（与全项目约定一致）

  assist.scene_frames[key] = {
    // ⚠️ 打磨图只有本地文件、**没有公网 CDN URL** —— 前端「生成视频」会因此退回多图模式
    //   （Agnes 视频接口的 first_frame / last_frame 必须是公网可访问 URL，本地地址它拉不到）
    image_url_output: '',
    asset_path: assetPath,
    mime,
    size: buffer.length,
    polished: true,
    polished_at: new Date().toISOString(),
    prompt: cur.prompt || '',
    refs: cur.refs || [],
    aspect_ratio: cur.aspect_ratio || '16:9',
    created_at: cur.created_at || new Date().toISOString(),
    prev: {
      image_url_output: cur.image_url_output || '',
      asset_path: cur.asset_path || '',
      mime: cur.mime || null,
      size: cur.size || null,
      backed_up_at: new Date().toISOString(),
    },
  };

  reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });
  rewrite();
  console.log(`[assist:screenplay] ${requirementId} 场${sceneIdx + 1} 首帧图已打磨覆盖: ${assetPath}`);
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist = null;
  try { assist = JSON.parse(req.assist_screenplay || 'null'); } catch { assist = null; }
  // v0.22.67: 剧本记录本身不存 project_id，前端拼本地资源 URL（首帧图/分镜头视频/成片）
  //   时会 fallback 到 'default' → /api/generate/assets/default/... 404。
  //   读取时注入（不改写库里那份，避免与并发写冲突）。
  if (assist && !assist.project_id && req.project_id) assist.project_id = req.project_id;
  return assist;
}

/**
 * v0.22.67: 视频生成选项（每段时长 + 画幅）—— 用户拍板「默认但可调」
 *   默认：每段时长 = round(target_seconds / 场数)（3 场 15s → 5s）；画幅 16:9
 */
const ASPECT_DIMS = {
  '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [1024, 1024],
  '4:3': [1152, 864], '3:4': [864, 1152],
};
const ALLOWED_ASPECTS = Object.keys(ASPECT_DIMS);

function defaultVideoOpts(assist) {
  const a = assist || {};
  const scenes = (a.screenplays && a.picked !== null && a.picked !== undefined)
    ? (a.screenplays[a.picked]?.scenes || []).length : 3;
  const total = a.target_seconds || 15;
  const per = Math.max(4, Math.min(12, Math.round(total / Math.max(1, scenes)) || 5));
  // v0.22.73: 默认模型从系统配置读（管理后台「AI 模型」可改）
  return { seconds_per_scene: per, aspect_ratio: '16:9', video_model: require('../ai-model-config').videoModel() };
}

function setVideoOpts(requirementId, payload = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_screenplay || 'null'); } catch { assist = null; }
  if (!assist) return null;

  const cur = Object.assign(defaultVideoOpts(assist), assist.video_opts || {});
  if (payload.seconds_per_scene !== undefined) {
    const s = parseInt(payload.seconds_per_scene, 10);
    if (s >= 4 && s <= 12) cur.seconds_per_scene = s;
  }
  if (payload.aspect_ratio) {
    const a = String(payload.aspect_ratio);
    if (ALLOWED_ASPECTS.includes(a)) cur.aspect_ratio = a;
  }
  if (payload.video_model) {
    const m = String(payload.video_model).trim();
    // v0.22.73: 改成前缀校验（原来是写死白名单 /^agnes-video-(2.5|2.5-flash|v2.0)$/ →
    //   官方出新模型就得改代码；现在只要形如 agnes-video-xxx 都接受）
    if (require('../ai-model-config').isVideoModel(m)) cur.video_model = m;
  }
  assist.video_opts = cur;
  reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });
  // v0.22.68: 同步重写聊天流卡片 —— 否则历史里那张卡还显示旧时长/画幅，
  //   下次开窗或重新渲染时用户看到的和实际生效的不一致（假数据）
  if (assist.used && assist.picked !== null && assist.picked !== undefined) {
    try {
      const sp = (assist.screenplays || [])[assist.picked];
      if (sp) {
        writeScreenplayChatEntry(requirementId, sp, {
          idea: assist.idea, target_seconds: assist.target_seconds,
          idx: assist.picked, total: assist.screenplays.length,
        });
      }
    } catch (e) {
      console.warn(`[assist:screenplay] ${requirementId} setVideoOpts 后重写聊天流卡片失败:`, e.message);
    }
  }
  console.log(`[assist:screenplay] ${requirementId} video_opts 更新: ${JSON.stringify(cur)}`);
  return assist;
}

/**
 * v0.22.71: 角色名别名集 —— 剧本里常用简称（角色叫「咖啡师小雨」，分镜里写的是「小雨」）
 *   朴素 includes 匹配会漏（场 2/3 判不出出场人物）→ 退到"全部角色"就会画出多余的人
 */
const ROLE_PREFIXES = /^(咖啡师|店员|老板|师傅|主持人|主播|记者|医生|护士|老师|学生|司机|保安|厨师|店长|服务员|妈妈|爸爸|爷爷|奶奶|外公|外婆|哥哥|姐姐|弟弟|妹妹|小|大|老)/;
function charAliases(name) {
  const n = String(name || '').trim();
  if (!n) return [];
  const out = new Set([n]);
  const stripped = n.replace(ROLE_PREFIXES, '');
  if (stripped && stripped.length >= 2 && stripped !== n) out.add(stripped);
  if (n.length >= 3) out.add(n.slice(-2));   // 末两字简称（咖啡师小雨 → 小雨）
  return Array.from(out).filter(a => a.length >= 2);
}

/**
 * v0.22.71: 本场真正出场的人物（按 shot/dialogue/action 文本判定）
 *   用户报「场 1 只有姆万加，首帧图却画了 2 个人」——根因是提示词把全剧角色都写进去了，
 *   且把所有角色图都当参考图传（模型按参考图凑人数）。
 *   规则：① 文本里点到名的角色才算出场 ② 一个都没点到 → 只给主角（1 人），绝不默认全给
 */
function castOfScene(sp, scene) {
  const text = [scene && scene.shot, scene && scene.dialogue, scene && scene.action].filter(Boolean).join(' ');
  const chars = (sp && sp.characters) || [];
  const present = chars.filter(c => c.name && charAliases(c.name).some(a => text.includes(a)));
  if (present.length) return { cast: present, matched: true };
  return { cast: chars.slice(0, 1), matched: false };
}

/** 相对 asset_path → data URI（参考图兜底用；正常走 CDN image_url_output）
 *  v0.22.70: 归一化 —— image-tools-service 返回的 asset_path 自带 workspace 前缀
 *  （'agent-buddy-actions/assets/...'），而这里按「相对 workspace 的路径」解析 → 会拼成
 *  workspaces/<slug>/<slug>/assets/... → 文件不存在 → 参考图静默丢失。统一剥到 'assets/' 开头。 */
function normAssetPath(p) {
  if (!p) return '';
  const s = String(p);
  const i = s.indexOf('assets/');
  return i > 0 ? s.slice(i) : s;
}

function assetToDataUri(projectSlug, relPath) {
  try {
    const compose = require('../video-compose');
    const abs = compose.resolveAssetPath(projectSlug, normAssetPath(relPath));
    if (!abs || !require('fs').existsSync(abs)) return '';
    const buf = require('fs').readFileSync(abs);
    const mime = /\.png$/i.test(abs) ? 'image/png' : /\.webp$/i.test(abs) ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) { return ''; }
}

/**
 * v0.22.67: 为某一分镜头生成「首帧图」（这一场的起始定格画面）
 *   用途：作为该段视频的 first_frame，并作为上一段的 last_frame → 段间精确衔接
 *   参考图：角色档案图（全部角色）+ 场景图（多图合成，保形象一致）
 *   返回 image_url_output（Agnes CDN 公网 URL，2.5 视频接口要求公网可访问）
 */
async function genSceneFrame(requirementId, payload = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) throw new Error('需求不存在');
  let assist;
  try { assist = JSON.parse(req.assist_screenplay || 'null'); } catch { assist = null; }
  if (!assist) throw new Error('剧本数据不存在');
  if (assist.picked === null || assist.picked === undefined) throw new Error('请先选一个剧本');

  const sp = assist.screenplays[assist.picked];
  const sceneIdx = parseInt(payload.scene_idx, 10) || 0;
  const scene = (sp.scenes || [])[sceneIdx];
  if (!scene) throw new Error('分镜头数据缺失');

  const videoSvc = require('./video');
  const slug = videoSvc.getProjectDirForReq(req);
  const opts = Object.assign(defaultVideoOpts(assist), assist.video_opts || {});
  const dims = ASPECT_DIMS[opts.aspect_ratio] || ASPECT_DIMS['16:9'];

  // ── 参考图：只给「本场出场角色」的图 + 场景图（CDN URL 优先，本地 asset 转 data URI 兜底）──
  //   v0.22.71: 之前给全部角色图 → 模型按参考图凑人数 → 单人场画出 2 个人
  const { cast, matched } = castOfScene(sp, scene);
  const castNames = cast.map(c => c.name);
  console.log(`[assist:screenplay] ${requirementId} 场${sceneIdx + 1} 出场人物(${matched ? '文本命中' : '兜底主角'}): ${castNames.join('、') || '(无)'}`);
  const refs = [];
  const charAssets = (assist.assets && assist.assets.characters) || {};
  for (const name of castNames) {
    const a = charAssets[name];
    if (!a) continue;
    const u = a.image_url_output || (a.asset_path ? assetToDataUri(slug, a.asset_path) : '');
    if (u) refs.push({ kind: 'character', name, url: u });
  }
  const sceneAsset = (assist.assets && assist.assets.scenes && assist.assets.scenes['0']) || null;
  if (sceneAsset) {
    const u = sceneAsset.image_url_output || (sceneAsset.asset_path ? assetToDataUri(slug, sceneAsset.asset_path) : '');
    if (u) refs.push({ kind: 'scene', name: '场景', url: u });
  }

const castLine = castNames.length
    ? `出场人物：画面中只有 ${castNames.join(' 和 ')} 这 ${castNames.length} 个人物（外貌与参考图一致），不得出现其他人物、路人或额外的人。`
    : '本场为环境空镜：画面中不出现任何人物。';

// ── v0.22.X: 连续帧链（修复版）──
//   v0.22.X 第 1 版根因：原 prompt 「不得重绘已存在的环境元素」+ 「仅更新人物姿态 / 画面内的人物位置与动作」
//   → LLM 误读：把"不得改动原元素"理解成"可以加新元素填补画面空白" → 「凭空多出楼阁一角」
//   修复策略（v0.22.X 第 2 版）：
//     ① prev-frame 降级为「风格参考」：refs 里仍然传入，但 prompt 里只说"色调/光线/笔触风格延续"
//        —— 元素决策权交回给 setting/continuity_props/scene_location，不再让 prev-frame 参与元素继承
//     ② 改写 prevFrameLine：删「不得重绘」「仅更新人物姿态」两个误导句
//     ③ 加硬约束：环境元素只能来自 setting/continuity_props/scene_location，不得引入这三者未提及的新元素
//     ④ 负面加：凭空出现的新建筑（楼阁/亭台/塔/牌坊/桥梁等）、凭空出现的新陈设、新装饰、新家具、新植被类型
let prevFrame = null;
if (sceneIdx > 0 && assist.scene_frames && assist.scene_frames[String(sceneIdx - 1)]) {
  const pf = assist.scene_frames[String(sceneIdx - 1)];
  const pfUrl = pf.image_url_output || (pf.asset_path ? assetToDataUri(slug, pf.asset_path) : '');
  if (pfUrl) prevFrame = pf;
}
if (prevFrame) {
  refs.push({
    kind: 'prev-frame',
    name: `上一场（场 ${sceneIdx}）`,
    url: prevFrame.image_url_output || (prevFrame.asset_path ? assetToDataUri(slug, prevFrame.asset_path) : ''),
  });
}

const prevFrameLine = prevFrame
  ? `🎨 风格延续：参考图「上一场（场 ${sceneIdx}）的首帧」仅用于延续色调、光线氛围、笔触风格。本帧的环境元素决策必须依据 setting + continuity_props + scene_location（剧本明确登记的环境元素）。如上一场画面里出现了 setting/continuity_props/scene_location 未提及的元素（例如楼阁、亭台、牌坊等），那是上一场的 AI 生成错误，**不得在本场复刻或延续**。`
  : '';

// 🆕 v0.22.X: 借鉴 Sora 2「Recurring character registry」+ Kling「多 label 参考图」的设计
//   给 LLM 一份「允许出现元素的白名单」+「黑名单」——比负向词更精确
//   白名单来源：refs（场景图 + 角色图 + 道具图 + 上一场首帧）+ setting + continuity_props + scene_location
//   黑名单来源：白名单之外的一切（不写出来反而最严——LLM 只能从白名单里选）
const allowedSourceLine = (() => {
  // v0.22.X P1: 实体 ID 注入 —— 给每个 continuity_prop 分配稳定锚点 [PR_nn]，
  //   与负面词 + L6 自检的 violations 形成三方对照（LLM 用 [PR_01] 指代比用裸 label 更不易漂移）
  const props = sp.continuity_props || [];
  const propAnchors = props.map((p, i) => `[PR_${String(i + 1).padStart(2, '0')}] ${p.label}`).join('、');
  const propLine = props.length
    ? `③ 道具（continuity_props，用方括号 ID 指代）：${propAnchors}`
    : '';
  const anchorNote = props.length
    ? `\n   注意：提及道具时优先用方括号 ID（如 [PR_01] 古琴），画面里这些道具必须可见且与剧本一致，禁止出现未登记的同类道具。`
    : '';
  return `🔒 元素白名单：画面中只能出现下列来源的元素，不得凭空添加白名单之外的任何角色/建筑/装饰/家具/植被/陈设：
 ① 参考图（角色档案图 + 场景图 + 上场首帧）的视觉元素
 ② setting 描述的环境（${(sp.setting || '').slice(0, 60)}）
 ${propLine}
 ④ scene_location 描述的本场空间位置（${(scene.scene_location || '').slice(0, 30)}）
任何白名单外的元素（楼阁/亭台/塔/牌坊/桥梁/新建筑/新装饰/新陈设/新植被类型）一律不得出现。${anchorNote}`;
})();

const prompt = ((payload.prompt || scene.scene_frame_prompt_override || '')).trim() || [
    `电影感写实画面：${sp.setting || ''}。`,
    scene.shot ? `镜头：${scene.shot}。` : '',
    scene.action ? `画面内容：${scene.action}的起始瞬间。` : '',
    castLine,
    prevFrameLine,
    allowedSourceLine,
    `构图：${opts.aspect_ratio} 画幅建立镜头，主体清晰，前中后景层次分明。`,
    '风格：电影感写实摄影，真实光影，浅景深。质量：细节丰富，2K，画面干净。',
    '负面：多个人物、第二个人、多余路人、群演、畸形手、文字、水印、低质量、卡通、动漫、插画、凭空出现的新建筑（楼阁/亭台/塔/牌坊/桥梁等）、凭空出现的新陈设、新装饰、新家具、新植被类型、剧本未登记的环境元素。',
  ].filter(Boolean).join(' ');

  const imageSvc = require('../image-tools-service');
  console.log(`[assist:screenplay] ${requirementId} 生成首帧图 场${sceneIdx + 1}（参考图 ${refs.length} 张，画幅 ${opts.aspect_ratio}）`);

  // ── v0.22.X L6 闭环验证：生成 → 视觉自检 → 有违规则拼负面重生成（最多 2 轮）──
  //   设计：校验失败/超时一律降级（不阻断主流程），只记 l6_check 供 UI/审计
  let attempt = 0;
  let genR = null;
  let lastOpt = null;
  let l6 = null;
  const NEG_BASE = '多个人物、第二个人、多余路人、群演、畸形手、文字、水印、低质量、卡通、动漫、插画、剧本未登记的环境元素。';
  const MAX_L6_ROUNDS = 2;

  while (attempt <= MAX_L6_ROUNDS) {
    // 生成（第 0 轮用原始 prompt；第 N 轮把上轮违规词追加到负面）
    let curPrompt = prompt;
    if (attempt > 0 && l6 && l6.violations.length) {
      const banned = l6.violations.map(v => `画面里不得出现：${v}`).join('；');
      curPrompt = prompt + ` 【L6 自检修复】${banned}。${NEG_BASE}`;
      console.log(`[assist:screenplay:L6] ${requirementId} 场${sceneIdx + 1} 第 ${attempt} 轮重生成（违规: ${l6.violations.join('、')}）`);
    }

    console.log(`[assist:screenplay] ${requirementId} 生成首帧图 场${sceneIdx + 1} 第 ${attempt + 1} 次（参考图 ${refs.length} 张，画幅 ${opts.aspect_ratio}）`);
    genR = await imageSvc.coreGenerate({
      prompt: curPrompt,
      referenceImages: refs.map(x => x.url),
      size: '1K',
      n: 1,
      projectSlug: slug,
      targetWidth: dims[0],
      targetHeight: dims[1],
    });
    if (!genR || !genR.ok) throw new Error('首帧图生成失败: ' + ((genR && genR.error) || '未知错误'));
    lastOpt = (genR.options || [])[0];
    if (!lastOpt) throw new Error('首帧图生成失败: 无返回图片');

    // 写进 scene_frames（每轮都覆盖，保证 UI 永远拿到最新图）
    if (!assist.scene_frames) assist.scene_frames = {};
    assist.scene_frames[String(sceneIdx)] = {
      image_url_output: lastOpt.image_url_output || null,
      asset_path: normAssetPath(lastOpt.asset_path) || null,
      mime: lastOpt.mime || null,
      size: lastOpt.size || null,
      prompt: curPrompt,
      refs: refs.map(x => ({ kind: x.kind, name: x.name })),
      aspect_ratio: opts.aspect_ratio,
      created_at: new Date().toISOString(),
    };
    reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });

    // 最后一轮不再自检（省时）；前 N-1 轮跑 L6 校验决定是否重生成
    if (attempt >= MAX_L6_ROUNDS) {
      // 末轮也记一次 l6_check 供审计（不阻断）
      l6 = await runL6FrameCheck(requirementId, sp, scene, sceneIdx, castNames, assist.scene_frames[String(sceneIdx)].asset_path, slug);
      assist.scene_frames[String(sceneIdx)].l6_check = l6;
      reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });
      break;
    }

    l6 = await runL6FrameCheck(requirementId, sp, scene, sceneIdx, castNames, assist.scene_frames[String(sceneIdx)].asset_path, slug);
    assist.scene_frames[String(sceneIdx)].l6_check = l6;
    reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });

    // v0.22.79: degraded（解析失败/截断）只要捞到了违规项，也要触发重生成 —— 不能因为
    //   JSON 被 maxTokens 截断就当成「通过」（实测发生过：真实 4 条违规被截断 → 显示 ✅）
    if (l6.ok || l6.skipped || !l6.violations.length) {
      console.log(`[assist:screenplay:L6] ${requirementId} 场${sceneIdx + 1} 自检通过（${l6.reason || '干净'}），停止重生成`);
      break;
    }
    // 有违规 → 进入下一轮重生成
    attempt++;
  }

  const opt = lastOpt;

  // 重写聊天流卡片（同 setAsset/setSceneVideo 的处理）
  if (assist.used && assist.picked !== null && assist.picked !== undefined) {
    try {
      writeScreenplayChatEntry(requirementId, sp, {
        idea: assist.idea, target_seconds: assist.target_seconds,
        idx: assist.picked, total: assist.screenplays.length,
      });
    } catch (e) {
      console.warn(`[assist:screenplay] ${requirementId} genSceneFrame 后重写聊天流卡片失败:`, e.message);
    }
  }
  console.log(`[assist:screenplay] ${requirementId} 首帧图完成 场${sceneIdx + 1}: ${assist.scene_frames[String(sceneIdx)].asset_path}`);
  return assist;
}

// ============================================================
// v0.22.X L6 闭环验证（借鉴「视频生成场景一致性控制」6 层框架的 L6 层）
//   生成首帧后调 LLM 视觉自检：画面里有没有「白名单之外」的元素？
//   有违规 → 把违规词拼进负面 prompt 重新生成（最多 2 轮）
//   设计原则：
//     ① 用 describeImage（底层自动挑带 vision 能力的活跃模型），不写死 provider
//     ② 校验结果写回 scene_frames[idx].l6_check（供 UI 展示 + 审计）
//     ③ 校验失败/超时不阻断主流程（降级为 warning，不 throw）
// ============================================================

// 构造 L6 自检 prompt：喂给 vision LLM 的指令
//   ⚠️ v0.22.80 教训：prompt 里**只写给判官看的指令**，别写开发者复盘注释 ——
//   上一版把「之前把樱花/远山算违规导致误报」的复盘文字留在了违规清单段里，
//   判官会读到「樱花/远山 判成未登记」→ 继续误报（单测锁死：樱花/远山 只能出现在豁免段）。
function buildL6CheckPrompt(sp, scene, sceneIdx, castNames) {
  const props = (sp.continuity_props || []).map((p, i) => `[PR_${String(i + 1).padStart(2, '0')}] ${p.label}`).filter(Boolean);
  const allowed = [
    `① 参考图的视觉元素`,
    `② setting: ${(sp.setting || '').slice(0, 80)}`,
    props.length ? `③ 道具（continuity_props）：${props.join('、')}` : '',
    scene.scene_location ? `④ 本场空间: ${scene.scene_location}` : '',
  ].filter(Boolean).join('；');

  return `你是一位严格的视觉审查员。请审查这张电影首帧画面，判断其中是否出现了【剧本未登记】的元素。

【已登记的允许元素白名单】
${allowed}
${castNames.length ? `出场人物（仅这些）：${castNames.join('、')}` : '本场为环境空镜，不应出现任何人物。'}

请逐项检查并回答（JSON 格式）：
{
  "violations": ["违规元素1", "违规元素2", ...],
  "ok": true | false,
  "reason": "一句话说明"
}

只输出 JSON，不要解释。若画面干净（无下列四类违规），violations 为空数组，ok=true。

【只把下面 4 类算违规】—— 判定面刻意收窄：判官看不到参考图，凡「可能来自参考基准图或季节氛围」的元素一律不判违规，宁可漏报也不要误报（误报会白烧 1-2 轮重生成）。
A. 剧本未登记的建筑/构筑物：楼阁 / 亭台 / 塔 / 牌坊 / 桥梁 / 房屋 / 围墙 / 山门 / 石阶 / 道路 / 码头 / 舟船
B. 时代或场景不符的现代物件：电线杆 / 汽车 / 路灯 / 塑料用品 / 玻璃幕墙 / 空调 / 招牌 / 电子设备
C. 人物不符：出现出场人物之外的任何人物（含剪影 / 背影 / 远处人影 / 旁观者），或应出场的角色缺席
D. 前景/中景新增的大件实体物件：不属于 setting 与登记道具的岩石 / 石台 / 石凳 / 家具 / 器皿 / 灯笼等可辨识的大件物品

【明确豁免 —— 以下一律不得列入 violations】
- 植被与自然元素：花树 / 樱花 / 桃树 / 柳树 / 芦苇 / 草丛 / 成片花丛 / 水生植物（多为参考基准图自带或季节氛围）
- 远景背景元素：远山 / 丘陵 / 天空 / 云 / 雾气 / 霞光 / 水面倒影
- 参考图（角色档案图 / 场景基准图 / 上场首帧）里已经存在且在画面中合理延续的环境细节
- 色调 / 光线 / 笔触 / 景深 / 画风的差异
（拿不准某元素是否登记时，不要列入 violations —— 可在 reason 里提一句；宁可漏报也不要误报）`;
}

// 解析 LLM 返回的 JSON（容错：LLM 可能带 ```json 包裹或前后废话）
//   v0.22.79: ① 解析失败不再冒充「通过」——标记 degraded（UI 灰字），避免「其实有违规但显示 ✅」
//             ② 加截断容错：maxTokens 被打满时 JSON 不闭合 → 从 "violations":[ ... 里捞已给出的条目
function salvageViolations(raw) {
  const vseg = String(raw || '').match(/"violations"\s*:\s*\[([\s\S]*)/);
  if (!vseg) return [];
  const items = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let mm;
  while ((mm = re.exec(vseg[1]))) {
    const v = mm[1].replace(/\\"/g, '"').trim();
    if (v.length >= 2 && !items.includes(v)) items.push(v);
  }
  // v0.22.80: 末尾被 maxTokens 从中间切断的那一项（只有开引号、没有闭引号）——
  //   旧实现整条丢掉 → 重生成时少一条负面词 → 同一条违规可能再犯（单测锁死）
  const tail = vseg[1].match(/"((?:[^"\\]|\\.)*)$/);
  if (tail) {
    const v = tail[1].replace(/\\"/g, '"').trim();
    if (v.length >= 2 && !items.includes(v)) items.push(v);
  }
  return items;
}

function parseL6CheckResult(text) {
  if (!text) return { ok: true, violations: [], reason: 'LLM 无响应（降级通过）', degraded: true };
  let s = text.trim();
  // 剥掉可能的 ```json ... ``` 包裹
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // 找第一个 { ... } 块
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) {
    const v = salvageViolations(s);
    if (v.length) return { ok: false, violations: v, reason: '自检 JSON 被截断，已从原文容错提取违规项', degraded: true };
    return { ok: true, violations: [], reason: '无法解析 LLM 响应（降级通过）', degraded: true };
  }
  try {
    const obj = JSON.parse(m[0]);
    const violations = Array.isArray(obj.violations) ? obj.violations.map(String).filter(Boolean) : [];
    return { ok: !!obj.ok && violations.length === 0, violations, reason: String(obj.reason || '') };
  } catch {
    const v = salvageViolations(m[0]);
    if (v.length) return { ok: false, violations: v, reason: '自检 JSON 解析失败，已从原文容错提取违规项', degraded: true };
    return { ok: true, violations: [], reason: 'JSON 解析失败（降级通过）', degraded: true };
  }
}

// v0.22.X+1: assetPath 是「相对 workspace 的路径」（assets/<date>/x.png）——
//   必须用 video-compose.resolveAssetPath(slug, ...) 拼绝对路径，否则 vision-service
//   按 process.cwd() 解析 → 文件不存在 → 每次都静默「降级通过」（L6 变空转）。
async function resolveFrameAbsPath(slug, assetPath, req) {
  if (!assetPath) return '';
  const rel = normAssetPath(assetPath);
  if (/^[a-zA-Z]:[\\/]/.test(rel)) return rel;          // 已是绝对路径
  try {
    const compose = require('../video-compose');
    const projSlug = slug || (req ? require('../video').getProjectDirForReq(req) : 'default');
    const abs = compose.resolveAssetPath(projSlug, rel);
    if (abs && require('fs').existsSync(abs)) return abs;
    console.warn(`[assist:screenplay:L6] asset 绝对路径不存在: ${abs}`);
  } catch (e) {
    console.warn(`[assist:screenplay:L6] 解析 asset 路径失败: ${e.message}`);
  }
  return rel;
}

// L6 自检：读本地 asset 路径 → describeImage → 解析。返回 { ok, violations, reason }
async function runL6FrameCheck(requirementId, sp, scene, sceneIdx, castNames, assetPath, slug) {
  if (!assetPath) return { ok: true, violations: [], reason: '无本地 asset（跳过校验）', skipped: true };
  try {
    const visionSvc = require('../vision-service');
    const prompt = buildL6CheckPrompt(sp, scene, sceneIdx, castNames);
    const absPath = await resolveFrameAbsPath(slug, assetPath, null);
    const r = await visionSvc.describeImage(absPath, {}, { prompt, maxTokens: 800 });
    if (!r || !r.ok) {
      console.warn(`[assist:screenplay:L6] ${requirementId} 场${sceneIdx + 1} vision 调用失败: ${(r && r.error) || '未知'}`);
      return { ok: true, violations: [], reason: `vision 调用失败（${(r && r.error) || '未知'}），降级通过`, degraded: true };
    }
    const parsed = parseL6CheckResult(r.description);
    parsed.raw = r.description;
    console.log(`[assist:screenplay:L6] ${requirementId} 场${sceneIdx + 1} 自检: ok=${parsed.ok} violations=${JSON.stringify(parsed.violations)}`);
    return parsed;
  } catch (e) {
    console.warn(`[assist:screenplay:L6] ${requirementId} 场${sceneIdx + 1} 自检异常: ${e.message}`);
    return { ok: true, violations: [], reason: `自检异常（${e.message}），降级通过`, degraded: true };
  }
}

/**
 * v0.22.X: 把已生成的分镜头合成一条完整视频（用户报「3 段视频割裂，怎么连到一起」）
 *   payload: { transition: 'none' | 'fade', transitionDuration?: 0.4 }
 *   流程：按 field 顺序收集 scene_videos 的 asset_path → video-compose 拼接 → 写 final_video → 重写聊天流卡片
 *   注意：至少 2 段；只合成「已生成」的段落（缺段不影响，按序拼现有的）
 */
async function composeFinal(requirementId, payload = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) throw new Error('需求不存在');
  let assist;
  try { assist = JSON.parse(req.assist_screenplay || 'null'); } catch { assist = null; }
  if (!assist) throw new Error('剧本数据不存在');

  const sceneVideos = assist.scene_videos || {};
  const entries = Object.keys(sceneVideos)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((k) => ({ idx: parseInt(k, 10), v: sceneVideos[k] || {} }))
    .filter((e) => e.v.asset_path);
  if (entries.length < 2) {
    throw new Error(`至少需要 2 个已生成的分镜头才能合成（当前 ${entries.length} 个）`);
  }

  const videoSvc = require('./video');
  const compose = require('../video-compose');
  const slug = videoSvc.getProjectDirForReq(req);
  const files = entries.map((e) => compose.resolveAssetPath(slug, e.v.asset_path));
  const missing = files.filter((f) => !f || !require('fs').existsSync(f));
  if (missing.length) throw new Error(`有 ${missing.length} 个分镜头视频文件在本地找不到，无法合成`);

  const transition = payload.transition === 'fade' ? 'fade' : 'none';
  const out = compose.buildOutputPath(slug, files.length, transition);
  const t0 = Date.now();
  console.log(`[assist:screenplay] ${requirementId} 开始合成 ${files.length} 段（transition=${transition}）`);
  const r = await compose.concatVideos(files, out.absPath, {
    transition,
    transitionDuration: payload.transitionDuration || 0.4,
  });
  if (!r.ok) {
    console.error(`[assist:screenplay] ${requirementId} 合成失败:`, r.error);
    throw new Error('视频合成失败: ' + r.error);
  }

  assist.final_video = {
    asset_path: out.assetPath,
    size: r.size,
    duration: r.duration,
    segments: files.length,
    scene_indexes: entries.map((e) => e.idx),
    transition,
    mode: r.mode,
    status: 'done',
    created_at: new Date().toISOString(),
  };
  reqStore.update(requirementId, { assist_screenplay: JSON.stringify(assist) });
  console.log(`[assist:screenplay] ${requirementId} 合成完成 ${r.duration ? r.duration.toFixed(2) + 's' : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s, ${(r.size / 1048576).toFixed(1)}MB)`);

  // 同步重写聊天流卡片（同 setSceneVideo 的处理）
  if (assist.used && assist.picked !== null && assist.picked !== undefined) {
    try {
      writeScreenplayChatEntry(requirementId, assist.screenplays[assist.picked], {
        idea: assist.idea,
        target_seconds: assist.target_seconds,
        idx: assist.picked,
        total: assist.screenplays.length,
      });
    } catch (e) {
      console.warn(`[assist:screenplay] ${requirementId} composeFinal 后重写聊天流卡片失败:`, e.message);
    }
  }

  return assist;
}

module.exports = {
  name: '短视频剧本（3 个剧本选项 + 角色/场景/分镜头资源联动）',
  field: 'assist_screenplay',
  runAssistJob,
  markPicked,
  setAsset,        // v0.22.8: 角色/场景图写入
  setSceneVideo,   // v0.22.8: 分镜头视频写入
  genSceneFrame,   // v0.22.67: 分镜头「首帧图」生成（角色图+场景图多图合成）
  polishSceneFrame, // v0.22.77: 「✏️ 打磨」首帧图回写（覆盖 + 原图备份可还原）
  castOfScene,     // v0.22.71: 本场出场人物判定（首帧图人数控制）
  charAliases,     // v0.22.71: 角色名别名（咖啡师小雨 → 小雨）
  normAssetPath,   // v0.22.70: asset_path 归一化（剥掉 workspace 前缀）
  setSceneVideoPrompt, // v0.22.X: 用户修改视频 prompt 持久化（解「改完不生效 + 刷新恢复原样」bug）
  setSceneFramePrompt, // v0.22.X: 用户修改首帧图 prompt 持久化（补全首帧图链路架构）
  setVideoOpts,    // v0.22.67: 每段时长 / 画幅 / 视频模型
  defaultVideoOpts,
  composeFinal,    // v0.22.65: 合成完整视频（分镜头拼接）
  getAssist,
  writeScreenplayChatEntry,
  // v0.22.X L6 闭环验证（导出供 UI 展示 + 单元测试）
  buildL6CheckPrompt,
  parseL6CheckResult,
  runL6FrameCheck,
  resolveFrameAbsPath,
};
