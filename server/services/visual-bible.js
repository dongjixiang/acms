// P200: 视觉设定集（Visual Bible）— 从全文自动抽取人物/场景，生成设定图，建立一致性基准
//
// 设计要点（多多 2026-09-12 拍板）：
//   ① 数据源从「用户输入」变成「全文」— 汇总同一角色在所有段落的描写
//   ② 匹配从「UI 勾选」变成「AI 推理」— 用户选段落后 AI 自动匹配角色/场景
//   ③ 用户角色从「维护者」变成「审阅者」— 只在确认卡上点头
//
// 流程：全文 → 分段 LLM 抽取 → 合并去重 → 设定集草案 →（用户确认）→ 逐张生成设定图 → 落库
//   生成图复用 /api/image-tools/ai-generate；落库复用 character-library / scene-library
//   本 service 只负责「分析 + 合并」这块纯推理逻辑

const llmAdapter = require('./llm-adapter');
const modelStore = require('../stores/model-store');

// ── JSON 容错解析（对齐 agent-buddy.js 的 extractJson）──
function extractJson(text) {
  var results = [];
  var depth = 0, start = -1;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        var s = text.slice(start, i + 1);
        try { results.push(JSON.parse(s)); } catch (e) { /* skip */ }
        start = -1;
      }
    }
  }
  return results;
}

// ── 分段：按段落边界切成 ≤ maxChars 的片段，保留全局段落索引 ──
function splitIntoSegments(fullText, maxChars) {
  maxChars = maxChars || 2500;
  var paras = String(fullText || '').split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
  var segments = [];
  var cur = [];
  var curLen = 0;
  var startIdx = 0;
  for (var i = 0; i < paras.length; i++) {
    var p = paras[i];
    // 单段就超限 → 单独成段（避免无限累积）
    if (curLen > 0 && curLen + p.length > maxChars) {
      segments.push({ text: cur.join('\n\n'), startParaIdx: startIdx, endParaIdx: i - 1 });
      cur = []; curLen = 0; startIdx = i;
    }
    cur.push(p); curLen += p.length;
  }
  if (cur.length) segments.push({ text: cur.join('\n\n'), startParaIdx: startIdx, endParaIdx: paras.length - 1 });
  return segments;
}

// ── 单段 LLM 抽取 ──
async function extractFromSegment(segmentText) {
  var model = modelStore.getDefaultGenModel();
  if (!model) throw new Error('未配置生成模型');

  var system = [
    '你是小说/文章的视觉设定分析师。从给定文本片段中抽取所有【人物】和【场景】，输出严格 JSON。',
    '',
    '输出格式：',
    '{"characters":[{"name":"人物名","aliases":["别名"],"description":"外貌/服装/气质的完整描写","imagePrompt":"角色定妆照的画面描述"}],"scenes":[{"name":"场景名","aliases":[],"description":"环境的完整描写","imagePrompt":"环境全景的画面描述"}]}',
    '',
    '规则：',
    '1. name 用文本中的称谓（有全名用全名，否则用最常用的称谓）。',
    '2. description 汇总该片段中关于此人物/场景的**所有**视觉信息（年龄/身材/五官/发型/服装/气质/道具），用一句或几句连贯中文，不要罗列。',
    '3. imagePrompt 是给文生图模型的画面描述 —— 人物：正面或四分之三侧身、半身、五官清晰、素色背景、无文字、无其他人；场景：环境全景、空镜、无人物、有纵深层次。必须包含 description 的关键视觉特征。',
    '4. aliases 是同一个人物/场景在文中出现的其他称谓（如「林公子」「林少侠」）。',
    '5. 只抽取有**视觉形象**意义的实体。抽象概念（命运、江湖）、泛称（人们、众人）、纯功能称呼（店小二只出现一次且无描写）不要抽取。',
    '6. 没有人物或场景时给空数组。',
    '7. 只输出 JSON，不要 markdown 代码块，不要任何解释文字。'
  ].join('\n');

  var result = await llmAdapter.callLLM(model.id, [
    { role: 'system', content: system },
    { role: 'user', content: '文本片段：\n' + segmentText }
  ], { maxTokens: 3000, temperature: 0.2, caller: 'visual-bible-extract' });

  var content = typeof result === 'string' ? result : (result && result.content) || '';
  var jsons = extractJson(content);
  if (!jsons.length) return { characters: [], scenes: [], _raw: content.slice(0, 300) };
  var j = jsons[0];
  return {
    characters: Array.isArray(j.characters) ? j.characters : [],
    scenes: Array.isArray(j.scenes) ? j.scenes : []
  };
}

// ── 归一化名字（用于合并判定）──
function normName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '');
}

