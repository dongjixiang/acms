// Wiki 服务 — Obsidian vault 文件读写
const fs = require('fs');
const path = require('path');

class WikiService {
  /**
   * 读取 Wiki 页面
   */
  readPage(vaultPath, pagePath) {
    const fullPath = path.join(vaultPath, pagePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf-8');
  }

  /**
   * 写入 Wiki 页面（自动创建目录）
   */
  writePage(vaultPath, pagePath, content) {
    const fullPath = path.join(vaultPath, pagePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
  }

  /**
   * 根据需求数据生成 Wiki 页内容
   */
  generateRequirementPage(req) {
    const srs = typeof req.srs === 'string' ? JSON.parse(req.srs) : (req.srs || {});
    const approval = typeof req.approval === 'string' ? JSON.parse(req.approval) : (req.approval || {});
    const tags = typeof req.tags === 'string' ? JSON.parse(req.tags) : (req.tags || []);

    const scopeIn = (srs.scopeIn || []).map(s => `- ${s}`).join('\n');
    const scopeOut = (srs.scopeOut || []).map(s => `- ${s}`).join('\n');
    const acceptance = (srs.acceptanceCriteria || []).map(a => `- [ ] ${a}`).join('\n');
    const constraints = (srs.technicalConstraints || []).map(c => `- ${c}`).join('\n');

    const statusLabels = {
      idea: '💡 想法', clarifying: '❓ 澄清中', review: '👀 待审核',
      approved: '✅ 已确认', in_execution: '🔄 执行中', done: '🎉 已完成',
      change_requested: '📝 变更中', abandoned: '🗑 已放弃'
    };
    const priorityLabels = { 1: 'P1 🔴', 2: 'P2 🟠', 3: 'P3 🟡', 4: 'P4 🟢', 5: 'P5 ⚪' };

    return `---
tags: [需求${tags.map(t => `, ${t}`).join('')}]
status: ${req.status}
priority: ${priorityLabels[req.priority] || 'P3'}
kanban_id: ${req.id}
created: ${req.created_at?.split('T')[0] || ''}
deadline: ${req.deadline || ''}
---

# ${req.id}: ${req.title}

## 📋 需求描述

${req.structured_description || req.description || '（待完善）'}

## 📐 功能范围

### In Scope
${scopeIn || '（待定义）'}

### Out of Scope
${scopeOut || '（无）'}

## ✅ 验收标准

${acceptance || '（待定义）'}

## 🔧 技术约束

${constraints || '（无）'}

## 💬 需求摘要

${srs.summary || '（待生成）'}

## 🔗 关联任务

| 任务 | 状态 | 执行者 |
|------|------|--------|
| — | — | — |

## 📊 状态

- 当前状态: ${statusLabels[req.status] || req.status}
- 优先级: ${priorityLabels[req.priority] || `P${req.priority}`}
- 创建时间: ${req.created_at || ''}

<!-- ★★★ 以下是人类编辑区域，ACMS 不会覆盖 ★★★ -->
## 📝 人工备注

（此处可自由添加笔记，不会被系统覆盖）

<!-- ★★★ 人类编辑区域结束 ★★★ -->
`;
  }

  /**
   * 检查 Wiki 页一致性
   */
  checkConsistency(vaultPath, pagePath, dbUpdatedAt) {
    const fullPath = path.join(vaultPath, pagePath);
    if (!fs.existsSync(fullPath)) return { consistent: false, reason: 'file_missing' };
    const stat = fs.statSync(fullPath);
    const wikiModified = stat.mtimeMs;
    const dbModified = new Date(dbUpdatedAt).getTime();
    // Wiki 比 DB 旧 → 需要同步
    if (wikiModified < dbModified - 60000) return { consistent: false, reason: 'wiki_stale' };
    return { consistent: true };
  }
}

module.exports = new WikiService();
