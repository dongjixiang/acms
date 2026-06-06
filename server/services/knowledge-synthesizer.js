// 需求 → 知识页面生成器
// 当需求进入 approved / in_execution 时，用 LLM 自动生成实体知识页
const reqStore = require('../stores/requirement-store');
const knowledgeService = require('./knowledge-service');
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');
const path = require('path');

/**
 * 为一条需求生成知识页面（异步、非阻塞）
 */
async function generateForRequirement(reqId) {
  try {
    const req = reqStore.getById(reqId);
    if (!req) return { skipped: true, reason: '需求不存在' };

    // 1. 收集素材
    const srs = safeParse(req.srs);
    const clarifications = reqStore.getClarifications(reqId);
    const archSpec = safeParse(req.arch_spec);
    const interfaceContracts = safeParse(req.interface_contracts);

    // 2. 如果 SRS 太单薄则跳过
    const srsText = JSON.stringify(srs, null, 2);
    if (srsText.length < 50 && (!clarifications || clarifications.length === 0)) {
      return { skipped: true, reason: '需求信息不足' };
    }

    // 3. 选模型
    const allModels = modelStore.list();
    const model = allModels.find(m => m.status === 'active') || allModels[0];
    if (!model) return { skipped: true, reason: '无可用模型' };

    // 4. 构建 prompt — 输出 frontmatter + markdown 正文
    const clariText = (clarifications || [])
      .map(c => `[${c.role}] ${c.content}`)
      .join('\n');

    const prompt = `你是一个项目知识库编辑。根据以下需求的完整信息，生成一个知识页面。

输出格式：
---
title: 页面标题（用需求名）
type: entity
created: ${new Date().toISOString().split('T')[0]}
updated: ${new Date().toISOString().split('T')[0]}
tags: [requirement, 从内容提取的2-3个标签]
confidence: low
sources:
  - requirement: ${req.id}
---

# 页面标题

> 由需求"${req.title}"自动生成

## 概述

（用2-3句话概括该需求的业务价值和技术目标）

## 详细说明

（基于 SRS 的 scopeIn/acceptanceCriteria/technicalConstraints，写成可读的维基条目）

## 设计决策

（如果 arch_spec 或 interfaceContracts 有内容，提炼关键设计决策要点）

## 关联

（基于澄清对话中提到的关键词，推测可能相关的实体或概念）

---

需求信息：
项目ID: ${req.project_id}
需求ID: ${req.id}
优先级: ${req.priority}
当前状态: ${req.status}

SRS 文档:
${srsText.length > 3000 ? srsText.slice(0, 3000) + '\n...（截断）' : srsText}

架构宪法:
${JSON.stringify(archSpec, null, 2).slice(0, 1000)}

接口契约:
${JSON.stringify(interfaceContracts, null, 2).slice(0, 1000)}

澄清对话:
${clariText.slice(0, 2000)}
`;

    // 5. 调用 LLM
    const result = await callLLM(model.id, [
      { role: 'user', content: prompt }
    ], { temperature: 0.4, maxTokens: 4000 });

    let pageContent = result.content || '';
    if (!pageContent) return { skipped: true, reason: 'LLM 返回空' };

    // 6. 从 content 剥离可能的 markdown 代码块包裹
    pageContent = pageContent.replace(/^```(?:yaml|markdown|md)?\s*\n/i, '').replace(/\n```\s*$/i, '');

    // 7. 生成文件名
    const safeName = req.title
      .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 32) || req.id.toLowerCase();

    const pagePath = `entities/${safeName}.md`;

    // 8. 写入知识库
    const project = require('../stores/project-store').getById(req.project_id);
    if (!project) return { skipped: true, reason: '项目不存在' };

    // 检查是否已存在（不覆盖）
    const existing = knowledgeService.readPage(req.project_id, project.wiki_vault_path, pagePath);
    if (existing) {
      return { skipped: true, reason: '页面已存在', path: pagePath };
    }

    knowledgeService.writePage(req.project_id, project.wiki_vault_path, pagePath, pageContent);

    // 9. 尝试关联到需求
    try {
      const matcher = require('./knowledge-matcher');
      matcher.linkRequirement(req.project_id, req.id, pagePath, 'auto');
    } catch (e) { /* 非关键 */ }

    // 10. 写 log
    knowledgeService.appendLog(req.project_id, project.wiki_vault_path,
      `generate | 需求 ${req.id} → ${pagePath}`);

    // 11. 更新索引
    try {
      const scanner = require('./knowledge-scanner');
      scanner.updateIndexAfterScan(req.project_id, project.wiki_vault_path);
    } catch (e) { /* 非关键 */ }

    return { created: true, path: pagePath, title: safeName };

  } catch (e) {
    console.error(`[KnowledgeSynthesizer] ${reqId}: ${e.message}`);
    return { skipped: true, reason: e.message };
  }
}

function safeParse(str) {
  if (!str) return {};
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return {}; }
}

module.exports = { generateForRequirement };
