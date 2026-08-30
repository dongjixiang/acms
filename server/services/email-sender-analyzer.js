// ACMS Email Sender Analyzer — v0.30（借鉴 inbox-zero@main analyze-sender-pattern.ts + ai-categorize-senders.ts）
// 路径：server/services/email-sender-analyzer.js
//
// 借鉴来源（NOASSERTION license — 重写为 JS，不 copy 源码）：
//   - apps/web/app/api/ai/analyze-sender-pattern/route.ts line 39-44：
//     "return immediately + setImmediate / after() 后台处理"
//     借鉴理念但 ACMS 简化为同步返回（数据量小）
//   - apps/web/utils/ai/categorize-sender/ai-categorize-senders.ts：
//     * XML 结构 prompt（senders 列表 + recent emails 抽样）
//     * 防 hallucination（matchSendersWithFullEmail）
//     * 防类目扩散（不在用户类目中 → reject）
//
// 设计原则：
//   1. 一键分析 INBOX 中所有 sender：拉最近 N 封 → 抽取 unique senders → 频率排序
//   2. 取 top 20 sender → 1 次 LLM 调用（省钱 + 类目一致）
//   3. 防 LLM hallucination：返回结果必须匹配原始输入 sender（normalize 后）
//   4. 防类目扩散：LLM 返回的 category 必须 ∈ 用户类目，否则降级 "其他"
//   5. imap-service.listEmails 内部自动 openBox（imap-service.js line 206）
//      —— 不能再额外调不存在的 imap.openBox
//
// 调用方：routes/emails.js POST /analyze-senders
//   入参：{ mailbox?, maxSenders?, modelId? }
//   出参：{ ok, senders: [{from, count, category, rationale, source}], ... }

const runtime = require('./agent-runtime');
const { createImapService } = require('./imap-service');
const config = require('../config');
const categoryStore = require('./email-sender-category-store'); // v0.33 跳过已分类

// 复用 email-classifier 的 DEFAULT_CATEGORIES + 静态规则
const { DEFAULT_CATEGORIES, matchStaticRule } = require('./email-classifier');

// === Sender 抽取与频率统计 ===
function extractEmailAddress(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  const m2 = String(from || '').match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return m2 ? m2[1].toLowerCase() : String(from || '').trim().toLowerCase();
}

function aggregateSendersByFrequency(emails) {
  const map = new Map();
  for (const e of emails || []) {
    const sender = extractEmailAddress(e.from || '');
    if (!sender || sender.includes('@localhost')) continue;
    if (!map.has(sender)) map.set(sender, { emails: [], count: 0 });
    const entry = map.get(sender);
    entry.emails.push({ subject: e.subject || '', snippet: (e.snippet || e.text || '').toString().slice(0, 200), date: e.date || '' });
    entry.count++;
  }
  return [...map.entries()]
    .map(([sender, info]) => ({ sender, count: info.count, recent: info.emails.slice(0, 3) }))
    .sort((a, b) => b.count - a.count);
}

// === AI Prompt（借鉴 inbox-zero ai-categorize-senders.ts line 43-88 的 XML 结构）===
function buildAiSystemPrompt(categories) {
  return `You are an AI assistant specializing in email management and classification.
Your task is to classify email senders based on their email address and recent email content.
Provide accurate categorizations to help the user efficiently manage their inbox.

IMPORTANT:
- Accuracy is more important than completeness
- Only use the categories provided below
- If unsure, respond with "其他"
- Respond with JSON only, no markdown code blocks`;
}

function buildAiUserPrompt(senders, categories) {
  const validNames = categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n  ');
  return `Classify the following ${senders.length} email senders by their email address + recent email samples:

${senders.map((s, idx) => `<sender index="${idx}">
  <email_address>${s.sender}</email_address>
  <count>${s.count}</count>
  <recent_emails>
${s.recent.map(e => `    <email>
      <subject>${escapeXml(e.subject)}</subject>
      <snippet>${escapeXml(e.snippet)}</snippet>
    </email>`).join('\n')}
  </recent_emails>
</sender>`).join('\n')}

<categories>
  ${validNames}
</categories>

<instructions>
1. For each sender, pick the best category from the list above.
2. If unsure, return "其他" for that sender.
3. Keep the rationale to 1 sentence max.
</instructions>

<output_format>
{"senders":[{"sender":"<original sender email>","category":"<exact-category-name>","rationale":"<short>"}]}
</output_format>`;
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// === 防 LLM hallucination：matchSendersWithFullEmail（line 133 原版翻译） ===
function matchSendersWithFullEmail(aiResponseSenders, originalSenders) {
  const originalMap = new Map();
  for (const s of originalSenders) originalMap.set(s, s);
  return (aiResponseSenders || [])
    .map((r) => {
      const aiSender = String(r.sender || '').toLowerCase();
      // LLM 可能返回 "John <john@x.com>" 或 "john@x.com (Acme)" — 提取 email
      const m = aiSender.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const normalized = m ? m[1] : aiSender;
      const matched = originalMap.get(normalized);
      if (!matched) return null;
      return { sender: matched, category: String(r.category || '其他').trim(), rationale: String(r.rationale || '').trim().slice(0, 200) };
    })
    .filter(Boolean);
}

// === 解析 LLM 输出（容错） ===
function parseAiOutput(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  text = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.senders)) return null;
    return parsed.senders;
  } catch (_) {
    return null;
  }
}

