// ACMS 内建工具 — 邮件发送（v0.47）
//   LLM 看到用户说"把对话发邮件给 xxx"/"把生成的图片发邮件给 xxx"等意图时,主动 tool-call
//   handler 立即返回 ok=true,但**不立即发邮件**(B 方案:用户确认才发)
//   而是把"待发送邮件"写到 supplement_history(前端识别后弹预览卡)
//   用户点 [✅ 确认发送] → 走原 send_email assist 流程
//   v0.47+: 支持 attach_keywords 自动匹配 REQ 已生成的资产(图片/视频/文档)作为附件
const { registerTool } = require('../services/tool-registry');
const path = require('path');
const fs = require('fs');
const config = require('../config');

registerTool({
  name: 'send_email',
  description: '帮用户发送一封邮件(收件人/主题/正文提取自用户消息 + 对话历史)。'
    + '当用户表达"发邮件给 X""给 X 发个通知""转发对话给 X""把这段内容发给 X""把刚才生成的图片发邮件给 X"等明确邮件发送意图时使用。'
    + '**附件自动匹配(attach_keywords)**:根据关键词(如"海边美女散步图片")在 REQ 历史生成内容(图片/视频/文档)里匹配最相关的 asset 作为附件。'
    + '**默认行为**:不传或传空数组时,自动附带最近生成的 1 个 asset(用户在 REQ 里刚生成的图片/视频/文档)。'
    + '**想不附任何附件**:传 `["none"]` 或 `["无附件"]`(明确告诉系统"无附件")。'
    + '**想附多张**:传多个关键词(如 ["海边散步图","咖啡馆图"])匹配多个 asset,按相关度排序。'
    + '**音乐源是 URL 没有本地文件**,会作为链接追加到正文(不会作为附件)。'
    + '**注意**:这是 B 方案的安全设计 — handler 不会真发邮件,只是把邮件信息写到聊天流让用户在预览卡确认。'
    + '**严禁**对"是否需要提醒/通知/总结"等非明确发邮件意图调用本工具;**严禁**用户没提供收件人地址时胡乱编造邮箱。'
    + '返回 ok=true 表示邮件已准备,前端会弹预览卡让用户确认;ok=false 表示参数缺失或不合法,需 LLM 提示用户补充。'
    + '\n\n'
    + '【🔥 v0.50 新规 — 复合意图下游 send_email body 必须引用上游数据】\n'
    + '当 send_email 是在 plan_execute 编排里作为某个上游 step（web_search / web_research / generate_image / document_gen）的下游时（取决于 depends_on），\n'
    + '你**必须**在 args.body / args.subject 里用 ${...} 模板引用上游真实数据，否则邮件正文会凭空编写：\n'
    + '  ❌ 错误：body = "Please find attached the latest World Cup promotional image."（纯空话，无任何来自上游 step 的数据）\n'
    + '  ✅ 正确：body = "世界杯赛况概要：${s1.formatted}\\n\\n海报附件 ID：${s2.file_ids.0.id}..."（含上游 web_research 综合 + 上游生成的图 file_id）\n'
    + '\n'
    + '注：plan-executor 对 generate_image / document_gen 会自动注入上游 ${s1.formatted} 作为 prefix 兜底；\n'
    + '但**send_email body 不自动注入**（邮件正文是发给用户读的，拼接 prefix 会污染纯度）——\n'
    + '所以你必须显式写 ${...} 引用上游 step result，否则邮件将是空话。这是 v0.50 关键约束。'
    + '\n\n'
    + '【重要】这是 fire-and-forget 异步任务,调用一次即可,不要重复调用。',
  parameters: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: '收件人邮箱(必填,从用户消息抽取,多个用 ; 分隔;无法抽取则填空字符串)',
      },
      subject: {
        type: 'string',
        description: '邮件主题(必填,基于用户消息+对话上下文提炼,简短概括,≤30 字)',
      },
      body: {
        type: 'string',
        description: '邮件正文(必填,基于用户消息+对话历史整理,3-5 句话,包含关键决策/待办/讨论要点)',
      },
      attach_keywords: {
        type: 'array',
        items: { type: 'string' },
        description: '附件关键词数组(可选)。'
          + '默认(不传或空数组)=附最近生成的 1 个 asset;'
          + '传 ["none"] = 明确不附;'
          + '传 ["海边散步","咖啡馆"] = 匹配多张相关图。'
          + '系统会在 REQ 历史的图片/视频/文档生成内容里匹配最相关的 asset 作为邮件附件。',
      },
    },
    required: ['to', 'subject', 'body'],
  },
  async handler(args, ctx = {}) {
    const { reqId } = ctx;
    if (!reqId) return { ok: false, error: 'NO_REQ_ID', message: '工具调用上下文缺少 reqId' };

    // 基础校验
    if (typeof args?.to !== 'string' || typeof args?.subject !== 'string' || typeof args?.body !== 'string') {
      return { ok: false, error: 'INVALID_ARGS', message: 'to/subject/body 必须是字符串' };
    }
    const attachKeywordsRaw = Array.isArray(args?.attach_keywords) ? args.attach_keywords.map(s => String(s).trim()).filter(Boolean) : [];
    // v0.47.2："none/__none__" 显式表示"不要附件"，否则空数组走"默认附最近"
    const attachKeywords = (attachKeywordsRaw.length === 1 && /^(none|__none__|无附件|null|空)$/i.test(attachKeywordsRaw[0]))
      ? []
      : attachKeywordsRaw;
    const forceNoAttach = attachKeywordsRaw.length === 1 && /^(none|__none__|无附件|null|空)$/i.test(attachKeywordsRaw[0]);

    try {
      const reqStore = require('../stores/requirement-store');
      const req = reqStore.getById(reqId);
      if (!req) return { ok: false, error: 'REQ_NOT_FOUND' };

      // v0.49: 附件来源三档优先级
      //   1) args.file_ids 显式（plan-executor 已注入上游精确 file_ids / LLM 手填）
      //   2) ctx.planDoc 上下文 + 没 file_ids → 报错 NO_FILE_IDS_FROM_DEPENDENCIES（不再偷偷走全局兜底）
      //   3) 非 plan 上下文（chat 流直接调）→ 老逻辑（attach_keywords 或默认"最近 1 个"）
      let fileIds = [];
      let matchedDetails = [];

      if (Array.isArray(args?.file_ids) && args.file_ids.length > 0) {
        // 优先级 1：显式 file_ids（plan 上下文最安全的方式）
        fileIds = args.file_ids.map(id => typeof id === 'object' ? (id.id || id) : id);
        // v0.50: plan 模式填 attachments（前端显示附件列表）— chat-upload 没 export getFileMeta，改用 getFilePath
        try {
          const chatUpload = require('../services/chat-upload');
          for (const id of fileIds) {
            // v0.50 fix 0KB bug: getFilePath 返回 {filePath, meta}, meta 含真实 size/mime/name
            const info = chatUpload.getFilePath?.(id);
            const meta = info?.meta;
            if (meta) {
              matchedDetails.push({ name: meta.name || '', size: meta.size || 0, mime: meta.mime || '' });
            } else if (typeof id === 'string') {
              // 真没 meta 时给个 fallback（前端能看到"有附件"事实）
              matchedDetails.push({ name: `附件-${id.slice(0, 8)}`, size: 0, mime: 'application/octet-stream' });
            }
          }
        } catch {}
        console.log(`[tool:send_email] ${reqId} plan 模式: 使用 file_ids=${fileIds.length} attachments=${matchedDetails.length}`);
      } else if (ctx.planDoc) {
        // 优先级 2：plan 上下文但没有 file_ids → 显式拒绝（避免悄悄错拿历史图）
        return {
          ok: false,
          error: 'NO_FILE_IDS_FROM_DEPENDENCIES',
          message: 'plan 上下文中 send_email 需要 file_ids。请确保上游步骤（如 generate_image / document_gen）已生成并在 step.result.file_ids 里；plan-executor 会自动注入。',
          reqId,
        };
      } else {
        // 优先级 3：chat 流直接调 — 老路径（保持向后兼容）
        let matchedAssets = [];
        if (forceNoAttach) {
          matchedAssets = [];
          console.log(`[tool:send_email] ${reqId} 用户显式要求无附件`);
        } else {
          matchedAssets = matchAssetsByKeywords(req, attachKeywords);
        }
        for (const asset of matchedAssets) {
          try {
            const imported = matchAssetToChatUpload(asset);
            if (imported?.id) {
              fileIds.push(imported.id);
              matchedDetails.push({ name: imported.name, size: imported.size, mime: imported.mime });
            }
          } catch (e) {
            console.warn(`[tool:send_email] 导入附件 ${asset.assetPath || asset.filePath} 失败:`, e.message);
          }
        }
      }

      // ── 音乐源（无本地文件，把 URL 追加到正文）──
      let finalBody = args.body.trim();
      const musicUrl = extractMusicUrl(req, attachKeywords);
      if (musicUrl) {
        finalBody += `\n\n🔗 在线收听：${musicUrl}`;
      }

      // ── 写 pending system entry ──
      const historyEntry = {
        role: 'system',
        text: JSON.stringify({
          type: 'pending_send_email',
          to: args.to.trim(),
          subject: args.subject.trim(),
          body: finalBody,
          reason: '用户请求发送邮件',
          file_ids: fileIds,         // v0.47：附件 file_id 列表
          attachments: matchedDetails, // v0.47：附件预览信息(名称+大小)
          music_url: musicUrl,        // v0.47：音乐源(如果有)
        }),
        at: new Date().toISOString(),
        source: 'send_email_pending',
      };

      let history = [];
      try { history = JSON.parse(req.supplement_history || '[]'); } catch { /* 静默 */ }
      if (!Array.isArray(history)) history = [];
      history.push(historyEntry);
      reqStore.update(reqId, { supplement_history: JSON.stringify(history) });

      console.log(`[tool:send_email] ${reqId} pending → to="${args.to.slice(0, 40)}" subject="${args.subject.slice(0, 30)}" attach=${fileIds.length} music=${musicUrl ? 'yes' : 'no'}`);

      const missing = [];
      if (!args.to.trim()) missing.push('收件人');
      if (!args.subject.trim()) missing.push('主题');
      if (!args.body.trim()) missing.push('正文');

      const message = missing.length > 0
        ? `邮件已准备,但 ${missing.join('/')} 未识别 — 用户在聊天流预览卡点 [✏ 编辑] 补全后即可发送`
        : (fileIds.length > 0
          ? `邮件已准备(含 ${fileIds.length} 个附件),等待用户确认`
          : '邮件已准备,等待用户在聊天流预览卡确认后发送');

      return {
        ok: true,
        message,
        reqId,
        preview: { to: args.to.trim(), subject: args.subject.trim(), body: finalBody, file_ids: fileIds, attachments: matchedDetails, music_url: musicUrl },
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
});

// ════════════════════════════════════════════════════════════════════
//  v0.47: 智能附件匹配辅助函数
// ════════════════════════════════════════════════════════════════════

/**
 * 根据关键词在 REQ 已生成的 asset 中匹配附件候选
 * @returns {Array<{ kind, assetPath, absPath, filename, mime, prompt, score }>}
 */
function matchAssetsByKeywords(req, keywords) {
  // 解析 req 真实对应的 project_slug(与 image-gen/video/document-gen 的存盘路径保持一致)
  let projectSlug = 'default';
  try {
    const projectStore = require('../stores/project-store');
    const proj = req.project_id ? projectStore.getById(req.project_id) : null;
    if (proj?.slug) projectSlug = proj.slug;
    else if (req.project_id) projectSlug = req.project_id;
  } catch { /* keep 'default' */ }
  const resolveAbs = (rel) => path.isAbsolute(rel)
    ? rel
    : path.join(config.workspaceRoot, projectSlug, rel);

  const candidates = [];

  // ── 图片：req.assist_image（v0.47.2 修正：字段名是 assist_image，不是 assist_image_gen）──
  try {
    const img = JSON.parse(req.assist_image || 'null');
    if (img && (img.status === 'done' || img.status === 'picked')) {
      const opt = (img.options && img.options[img.picked_idx != null ? img.picked_idx : 0])
        || img.options?.[0]
        || null;
      const assetPath = opt?.asset_path || img.asset_path;
      if (assetPath) {
        candidates.push({
          kind: 'image',
          assetPath,
          absPath: resolveAbs(assetPath),
          filename: (opt?.prompt || img.prompt || 'image').slice(0, 30) + (path.extname(assetPath) || '.png'),
          mime: opt?.mime || 'image/png',
          prompt: opt?.prompt || img.prompt || '',
          savedAt: img.sent_at || img.generated_at,
        });
      }
    }
  } catch { /* ignore */ }

  // ── 视频：req.assist_video（如果有 asset_path 本地文件）──
  try {
    const vid = JSON.parse(req.assist_video || 'null');
    if (vid && vid.status === 'done') {
      const assetPath = vid.asset_path;
      if (assetPath) {
        candidates.push({
          kind: 'video',
          assetPath,
          absPath: resolveAbs(assetPath),
          filename: (vid.prompt || 'video').slice(0, 40) + '.mp4',
          mime: 'video/mp4',
          prompt: vid.prompt || '',
          savedAt: vid.sent_at || vid.generated_at,
        });
      }
    }
  } catch { /* ignore */ }

  // ── 文档：req.assist_document_gen ──
  try {
    const doc = JSON.parse(req.assist_document_gen || 'null');
    if (doc && doc.status === 'done') {
      if (doc.docx_path) {
        candidates.push({
          kind: 'document',
          assetPath: doc.docx_path,
          absPath: resolveAbs(doc.docx_path),
          filename: (doc.user_instruction || 'document').slice(0, 30) + '.docx',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          prompt: doc.user_instruction || '',
          savedAt: doc.sent_at || doc.generated_at,
        });
      } else if (doc.md_path) {
        candidates.push({
          kind: 'document',
          assetPath: doc.md_path,
          absPath: resolveAbs(doc.md_path),
          filename: (doc.user_instruction || 'document').slice(0, 30) + '.md',
          mime: 'text/markdown',
          prompt: doc.user_instruction || '',
          savedAt: doc.sent_at || doc.generated_at,
        });
      }
    }
  } catch { /* ignore */ }

  if (candidates.length === 0) return [];

  // ── 匹配 + 排序 ──
  //   有 keywords: 算 score = 关键词命中数 + 时间衰减
  //   无 keywords: 默认返回最近生成的 1 个
  if (keywords.length === 0) {
    candidates.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
    return [candidates[0]];
  }

  const scored = candidates.map(c => {
    const prompt = (c.prompt || '').toLowerCase();
    const filename = (c.filename || '').toLowerCase();

    // v0.47+ 匹配策略：先整体（强匹配 score=2/token），再按 token 拆 fuzzy 匹配（弱 score=1/token）
    let hits = 0;
    let bestDetail = '';
    for (const kw of keywords) {
      const k = kw.toLowerCase().trim();
      if (!k) continue;

      // 1) 整体子串匹配
      if (prompt.includes(k)) {
        hits += 2;
        bestDetail += `[exact:${k}] `;
        continue;
      }
      if (filename.includes(k)) {
        hits += 1;
        bestDetail += `[file:${k}] `;
        continue;
      }

      // 2) token fuzzy 匹配：把 kw 和 prompt 都按非字母数字字符拆词,统计交集
      //    中文特殊处理:按 2-char sliding window 切(中文常见 2-字词),英文按空格/标点
      const kwTokens = splitToTokens(k);
      const promptTokens = new Set(splitToTokens(prompt).concat(prompt.split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(t => t.length >= 2)));
      let tokenHits = 0;
      for (const t of kwTokens) {
        if (promptTokens.has(t)) tokenHits++;
      }
      if (tokenHits > 0) {
        // 至少一个 token 命中,得 1 分
        hits += 1;
        bestDetail += `[token:${tokenHits}/${kwTokens.length}] `;
      }
    }
    return { ...c, score: hits, _detail: bestDetail };
  }).filter(c => c.score > 0);

  scored.sort((a, b) => b.score - a.score);
  if (scored[0]) console.log(`[tool:send_email] 附件匹配: best="${scored[0].filename}" score=${scored[0].score} ${scored[0]._detail}`);
  return scored;
}

/**
 * v0.47+ 把字符串切成可匹配的 token 列表
 *   - 中文:按 2-char sliding window 切("海边美女散步" → ["海边","边女","美女","女散","散步"])
 *   - 英文/数字:按非字母数字字符切("hello world" → ["hello","world"])
 *   这样"海边美女散步图片"关键词 → 多个 2-char token,任一命中 prompt token 就算匹配
 */
function splitToTokens(str) {
  if (!str) return [];
  const tokens = [];
  // 1) 英文/数字部分：按非字母数字切
  const englishParts = str.split(/[^a-z0-9]+/).filter(t => t.length >= 2);
  tokens.push(...englishParts);
  // 2) 中文部分：连续中文字符按 2-char sliding window
  const chineseBlocks = str.match(/[\u4e00-\u9fa5]+/g) || [];
  for (const block of chineseBlocks) {
    for (let i = 0; i < block.length - 1; i++) {
      tokens.push(block.slice(i, i + 2));
    }
  }
  return tokens;
}

/**
 * 把 asset 复制到 chat-uploads 拿 file_id（v0.47+：直接用 candidate.absPath，跳过路径再拼）
 */
function matchAssetToChatUpload(asset) {
  const absPath = asset.absPath || asset.assetPath;
  if (!fs.existsSync(absPath)) {
    console.warn(`[tool:send_email] asset 不存在: ${absPath}`);
    return null;
  }
  const chatUpload = require('../services/chat-upload');
  return chatUpload.importFromPath(absPath, {
    name: asset.filename,
    mime: asset.mime,
    size: fs.statSync(absPath).size,
    category: asset.kind,
  });
}

/**
 * 提取音乐 URL（如果有音乐源且关键词命中）
 */
function extractMusicUrl(req, keywords) {
  try {
    const music = JSON.parse(req.assist_music || 'null');
    if (!music || music.status !== 'done') return null;

    // 无关键词：默认不附（避免每次发邮件都强行附音乐）
    if (keywords.length === 0) return null;

    // 关键词命中 song/artist
    const song = (music.song || '').toLowerCase();
    const artist = (music.artist || '').toLowerCase();
    const hit = keywords.some(kw => {
      const k = kw.toLowerCase();
      return song.includes(k) || artist.includes(k);
    });
    if (!hit) return null;

    // 优先 playable_url（B站/网易云直接播放链接），其次 sources[0].url
    return music.playable_url || music.sources?.[0]?.url || null;
  } catch { return null; }
}
