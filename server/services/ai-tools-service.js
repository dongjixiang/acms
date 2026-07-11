// ACMS AI 工具层 — v0.23 L2 拆分后的兼容入口（shim）
//
// 本文件保留，仅为向后兼容 routes/ai-tools.js + routes/ai-clarify.js 的 require 调用
// 真实实现已拆分到以下模块：
//   - doc-generator.js             (generateDoc)
//   - requirement-decomposer.js    (decomposeRequirement)
//   - consistency-checker.js       (refineSection + checkConsistency)
//   - task-agent.js                (executeTaskAgent) ⭐ v0.23 agent 核心
// 共享 utility 见 ai-tools-utils.js
//
// v0.23 L2 重构说明：
//   原 ai-tools-service.js 783 行混合 7 个职责 → 拆为 4 个业务模块 + 1 个 utility + shim
//   任何 routes/* 里的 require('../services/ai-tools-service') 都不需要改

const { generateDoc } = require('./doc-generator');
const { decomposeRequirement } = require('./requirement-decomposer');
const { refineSection, checkConsistency } = require('./consistency-checker');
const { executeTaskAgent, extractRequiredFiles, verifyFilesExist, auditTaskRequirements, generatePlan, PHASES, PHASE_META } = require('./task-agent');

module.exports = {
  generateDoc,
  decomposeRequirement,
  refineSection,
  checkConsistency,
  executeTaskAgent,
  // v0.23: agent claim verification (防 agent 撒谎说成功)
  extractRequiredFiles,
  verifyFilesExist,
  auditTaskRequirements,
  // v0.46: plan mode (PM 先看 plan 再决定执行)
  generatePlan,
  PHASES,
  PHASE_META,
};
