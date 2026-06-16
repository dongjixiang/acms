// 项目知识库服务
// 遵循 Karpathy LLM Wiki 模式：
//   raw/          不可变的原始材料（上传文件、基线扫描输出）
//   entities/    知识实体页面
//   concepts/    概念说明页面
//   architecture/架构文档
//   decisions/   设计决策记录
//   index.md     知识索引（全量目录）
//   log.md       知识变更日志（append-only）
//   SCHEMA.md    知识管理约定

const path = require('path');
const fs = require('fs');
const { collection } = require('../db/connection');

// 知识库在 vault 内的相对路径
const KNOWLEDGE_RELATIVE = 'projects';

// 目录结构定义
const KNOWLEDGE_DIRS = [
  'raw/user-uploads',
  'raw/extracted',
  'raw/baseline',
  'entities',
  'concepts',
  'architecture',
  'media',
  'decisions',
];

function ensureKnowledgeBase(projectId, wikiVaultPath) {
  const kbPath = getKnowledgePath(projectId, wikiVaultPath);
  if (!fs.existsSync(path.join(kbPath, 'index.md'))) {
    initKnowledgeBase(projectId, wikiVaultPath);
  }
  return kbPath;
}

// ── 初始化项目知识库 ──

function getKnowledgePath(projectId, wikiVaultPath) {
  return path.join(wikiVaultPath, KNOWLEDGE_RELATIVE, projectId);
}

function initKnowledgeBase(projectId, wikiVaultPath) {
  const kbPath = getKnowledgePath(projectId, wikiVaultPath);

  // 创建目录结构
  for (const dir of KNOWLEDGE_DIRS) {
    fs.mkdirSync(path.join(kbPath, dir), { recursive: true });
  }

  // SCHEMA.md — 知识管理约定
  const schemaPath = path.join(kbPath, 'SCHEMA.md');
  if (!fs.existsSync(schemaPath)) {
    fs.writeFileSync(schemaPath, `# 项目知识库管理约定

> 基于 Karpathy LLM Wiki 模式
> 创建: ${new Date().toISOString().split('T')[0]}

## 目录结构

| 目录 | 用途 | 维护者 |
|------|------|--------|
| raw/ | 不可变的原始材料（上传文件、扫描输出） | 系统写入 |
| entities/ | 项目中的实体/模块文档 | AI + 用户维护 |
| concepts/ | 概念说明、业务流程描述 | AI + 用户维护 |
| architecture/ | 架构文档（组件树、API 路由、数据模型） | AI 维护 |
| media/ | 音视频资源信息 | AI 维护 |
| decisions/ | 设计决策记录（ADR） | 用户维护 |
| index.md | 全量目录索引 | 系统 + AI 更新 |
| log.md | 知识变更日志（append-only） | 系统 + AI 写入 |

## 页面规范

每个知识页面包含 YAML frontmatter:

\`\`\`yaml
---
title: 页面标题
type: entity | concept | architecture | decision
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [标签1, 标签2]
confidence: high | medium | low
contested: false
---
\`\`\`

## 链接规范

- 使用 \`[[wikilink]]\` 进行页面间引用
- 每页至少包含 2 个出站链接（指向其他知识页面）
- 使用 \`^[source-path]\` 标注信息来源

## 更新规则

- raw/ 下的文件不可修改
- 信息矛盾时标记 \`contested: true\`，保留双方观点
- 每次更新更新 \`updated\` 字段
- 每次操作追加到 \`log.md\`
`);
  }

  // index.md — 知识索引
  const indexPath = path.join(kbPath, 'index.md');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, `# 项目知识索引

> 知识库全量目录
> 创建: ${new Date().toISOString().split('T')[0]}
> 页面总数: 0

## 架构文档 (Architecture)

<!-- 由扫描器自动维护 -->

## 实体模块 (Entities)

<!-- 由 AI 扫描后自动创建 -->

## 概念说明 (Concepts)

<!-- 用户或 AI 手动创建 -->

## 设计决策 (Decisions)

<!-- 用户手动记录 -->
`);
  }

  // log.md — 知识变更日志
  const logPath = path.join(kbPath, 'log.md');
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, `# 知识库变更日志

> Append-only 变更记录

## [${new Date().toISOString().split('T')[0]}] init | 知识库初始化
- 项目知识库创建，目录结构初始化
`);
  }

  return kbPath;
}

// ── 读取页面 ──

