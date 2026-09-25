// ACMS · 剧本辅助核心渲染（v0.22.31，2026-06-30）
//   v0.22 单一来源：assist 侧栏 + 聊天流卡片都用这份 render
//   渲染：角色 / 场景 / 分镜头 3 大块 + 内嵌"生成图/视频"按钮
//
// 接入方式：
//   - assists/screenplay.js 侧栏 render(reqId, data) → 调 ACMSScreenplayCard.renderDetail()
//   - chat.js renderScreenplayBubble(jsonText) → 同上
//
// v0.22.22 修复：
//   - textarea id 用 idx（不用 name 算 — JS \w 不匹配中文，会撞 id → 点第 2 角色按钮读第 1 个 desc）
//   - 默认 prompt 用结构化生成函数 buildCharacterPrompt/buildScenePrompt
//     （带 name + desc + logline + setting + 时长 + 风格关键词 + 负面提示，Agnes 模型对英文 prompt 更准）
//
// v0.22.23 修复（按 SDXL/Flux 角色立绘公认结构重写 prompt）：
//   - 角色 prompt：去掉 Scene mood / Story tone（类别错误 — 角色立绘 = reference sheet，不是 narrative illustration）
//     加 Subject/Appearance/Pose/View/Expression/Background（简洁 studio 背景）+ 加 'multiple characters/busy background' 防加戏
//   - 场景 prompt：去掉基于 logline 的 Mood（剧情元素不是场景属性）
//     加 Scene/Environment/Atmosphere/Composition/Lighting（强调 no characters in frame）
//   - 视频 prompt（分镜头）：新增 buildSceneVideoPrompt 函数
//     结构：Setting + Camera + Action + Dialogue + Style + Quality（视频模型完整输入）
//
// v0.22.31 修复（IP 锚定 + 风格锁定）：
//   - 新增 IP 词典（ip-dict.js）：用户输入"擎天柱"→ 锁定到 Transformers G1 Optimus Prime
//   - buildCharacterPrompt 接收 art_style 参数（剧本级共享），强制硬约束写入 Style + Negative
//   - 同一剧本所有角色必须 art_style 一致（解决"角色 1 写实 + 角色 2 卡通"的不一致问题）
//   - 引入 STYLE_TEMPLATES：每种风格有专属 stylePrefix / negativePrefix
//
// 全局对象：window.ACMSScreenplayCard = { renderDetail, renderFromChatEntry, buildCharacterPrompt, buildScenePrompt, buildSceneVideoPrompt }

