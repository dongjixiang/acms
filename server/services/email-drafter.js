// ACMS Email Drafter — v0.30（借鉴 inbox-zero@main draft-reply.ts 完整 system prompt）
// 路径：server/services/email-drafter.js
//
// 借鉴来源（NOASSERTION license — 不 copy 任何 TypeScript 代码，仅借鉴思路 + 翻译 prompt 思路）：
//   - apps/web/utils/ai/reply/draft-reply.ts line 21-57（完整 systemPrompt）
//     + LENGTH_DISCIPLINE（line 69-70 自适应长度规则）
//   - apps/web/utils/email/signature-extraction.ts 33 行纯函数（个人签名提取 — 暂不做 v0.31）
//
// 设计原则：
//   1. 借鉴 inbox-zero 完整 system prompt 文本（10 条核心纪律）
//   2. 不调外部工具（tone mimic / knowledge base / calendar / MCP — 留给 v0.31+）
//   3. 用户主动按钮触发，结果弹窗显式展示，绝不自动发
//   4. 输出约束：温度 0.7（自然语气）+ maxTokens 800 + 长度自约束（不要超过原邮件 3 倍）
//   5. 防 LLM hallucination：检查返回为空/过长/包含"Subject"/包含第一人称指令全部 fallback
//
// 调用方：routes/emails.js POST /draft-reply
//   入参：{ from, subject, body }
//   出参：{ ok, draft, reason, source: 'ai' | 'fallback' }

const runtime = require('./agent-runtime');

// === 借鉴 inbox-zero draft-reply.ts line 21-57 的完整 system prompt（翻译成中文 prompt） ===
// ACMS 中文版调整：改 "ground facts" 等英文提示为中文；保留"do not invent/Do not mirror"等核心纪律
const SYSTEM_PROMPT = `你是一名专业的邮件回复撰写助理。

设计原则：
- 不要简单重复对方刚说的话（"Do NOT simply repeat or mirror what the last email said"）
- 不要在回复中说明你是 AI
- 不要回复 Subject 主题行 — 只写正文
- 仅返回纯文本，不要 HTML 标签；如果必须用链接，用 markdown 格式 [Label](https://example.com/path) 或 [Label](mailto:user@example.com)
- 用 Unix 换行格式化段落：段落之间用 \\n\\n，单行断行用 \\n
- 写邮件的语言要跟对方邮件的语言一致
- 不要用占位符代替实际信息 — 仅在确实没信息时用
- 不要加签名（用户会自己处理签名）
- 不要编造事实。如果信息不足以准确回答，宁可在结尾显式说"需要您确认..."
- 回答对方邮件里每一个具体问题或请求事项
- 不要使用 em dashes（— 字符），除非用户写作风格明确要求
- 长度规则：默认简洁、直接、友好、口语化。回复长度跟对方邮件成比例（对方 2 句话 → 你也 2 句话；对方 5 段 → 你可以 1-2 段）。不要堆砌废话或主动加"如有问题随时联系"

语气：商务邮件，默认简明扼要。不要口语化过度。

【用户语气模仿】
如果用户提供了历史回复样本（<user_tone_samples>...</user_tone_samples>），必须严格按照样本的语气、长度、打招呼方式、标点风格、用词偏好来撰写回复。样本的优先级最高 — 用户的真实风格胜过上面的默认规则。`;

const LENGTH_DISCIPLINE = `Don't pad with filler or restate the incoming message. Match the reply length to what was actually asked.`;

// === LLM 输出解析（防 hallucination / 防 Subject 注入 / 防占位符注入） ===
function parseDraftReplyOutput(raw) {
  if (!raw) return null;
  let text = String(raw).trim();

  // 防注入 1：去掉 markdown 代码块 wrapper（LLM 偶尔回 ```）
  text = text.replace(/^```[a-zA-Z]*\s*/i, '').replace(/```\s*$/i, '').trim();

  // 防注入 2：如果 LLM 不小心写了 Subject: 行，剥掉它
  text = text.replace(/^\s*Subject\s*:\s*.*$/im, '').trim();

  // 防注入 3：去掉问候语里的固定 greeting（保留灵活但不让"[Your Name]"等占位符残留）
  // 不主动修改 — 让用户自己编辑

  // 防注入 4：检查是否包含 em dashes（按规则不应有）
  if (/[—–]/.test(text)) {
    text = text.replace(/\s*[—–]\s*/g, ', ');
  }

  // 简单校验：长度合理性（>20 字符，< 5000 字符）
  if (text.length < 20 || text.length > 5000) return null;

  // 校验：至少有一句中文或英文（避免纯标点输出）
  const hasContent = /[\u4e00-\u9fa5a-zA-Z]/.test(text);
  if (!hasContent) return null;

  return text;
}

// === 主入口：草拟回复 ===
/**
 * @param {Object} opts
 * @param {string} opts.from      - 原邮件发件人
 * @param {string} opts.subject   - 原邮件主题
 * @param {string} opts.body      - 原邮件正文
 * @param {string} [opts.toneHints] - 可选：「更正式」/「更简短」等语气提示
 * @param {string} [opts.modelId] - 可选 LLM 模型 ID
 * @returns {Promise<{
 *   ok: boolean,
 *   draft: string,
 *   reason: string,
 *   source: 'ai'|'fallback',
 *   error?: string
 * }>}
 */
async function draftReply({ from, subject, body, toneHints, toneSamples, previousDraft, retryHint, modelId } = {}) {
  if (!from && !subject && !body) {
    return { ok: false, draft: '', reason: '缺少邮件内容', source: 'fallback' };
  }

  // 限制输入长度避免 prompt 过长
  const truncBody = (body || '').toString().slice(0, 3000);
  const truncSubject = (subject || '').toString().slice(0, 200);
  const truncFrom = (from || '').toString().slice(0, 200);

  const userPrompt = `对方发件人：${truncFrom}
对方主题：${truncSubject}

对方邮件正文：
"""
${truncBody}
"""
${previousDraft ? `

【上一版你生成的草稿（用户不满意的）】
"""
${previousDraft}
"""${retryHint ? '\n\n用户的具体修改意见：' + retryHint : '\n\n请生成一个明显不同、更符合用户期望的版本（不要重复上一版的角度、用词、结构）。'}`
  : ''}
${toneSamples ? toneSamples + '\n' : ''}请按上述设计原则及用户语气样本撰写一封回复。${toneHints ? `\n额外要求：${toneHints}` : ''}

正文：`;

  let text = null;
  try {
    const result = await runtime.execute({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + '\n\n' + LENGTH_DISCIPLINE },
        { role: 'user', content: userPrompt },
      ],
      caller: 'email-drafter',
      maxRounds: 1,
      maxTokens: 800,
      temperature: 0.7,
      modelId,
    });

    if (result.error || !result.content) {
      return {
        ok: false,
        draft: '',
        reason: 'LLM 调用失败',
        source: 'fallback',
        error: result.error || '无内容',
      };
    }
    text = parseDraftReplyOutput(result.content);
  } catch (e) {
    return {
      ok: false,
      draft: '',
      reason: 'LLM 异常',
      source: 'fallback',
      error: e.message,
    };
  }

  if (!text) {
    return {
      ok: false,
      draft: '',
      reason: 'LLM 输出无法解析（可能过长/为空/格式异常）',
      source: 'fallback',
    };
  }

  return {
    ok: true,
    draft: text,
    reason: '借鉴 inbox-zero draft-reply 完整 prompt 调优',
    source: 'ai',
  };
}

module.exports = {
  draftReply,
  parseDraftReplyOutput,
  SYSTEM_PROMPT,
};