// ── 去重拼接描述（按中文句号/分号切句，去掉重复句）──
function mergeDescriptions(descs) {
  var seen = {};
  var out = [];
  descs.forEach(function (d) {
    String(d || '').split(/[。；;]/).forEach(function (sent) {
      var s = sent.trim();
      if (!s || s.length < 2) return;
      // 用前 12 字做去重 key（避免完全相同的句子重复）
      var key = s.slice(0, 12);
      if (seen[key]) return;
      seen[key] = true;
      out.push(s);
    });
  });
  return out.join('。') + (out.length ? '。' : '');
}

// ── 合并多段抽取结果（同实体合并 description/aliases/appearances）──
function mergeEntities(partials, kind) {
  // partials: [{ entities:[...], paraIdxRange:{start,end} }, ...]
  var groups = [];   // [{ name, aliases:Set, descs:[], imagePrompts:[], appearances:Set }]
  var nameToGroup = {};   // normName → group index（name 和 aliases 都建索引）

  partials.forEach(function (partial) {
    var list = partial.entities || [];
    list.forEach(function (e) {
      var name = String(e.name || '').trim();
      if (!name) return;
      var aliases = Array.isArray(e.aliases) ? e.aliases.map(function (a) { return String(a).trim(); }).filter(Boolean) : [];

      // 1. 找已存在的 group — 按 name 或任一 alias 匹配
      var candidates = [name].concat(aliases);
      var gi = -1;
      for (var i = 0; i < candidates.length; i++) {
        var k = normName(candidates[i]);
        if (k && nameToGroup[k] !== undefined) { gi = nameToGroup[k]; break; }
      }

      // 2. 没有就新建
      if (gi < 0) {
        gi = groups.length;
        groups.push({ name: name, aliases: [], descs: [], imagePrompts: [], appearances: [] });
      }
      var g = groups[gi];

      // 3. 索引所有名字
      [name].concat(aliases).forEach(function (n) {
        var k = normName(n);
        if (k && nameToGroup[k] === undefined) nameToGroup[k] = gi;
      });

      // 4. 收集 aliases（排除已作为 group.name 的）
      aliases.forEach(function (a) {
        if (normName(a) !== normName(g.name) && g.aliases.indexOf(a) < 0) g.aliases.push(a);
      });

      // 5. 收集 description / imagePrompt / appearances
      if (e.description) g.descs.push(String(e.description));
      if (e.imagePrompt) g.imagePrompts.push(String(e.imagePrompt));
      if (typeof partial.paraIdx === 'number' && g.appearances.indexOf(partial.paraIdx) < 0) {
        g.appearances.push(partial.paraIdx);
      }
      // 该段落区间内所有出现都算（粗粒度 — 段落级即可）
      if (partial.paraIdxRange) {
        for (var p = partial.paraIdxRange.start; p <= partial.paraIdxRange.end; p++) {
          if (g.appearances.indexOf(p) < 0) g.appearances.push(p);
        }
      }
    });
  });

  // 6. 产出最终结构
  return groups.map(function (g) {
    var desc = mergeDescriptions(g.descs);
    // imagePrompt：优先用已有的最长的（描述更全），否则用 description 兜底
    var bestPrompt = g.imagePrompts.sort(function (a, b) { return (b || '').length - (a || '').length; })[0] || '';
    return {
      name: g.name,
      aliases: g.aliases,
      description: desc,
      imagePrompt: bestPrompt || desc,
      appearances: g.appearances.sort(function (a, b) { return a - b; })
    };
  });
}

// ── 主入口：分析全文 → 设定集草案 ──
//   onProgress({ phase, current, total, message }) — 可选进度回调
async function analyzeDocument(fullText, onProgress) {
  var text = String(fullText || '').trim();
  if (!text) throw new Error('文档为空');
  var segments = splitIntoSegments(text, 2500);
  var total = segments.length;
  if (onProgress) onProgress({ phase: 'segment', current: 0, total: total, message: '开始分析全文…' });

  var partials = [];
  for (var i = 0; i < segments.length; i++) {
    if (onProgress) onProgress({ phase: 'segment', current: i + 1, total: total, message: '分析第 ' + (i + 1) + '/' + total + ' 段…' });
    try {
      var r = await extractFromSegment(segments[i].text);
      r.characters.forEach(function (c) { r.characters.indexOf(c); });
      partials.push({ entities: r.characters, paraIdxRange: { start: segments[i].startParaIdx, end: segments[i].endParaIdx } });
      // 场景单独收集（用同一 partial 结构，后面分开 merge）
      if (!partials[i]._scenes) partials[i]._scenes = r.scenes;
    } catch (e) {
      // 单段失败不阻断整体（记录后继续）
      console.warn('[visual-bible] 段', i + 1, '抽取失败:', e.message);
      partials.push({ entities: [], paraIdxRange: { start: segments[i].startParaIdx, end: segments[i].endParaIdx }, _scenes: [], _error: e.message });
    }
  }

  // 角色用 partials，场景用 _scenes（结构对齐）
  var charPartials = partials.map(function (p) {
    return { entities: p.entities, paraIdxRange: p.paraIdxRange };
  });
  var scenePartials = partials.map(function (p) {
    return { entities: p._scenes || [], paraIdxRange: p.paraIdxRange };
  });

  var characters = mergeEntities(charPartials, 'character');
  var scenes = mergeEntities(scenePartials, 'scene');

  if (onProgress) onProgress({ phase: 'merge', current: total, total: total, message: '合并去重完成' });

  return {
    characters: characters,
    scenes: scenes,
    stats: {
      segments: total,
      chars: text.length,
      charCount: characters.length,
      sceneCount: scenes.length
    }
  };
}

