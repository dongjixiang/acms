// 原型示意图生成器 v3 — 按需求生成一套完整界面线框图，可迭代调整
// 让用户在确认 SRS 之前看到各页面的实际布局示意图，并根据反馈调整

const reqStore = require('../stores/requirement-store');
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');

/**
 * 为一条需求生成一套界面线框图（不含多方案对比）
 * @param {string} reqId
 * @param {string} adjustFeedback - 可选的调整反馈，基于前一次生成的结果进行微调
 * @param {string} preferredModelId - 可选，指定使用的模型 ID
 * @returns {object} { pages: [{ name, purpose, wireframe }], flowDescription, modelUsed }
 */
async function generateSketches(reqId, adjustFeedback, preferredModelId) {
  const req = reqStore.getById(reqId);
  if (!req) return { error: '❌ 需求不存在' };

  const srs = safeParse(req.srs);
  const clarifications = reqStore.getClarifications(reqId);
  const prevSketches = req._cachedSketchResult || '';

  const allModels = modelStore.list();
  // 优先使用非 anthropic-messages 协议的活跃模型（更快更稳定）
  // 如果指定了模型 ID，优先使用
  const activeModels = allModels.filter(m => m.status === 'active');
  let model;
  if (preferredModelId) {
    model = activeModels.find(m => m.id === preferredModelId);
  }
  if (!model) {
    model = activeModels.find(m => m.api !== 'anthropic-messages')
      || activeModels[0];
  }
  if (!model) return { error: '❌ 无可用模型' };
  req._lastSketchModel = model.id;

  const clariText = (clarifications || []).map(c => `[${c.role}] ${c.content}`).join('\n').slice(0, 3000);

  const adjustSection = adjustFeedback
    ? `\n\n## 调整要求（基于上次生成的结果进行修改）\n用户反馈：${adjustFeedback}\n请基于之前的方案进行调整，不要推倒重来。以下是之前生成的方案：\n${prevSketches.slice(0, 2000)}`
    : '';

  const srsUpdateSection = adjustFeedback
    ? `\n\n## 额外要求：同步更新 SRS\n由于用户根据你的线框图提出了调整意见，除了更新线框图外，请将调整内容也反映到需求的 SRS 文档中。\n在输出 JSON 中增加 "srsUpdates" 字段，格式如下：\n\n"srsUpdates": {\n  "scopeIn": ["修改后的范围列表，整合用户反馈的新需求"],\n  "acceptanceCriteria": ["修改后的验收标准，整合用户反馈的新验收条件"],\n  "summary": "更新后的需求摘要"\n}\n\n注意：原有 scopeIn 和 acceptanceCriteria 中仍然有效的内容需要保留，只增加、删除或修改与用户反馈直接相关的部分。不要做不相关的改动。\n`
    : '';

  const prompt = `你是一位产品架构师和UX设计师。这是一个**原型类产品需求**。请根据以下信息，为该需求设计**一套完整**的界面线框图。${srsUpdateSection}

你需要：
1. 根据需求的 scopeIn 列出的功能模块，设计对应的页面
2. 页面数量规则：scopeIn 功能模块 **≤ 5 个时全部生成**对应的页面；**> 5 个时选取最重要的 5 个**生成
3. 对每个页面生成一个**HTML 线框图**展示其布局和信息结构
4. 用一句话描述整体的用户操作流程

## HTML 线框图要求

每个线框图是一个自包含的 HTML 片段（一个 <div>），用简洁的界面示意展示页面的**区域布局和信息结构**。

### 数据要求（严格遵循）：
- **必须使用需求中的实际内容**，不要用"xxx""标题""列表项1"等通用占位
- 例：样片名称用"夏日人像""城市夜景"，标签用"人像""夜景""2025春季"，按钮文字用具体操作名
- 文本内容从需求描述、scopeIn 列表、澄清对话中提取
- 行数/条目数用具体数量标注，如"共 12 个样片"

### 风格规范（严格遵循）：
- 容器尺寸：固定宽 280px，高自适应（最多 360px）
- 背景色：浅灰 (#f0f0f0)
- 所有区域用 **实线边框 + 浅色背景区分**，标注区域名称
- 图片占位用 **灰色矩形**，内部写 "📷" 或 "图片"
- 文本用 11px 字体，颜色深灰 (#333)
- **不要阴影、渐变、圆角（border-radius: 2px 以内）**
- **不要 JavaScript、不要外部资源、不要 @import**
- 所有样式写在元素 style 属性里，不要单独 <style> 标签
- 确保内容完整但不溢出

### 示例线框图结构（仅作参考，根据实际需求调整）：
\`\`\`html
<div style="background:#fff;border:1px solid #ccc;width:280px;padding:6px;font-family:sans-serif;font-size:11px;color:#333;line-height:1.4">
  <div style="background:#e8e8e8;padding:6px;border:1px solid #bbb;margin-bottom:4px;text-align:center;font-weight:bold">📌 导航栏</div>
  <div style="display:flex;gap:4px;margin-bottom:4px">
    <div style="flex:1;background:#ddd;height:80px;display:flex;align-items:center;justify-content:center;border:1px solid #bbb">📷</div>
    <div style="flex:1;background:#ddd;height:80px;display:flex;align-items:center;justify-content:center;border:1px solid #bbb">📷</div>
  </div>
  <div style="background:#f5f5f5;padding:4px;border:1px solid #ccc;font-size:10px">样片标题 · 标签1 标签2</div>
  <div style="background:#e0e7ff;padding:6px;margin-top:4px;border:1px solid #99c;text-align:center;font-size:10px">📅 预约按钮</div>
</div>
\`\`\`

## 输出 JSON 结构

输出严格的 JSON（不要 markdown 代码块包裹），结构如下：

{
  "pages": [
    {
      "name": "列表页/首页",
      "purpose": "该页面的核心目的",
      "wireframe": "<div style='...'>...</div>"
    },
    {
      "name": "详情页",
      "purpose": "该页面的核心目的",
      "wireframe": "<div style='...'>...</div>"
    }
  ],
  "flowDescription": "一句话描述用户从进入→操作→完成的完整流程"
}

## 注意事项
- 遵循上面的页面数量规则，不要多生成也不需要偷工减料
- 线框图要有层次感，区分导航区/内容区/操作区
- 用 emoji 辅助标注区域功能（📋📷📅🔍✏️📊 等）
- **所有文字必须从需求信息中提取**，不允许使用通用占位符
${adjustSection}

需求信息：
标题: ${req.title}
状态: ${req.status}

SRS 文档：
${JSON.stringify(srs, null, 2).slice(0, 3000)}

澄清对话：
${clariText}`;

  try {
    const result = await callLLM(model.id, [
      { role: 'user', content: prompt }
    ], { temperature: 0.6, maxTokens: 8000, jsonMode: true });

    const content = result.content || '';
    let parsed = extractJSON(content);
    if (!parsed || !parsed.pages) {
      // 降级重试：去 jsonMode
      const retryResult = await callLLM(model.id, [
        { role: 'user', content: prompt + '\n\n【重要】请严格输出 JSON，不要任何额外文字。' }
      ], { temperature: 0.6, maxTokens: 8000, jsonMode: false });
      const retryContent = retryResult.content || '';
      parsed = extractJSON(retryContent);
    }

    // 缓存生成结果（供后续 adjust 使用）
    if (parsed && parsed.pages) {
      req._cachedSketchResult = JSON.stringify(parsed);
    }

    return {
      pages: (parsed && parsed.pages) || [],
      flowDescription: (parsed && parsed.flowDescription) || '',
      srsUpdates: (parsed && parsed.srsUpdates) || null,
      modelUsed: result.modelUsed,
    };
  } catch (e) {
    return { error: `LLM 调用失败: ${e.message}` };
  }
}

function extractJSON(text) {
  if (!text) return null;
  let clean = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first !== -1 && last > first) clean = clean.slice(first, last + 1);
  try { return JSON.parse(clean); } catch { return null; }
}

function safeParse(str) {
  if (!str) return {};
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return {}; }
}

module.exports = { generateSketches };
