// 技能存储 — Skill CRUD + 匹配
const { collection } = require('../db/connection');
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

class SkillStore {
  // 列出所有技能
  list(category) {
    let skills = collection('skills').all();
    if (category) skills = skills.filter(s => s.category === category);
    return skills;
  }

  // 获取单个技能
  getById(id) { return collection('skills').findOne(s => s.id === id) || null; }

  // 创建技能（JSON 存储 + SKILL.md 文件）
  create({ id, name, description = '', category = 'general', matchOn = {}, execution = {}, taskTemplate = {} }) {
    const now = new Date().toISOString();
    const skill = {
      id, name, description, category,
      match_on: JSON.stringify(matchOn),
      execution: JSON.stringify(execution),
      task_template: JSON.stringify(taskTemplate),
      created_at: now, updated_at: now
    };
    collection('skills').insert(skill);

    // 生成 SKILL.md 文件
    this._writeSkillFile(skill);

    return skill;
  }

  // 更新技能
  update(id, updates) {
    const now = new Date().toISOString();
    const result = collection('skills').update(s => s.id === id, { ...updates, updated_at: now });
    if (result) {
      const skill = this.getById(id);
      this._writeSkillFile(skill);
    }
    return result;
  }

  // 删除技能
  remove(id) {
    // 删除 SKILL.md
    try {
      const mdPath = path.join(SKILLS_DIR, `${id}.md`);
      if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
    } catch (e) { /* */ }
    return collection('skills').remove(s => s.id === id);
  }

  // 匹配：根据任务属性找匹配的 Skill，返回 { skill, score }
  matchForTask(task) {
    const skills = this.list();
    const matches = [];
    for (const s of skills) {
      const matchOn = JSON.parse(s.match_on || '{}');
      let score = 0;
      if (matchOn.taskType && matchOn.taskType.includes(task.type)) score += 3;
      if (matchOn.tags && task.tags) {
        const taskTags = typeof task.tags === 'string' ? JSON.parse(task.tags) : task.tags;
        const matched = matchOn.tags.filter(t => taskTags.includes(t));
        score += matched.length * 2;
      }
      if (score > 0) matches.push({ skill: s, score });
    }
    return matches.sort((a, b) => b.score - a.score);
  }

  // 导出 Skills 列表（供 AI prompt 用）
  exportForPrompt() {
    const skills = this.list();
    return skills.map(s => {
      const exec = JSON.parse(s.execution || '{}');
      const tmpl = JSON.parse(s.task_template || '{}');
      return `- **${s.id}**: ${s.name} (${s.category})\n  匹配: ${JSON.stringify(JSON.parse(s.match_on || '{}'))}\n  任务模板: ${tmpl.title || '无'}, type=${tmpl.type || 'coding'}, hours=${tmpl.estimatedHours || 4}`;
    }).join('\n');
  }

  // 从 prompts/ 目录加载 Skill 的提示词
  loadPrompt(skillId) {
    try {
      const promptPath = path.join(SKILLS_DIR, 'prompts', `${skillId}.md`);
      if (fs.existsSync(promptPath)) {
        return fs.readFileSync(promptPath, 'utf-8').trim();
      }
    } catch (e) { /* */ }
    return null;
  }

  // 生成 SKILL.md 文件（Obsidian 可读）
  _writeSkillFile(skill) {
    if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });

    const matchOn = JSON.parse(skill.match_on || '{}');
    const execution = JSON.parse(skill.execution || '{}');
    const tmpl = JSON.parse(skill.task_template || '{}');

    const md = `---
skill_id: ${skill.id}
category: ${skill.category}
created: ${skill.created_at}
updated: ${skill.updated_at}
---

# ${skill.name}

> ${skill.description}

## 匹配规则

- 任务类型: ${(matchOn.taskType || []).join(', ') || '不限'}
- 标签: ${(matchOn.tags || []).join(', ') || '不限'}
- 所需技能: ${JSON.stringify(matchOn.requiredSkills || {})}

## 执行步骤

${(execution.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 交付物

${(execution.deliverables || []).map(d => `- ${d}`).join('\n')}

## 参考资料

${(execution.references || []).map(r => `- ${r}`).join('\n')}

## 任务模板

- 标题: ${tmpl.title || skill.name}
- 类型: ${tmpl.type || 'coding'}
- 预估工时: ${tmpl.estimatedHours || 4}h
- 所需技能: ${JSON.stringify(tmpl.requiredSkills || {})}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
`;
    fs.writeFileSync(path.join(SKILLS_DIR, `${skill.id}.md`), md, 'utf-8');
  }
}

module.exports = new SkillStore();