(function () {
/**
   * v0.22.22: 结构化图片 prompt（默认填入 textarea，用户可改）
   *   v0.22.23: 按 SDXL/Flux 角色立绘公认结构重写 — 去掉 Scene mood / Story tone（与人物无关）
   *     角色立绘 = reference sheet，核心是人物外貌/服装/姿态，背景必须简洁（避免 AI 把场景当主角）
   *     Agnes image-2.0-flash 对英文 prompt 更准
   *   v0.22.31: 加 IP 锚定 + 风格硬约束（解决"擎天柱→机甲人"+"角色风格不一致"问题）
   *     - 第 4 个参数 artStyle（默认 'photorealistic'，从 sp.art_style 取）
   *     - 检测 c.name + c.desc 是否含知名 IP → 注入 IP.visualKeywords
   *     - STYLE_TEMPLATES 的 stylePrefix / negativePrefix 强制锁死风格
   *     - 同一剧本所有角色共享同一 artStyle（剧本级一致性）
   */
  function buildCharacterPrompt(c, sp, targetSeconds, artStyle) {
    const name = (c.name || '').trim();
    const desc = (c.desc || '').trim();
    const ts = targetSeconds || 30;
    // v0.22.31: artStyle 默认值（从 sp.art_style 读，不传则 photorealistic）
    const style = artStyle || sp?.art_style || 'photorealistic';

    // ── v0.22.X: 主体类别自动判定（治标兜底）──
    //   根因：之前 3 行人形描述（姿态 / 表情 / 视角）写死在模板里，
    //   非人形角色（车 / 动物 / 物件 / 机械）被 LLM 画成人 → 「老拖车画成人」
    //   修复：扫 name+desc 命中「车辆 / 动物 / 机械 / 物件 / 建筑 / 植物 / 食物 / 自然物 / 光影」
    //   → 切非人形分支（去掉 3 行人形词 + 改负面）
    //   人类角色 → 走原模板（不变）
    //   ⚠️ v0.22.81 修：旧实现是「单字关键词裸 substring 命中即判非人形」，被单字词误伤 ——
    //     关键词表里有 '风' → 「古风少女 / 古风青年男子 / 窈窕淑女」全部命中 → 人形角色
    //     被判成非人形（丢掉表情/姿态行 + 负面写「非拟人化主体误加五官」）→ 古风/国风剧本
    //     （主力场景）全军覆没。同类误伤：'花'（手持花篮）、'水'、'云'、'光'。
    //   新规则（三级）：
    //     ① 命中「人形标记词」（人/女/男/少女/青年/太子/武士…）→ 人形，除非同时命中强非人形词
    //     ② 命中「强非人形词」（拖车/货车/机器人/动物/猫…）→ 非人形
    //     ③ 都没命中 → 只看「弱非人形词」，且先剔除风格词（古风/国风/写实…）再匹配
    const HUMAN_MARKERS = ['人', '女', '男', '少女', '少年', '男子', '女子', '青年', '老者', '老人', '姑娘', '公子', '小姐',
      '太子', '王子', '王', '公主', '骑士', '战士', '武士', '法师', '巫师', '侠', '将士', '士兵', '侍卫', '臣', '官', '大夫',
      '医生', '护士', '老师', '学生', '母亲', '父亲', '妈妈', '爸爸', '孩子', '儿童', '工人', '司机', '商人', '农夫', '渔民', '孩童'];
    const STRONG_NONHUMAN = ['卡车', '货车', '拖车', '巴士', '摩托', '自行车', '机器人', '机甲', '机械', '动物', '猫', '狗', '鸟',
      '鱼', '虎', '龙', '建筑', '城堡', '植物', '食物', '面包', '蛋糕'];
    const WEAK_NONHUMAN = ['车', '物件', '塔', '树', '草', '花', '自然物', '云', '风', '水', '火', '光影', '光', '影'];
    // 风格/氛围词先剔除（它们是修饰，不是主体类别；「古风」「国风」「水墨」等）
    const STYLE_WORDS = ['古风', '国风', '仙侠', '古装', '和风', '日式', '水墨', '油画', '写实', '卡通', '动漫', '复古', '唯美', '浪漫', '温情', '风情', '风光', '风光片'];
    const rawSearchText = `${name} ${desc}`;
    const searchText = STYLE_WORDS.reduce((t, w) => t.split(w).join(''), rawSearchText);
    const strongHits = STRONG_NONHUMAN.filter(k => searchText.includes(k));
    const hasHumanMarker = HUMAN_MARKERS.some(k => searchText.includes(k));
    const weakHits = WEAK_NONHUMAN.filter(k => searchText.includes(k));
    const isNonHuman = strongHits.length > 0 ? true : (hasHumanMarker ? false : weakHits.length > 0);
    console.log(`[screenplay] buildCharacterPrompt: ${name} → ${isNonHuman ? '非人形' : '人形'} 模板`
      + `（强非人形词:${strongHits.join('/') || '无'} · 人形标记:${hasHumanMarker ? '有' : '无'} · 弱词:${weakHits.join('/') || '无'}）`);

    // v0.22.31: IP 锚定检测 — name + desc 拼起来查 IP 词典
    const ipDict = window.ACMSScreenplayIPDict;
    const styleTpl = ipDict?.getStyleTemplate(style) || { stylePrefix: '', styleSuffix: '', negativePrefix: '' };
    let ipAnchor = null;
    if (ipDict) {
      // 同时查 name 和 desc（防止 LLM 把 IP 名写进 desc 而不是 name）
      const searchText = `${name} ${desc}`;
      ipAnchor = ipDict.lookup(searchText);
    }

    // v0.22.64: 全中文 prompt（多多 2026-09-13 要求「提示词都改成对应的中文」）
    //   注：Agnes（国内模型）中文 prompt 效果已验证（历史中文 prompt 生成的图/视频都正常）
    const subjectLine = ipAnchor
      ? `主体：${ipAnchor.nameEn}。`
      : `主体：${name || '一个人物'}。`;

    const appearanceLine = ipAnchor
      ? `外貌：${ipAnchor.visualKeywords}。`
      : (desc ? `外貌：${desc}。` : '外貌：有辨识度的角色设计，表情生动。');

    // v0.22.23: 角色立绘只关注人物本身 — 不带 Scene mood / Story tone（类别错误）
    // v0.22.X: 按主体类别切换 3 行人形描述（人形 / 非人形两套模板）
    const poseLine = isNonHuman
      ? '视角：中近景，平视，主体居中构图，3/4 侧角展示完整外形。'
      : '姿态：自然站姿，正对镜头并略带四分之三侧身，全身可见（头顶到胸下），体态自信。';
    const exprLine = isNonHuman
      ? ''
      : '表情：符合角色性格的入戏表情。';
    const lines = [
      subjectLine,
      appearanceLine,
      poseLine,
      exprLine,
      // v0.X 修复：背景行去掉"影棚"（所有风格通用：干净简洁背景，不抢人物）
      '背景：干净的纯色背景配柔和渐变，不出现环境景物，突出人物。',
      // v0.X 修复：用 styleTpl.descriptors 替代硬编码的"电影感人物肖像、影棚主光、4K 写实"等写实摄影描述
      //   之前 stylePrefix（国风水墨等）被这些硬描述压过，导致出图风格稀释到写实摄影
      `风格：${styleTpl.stylePrefix} ${styleTpl.styleSuffix} ${styleTpl.descriptors?.character || ''} ${ts} 秒短片的角色设定参考图。`,
      // v0.X 修复：quality 行也用 styleTpl.descriptors.characterQuality 替代
      `质量：${styleTpl.descriptors?.characterQuality || '细节丰富，杰作级，画面干净。'}`,
      // v0.22.31: negative 前置硬约束（negativePrefix 列出严禁项）+ 原有负面 + 防加戏
      //   v0.22.X: 非人形角色去掉人形负面词（脸部模糊 / 多余手指）+ 加"非拟人化主体误加五官"
      `负面：${styleTpl.negativePrefix} ${isNonHuman ? '文字、水印、低质量、非拟人化主体误加五官、多余肢体' : '多个人物、杂乱背景、环境景物、多余肢体、畸形手、脸部模糊、多余手指、畸形、文字、水印、低质量。'}`,
      // 🆕 v0.22.X: 借鉴 Sora 2 角色 registry 思路——加"白名单锚定"句，让 LLM 明确知道画面元素来源
      //   角色图 prompt 元素来源 = desc（角色视觉特征）+ 参考图（角色档案图）
      //   不让 LLM 自由加 desc 里没描述的细节（比如 desc 说"棕色拖车"，LLM 不能自由加"保险杠/挡风玻璃"等没提的元素）
      `🔒 元素白名单：画面中角色/主体的视觉元素只能来自「外貌（desc）」描述 + 参考图（角色档案图）的内容。不得凭空添加 desc 里未提及的细节（材质/纹理/装饰/标志物/色彩图案/挂件/伤痕等）。`,
    ].filter(Boolean);
    return lines.join(' ');
  }

/**
   * 场景图 prompt（环境本身，不带 logline 剧情元素）
   *   v0.22.31: 加 art_style 风格硬约束 + IP 锚定（如果 setting 提到 IP 场景名）
   *   v0.22.84: view 参数（'wide' | 'medium' | 'close'）—— 场景圣经多视角：
   *     同一地点的不同机位各出一张图，用硬约束锁死环境元素一致，只改机位/景别；
   *     首帧生成时按本场 scene.shot 自动挑视角（见 server pickSceneViewKey）
   */
  function buildScenePrompt(sp, targetSeconds, artStyle, view) {
    const setting = (sp.setting || '').trim();
    const ts = targetSeconds || 30;
    const viewKey = (view === 'wide' || view === 'medium' || view === 'close') ? view : '';
    const viewLabel = { wide: '全景', medium: '中景', close: '特写' }[viewKey] || '';
    // v0.22.31: artStyle 默认值
    const style = artStyle || sp?.art_style || 'photorealistic';

    // v0.22.31: IP 锚定（场景里也可能有 IP，比如"霍格沃茨"）
    const ipDict = window.ACMSScreenplayIPDict;
    const styleTpl = ipDict?.getStyleTemplate(style) || { stylePrefix: '', styleSuffix: '', negativePrefix: '' };
    let ipAnchor = null;
    if (ipDict && setting) {
      ipAnchor = ipDict.lookup(setting);
    }

    // v0.22.64: 全中文（原英文见 git 历史）
    const envLine = ipAnchor
      ? `环境：${setting || ''}（${ipAnchor.nameEn}）。${ipAnchor.visualKeywords}。`
      : (setting ? `环境：${setting}。` : '环境：电影感短片取景地，氛围感强。');

    const atmosphereLine = setting ? '氛围：与所处环境一致（天气、时间、场地氛围）。' : '氛围：电影感的环境氛围。';

    // v0.22.80: 场景基准图「元素登记纪律」（治根 —— 场景图是全剧所有首帧的参考基准，
    //   它自由发挥加的元素（樱花林/远山/楼阁）会被逐场复制，是「凭空多出东西」的源头；
    //   同时它也会让 L6 判官把参考图自带元素误判成违规。角色图/视频 prompt 早有白名单，
    //   唯独场景图没有 —— 这次补上）
    const props = (sp.continuity_props || []).map(p => p && p.label).filter(Boolean);
    const registryLine = [
      '🔒 场景基准图纪律（本图将作为全剧所有分镜的参考基准，任何未登记元素都会被逐场复制）：',
      `只画「环境设定」「登记道具」「空间位置」里明确写出的元素。环境设定：${setting || '（未填写，本图只画氛围空镜）'}。`,
      props.length ? `登记道具：${props.join('、')}。` : '',
      '不得自由发挥添加未登记的元素：建筑与构筑物（楼阁/亭台/塔/牌坊/桥梁/房屋/围墙/石阶/道路/码头）；',
      '开花乔木与成片花丛（樱花/桃花/杏花/花海）；地貌（远山/山脉/丘陵）；人造陈设（灯笼/石凳/舟船/家具/围栏）。',
    ].filter(Boolean).join('');

    // v0.55: 把"人像/肖像"替换成"空镜"（场景专属，不引导人物）
    const sceneStyleSuffix = styleTpl.styleSuffix.replace(/人像|肖像|portrait/gi, '空镜');

    // v0.22.84: 场景圣经多视角 —— 视角声明 + 跨视角环境一致性硬约束 + 分镜别构图
    const viewLine = viewKey
      ? `🎞 场景圣经·${viewLabel}机位：本图是同一地点的「${viewLabel}」视角（其它机位各有独立图）。硬约束：环境元素必须与主场景图完全一致 —— 地形地貌、植被种类与分布、水面与河岸形状、光照方向与天气、时代风格；只允许改变机位、景别与取景范围，不得出现主场景图没有的元素（建筑/构筑物/植被/陈设）。`
      : '';
    const compLine = viewKey === 'close'
      ? '构图：特写/近景机位，聚焦场景关键局部，背景虚化但与环境同源，浅景深。'
      : viewKey === 'medium'
        ? '构图：中景机位，平视，取场景中段（主体及其近旁环境），保留环境上下文，前中后景层次分明。'
        : viewKey === 'wide'
          ? '构图：广角全景建立镜头，略低角度或平视，完整展示场景全貌与空间关系。'
          : '构图：广角建立镜头，略低角度或平视，前中后景层次清晰，以环境为主体。';

    const lines = [
      viewKey ? `场景（场景圣经·${viewLabel}机位）：环境镜头，画面中不出现人物。` : '场景：环境建立镜头，画面中不出现人物。',
      envLine,
      atmosphereLine,
      registryLine,
      viewLine,
      compLine,
      '光线：与环境及时间一致的自然环境光，柔和空气感，景深。',
      // v0.X 修复：用 styleTpl.descriptors.scene 替代"电影感建立镜头、写实、氛围光效、专业摄影、空旷场地"
      `风格：${styleTpl.stylePrefix} ${sceneStyleSuffix} ${styleTpl.descriptors?.scene || ''}`,
      // v0.X 修复：quality 行也用 descriptors.sceneQuality 替代
      `质量：${styleTpl.descriptors?.sceneQuality || '细节丰富，杰作级，广角构图。'}`,
      // v0.22.55: negative 加强 — 不只防"人"，还要明确"空镜 / 无人"
      `负面：${styleTpl.negativePrefix} 人物、角色、人类、动物、宠物、人群、拥挤、有人、文字、水印、模糊、低质量、设定未登记的建筑（楼阁/亭台/塔/牌坊/桥梁/房屋/围墙/石阶/道路/码头）、设定未登记的开花乔木与成片花丛（樱花/桃花/杏花/花海）、设定未登记的远山/山脉/丘陵、设定未登记的人造陈设（灯笼/石凳/舟船/家具/围栏）。`,
    ];
    return lines.join(' ');
  }

/**
   * v0.22.23: 视频 prompt（分镜头）
   *   视频模型需要的结构 = 视觉描述 + 镜头感 + 动作 + 对白 + 风格一致性 + 质量
   *   Agnes Video API（参考 video.js 实现）对结构化 prompt 响应更好
   *   v0.22.31: 加 art_style 风格硬约束 + IP 锚定（如果 scene.sp 含 IP）
   */

  /**
   * v0.22.X L6 闭环验证 —— 首帧图生成后 AI 自检状态的展示徽章
   *   frameObj.l6_check: { ok, violations:[], reason, degraded?, skipped? }
   *   三种展示态：
   *     ① 无 l6_check（老数据）→ 不展示
   *     ② 自检通过（ok:true 或降级通过）→ 绿色「✅ L6 自检通过」
   *     ③ 仍有违规（ok:false + violations）→ 黄色「⚠️ AI 检测到未登记元素：...（已尝试自动重生成）」
   */
  function renderL6Badge(l6) {
    if (!l6 || typeof l6 !== 'object') return '';
    // 降级 / 跳过 → 灰色小字提示，不干扰主视觉
    if (l6.skipped) return '<div style="font-size:10px;color:var(--text3);margin-top:1px" title="没有本地备份图，跳过了 AI 自检">◌ L6 自检：跳过（无本地备份）</div>';
    if (l6.degraded) return '<div style="font-size:10px;color:var(--text3);margin-top:1px" title="' + escHtml(l6.reason || '视觉模型不可用') + '">◌ L6 自检：' + escHtml(l6.reason || '降级通过') + '</div>';
    // v0.22.83: warn 模式（默认）—— 检测到就列明细 + 给用户三个可行动作，不再声称"已自动重生成"
    if (!l6.ok && Array.isArray(l6.violations) && l6.violations.length) {
      return '<div style="font-size:10px;color:#c9a227;margin-top:1px" title="' + escHtml(l6.reason || '') + '">⚠️ L6 自检：检测到未登记元素（' + escHtml(l6.violations.join('、')) + '）—— 未自动重画。可改上方提示词后点「🔄 重生成首帧」，或忽略</div>';
    }
    // 通过（含干净 + auto 模式下已修复）→ 绿色
    return '<div style="font-size:10px;color:var(--green);margin-top:1px" title="' + escHtml(l6.reason || '画面元素都在剧本登记范围内') + '">✅ L6 自检通过' + ((l6.violations && l6.violations.length) ? '（已自动修复 ' + escHtml(l6.violations.join('、')) + '）' : '') + '</div>';
  }

  function buildSceneVideoPrompt(scene, sp, artStyle) {
    const shot = (scene.shot || '').trim();
    const action = (scene.action || '').trim();
    const dialogue = scene.dialogue && scene.dialogue !== '——' ? scene.dialogue.trim() : '';
    const setting = (sp.setting || '').trim();
    const ts = sp.target_seconds || 30;
    // v0.22.31: artStyle 默认值
    const style = artStyle || sp?.art_style || 'photorealistic';

    // v0.22.31: IP 锚定（视频场景里也可能有 IP，比如"霍格沃茨大厅"）
    const ipDict = window.ACMSScreenplayIPDict;
    const styleTpl = ipDict?.getStyleTemplate(style) || { stylePrefix: '', styleSuffix: '', negativePrefix: '', descriptors: { video: '', videoQuality: '' } };
    let ipAnchor = null;
    if (ipDict) {
      const searchText = `${setting} ${shot} ${action}`;
      ipAnchor = ipDict.lookup(searchText);
    }

    // 🆕 v0.X fix: 注入场景出场角色的 desc（防止生图 LLM 脑补"不在剧本里的人物"）
    //   server schema L37-43 已加 characters: [name1, name2] 字段（之前没有）
    //   兜底：scene.characters 缺失或为空（v0.X 之前的旧剧本）→ 注入 sp.characters 全部
    //   兜底 2：name 在 sp.characters 里查不到（LLM 瞎写名字）→ 跳过
    const allChars = Array.isArray(sp.characters) ? sp.characters : [];
    const sceneCharNames = (Array.isArray(scene.characters) && scene.characters.length)
      ? scene.characters
      : allChars.map(c => c.name).filter(Boolean);  // 旧剧本兜底：注入所有角色
    const characterLines = [];
    sceneCharNames.forEach(name => {
      const c = allChars.find(c => c.name === name);
      if (c && (c.name || c.desc)) {
        characterLines.push(`出场人物：${c.name || ''}（${c.desc || ''}）。`);
      }
    });
    const characterLine = characterLines.join(' ');

    // v0.22.64: 全中文（原英文见 git 历史）
    // 🆕 v0.22.X fix: 优先用 scene_location（每场独立空间锚定 —— Continuity Bible L48 加的字段）
    //   之前只用 sp.setting（全局基调）→ 每场具体空间位置丢失，LLM 自由发挥
    //   经典 bug：场 1 shot 写"中景，淑女侧身伸手采莲" + setting 写"江南水乡..."
    //   → Agnes 脑补"岸边柳树下伸手够莲蓬"，实际剧本场 1 scene_location="荷塘深处"（应在船上）
    //   兜底：scene_location 缺失（老剧本）→ 走 setting
    const sceneLocation = (scene.scene_location || '').trim();
    const settingLine = ipAnchor
      ? `场景：${sceneLocation || setting}（${ipAnchor.nameEn}）。${ipAnchor.visualKeywords}。`
      : (sceneLocation
          ? `场景位置：${sceneLocation}（全剧背景：${setting}）。`
          : (setting ? `场景：${setting}。` : ''));

    // 视频里可能有角色 → styleSuffix 里的"人像/肖像"改成中性"画面"（不误导为空镜）
    const videoStyleSuffix = styleTpl.styleSuffix.replace(/人像|肖像|portrait/gi, '画面');

    // v0.X 修复：descriptors.video 含 $TS$ 占位符（与 character/scene 不同，video 描述需要 ts 变量）
    const videoDesc = (styleTpl.descriptors?.video || '').replace('$TS$', ts);

    const parts = [
      // v0.22.31: 场景环境（上下文锚定 — 跟当前剧本 setting 一致 + IP 视觉锚定）
      settingLine,
      // 镜头与构图
      shot ? `镜头：${shot}。` : '镜头：电影感中景，平视，适度景深。',
      // 🆕 v0.X fix: 注入场景出场人物（在动作之前，让生图 LLM 先知道人物再描述动作）
      characterLine,
      // 动作（核心）
      action ? `动作：${action}。` : '',
      // 对白（如有）
      dialogue ? `对白：角色说："${dialogue}"。` : '',
      // 🆕 v0.22.X fix: 对白人物名不等于出场人物 —— 注入「对白里出现但不在出场人物中的名字不得出现在画面」
      //   经典 bug：场 1 对白"窈窕淑女，君子好逑" → LLM 看到"君子"两字 → 画两个角色
      //   即使 characters 字段已限制 LLM 也常把对白里出现的名字脑补成第二个出场人物
      //   防御式：扫对白里所有 sp.characters 中的名字 → 在出场人物里的留 → 不在的进负面词
      (() => {
        if (!dialogue || !Array.isArray(sp.characters)) return '';
        const castNames = (Array.isArray(scene.characters) && scene.characters.length)
          ? scene.characters
          : allChars.map(c => c.name).filter(Boolean);
        const castSet = new Set(castNames);
        const offstage = sp.characters
          .map(c => c.name)
          .filter(name => name && !castSet.has(name) && dialogue.includes(name));
        if (offstage.length === 0) return '';
        return `硬约束：画面中只能出现出场人物（${castNames.join('、')}），对白里提及但未出场的角色（${offstage.join('、')}）不得出现在画面中、不得以剪影/背影/旁观者等方式出现。`;
      })(),
      // 🆕 v0.22.X: 视频场景元素白名单（与 genSceneFrame 对称）—— 借鉴 Sora 2 scene registry
      //   视频画面元素来源 = 参考图（角色 + 场景 + 上场首帧）+ setting + continuity_props + scene_location
      //   不允许凭空引入未登记的元素（建筑/陈设/装饰等）
      `🔒 元素白名单：视频画面中只能出现下列来源的元素：① 参考图（角色档案图 + 场景图 + 上一段尾帧/本段首帧）的视觉元素；② setting（${(setting || '').slice(0,40)}）；③ continuity_props 登记的道具（${(sp.continuity_props || []).map(p => p.label).join('、') || '无'}）；④ scene_location（${(sceneLocation || '').slice(0,30)}）。白名单外的元素（楼阁/亭台/塔/牌坊/桥梁/新建筑/新装饰/新陈设）一律不得出现。`,
      // v0.X 修复：用 descriptors.video 替换"电影感 ... 短片质感，写实，专业摄影，动作流畅自然"
      `风格：${styleTpl.stylePrefix} ${videoStyleSuffix} ${videoDesc}`,
      // v0.X 修复：quality 用 descriptors.videoQuality
      `质量：${styleTpl.descriptors?.videoQuality || '细节丰富，焦点清晰。'}`,
    ].filter(Boolean);
    return parts.join(' ');
  }

  /**
   * 主渲染函数
   *   data = 完整 assist_screenplay JSON
   *   返回 HTML 字符串
   */
  function renderDetail(reqId, data) {
    if (!data) return '';
    if (data.status === 'generating') {
      return '<div class="insight-loading">⏳ 正在生成 3 个剧本方案…</div>';
    }
    if (data.status === 'failed') {
      return `<div class="insight-error">❌ 生成失败：${escHtml(data.error || '未知错误')}</div>`;
    }
    if (data.status === 'done' && !data.picked && data.picked !== 0) {
      return renderPickScreenplayList(reqId, data);
    }
    if (data.status === 'done' && (data.picked !== null && data.picked !== undefined)) {
      return renderSelectedScreenplay(reqId, data);
    }
    return '';
  }

  /** 3 个剧本选项卡（未选状态） */
  function renderPickScreenplayList(reqId, data) {
    const screenplays = data.screenplays || [];
    const cards = screenplays.map((sp, i) => {
      const isPicked = data.picked === i;
      return `
      <div class="assist-card ${isPicked ? 'assist-card-picked' : ''}" data-screenplay-idx="${i}">
        <div class="assist-card-header">
          <span class="assist-card-letter">${String.fromCharCode(65 + i)}</span>
          <strong>${escHtml(sp.title || '(无标题)')}</strong>
          ${isPicked ? '<span class="assist-picked-badge">✅ 你选的</span>' : ''}
        </div>
        <div class="assist-card-row" style="font-style:italic;color:var(--text2);margin:4px 0">${escHtml(sp.logline || '')}</div>
        ${sp.characters && sp.characters.length ? `
          <div class="assist-card-row"><span class="assist-label">角色：</span>${sp.characters.map(c => escHtml(c.name || '') + (c.desc ? '（' + escHtml(c.desc) + '）' : '')).join('、')}</div>
        ` : ''}
        <div class="assist-card-row"><span class="assist-label">分镜：</span>${(sp.scenes || []).length} 场 · ${data.target_seconds || 30}s</div>
        <details style="margin-top:4px">
          <summary style="font-size:11px;color:var(--text2);cursor:pointer">📖 查看完整分镜</summary>
          <div style="padding:6px 0;font-size:11px;color:var(--text)">
            ${(sp.scenes || []).map(sc => `
              <div style="margin:3px 0;padding:4px;border-left:2px solid var(--border)">
                <div style="color:var(--accent);font-weight:600">⏱ ${escHtml(sc.time || '?')}</div>
                ${sc.shot ? `<div>📷 ${escHtml(sc.shot)}</div>` : ''}
                ${sc.dialogue && sc.dialogue !== '——' ? `<div>💬 ${escHtml(sc.dialogue)}</div>` : ''}
                ${sc.action ? `<div>🎬 ${escHtml(sc.action)}</div>` : ''}
              </div>
            `).join('')}
            ${sp.shot_tips ? `<div style="margin-top:4px;color:var(--text2)">💡 拍摄建议：${escHtml(sp.shot_tips)}</div>` : ''}
          </div>
        </details>
        <button class="btn-small btn-primary assist-pick-btn" onclick="selectScreenplay('${reqId}', ${i})">
          ${isPicked ? '✅ 已选 · 已填入输入框' : '👆 选这个剧本'}
        </button>
      </div>
      `;
    }).join('');

    return `
      <div class="assist-section-title">🎬 短视频剧本 · 3 个方向</div>
      <div class="assist-intro">挑一个最合心意的剧本——选中后会自动填到下方输入框，你可以修改后再发给 AI 继续打磨。</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px">基于：${escHtml(data.idea || '')} · ${data.target_seconds || 30}s</div>
      <div class="assist-grid">${cards}</div>
      <div class="assist-regen-row">
        <button class="btn-small btn-secondary" onclick="ACMSAssistDispatcher.regenerateBatch('${reqId}', 'screenplay')" title="让 AI 再生成 3 个明显不同的剧本">🔄 都不满意，再换一批</button>
      </div>
    `;
  }

  /**
   * 已选剧本 → 渲染角色/场景/分镜头 3 大块 + 内嵌按钮
   *   v0.22.9+: 顶部加状态条（角色/场景/视频 进度）
   */
  function renderSelectedScreenplay(reqId, data) {
    const sp = data.screenplays[data.picked];
    if (!sp) return '<div class="insight-error">剧本数据丢失</div>';
    // v0.22.71 修复：sp 是 screenplay 数组元素（{title, logline, characters, scenes}），
    //   本身没有 art_style 字段。art_style 在 data 顶层（data.art_style）。
    //   不注入会导致 buildCharacterPrompt L47 fallback 永远走 'photorealistic'，
    //   选了"国风水墨"却出"写实摄影"描述。
    //   注入到 sp 让 L47 `sp?.art_style` fallback 能读到，同时外部 screenplay.js 调用 buildSceneVideoPrompt 时也自动生效。
    if (!sp.art_style && data.art_style) sp.art_style = data.art_style;

    const characters = sp.characters || [];
    const scenes = sp.scenes || [];
    const assets = data.assets || { characters: {}, scenes: {} };
    const sceneVideos = data.scene_videos || {};
    const target = data.target_seconds || 30;
    // v0.22.67: 首帧图 + 视频选项（每段时长/画幅）+ 项目 slug（拼本地资源 URL）
    const sceneFrames = data.scene_frames || {};
    const proj = encodeURIComponent(data.project_id || 'default');
    const videoOpts = Object.assign(
      { seconds_per_scene: Math.max(4, Math.min(12, Math.round(target / Math.max(1, scenes.length)) || 5)),
        aspect_ratio: '16:9', video_model: 'agnes-video-2.5-flash' },
      data.video_opts || {}
    );

    // 统计资源就绪情况
    const charAssets = assets.characters || {};
    const sceneAssets = assets.scenes || {};
    const charsReady = characters.filter(c => charAssets[c.name]?.asset_path).length;
    const sceneReady = (sceneAssets['0']?.asset_path) ? 1 : 0;
    // v0.22.65: 计数口径与「是否已生成」一致 —— asset_path（已落本地）或 video_url（CDN）任一存在即算已生成
    //   之前只认 video_url → 本地已下载但 video_url 为空的记录会被算成"未生成"（合成入口不出现）
    const videoReady = scenes.filter((_, i) => {
      const v = sceneVideos[String(i)];
      return !!(v && (v.asset_path || v.video_url));
    }).length;
    const charsTotal = characters.length;
    const sceneTotal = 1;
    const videoTotal = scenes.length;
    const allReady = charsReady === charsTotal && sceneReady === sceneTotal && charsTotal > 0;

    // 顶部状态条
    const statusBar = renderStatusBar({
      charsReady, charsTotal, sceneReady, sceneTotal, videoReady, videoTotal, allReady,
    });

    // 角色区块
    const charactersHtml = characters.map((c, idx) => {
      const name = c.name || `角色${idx + 1}`;
      const desc = c.desc || '';
      const asset = charAssets[name];
      const imgAsset = asset?.asset_path;
      const imgSrc = imgAsset
        ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${imgAsset}`
        : null;
      const cdnFallback = asset?.image_url_output || null;
      const displaySrc = imgSrc || cdnFallback;
      const isReady = !!imgAsset;
      const options = asset?.options || [];
      const hasMultipleOptions = options.length > 1;

      // 3 张候选缩略图（v0.22.11 换图功能）
      // v0.22.57: 改 column 排列（之前 flex-wrap 横排 → 用户报"生成图片后由左向右"）
      //   每张候选独立一行 + 左对齐（按 v1.0"section 完整对等"原则）
      const optionsHtml = hasMultipleOptions ? `
        <details style="margin-top:6px" data-screenplay-options="${escHtml(name).replace(/"/g, '&quot;')}">
          <summary style="font-size:11px;color:var(--accent);cursor:pointer;user-select:none">🔀 候选 ${options.length} 张（已选第 ${(asset.picked_idx || 0) + 1} 张 · 点切换）</summary>
          <div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:6px 0">
            ${options.map((opt, i) => {
              const optSrc = opt.asset_path
                ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${opt.asset_path}`
                : opt.image_url_output;
              const optCdn = opt.image_url_output || null;
              const displayOptSrc = optSrc || optCdn;
              const isSelected = (asset.picked_idx || 0) === i;
              return `
                <div onclick="screenplayPickOption('${reqId}', 'character', '${escHtml(name).replace(/'/g, "\\'")}', ${i})" style="
                  display:flex;align-items:center;gap:8px;
                  padding:4px 6px;border-radius:4px;cursor:pointer;position:relative;
                  border:1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'};
                  background:${isSelected ? 'rgba(99,102,241,0.1)' : 'transparent'};
                " title="候选 ${i + 1}">
                  ${displayOptSrc ? `<img src="${escHtml(displayOptSrc)}" style="width:60px;height:60px;object-fit:cover;border-radius:2px;flex-shrink:0" alt="候选 ${i + 1}" onerror="this.onerror=null;this.src='${escHtml(optCdn || '')}';" />` : '<span style="color:var(--text3);font-size:10px">无图</span>'}
                  <span style="font-size:11px;color:var(--text2)">候选 ${i + 1}${isSelected ? ' · ✅ 已选' : ''}</span>
                  ${isSelected ? '<div style="position:absolute;top:2px;right:2px;background:var(--accent);color:white;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:9px">✓</div>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        </details>
      ` : '';

      // v0.22.22: textarea id 用 idx（不用 name 算 — JS \w 不匹配中文，会撞 id）
      const taId = `sppc-${reqId}-char-${idx}`;
      // v0.22.22: 默认 prompt 用结构化生成函数（带 name + desc + setting + logline + 风格 + 负面）
      // v0.22.82: 用户改过并已保存（prompt_override）→ 优先用它（刷新/换入口后不再退回默认值）
      const charPromptOverride = (asset && typeof asset.prompt_override === 'string') ? asset.prompt_override.trim() : '';
      const defaultPrompt = charPromptOverride || buildCharacterPrompt(c, sp, target);

      return `
        <div class="screenplay-asset-block" style="margin:8px 0;padding:8px;background:var(--bg);border:1px solid ${isReady ? 'var(--green)' : 'var(--border)'};border-radius:6px">
          <!-- v0.22.56: asset block 内部全 column（之前头行 [名字+图+按钮] 横排让"图"挤右边 → "由左向右"）
               现在：头行 [名字 flex:1 + 按钮] + textarea 全宽 + 提示 + 图（次要预览，textarea 下方居左） + 候选 details -->
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <div style="font-weight:600;font-size:13px;flex:1;min-width:0">👤 ${escHtml(name)} ${isReady ? '<span style="color:var(--green)">✅</span>' : '<span style="color:var(--text3)">⏳</span>'}</div>
            <button class="btn-small" onclick="screenplayGenImageForm('${reqId}', 'character', '${escHtml(name)}', document.getElementById('${taId}').value)" style="font-size:10px;flex-shrink:0">${isReady ? '🎨 重新生成' : '🎨 生成图'}</button>
          </div>
          <textarea id="${taId}" rows="3" style="width:100%;font-size:11px;padding:3px;border:1px solid var(--border);border-radius:3px;font-family:inherit" placeholder="修改图片生成的提示词…" onblur="ACMSAssistDispatcher.updateAssetPrompt('${reqId}', 'character', '${escHtml(name).replace(/'/g, "\\'")}', this.value)">${escHtml(defaultPrompt)}</textarea>
          <div style="font-size:10px;color:var(--text3);margin-top:1px">${charPromptOverride ? '✅ 已保存为自定义提示词（改完点按钮即用此版本重画）' : '✏️ 默认已带角色名+描述+场景+风格，改完离开输入框会自动保存'}</div>
          ${displaySrc ? `<div style="margin-top:6px"><img src="${escHtml(displaySrc)}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;cursor:zoom-in" onclick="event.stopPropagation();previewImage('${escHtml(displaySrc)}','${escHtml(cdnFallback || '')}')" alt="角色图" onerror="this.onerror=null;this.src='${escHtml(cdnFallback || '')}';" /></div>` : ''}
          ${optionsHtml}
        </div>
      `;
    }).join('');

    // 场景区块
    const sceneKey = '0';
    const sceneAsset = sceneAssets[sceneKey];
    const sceneImgAsset = sceneAsset?.asset_path;
    const sceneImgSrc = sceneImgAsset
      ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${sceneImgAsset}`
      : null;
    const sceneCdnFallback = sceneAsset?.image_url_output || null;
    const sceneDisplaySrc = sceneImgSrc || sceneCdnFallback;
    const sceneIsReady = !!sceneImgAsset;
    const sceneOptions = sceneAsset?.options || [];
    const sceneHasMultipleOptions = sceneOptions.length > 1;
    // v0.22.57: 候选 details 改 column 排列（之前 flex-wrap 横排 → "由左向右"）
    const sceneOptionsHtml = sceneHasMultipleOptions ? `
      <details style="margin-top:6px" data-screenplay-options="scene_0">
        <summary style="font-size:11px;color:var(--accent);cursor:pointer;user-select:none">🔀 候选 ${sceneOptions.length} 张（已选第 ${(sceneAsset.picked_idx || 0) + 1} 张 · 点切换）</summary>
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:6px 0">
          ${sceneOptions.map((opt, i) => {
            const optSrc = opt.asset_path
              ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${opt.asset_path}`
              : opt.image_url_output;
            const optCdn = opt.image_url_output || null;
            const displayOptSrc = optSrc || optCdn;
            const isSelected = (sceneAsset.picked_idx || 0) === i;
            return `
              <div onclick="screenplayPickOption('${reqId}', 'scene', '0', ${i})" style="
                display:flex;align-items:center;gap:8px;
                padding:4px 6px;border-radius:4px;cursor:pointer;position:relative;
                border:1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'};
                background:${isSelected ? 'rgba(99,102,241,0.1)' : 'transparent'};
              " title="候选 ${i + 1}">
                ${displayOptSrc ? `<img src="${escHtml(displayOptSrc)}" style="width:60px;height:60px;object-fit:cover;border-radius:2px;flex-shrink:0" alt="候选 ${i + 1}" onerror="this.onerror=null;this.src='${escHtml(optCdn || '')}';" />` : '<span style="color:var(--text3);font-size:10px">无图</span>'}
                <span style="font-size:11px;color:var(--text2)">候选 ${i + 1}${isSelected ? ' · ✅ 已选' : ''}</span>
                ${isSelected ? '<div style="position:absolute;top:2px;right:2px;background:var(--accent);color:white;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;font-size:9px">✓</div>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </details>
    ` : '';
    // v0.22.22: 默认 prompt 用结构化生成函数（带 setting + logline + 时长 + 风格 + 负面）
    // v0.22.82: 用户改过并已保存（prompt_override）→ 优先用它
    const sceneOverride = (sceneAsset && typeof sceneAsset.prompt_override === 'string') ? sceneAsset.prompt_override.trim() : '';
    const sceneDefaultPrompt = sceneOverride || buildScenePrompt(sp, target);
    const sceneTaId = `spsc-${reqId}-scene-0`;
    // v0.22.84: 场景圣经（多视角）—— 同一地点的 全景/中景/特写 三张基准图；
    //   首帧按本场 scene.shot 自动挑视角（服务端 pickSceneViewKey），缺哪张就回退主场景图
    const sceneViewRows = ['wide', 'medium', 'close'].map(v => {
      const key = `0#${v}`;
      const label = { wide: '全景', medium: '中景', close: '特写' }[v];
      const a = sceneAssets[key];
      const imgPath = a?.asset_path;
      const imgSrcV = imgPath
        ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${imgPath}`
        : (a?.image_url_output || null);
      const ready = !!imgPath;
      const taIdV = `spsv-${reqId}-${v}`;
      const ov = (a && typeof a.prompt_override === 'string') ? a.prompt_override.trim() : '';
      const defP = ov || buildScenePrompt(sp, target, undefined, v);
      return `
        <div style="margin-top:6px;padding:6px;background:var(--bg2);border:1px solid ${ready ? 'var(--green)' : 'var(--border)'};border-radius:4px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="font-size:11px;flex:1">🎞 ${label}机位 ${ready ? '<span style="color:var(--green)">✅</span>' : '<span style="color:var(--text3)">⏳</span>'}</div>
            <button class="btn-small" onclick="screenplayGenImageForm('${reqId}', 'scene', '${key}', document.getElementById('${taIdV}').value)" style="font-size:10px;flex-shrink:0">${ready ? '🎨 重新生成' : '🎨 生成图'}</button>
          </div>
          <textarea id="${taIdV}" rows="2" style="width:100%;font-size:10px;padding:3px;border:1px solid var(--border);border-radius:3px;font-family:inherit" placeholder="修改${label}机位的提示词…" onblur="ACMSAssistDispatcher.updateAssetPrompt('${reqId}', 'scene', '${key}', this.value)">${escHtml(defP)}</textarea>
          ${imgSrcV ? `<img src="${escHtml(imgSrcV)}" style="width:52px;height:52px;object-fit:cover;border-radius:3px;margin-top:4px;cursor:zoom-in" onclick="event.stopPropagation();previewImage('${escHtml(imgSrcV)}','${escHtml(a?.image_url_output || '')}')" alt="${label}机位" />` : ''}
        </div>`;
    }).join('');
    const sceneBibleBlock = `
      <details style="margin-top:8px">
        <summary style="font-size:11px;color:var(--accent);cursor:pointer;user-select:none">🎞 场景圣经（多视角）· 首帧按分镜景别自动选参考图</summary>
        <div style="font-size:10px;color:var(--text3);margin-top:4px">三张必须是「同一地点」的不同机位（环境元素一致，只改机位/景别）。全景镜头→全景图、中景→中景图、特写→特写图；缺哪张自动回退主场景图。</div>
        ${sceneViewRows}
      </details>
    `;
    const sceneBlock = `
      <div class="screenplay-asset-block" style="margin:8px 0;padding:8px;background:var(--bg);border:1px solid ${sceneIsReady ? 'var(--green)' : 'var(--border)'};border-radius:6px">
        <!-- v0.22.56: 同角色块改全 column，头行 [名字+按钮] + textarea 全宽 + 提示 + 图（次要预览，textarea 下方） -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <div style="font-weight:600;font-size:13px;flex:1;min-width:0">🎬 场景设定 ${sceneIsReady ? '<span style="color:var(--green)">✅</span>' : '<span style="color:var(--text3)">⏳</span>'}</div>
          <button class="btn-small" onclick="screenplayGenImageForm('${reqId}', 'scene', '0', document.getElementById('${sceneTaId}').value)" style="font-size:10px;flex-shrink:0">${sceneIsReady ? '🎨 重新生成' : '🎨 生成图'}</button>
        </div>
        <textarea id="${sceneTaId}" rows="3" style="width:100%;font-size:11px;padding:3px;border:1px solid var(--border);border-radius:3px;font-family:inherit" placeholder="修改场景图的提示词…" onblur="ACMSAssistDispatcher.updateAssetPrompt('${reqId}', 'scene', '0', this.value)">${escHtml(sceneDefaultPrompt)}</textarea>
        <div style="font-size:10px;color:var(--text3);margin-top:1px">${sceneOverride ? '✅ 已保存为自定义提示词（改完点按钮即用此版本重画）' : '✏️ 默认已带环境+氛围+风格，改完离开输入框会自动保存'}</div>
        ${sceneDisplaySrc ? `<div style="margin-top:6px"><img src="${escHtml(sceneDisplaySrc)}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;cursor:zoom-in" onclick="event.stopPropagation();previewImage('${escHtml(sceneDisplaySrc)}','${escHtml(sceneCdnFallback || '')}')" alt="场景图" onerror="this.onerror=null;this.src='${escHtml(sceneCdnFallback || '')}';" /></div>` : ''}
        ${sceneBibleBlock}
        ${sceneOptionsHtml}
      </div>
    `;

    // 分镜头区块
    const scenesHtml = scenes.map((sc, idx) => {
      const video = sceneVideos[String(idx)];
      const videoSrc = video?.asset_path
        ? `/api/generate/assets/${encodeURIComponent(data.project_id || 'default')}/${video.asset_path}`
        : video?.video_url;
      const hasVideo = !!videoSrc;
      const characterAsset = characters.length > 0 ? charAssets[characters[0].name] : null;
      const hasAllAssets = characterAsset?.asset_path && sceneImgAsset;

      // v0.22.67: 首帧图（本场起始定格）—— 作为本段 first_frame，同时作为上一段的 last_frame
      // v0.22.70 fix: 破图 —— image-tools-service.coreGenerate 返回的 asset_path 自带了 workspace 前缀
      //   （'agent-buddy-actions/assets/2026-09-13/x.png'），而这里拼 /api/generate/assets/<slug>/ 时又拼了一次
      //   → 变成 /<slug>/<workspaceDir>/assets/... → 404 → 破图。统一剥掉到 'assets/' 开头。
      const frameObj = sceneFrames[String(idx)];
      const normAsset = (p) => {
        if (!p) return '';
        const i = String(p).indexOf('assets/');
        return i > 0 ? String(p).slice(i) : String(p);
      };
      const frameSrc = frameObj
        ? (frameObj.asset_path ? `/api/generate/assets/${proj}/${normAsset(frameObj.asset_path)}` : (frameObj.image_url_output || ''))
        : '';
      const nextFrameObj = sceneFrames[String(idx + 1)];
      const isLastScene = idx === scenes.length - 1;
      const canGenVideo = !!frameSrc || hasAllAssets;
      const disabledHint = canGenVideo ? '' : '（需先生成角色图 + 场景图，或生成首帧图）';
      const statusBadge = hasVideo
        ? '<span style="color:var(--green)">✅</span>'
        : canGenVideo
          ? '<span style="color:var(--accent)">🔓 可生成</span>'
          : '<span style="color:var(--text3)">⏳ 等待</span>';
      // 衔接说明：本段尾帧 = 下一场首帧（同一张图 → 接缝处画面连续）
      const linkLine = isLastScene
        ? (frameSrc ? '<span style="color:var(--green)">✅ 末段（只用首帧，结尾自由收束）</span>' : '')
        : (frameSrc && nextFrameObj
            ? '<span style="color:var(--green)">🔗 尾帧 = 场 ' + (idx + 2) + ' 首帧（已衔接）</span>'
            : (frameSrc
                ? '<span style="color:var(--accent3)">⚠️ 场 ' + (idx + 2) + ' 首帧未生成 → 本段结尾自由发挥（会有跳变）</span>'
                : ''));

      return `
        <div class="screenplay-scene-block" style="margin:6px 0;padding:8px;background:var(--bg2);border:1px solid ${hasVideo ? 'var(--green)' : 'var(--border)'};border-radius:6px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:12px;color:var(--accent);font-weight:600">⏱ ${escHtml(sc.time || '?')} · 场 ${idx + 1}</span>
            ${statusBadge}
          </div>
          <div style="font-size:12px;line-height:1.6">
            ${sc.shot ? `<div>📷 <strong>镜头：</strong>${escHtml(sc.shot)}</div>` : ''}
            ${sc.dialogue && sc.dialogue !== '——' ? `<div>💬 <strong>对白：</strong>${escHtml(sc.dialogue)}</div>` : ''}
            ${sc.action ? `<div>🎬 <strong>动作：</strong>${escHtml(sc.action)}</div>` : ''}
          </div>

          <div style="margin:6px 0;padding:6px 8px;background:var(--bg);border:1px dashed ${frameSrc ? 'var(--green)' : 'var(--border)'};border-radius:6px">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-size:11px;font-weight:600;flex:1;min-width:0">🖼 首帧图 ${frameSrc ? '✅' : '<span style="color:var(--text3)">未生成</span>'}${(frameObj && frameObj.polished) ? ' <span style="color:var(--accent3)">· ✏️ 已打磨</span>' : ''}</span>
              ${frameSrc ? `<button class="btn-small" style="font-size:10px;flex-shrink:0" onclick="openPolishSceneFrame('${reqId}', ${idx}, '${escHtml(frameSrc)}')" title="打开图片编辑器打磨这张首帧图（改完回写覆盖本场；原图会备份，可还原）">✏️ 打磨</button>` : ''}
              ${(frameObj && frameObj.prev) ? `<button class="btn-small" style="font-size:10px;flex-shrink:0" onclick="screenplayRevertSceneFrame('${reqId}', ${idx}, this)" title="还原到打磨前的首帧图">↩️ 还原</button>` : ''}
              <button class="btn-small" style="font-size:10px;flex-shrink:0" onclick="screenplayGenSceneFrame('${reqId}', ${idx}, this)" title="${frameSrc ? '重新生成这一场的首帧图（角色图+场景图作为参考）' : '用角色图+场景图生成这一场的起始定格画面'}">${frameSrc ? '🔄 重生成首帧' : '🎬 生成首帧图'}</button>
            </div><!-- v0.22.85 修复：这里必须有「首帧图标题行」flex 容器的闭合标签 —— 今晚 L6 提交把它删了，
              于是每个场景块少一层闭合，浏览器把下一场嵌进上一场（用户报「最后一个场景外面套了很多层」）。
              注意：本注释刻意不写标签字面量（否则 HTML 配平类检查会把它当成真标签数进去）。
              回归防护：server/__tests__/test-screenplay-render-structure.js -->
<!-- v0.22.77: 「✏️ 打磨」首帧图回写（覆盖 + 原图备份可还原） -->
              ${(frameObj && frameObj.polished && !frameObj.image_url_output) ? `<div style="font-size:10px;color:var(--accent3);margin-top:3px">⚠️ 这是本地打磨图（没有公网地址）→ 本场生成视频会自动退回「多图参考」模式，段与段之间可能不再严格衔接</div>` : ''}
              <!-- v0.22.X fix: 补全首帧图 prompt 持久化（之前只有视频 textarea，首帧图根本没 textarea+持久化，
                   用户改 prompt 期望影响首帧图但实际生效的是 video_prompt_override，架构断了） -->
              <textarea id="spfrm-${reqId}-${idx}" rows="3" style="width:100%;font-size:11px;padding:3px;border:1px solid var(--border);border-radius:3px;font-family:inherit;margin-top:4px" placeholder="修改首帧图的提示词…（默认显示当前图实际用的提示词，可在此基础上微调）" onblur="ACMSAssistDispatcher.updateSceneFramePrompt('${reqId}', ${idx}, this.value)">${escHtml(sc.scene_frame_prompt_override || (frameObj && frameObj.prompt) || '')}</textarea>
              ${sc.scene_frame_prompt_override ? '<div style="font-size:10px;color:var(--accent3);margin-top:1px">✅ 已保存为自定义首帧图提示词</div>' : '<div style="font-size:10px;color:var(--text3);margin-top:1px">✏️ 可修改提示词后点「🔄 重生成首帧」（默认会用结构化 prompt）</div>'}
              ${renderL6Badge(frameObj && frameObj.l6_check)}
              ${frameObj && frameObj.scene_view ? `<div style="font-size:10px;color:var(--text3);margin-top:1px">🎞 环境参考：${({ '0#wide': '全景', '0#medium': '中景', '0#close': '特写' })[frameObj.scene_view] || '主场景图'}</div>` : ''}
              ${frameSrc ? `
                <div style="margin-top:6px">
                  <img src="${escHtml(frameSrc)}" style="width:100%;max-width:200px;border-radius:4px;cursor:zoom-in;display:block" onclick="event.stopPropagation();previewImage('${escHtml(frameSrc)}','${escHtml(frameObj.image_url_output || '')}')" alt="首帧图" title="点击放大">
              </div>
            ` : `<div style="font-size:10px;color:var(--text3);margin-top:2px">先生成首帧图 → 本段以它为起点，下一场以它为终点，段与段自然衔接</div>`}
            ${linkLine ? `<div style="font-size:10px;margin-top:3px">${linkLine}</div>` : ''}
          </div>

                      <!-- v0.22.23: 默认填入结构化视频 prompt（Setting+Camera+Action+Dialogue+Style+Quality），用户可改 -->
                      <!-- v0.22.X fix: ① 优先读 sp.scenes[idx].video_prompt_override（用户改过就保留） → 之前默认填 buildSceneVideoPrompt，刷新就丢
                                     ② onblur 触发 updateSceneVideoPrompt 写回 req（之前根本没监听，textarea value 只活在 DOM 里） -->
            <textarea id="spvid-${reqId}-${idx}" rows="3" style="width:100%;font-size:11px;padding:3px;border:1px solid var(--border);border-radius:3px;font-family:inherit" placeholder="修改视频生成的提示词…" onblur="ACMSAssistDispatcher.updateSceneVideoPrompt('${reqId}', ${idx}, this.value)">${escHtml(sc.video_prompt_override || buildSceneVideoPrompt(sc, sp))}</textarea>
            <div style="font-size:10px;color:var(--text3);margin-top:1px">✏️ 可修改提示词后点下方按钮（${sc.video_prompt_override ? '✅ 已保存为自定义提示词' : '默认填的是结构化 prompt'}）</div>
          ${hasVideo ? `
            <div style="margin-top:6px">
              <video controls preload="metadata" style="width:100%;max-width:320px;border-radius:4px;cursor:zoom-in;background:#000;display:block" src="${escHtml(videoSrc)}" onclick="${videoClickAttr(videoSrc, video?.video_url)}" title="点击放大播放"></video>
              <div style="font-size:10px;color:var(--text2);margin-top:2px">✅ 视频已生成${video.asset_path ? '（已保存到本地）' : ''}${video.mode === 'keyframe' ? ' · 首尾帧模式' : ''} · 点击画面可放大播放</div>
              <!-- v0.22.X fix: 之前 hasVideo=true 分支完全不渲染按钮（只显示 video），用户改了 textarea 没法点重做 → 补一个「🔄 重做镜头」按钮 -->
              <button class="btn-small" ${canGenVideo ? '' : 'disabled'} onclick="screenplayGenVideo('${reqId}', ${idx}, document.getElementById('spvid-${reqId}-${idx}').value)" style="font-size:11px;margin-top:4px">
                🔄 重做镜头${frameSrc ? '（首尾帧衔接）' : ''}${disabledHint}
              </button>
            </div>
          ` : `
            <div style="margin-top:6px">
              <button class="btn-small" ${canGenVideo ? '' : 'disabled'} onclick="screenplayGenVideo('${reqId}', ${idx}, document.getElementById('spvid-${reqId}-${idx}').value)" style="font-size:11px">
                🎥 生成视频${frameSrc ? '（首尾帧衔接）' : ''}${disabledHint}
              </button>
            </div>
          `}
        </div>
      `;
    }).join('');

    // v0.22.81: Continuity Bible 告警展示 —— 之前校验结果只写进 req.assist_screenplay.warnings，
    //   前端一个字段都没读（「字段加了不消费」反模式）→ 用户看不到任何提示。
    //   数据形状：data.warnings = [{sp_idx, warnings:[{code, scene_idx, prop, message}]}]
    const myWarnings = (() => {
      const all = Array.isArray(data.warnings) ? data.warnings : [];
      const hit = all.find(w => Number(w && w.sp_idx) === Number(data.picked));
      return (hit && Array.isArray(hit.warnings)) ? hit.warnings : [];
    })();
    const warnBanner = myWarnings.length ? `
      <div style="margin:6px 0;padding:8px 10px;background:rgba(201,162,39,0.10);border:1px solid rgba(201,162,39,0.45);border-radius:6px">
        <div style="font-weight:600;font-size:12px;color:#c9a227">⚠️ 连续性告警 ${myWarnings.length} 条（不阻塞生成，建议核对后再出图/出视频）</div>
        <ul style="margin:4px 0 0 16px;padding:0;font-size:11px;color:var(--text2)">
          ${myWarnings.map(w => `<li>场 ${(Number(w && w.scene_idx) || 0) + 1}${w && w.prop ? ' · ' + escHtml(w.prop) : ''}：${escHtml((w && (w.message || w.code)) || '')}</li>`).join('')}
        </ul>
      </div>` : '';

    return `
      <div class="assist-section-title">🎬 ${escHtml(sp.title || '')}</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px">基于：${escHtml(data.idea || '')} · ${target}s · ${scenes.length} 场</div>
      <div style="font-style:italic;color:var(--text2);font-size:12px;margin-bottom:8px">${escHtml(sp.logline || '')}</div>

      ${warnBanner}

      ${statusBar}

      ${characters.length > 0 ? `
        <div class="screenplay-section-block">
          <div class="screenplay-section-title">👤 角色（${charsReady}/${charsTotal}）</div>
          ${charactersHtml}
        </div>
      ` : ''}

      <div class="screenplay-section-block">
        <div class="screenplay-section-title">🎬 场景（${sceneReady}/${sceneTotal}）</div>
        ${sceneBlock}
      </div>

      <div class="screenplay-section-block">
        <div class="screenplay-section-title">🎞 分镜头（${videoReady}/${videoTotal} 场已生成）</div>
        ${renderVideoOptsRow(reqId, data)}
        ${scenesHtml}
      </div>

      ${renderFinalVideoBlock(reqId, data, videoReady, videoTotal, sceneVideos)}

      <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border)">
        <button class="btn-small btn-secondary" onclick="ACMSAssistDispatcher.regenerateBatch('${reqId}', 'screenplay')" title="换一批剧本">🔄 换一批剧本</button>
      </div>
    `;
  }

  /**
   * v0.22.67: 视频生成选项行（每段时长 / 画幅）—— 用户拍板「有默认值但允许调整」
   *   - 每段时长：4-12s（2.5-flash 的 seconds 支持范围），默认 = 总时长 ÷ 场数
   *   - 画幅：16:9（默认）/ 9:16 / 1:1 / 4:3 / 3:4
   *   改动即时写回后端（set_video_opts），下一次生成视频/首帧图即生效
   */
  function renderVideoOptsRow(reqId, data) {
    const target = data.target_seconds || 30;
    const sceneN = ((data.screenplays && data.screenplays[data.picked]) || {}).scenes || [];
    const defaults = { seconds_per_scene: Math.max(4, Math.min(12, Math.round(target / Math.max(1, sceneN.length)) || 5)), aspect_ratio: '16:9' };
    const vo = Object.assign(defaults, data.video_opts || {});
    const secOpts = [4, 5, 6, 8, 10, 12].map(v =>
      `<option value="${v}"${v === vo.seconds_per_scene ? ' selected' : ''}>${v}s</option>`).join('');
    const aspOpts = ['16:9', '9:16', '1:1', '4:3', '3:4'].map(v =>
      `<option value="${v}"${v === vo.aspect_ratio ? ' selected' : ''}>${v}${v === '16:9' ? '（默认）' : ''}</option>`).join('');
    return `
      <div style="margin:4px 0 6px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span style="font-size:10px;color:var(--text3)">生成参数</span>
        <label style="font-size:11px;color:var(--text2)">每段时长
          <select class="btn-small" style="font-size:11px;padding:1px 4px" onchange="screenplaySetVideoOpts('${reqId}','seconds_per_scene',this.value,this)" title="2.5-flash 支持 4-12 秒/段；总时长 ${target}s">${secOpts}</select>
        </label>
        <label style="font-size:11px;color:var(--text2)">画幅
          <select class="btn-small" style="font-size:11px;padding:1px 4px" onchange="screenplaySetVideoOpts('${reqId}','aspect_ratio',this.value,this)" title="视频与首帧图都会用这个画幅">${aspOpts}</select>
        </label>
        <span style="font-size:10px;color:var(--text3)">模型 ${escHtml(vo.video_model || 'agnes-video-2.5-flash')}（首尾帧）</span>
      </div>
    `;
  }

  /**
   * v0.22.65: 完整视频区块（分镜头合成）
   *   用户报「3 段视频是割裂的，怎么连到一起」→ 这里给「合成完整视频」入口 + 成片回显
   *   - 已有 final_video → 播放器（点画面放大播放）+ 元信息 + 重新合成（可选过渡）+ 下载
   *   - 未合成且已生成 ≥2 段 → 两个合成按钮（无缝拼接 / 淡入淡出）
   *   - 段数不足 → 明确提示还差几段（不静默隐藏）
   */
  function renderFinalVideoBlock(reqId, data, videoReady, videoTotal, sceneVideos) {
    const final = data.final_video;
    const proj = encodeURIComponent(data.project_id || 'default');
    const finalSrc = final && final.asset_path ? `/api/generate/assets/${proj}/${final.asset_path}` : '';
    const boxStyle = 'margin:6px 0;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px';

    if (final && finalSrc) {
      const dur = final.duration ? Math.round(final.duration * 10) / 10 + 's' : '?';
      const mb = final.size ? (final.size / 1048576).toFixed(1) + 'MB' : '?';
      const how = final.transition === 'fade' ? '淡入淡出过渡' : '无缝拼接';
      return `
        <div class="screenplay-section-block">
          <div class="screenplay-section-title">🎬 完整视频（已合成）</div>
          <div class="${'screenplay-final-block'}" style="${boxStyle};border-color:var(--green)">
            <video controls preload="metadata" style="width:100%;max-width:360px;border-radius:4px;cursor:zoom-in;background:#000;display:block" src="${escHtml(finalSrc)}" onclick="${videoClickAttr(finalSrc)}" title="点击放大播放"></video>
            <div style="font-size:10px;color:var(--text2);margin-top:4px">
              ✅ ${final.segments || videoReady} 段 · ${dur} · ${mb} · ${how} · 点击画面可放大播放
            </div>
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <span style="font-size:10px;color:var(--text3)">重新合成：</span>
              <button class="btn-small" style="font-size:10px" onclick="screenplayComposeFinal('${reqId}', 'none', this)">🎞 无缝拼接</button>
              <button class="btn-small" style="font-size:10px" onclick="screenplayComposeFinal('${reqId}', 'fade', this)">✨ 淡入淡出过渡</button>
              <a class="btn-small" style="font-size:10px;text-decoration:none" href="${escHtml(finalSrc)}" download title="下载完整视频">⬇️ 下载</a>
            </div>
          </div>
        </div>
      `;
    }

    if (videoReady >= 2) {
      return `
        <div class="screenplay-section-block">
          <div class="screenplay-section-title">🎬 完整视频（${videoReady}/${videoTotal} 段已生成，可合成）</div>
          <div style="${boxStyle}">
            <div style="font-size:11px;color:var(--text2);margin-bottom:6px">把已生成的 ${videoReady} 个分镜头按顺序拼成一条完整视频（ffmpeg 本地合成，几秒完成）</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn-small btn-primary" style="font-size:11px" onclick="screenplayComposeFinal('${reqId}', 'none', this)">🎞 合成完整视频</button>
              <button class="btn-small" style="font-size:11px" onclick="screenplayComposeFinal('${reqId}', 'fade', this)" title="相邻两段 0.4 秒交叉溶解，观感更顺">✨ 淡入淡出过渡</button>
            </div>
          </div>
        </div>
      `;
    }

    // 不足 2 段：明确说明还差多少（不静默隐藏，避免用户以为功能没了）
    return `
      <div class="screenplay-section-block">
        <div class="screenplay-section-title">🎬 完整视频</div>
        <div style="${boxStyle}">
          <div style="font-size:11px;color:var(--text3)">已生成 ${videoReady}/${videoTotal} 段 —— 至少 2 段才能合成完整视频</div>
        </div>
      </div>
    `;
  }

  /**
   * v0.22.9+: 资源就绪状态条
   *   显示"角色 X/Y · 场景 X/Y · 视频 X/Y"
   *   全齐时高亮绿色"✅ 可开始生成视频"
   */
  function renderStatusBar(stats) {
    const { charsReady, charsTotal, sceneReady, sceneTotal, videoReady, videoTotal, allReady } = stats;
    const progress = (charsReady + sceneReady + videoReady) / Math.max(1, charsTotal + sceneTotal + videoTotal);
    const pct = Math.round(progress * 100);

    if (allReady) {
      return `
        <div style="margin:8px 0;padding:8px 10px;background:rgba(34,197,94,0.08);border:1px solid var(--green);border-radius:6px">
          <div style="font-weight:600;font-size:12px;color:var(--green)">✅ 全部资源就绪（${pct}%）</div>
          <div style="font-size:10px;color:var(--text2);margin-top:2px">角色 ${charsReady}/${charsTotal} · 场景 ${sceneReady}/${sceneTotal} · 视频 ${videoReady}/${videoTotal}</div>
        </div>
      `;
    }
    return `
      <div style="margin:8px 0;padding:6px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--text2)">📊 资源进度</span>
          <span style="font-size:11px;font-weight:600;color:${progress > 0 ? 'var(--accent)' : 'var(--text3)'}">${pct}%</span>
          <span style="font-size:10px;color:var(--text3);flex:1">·</span>
          <span style="font-size:10px;color:var(--text2)">角色 ${charsReady}/${charsTotal} · 场景 ${sceneReady}/${sceneTotal} · 视频 ${videoReady}/${videoTotal}</span>
        </div>
        <div style="height:3px;background:var(--border);border-radius:2px;margin-top:4px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--accent);transition:width .3s"></div>
        </div>
      </div>
    `;
  }

  /**
   * 解析聊天流 screenplay_result 卡片 → 调 renderDetail
   *   entry.text 是 JSON 字符串（含 screenplay + meta + assets + scene_videos）
   *   v0.22.13+: 把 assets + scene_videos 传给 renderDetail，让聊天流卡片也能交互
   */
  function renderFromChatEntry(reqId, jsonText) {
    if (!jsonText) return '<div class="chat-system-msg">📖 剧本结果（数据为空）</div>';
    let card;
    try { card = JSON.parse(jsonText); } catch { return `<div class="chat-system-msg">${escHtml((jsonText || '').slice(0, 100))}</div>`; }
    if (card.type !== 'screenplay_card' || !card.screenplay) {
      return `<div class="chat-system-msg">${escHtml((jsonText || '').slice(0, 100))}</div>`;
    }
    // 转成 renderDetail 期望的 data 结构（含完整 assets + scene_videos + project_id）
    // 注意：card.screenplay 是 server 写卡时已经是被选中的那一个（writeScreenplayChatEntry 传
    //   assist.screenplays[assist.picked]），所以 screenplays 数组长度恒为 1 → picked 必须是 0。
    //   card.picked_idx 是「3 个候选剧本里的第几个」(0/1/2)，不是「screenplays 数组索引」，
    //   之前误用它当 picked → 用户选了第 2/3 个剧本后再选图 → screenplays[1/2]=undefined → "剧本数据丢失"
    return renderDetail(reqId, {
      status: 'done',
      idea: card.idea || '',
      target_seconds: card.target_seconds || 30,
      screenplays: [card.screenplay],
      picked: 0,
      picked_at: card.saved_at || new Date().toISOString(),
      // 🆕 v0.22.72 bug fix: 把 art_style 也带过来（之前漏了 → buildCharacterPrompt L47 永远 fallback photorealistic）
      //   来源：server 端 writeScreenplayChatEntry 现在写入 card.art_style（从 req.assist_screenplay 反序列化读）
      art_style: card.art_style || 'photorealistic',
      // v0.22.13: 把 resources 也带过来（让聊天流卡片也能用按钮交互）
      assets: card.assets || { characters: {}, scenes: {} },
      scene_videos: card.scene_videos || {},
      // v0.22.20: server 端 setAsset/writeScreenplayChatEntry 已把 project_id 写进 card
      //   之前这里没传 → 拼本地 URL fallback 到 'default' → 404（因为没有 default 项目）
      // v0.22.65: 合成后的完整视频也要带过来（否则聊天流卡片看不到成片）
      final_video: card.final_video || null,
      // v0.22.67: 首帧图 + 视频选项（每段时长/画幅）
      scene_frames: card.scene_frames || {},
      video_opts: card.video_opts || null,
      project_id: card.project_id || null,
      // v0.22.81: Continuity Bible 告警（chat 卡路径也要带 —— 两个入口必须一致）
      warnings: card.warnings || [],
    });
  }

  window.ACMSScreenplayCard = { renderDetail, renderFromChatEntry, buildCharacterPrompt, buildScenePrompt, buildSceneVideoPrompt };
})();
