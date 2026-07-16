// ACMS · 文档生成辅助（v0.46，2026-07-15） — v0.48 拆 core 出来给 tool 调用
//   用户给出指令，AI 结合历史对话生成 Markdown 文件，
//   再由 Pandoc 转成 .docx，两个文件供用户下载。
//
// 字段：requirement.assist_document_gen
//   status / user_instruction / md_content / md_path / docx_path / error
//   md_url / docx_url（供前端下载）
//   generated_at
//
// v0.48 拆分：
//   - runDocGenCore(reqId, opts)  ← 核心：调 LLM + 写文件 + 拿 file_ids
//     返回 { ok, title, md_content, md_path, docx_path, md_url, docx_url, file_ids, error }
//   - runAssistJob(reqId, opts)    ← 兼容旧 UI 入口（chat inline form 等），内部调 core + 写 assist_document_gen 字段
//   - getAssist(reqId)             ← 读 doc gen 字段

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
 * v0.48: 核心 — 跑文档生成，返回结构化结果（含 file_ids 可串联给 send_email）
 * @param {string} requirementId
 * @param {object} opts { instruction, modelId }
 * @returns {Promise<{
 *   ok, title, md_content, md_path, docx_path, md_url, docx_url,
 *   file_ids: [{ id, name, size, mime, kind }], error
 * }>}
 */
async function runDocGenCore(requirementId, opts = {}) {
  const instruction = opts.instruction || opts.userInstruction || '';
  if (!instruction) {
    return { ok: false, error: 'NO_INSTRUCTION', message: '缺少 instruction' };
  }

  const req = reqStore.getById(requirementId);
  if (!req) return { ok: false, error: 'REQ_NOT_FOUND', message: `需求不存在: ${requirementId}` };

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
  if (!model) return { ok: false, error: 'NO_LLM_AVAILABLE', message: '无可用 LLM' };

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

  let mdContent;
  try {
    const resp = await callLLM(model.id, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.5, maxTokens: 4000, caller: 'document-gen' });
    mdContent = (resp.content || '').trim();
    if (!mdContent) return { ok: false, error: 'LLM_EMPTY', message: 'LLM 返回为空' };
  } catch (e) {
    return { ok: false, error: 'LLM_FAILED', message: e.message };
  }

  // 从 LLM 输出的 markdown 中提取第一个 ## 标题作为文件名
  const titleMatch = mdContent.match(/^##\s+(.+)/m);
  const docTitle = titleMatch ? titleMatch[1].trim() : '文档';
  const safeTitle = docTitle.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '').substring(0, 40) || 'document';

  // 写 .md 文件到 workspace assets
  const projectSlug = getProjectDirForReq(req);
  const hash = crypto.createHash('md5').update(mdContent).digest('hex').substring(0, 8);
  const mdFileName = `${safeTitle}_${hash}.md`;
  const mdAssetPath = saveDocAsset(projectSlug, mdContent, mdFileName);
  const mdAbsPath = path.join(WORKSPACE_ROOT, projectSlug, mdAssetPath);

  // 转 .docx
  let docxAssetPath = '';
  let docxAbsPath = '';
  try {
    const docxBuffer = await mdToDocx(mdContent, { title: instruction.substring(0, 100) });
    const docxFileName = `${safeTitle}_${hash}.docx`;
    docxAssetPath = saveDocAsset(projectSlug, docxBuffer instanceof Buffer ? docxBuffer : Buffer.from(docxBuffer), docxFileName);
    docxAbsPath = path.join(WORKSPACE_ROOT, projectSlug, docxAssetPath);
  } catch (e) {
    console.error(`[document_gen core] Pandoc 转换失败（降级，仅提供 .md）:`, e.message);
    // 降级：仍然提供 .md 文件
  }

  const mdUrl = `/api/generate/assets/${req.project_id || projectSlug}/${mdAssetPath}`;
  const docxUrl = docxAssetPath ? `/api/generate/assets/${req.project_id || projectSlug}/${docxAssetPath}` : '';

  // v0.48: 把 .docx 和 .md 都注册到 chat-upload，拿到 file_ids
  //   plan_execute 的 send_email step 会自动串联 file_ids 作为附件
  const fileIds = [];
  try {
    const chatUpload = require('../chat-upload');
    if (docxAbsPath && fs.existsSync(docxAbsPath)) {
      const docxBuffer = fs.readFileSync(docxAbsPath);
      const imported = chatUpload.importFromPath(docxAbsPath, {
        name: `${safeTitle}.docx`,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: docxBuffer.length,
        category: 'document',
      });
      if (imported?.id) fileIds.push({ id: imported.id, name: imported.name || `${safeTitle}.docx`, size: docxBuffer.length, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'docx' });
    }
    if (mdAbsPath && fs.existsSync(mdAbsPath)) {
      const mdBuffer = fs.readFileSync(mdAbsPath);
      const imported = chatUpload.importFromPath(mdAbsPath, {
        name: `${safeTitle}.md`,
        mime: 'text/markdown',
        size: mdBuffer.length,
        category: 'document',
      });
      if (imported?.id) fileIds.push({ id: imported.id, name: imported.name || `${safeTitle}.md`, size: mdBuffer.length, mime: 'text/markdown', kind: 'md' });
    }
  } catch (e) {
    console.warn(`[document_gen core] import to chat-upload 失败 (不影响主流程):`, e.message);
  }

  return {
    ok: true,
    title: safeTitle,
    md_content: mdContent,
    md_path: mdAssetPath,
    docx_path: docxAssetPath,
    md_url: mdUrl,
    docx_url: docxUrl,
    file_ids: fileIds,
    error: null,
  };
}

/**
 * 跑文档生成任务（兼容旧 UI 入口：chat inline form 等）
 *   内部调 runDocGenCore + 写 requirement.assist_document_gen 字段
 */
async function runAssistJob(requirementId, opts = {}) {
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

  const result = await runDocGenCore(requirementId, opts);

  reqStore.update(requirementId, {
    assist_document_gen: JSON.stringify({
      status: result.ok ? 'done' : 'failed',
      user_instruction: instruction,
      md_content: result.md_content || '',
      md_path: result.md_path || '',
      docx_path: result.docx_path || '',
      md_url: result.md_url || '',
      docx_url: result.docx_url || '',
      error: result.ok ? null : (result.error || result.message || '未知错误'),
      generated_at: new Date().toISOString(),
    }),
  });

  if (result.ok) {
    console.log(`[assist.document_gen] ${requirementId} 完成: md=${result.md_path} docx=${result.docx_path} file_ids=${result.file_ids?.length || 0}`);
  } else {
    console.error(`[assist.document_gen] ${requirementId} 失败: ${result.error || result.message}`);
  }
}

function pickDefaultLlm() {
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

/**
 * 读当前 doc gen 数据
 */
function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_document_gen || 'null'); } catch { return null; }
}

module.exports = { name, runAssistJob, getAssist, runDocGenCore };