// === 主入口 ===
async function analyzeSendersBatch({ mailbox = 'INBOX', maxSenders = 20, modelId } = {}) {
  // 1. 拉 IMAP 当前可见邮件（listEmails 内部已自动 openBox — 见 imap-service.js line 206）
  let imap;
  let emails;
  try {
    const smtpCfg = config.smtp || {};
    imap = createImapService({
      host: config.imapHost || process.env.IMAP_HOST || 'imap.263.net',
      port: config.imapPort || parseInt(process.env.IMAP_PORT || '993'),
      user: smtpCfg.user || '',
      pass: smtpCfg.pass || '',
      tls: config.imapTls !== false,
    });
    await imap.connect();
    const list = await imap.listEmails({ mailbox, limit: 50, offset: 0 });
    emails = list.emails || [];
  } catch (e) {
    return {
      ok: false,
      senders: [],
      analyzed: 0,
      error: 'IMAP 连接或拉取失败: ' + e.message,
      reason: 'IMAP_UNREACHABLE',
    };
  }

  // 2. 频次聚合
  const aggregated = aggregateSendersByFrequency(emails);
  const topSenders = aggregated.slice(0, maxSenders);

  if (topSenders.length === 0) {
    return { ok: true, senders: [], analyzed: 0, reason: 'NO_EMAILS' };
  }

  const categories = DEFAULT_CATEGORIES;
  const validNames = new Set(categories.map((c) => c.name));

  // 3. 先用静态规则试（0 LLM 调用消耗）
  // v0.33: 先用 store 中已有的分类跳过 — 直接标 source='persisted'
  //         （避免重复分析；用户可见"上次分类是营销订阅"但本次不再调 LLM）
  const alreadyCategorized = categoryStore.bulkGet(mailbox, topSenders.map(s => s.sender));
  const results = [];
  const needAi = [];
  for (const s of topSenders) {
    const existing = alreadyCategorized[s.sender];
    if (existing) {
      results.push({
        sender: s.sender,
        count: s.count,
        category: existing.category,
        rationale: `已持久化（${existing.count} 次确认 · 上次 ${existing.last_updated || '时间未知'}）— 跳过 LLM`,
        source: 'persisted',
      });
      continue;
    }
    const subject = s.recent[0]?.subject || '';
    const staticCat = matchStaticRule(s.sender, subject);
    if (staticCat) {
      results.push({
        sender: s.sender,
        count: s.count,
        category: staticCat,
        rationale: '匹配静态规则（不调 LLM）',
        source: 'static',
      });
    } else {
      needAi.push(s);
    }
  }

  // 4. 剩余的批量送 LLM（1 次调用 N 个 sender）
  if (needAi.length > 0) {
    try {
      const result = await runtime.execute({
        messages: [
          { role: 'system', content: buildAiSystemPrompt(categories) },
          { role: 'user', content: buildAiUserPrompt(needAi, categories) },
        ],
        caller: 'email-sender-analyzer',
        maxRounds: 1,
        maxTokens: 1500,
        temperature: 0.2,
        modelId,
      });

      if (!result.error && result.content) {
        const aiSenders = parseAiOutput(result.content);
        if (aiSenders) {
          const matched = matchSendersWithFullEmail(aiSenders, needAi.map((s) => s.sender));
          for (const m of matched) {
            const sourceSender = needAi.find((s) => s.sender === m.sender);
            // 防类目扩散
            const cat = validNames.has(m.category) ? m.category : '其他';
            const fallbackRationale = !validNames.has(m.category)
              ? `LLM 返回「${m.category}」不在类目中，已降级为「其他」。${m.rationale || ''}`
              : m.rationale;
            results.push({
              sender: m.sender,
              count: sourceSender ? sourceSender.count : 0,
              category: cat,
              rationale: fallbackRationale,
              source: 'ai',
            });
          }
        }
      }
    } catch (_) {
      // LLM 失败 — 给 sender 标 fallback
      for (const s of needAi) {
        if (!results.find((r) => r.sender === s.sender)) {
          results.push({
            sender: s.sender,
            count: s.count,
            category: '其他',
            rationale: 'LLM 推断失败 — 降级为「其他」',
            source: 'fallback',
          });
        }
      }
    }
  }

  // 5. 兜底：LLM 没有覆盖到的 sender
  for (const s of needAi) {
    if (!results.find((r) => r.sender === s.sender)) {
      results.push({
        sender: s.sender,
        count: s.count,
        category: '其他',
        rationale: 'AI 未覆盖',
        source: 'fallback',
      });
    }
  }

  // v0.33: 把 AI 推断结果也持久化进 store — 下次同 sender 自动跳过 LLM
  for (const r of results.filter(r => r.source === 'ai' || r.source === 'static')) {
    try {
      categoryStore.saveCategory({
        sender: r.sender, mailbox,
        category: r.category, source: r.source, rationale: r.rationale,
      });
    } catch (e) { console.warn('[email-sender-analyzer] 持久化失败:', e.message); }
  }

  return {
    ok: true,
    analyzed: topSenders.length,
    total_senders: aggregated.length,
    persisted_count: results.filter(r => r.source === 'persisted').length,
    senders: results.sort((a, b) => b.count - a.count),
    note: '借鉴 inbox-zero ai-categorize-senders.ts 批量模式（1 次 LLM 分类 N 个 sender · NOASSERTION license · 重写为 JS）',
  };
}

module.exports = {
  analyzeSendersBatch,
  aggregateSendersByFrequency,
  matchSendersWithFullEmail,
};
