// 信息架构图辅助手段（v0.3.3 Phase 2）
// AI 列出 5-8 个核心页面/模块的卡片布局，让用户圈出"我要这些"
// 字段：requirement.assist_arch

const { callLLM } = require('../llm-adapter');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');

function pickDefaultLlm() {
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

const ARCH_PROMPT = `你是 ACMS 系统的「信息架构助手」。给定一个需求，列出 5-8 个核心**页面/模块**（不是功能点，是用户在系统里能看到/进入的"单元"）。

每个模块：
- name (≤12 字): 模块名称（如"客户详情" / "Pipeline 看板" / "数据看板"）
- purpose (≤40 字): 这个模块是干什么的 / 用户在里面做什么
- entry (≤30 字): 用户从哪儿进入这个模块（如"顶部导航 → 客户 → 点击客户名"）
- key_elements: 1-3 个关键 UI 元素（如["客户基本信息表", "AI 自动填充按钮"]）

要求：
- 模块要**覆盖主要用户路径**——不要 8 个全是后台管理（要有用户实际用到的）
- 模块要**互不重叠**——不要"客户详情"和"客户信息"两个
- 5-8 个，按用户访问顺序排
- 输出严格 JSON：
{"modules":[
  {"name":"...","purpose":"...","entry":"...","key_elements":["...","..."]},
  ...
]}
不要任何额外文字、markdown 代码块、解释。`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_arch: JSON.stringify({
      status: 'generating',
      modules: [],
      picked: [],
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
    }),
  });
  console.log(`[assist:arch] ${requirementId} 开始生成`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const messages = [
      { role: 'system', content: ARCH_PROMPT },
      {
        role: 'user',
        content: [
          `需求标题: ${req.title || '(空)'}`,
          `需求描述: ${req.description || '(空)'}`,
        ].join('\n'),
      },
    ];

    const result = await callLLM(model.id, messages, {
      temperature: 0.4,
      maxTokens: 1200,
      jsonMode: true,
    });

    let content = (result.content || '').trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    }
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      content = content.substring(jsonStart, jsonEnd + 1);
    }
    const parsed = JSON.parse(content);
    const modules = Array.isArray(parsed.modules) ? parsed.modules.slice(0, 8) : [];

    reqStore.update(requirementId, {
      assist_arch: JSON.stringify({
        status: 'done',
        modules,
        picked: [],
        generated_at: new Date().toISOString(),
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:arch] ${requirementId} 完成, ${modules.length} 个模块`);
  } catch (e) {
    console.error(`[assist:arch] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_arch: JSON.stringify({
        status: 'failed',
        modules: [],
        error: e.message,
        generated_at: new Date().toISOString(),
        used: false,
      }),
    });
  }
}

function togglePick(requirementId, idx) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_arch || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  const picked = new Set(assist.picked || []);
  if (picked.has(idx)) picked.delete(idx); else picked.add(idx);
  assist.picked = Array.from(picked).sort((a, b) => a - b);
  assist.last_pick_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_arch: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_arch || 'null'); } catch { return null; }
}

module.exports = {
  name: '信息架构图（5-8 个核心页面/模块，圈出你要的）',
  field: 'assist_arch',
  runAssistJob,
  togglePick,
  getAssist,
};