function readPage(projectId, wikiVaultPath, pagePath) {
  const fullPath = path.join(ensureKnowledgeBase(projectId, wikiVaultPath), pagePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}

// ── 写入页面 ──

function writePage(projectId, wikiVaultPath, pagePath, content) {
  const fullPath = path.join(ensureKnowledgeBase(projectId, wikiVaultPath), pagePath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

// ── 列出知识库内容（目录树） ──

function listKnowledgeTree(projectId, wikiVaultPath) {
  const kbPath = ensureKnowledgeBase(projectId, wikiVaultPath);

  const result = [];

  function walk(dir, relative) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
      // 目录在前
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = (relative ? path.join(relative, entry.name) : entry.name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        // 跳过硬链接目录
        if (entry.name.startsWith('.')) continue;
        result.push({ type: 'directory', name: entry.name, path: relPath });
        walk(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        result.push({ type: 'file', name: entry.name, path: relPath });
      }
    }
  }

  walk(kbPath, '');
  return result;
}

// ── 读取 index.md 摘要 ──

function readIndexSummary(projectId, wikiVaultPath) {
  const content = readPage(projectId, wikiVaultPath, 'index.md');
  if (!content) return null;

  // 提取页面统计
  const pageCountMatch = content.match(/页面总数:\s*(\d+)/);
  const pageCount = pageCountMatch ? parseInt(pageCountMatch[1]) : 0;

  // 提取各节内容
  const sections = {};
  const sectionRegex = /## ([^\n]+)\n([^#]*)/g;
  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionName = match[1].trim();
    const sectionContent = match[2].trim();
    sections[sectionName] = sectionContent;
  }

  return { pageCount, sections };
}

// ── 日志操作 ──

function appendLog(projectId, wikiVaultPath, entry) {
  const logContent = readPage(projectId, wikiVaultPath, 'log.md');
  const newEntry = `\n## [${new Date().toISOString().split('T')[0]}] ${entry}`;
  writePage(projectId, wikiVaultPath, 'log.md', (logContent || '') + newEntry);
}

// ── 文件上传管理（元数据存储） ──

function addFileRecord({ projectId, filename, originalName, size, mimeType, notes }) {
  const record = {
    id: `kf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    project_id: projectId,
    filename,
    original_name: originalName,
    size,
    mime_type: mimeType,
    status: 'uploaded',
    notes: notes || '',
    uploaded_at: new Date().toISOString(),
    scanned_at: null,
    scan_report: null,
  };
  collection('knowledge_files').insert(record);
  return record;
}

function listFileRecords(projectId) {
  return collection('knowledge_files').find(f => f.project_id === projectId)
    .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
}

function getFileRecord(fileId) {
  return collection('knowledge_files').findOne(f => f.id === fileId);
}

function deleteFileRecord(fileId) {
  return collection('knowledge_files').remove(f => f.id === fileId);
}

function updateFileStatus(fileId, status, scanReport) {
  const updates = { status };
  if (scanReport) updates.scan_report = JSON.stringify(scanReport);
  if (status === 'scanned' || status === 'failed') updates.scanned_at = new Date().toISOString();
  return collection('knowledge_files').update(f => f.id === fileId, updates);
}

// ── 保存上传文件到知识库 ──

function saveUploadedFile(projectId, wikiVaultPath, file) {
  const kbPath = ensureKnowledgeBase(projectId, wikiVaultPath);
  const uploadDir = path.join(kbPath, 'raw', 'user-uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  // 生成唯一文件名
  const timestamp = new Date().toISOString().split('T')[0];
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${timestamp}_${safeName}`;
  const destPath = path.join(uploadDir, filename);

  // 复制上传的文件到目标位置（支持跨盘）
  fs.copyFileSync(file.path, destPath);
  try { fs.unlinkSync(file.path); } catch (e) { /* 清理临时文件，非关键 */ }

  return { filename, destPath, size: fs.statSync(destPath).size };
}

function deleteStoredFile(projectId, wikiVaultPath, filename) {
  const kbPath = ensureKnowledgeBase(projectId, wikiVaultPath);
  const filePath = path.join(kbPath, 'raw', 'user-uploads', filename);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    // 文件可能已被删除，忽略
  }
}

// ── 删除知识页面 ──

function deletePage(projectId, wikiVaultPath, pagePath) {
  const kbPath = ensureKnowledgeBase(projectId, wikiVaultPath);
  const fullPath = path.join(kbPath, pagePath);
  if (!fs.existsSync(fullPath)) return false;
  // 安全检查：只删除 .md 文件
  if (!fullPath.endsWith('.md')) return false;
  fs.unlinkSync(fullPath);
  return true;
}

// ── 获取知识库统计 ──

function getStats(projectId, wikiVaultPath) {
  const kbPath = ensureKnowledgeBase(projectId, wikiVaultPath);
  let mdFiles = 0;
  let totalDirs = 0;

  function count(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        totalDirs++;
        count(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        mdFiles++;
      }
    }
  }

  count(kbPath);
  return { exists: true, pageCount: mdFiles, dirCount: totalDirs };
}

module.exports = {
  ensureKnowledgeBase,  // v0.9 新导出：外部模块也可复用（之前漏导）
  initKnowledgeBase,
  getKnowledgePath,
  readPage,
  writePage,
  listKnowledgeTree,
  readIndexSummary,
  appendLog,
  addFileRecord,
  listFileRecords,
  getFileRecord,
  deleteFileRecord,
  updateFileStatus,
  saveUploadedFile,
  deleteStoredFile,
  deletePage,
  getStats,
};