// ── 匹配：给定一段选中文字 → 找出涉及的角色/场景 + 输出镜头描述 ──
async function matchSegment(selectedText, bible) {
  var model = modelStore.getDefaultGenModel();
  if (!model) throw new Error('未配置生成模型');
  var chars = (bible && bible.characters) || [];
  var scenes = (bible && bible.scenes) || [];
  if (!chars.length && !scenes.length) return { characters: [], scene: null, shot: '', prompt: selectedText };

  var charList = chars.map(function (c, i) { return (i + 1) + '. ' + c.name + (c.aliases.length ? '（' + c.aliases.join('/') + '）' : '') + ' — ' + String(c.description).slice(0, 60); }).join('\n');
  var sceneList = scenes.map(function (s, i) { return (i + 1) + '. ' + s.name + ' — ' + String(s.description).slice(0, 60); }).join('\n');

  var system = [
    '你是插图导演。给定一篇文档的【设定集】和用户选中的【一段文字】，判断这段文字应该画什么。',
    '',
    '输出严格 JSON：',
    '{"characters":["涉及的角色名（用设定集里的原名）"],"scene":"涉及的场景名（没有则空字符串）","shot":"镜头描述（谁在哪做什么，景别和角度）","prompt":"给文生图模型的完整画面描述"}',
    '',
    '规则：',
    '1. characters 只列**画面里应该出现**的角色（在场景中但没被提到的背景人物不要）。最多 3 个。',
    '2. scene 只选 1 个最匹配的。都不匹配就给空字符串。',
    '3. shot 描述构图：景别（远景/全景/中景/近景/特写）+ 角色姿态 + 环境元素 + 光线氛围。',
    '4. prompt 是可直接喂给文生图模型的完整描述（含角色外貌关键特征 + 场景环境 + 镜头）。',
    '5. 只输出 JSON，不要 markdown 代码块。'
  ].join('\n');

  var userMsg = '【设定集 · 角色】\n' + (charList || '（无）') +
    '\n\n【设定集 · 场景】\n' + (sceneList || '（无）') +
    '\n\n【用户选中的文字】\n' + String(selectedText || '').slice(0, 1500);

  var result = await llmAdapter.callLLM(model.id, [
    { role: 'system', content: system },
    { role: 'user', content: userMsg }
  ], { maxTokens: 1200, temperature: 0.3, caller: 'visual-bible-match' });

  var content = typeof result === 'string' ? result : (result && result.content) || '';
  var jsons = extractJson(content);
  if (!jsons.length) return { characters: [], scene: null, shot: '', prompt: selectedText };
  var j = jsons[0];

  // 把匹配到的角色名解析回完整对象（含 referenceImage）
  var matchedChars = [];
  (Array.isArray(j.characters) ? j.characters : []).forEach(function (name) {
    var hit = chars.find(function (c) {
      if (normName(c.name) === normName(name)) return true;
      return (c.aliases || []).some(function (a) { return normName(a) === normName(name); });
    });
    if (hit && matchedChars.indexOf(hit) < 0) matchedChars.push(hit);
  });

  var matchedScene = null;
  if (j.scene) {
    matchedScene = scenes.find(function (s) {
      if (normName(s.name) === normName(j.scene)) return true;
      return (s.aliases || []).some(function (a) { return normName(a) === normName(j.scene); });
    }) || null;
  }

  return {
    characters: matchedChars,
    scene: matchedScene,
    shot: String(j.shot || ''),
    prompt: String(j.prompt || selectedText || '')
  };
}

module.exports = {
  analyzeDocument: analyzeDocument,
  matchSegment: matchSegment,
  splitIntoSegments: splitIntoSegments,
  mergeEntities: mergeEntities,
  mergeDescriptions: mergeDescriptions,
  extractJson: extractJson
};
