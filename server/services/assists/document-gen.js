// ACMS · 文档生成辅助（v0.46，2026-07-15）
//   用户给出指令，AI 结合历史对话生成 Markdown 文件，
//   再由 Pandoc 转成 .docx，两个文件供用户下载。
//
// 字段：requirement.assist_document_gen
//   status / user_instruction / md_content / md_path / docx_path / error
//   md_url / docx_url（供前端下载）
//   generated_at

const reqStore = require('../../stores/requirement-store');
const path = require('path');
const fs = require('fs');
const config = require('../../config');
const { mdToDocx } = require('../export-service');
const { callLLM } = require('../llm-adapter');
const modelStore = require('../../stores/model-store');
const crypto = require('crypto');

const WORKSPACE_ROOT = config.workspaceRoot;
const name = '文档生成';

/**
 * 找项目目录名
 */
function getProjectDirForReq(reqRec) {
  if (!reqRec?.project_id) return 'default';
  try {
    const projectStore = require('../../stores/project-store');
    const proj = projectStore.getById(reqRec.project_id);
    if (proj?.slug) return proj.slug;
    return reqRec.project_id;
  } catch (e) { return reqRec.project_id || 'default'; }
}

/**
 * 保存文件到 workspace assets
 */
function saveDocAsset(projectSlug, content, fileName) {
  const dateStr = new Date().toISOString().split('T')[0];
  const docsDir = path.join(WORKSPACE_ROOT, projectSlug, 'assets', dateStr);
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  const filePath = path.join(docsDir, fileName);
  fs.writeFileSync(filePath, content);
  return `assets/${dateStr}/${fileName}`;
}

/**
 * 跑文档生成任务
 * @param {string} requirementId
 * @param {object} opts { instruction（用户指令）, modelId }
 */
async function runAssistJob(requirementId, opts = {}) {
  try {
    const req = reqStore.getById(requirementId);
    if (!req) return;

    const instruction = opts.instruction || opts.userInstruction || '';
    if (!instruction) {
      reqStore.update(requirementId, {
        assist_document_gen: JSON.stringify({
          status: 'failed', error: 'NO_INSTRUCTION', generated_at: new Date().toISOString(),
        }),
      });
      return;
    }

    reqStore.update(requirementId, {
      assist_document_gen: JSON.stringify({
        status: 'generating', user_instruction: instruction,
        md_content: '', md_path: '', docx_path: '', md_url: '', docx_url: '',
        error: null, generated_at: new Date().toISOString(),
      }),
    });

    // 读对话历史
    let supplementHistory = [];
    try {
      supplementHistory = JSON.parse(req.supplement_history || '[]');
      if (!Array.isArray(supplementHistory)) supplementHistory = [];
    } catch (e) { /* 静默 */ }

    // 拼接对话上下文
    const historyText = supplementHistory
      .filter(e => e && (e.role === 'user' || e.role === 'assistant') && (e.text || e.opening))
      .map(e => {
        if (e.role === 'user') return `**用户**: ${e.text || ''}`;
        const parts = [];
        if (e.opening) parts.push(e.opening);
        if (e.followup_question) parts.push(`→ 追问: ${e.followup_question}`);
        return `**AI**: ${parts.join(' ') || e.text || ''}`;
      })
      .join('\n\n');

    // 调 LLM 生成 markdown
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const systemPrompt = `你是一个文档整理助手。用户会给你一段对话历史和一个指令。
你的任务是根据指令整理对话内容，生成结构清晰的 Markdown 文档。

要求：
- 用 ## / ### 分节标题组织
- 保留关键事实、决策、数据
- 不要写元注释（"这是根据对话生成的文档"等）
- 语言与对话历史一致
- 纯 Markdown 输出，不需要代码块包裹`;

    const userPrompt = [
      `## 用户指令`,
      instruction,
      ``,
      `## 对话历史`,
      historyText || '(无对话历史，请基于指令生成内容)',
      ``,
      `请根据指令整理对话历史为 Markdown 文档。`,
    ].join('\n');

    const resp = await callLLM(model.id, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.5, maxTokens: 4000, caller: 'document-gen' });

    let mdContent = (resp.content || '').trim();
    if (!mdContent) throw new Error('LLM 返回为空');

    // 从 LLM 输出的 markdown 中提取第一个 ## 标题作为文件名
    const titleMatch = mdContent.match(/^##\s+(.+)/m);
    const docTitle = titleMatch ? titleMatch[1].trim() : '文档';
    const safeTitle = docTitle.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '').substring(0, 40) || 'document';

    // 写 .md 文件
    const projectSlug = getProjectDirForReq(req);
    const hash = crypto.createHash('md5').update(mdContent).digest('hex').substring(0, 8);
    const mdFileName = `${safeTitle}_${hash}.md`;
    const mdAssetPath = saveDocAsset(projectSlug, mdContent, mdFileName);

    // 转 .docx
    let docxAssetPath = '';
    try {
      const docxBuffer = await mdToDocx(mdContent, { title: instruction.substring(0, 100) });
      const docxFileName = `${safeTitle}_${hash}.docx`;
      docxAssetPath = saveDocAsset(projectSlug, docxBuffer instanceof Buffer ? docxBuffer : Buffer.from(docxBuffer), docxFileName);
    } catch (e) {
      console.error(`[assist.document_gen] Pandoc 转换失败（降级，仅提供 .md）:`, e.message);
      // 降级：仍然提供 .md 文件
    }

    const mdUrl = `/api/generate/assets/${req.project_id || projectSlug}/${mdAssetPath}`;
    const docxUrl = docxAssetPath ? `/api/generate/assets/${req.project_id || projectSlug}/${docxAssetPath}` : '';

    reqStore.update(requirementId, {
      assist_document_gen: JSON.stringify({
        status: 'done',
        user_instruction: instruction,
        md_content: mdContent,
        md_path: mdAssetPath,
        docx_path: docxAssetPath,
        md_url: mdUrl,
        docx_url: docxUrl,
        error: null,
        generated_at: new Date().toISOString(),
      }),
    });

    console.log(`[assist.document_gen] ${requirementId} 完成: md=${mdAssetPath} docx=${docxAssetPath}`);
  } catch (e) {
    console.error(`[assist.document_gen] ${requirementId} 异常:`, e.message);
    reqStore.update(requirementId, {
      assist_document_gen: JSON.stringify({
        status: 'failed', error: e.message, generated_at: new Date().toISOString(),
      }),
    });
  }
}

function pickDefaultLlm() {
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
    || all[0] || null;
}

/**
 * 读当前 doc gen 数据
 */
function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_document_gen || 'null'); } catch { return null; }
}

module.exports = { name, runAssistJob, getAssist };
