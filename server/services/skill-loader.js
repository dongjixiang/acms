// ACMS Skill Loader — 纯文件模式技能加载器
// 扫描 skills/ 目录，自动发现所有 SKILL.md 和 <id>.md 文件
// 解析 YAML frontmatter，构建 skill 索引
// 支持 agent 执行时按需加载 skill 内容到 system prompt

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

// ===== YAML frontmatter 解析（轻量版，不依赖外部库）=====
function parseFrontmatter(raw) {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('---')) return { metadata: {}, body: raw };

  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) return { metadata: {}, body: raw };

  const yamlStr = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trimStart();

  const metadata = {};
  for (const line of yamlStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    // 去掉引号
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // 数组 [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    }
    metadata[key] = val;
  }

  return { metadata, body };
}

// ===== 发现所有 skill 文件 =====
function discoverSkills() {
  const skills = [];

  if (!fs.existsSync(SKILLS_DIR)) return skills;

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    let filePath = null;
    let skillId = null;

    // 模式 1: skills/<id>.md（扁平文件）
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'SKILL.md') {
      filePath = path.join(SKILLS_DIR, entry.name);
      skillId = entry.name.replace(/\.md$/, '');
    }

    // 模式 2: skills/<dir>/SKILL.md（目录模式）
    if (entry.isDirectory()) {
      const skillMd = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        filePath = skillMd;
        // dir 名或 frontmatter id 作为 skillId
        skillId = entry.name;
      }
    }

    if (!filePath || !skillId) continue;

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { metadata, body } = parseFrontmatter(raw);

      // 统一字段名
      const id = metadata.id || metadata.skill_id || skillId;
      const name = metadata.name || id;
      const desc = metadata.description || '';
      const category = metadata.category || 'general';
      const version = metadata.version || '0.0.1';
      const author = metadata.author || '';
      const created = metadata.created || metadata.created_at || '';

      // matchOn 条件
      const matchOn = metadata.matchOn || {};
      // execution 步骤
      const execution = metadata.execution || {};
      // references 引用
      const references = metadata.references || [];

      skills.push({
        id,
        name,
        description: desc,
        category,
        version,
        author,
        created,
        matchOn,
        execution,
        references,
        filePath,
        body: body || '',
      });
    } catch (e) {
      // 跳过解析失败的 skill
    }
  }

  return skills;
}

// ===== 缓存 =====
let _cachedSkills = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5000; // 5 秒内不重新扫描

function getSkills() {
  const now = Date.now();
  if (_cachedSkills && (now - _cacheTimestamp) < CACHE_TTL_MS) {
    return _cachedSkills;
  }
  _cachedSkills = discoverSkills();
  _cacheTimestamp = now;
  return _cachedSkills;
}

// ===== 按 ID 获取 skill =====
function getById(id) {
  return getSkills().find(s => s.id === id) || null;
}

// ===== 按类别获取 skill =====
function getByCategory(category) {
  return getSkills().filter(s => s.category === category);
}

// ===== 匹配：根据任务属性找匹配的 Skill =====
function matchForTask(task) {
  const skills = getSkills();
  const matches = [];

  for (const s of skills) {
    const matchOn = s.matchOn || {};
    let score = 0;

    // Frontmatter matchOn
    if (matchOn.taskType && Array.isArray(matchOn.taskType)) {
      if (matchOn.taskType.includes(task.type)) score += 3;
    }
    if (matchOn.requiredSkills && task.required_skills) {
      const reqSkills = typeof task.required_skills === 'string'
        ? JSON.parse(task.required_skills)
        : task.required_skills;
      for (const [skillName, weight] of Object.entries(matchOn.requiredSkills)) {
        if (reqSkills[skillName]) {
          score += Math.round(weight * 2);
        }
      }
    }

    // Body 解析匹配规则（兼容旧 skill 格式：匹配规则写在 markdown 正文里）
    if (score === 0 && s.body) {
      const bodyMatch = parseMatchRulesFromBody(s.body);
      if (bodyMatch) {
        if (bodyMatch.taskType && bodyMatch.taskType.includes(task.type)) score += 3;
        if (bodyMatch.tags && task.title) {
          const matched = bodyMatch.tags.filter(t => task.title.toLowerCase().includes(t.toLowerCase()));
          score += matched.length * 2;
        }
      }
    }

    // 关键词匹配（兜底）
    if (score === 0) {
      const text = [task.title, task.description].filter(Boolean).join(' ').toLowerCase();
      const skillText = [s.name, s.description, s.id].filter(Boolean).join(' ').toLowerCase();
      const skillWords = skillText.split(/[\s\-_/]+/).filter(w => w.length > 2);
      const matched = skillWords.filter(w => text.includes(w));
      if (matched.length > 0) {
        score = matched.length;
      }
    }

    if (score > 0) {
      matches.push({ skill: s, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

// ===== 从 markdown body 解析"匹配规则"段落 =====
function parseMatchRulesFromBody(body) {
  // 匹配 "- 任务类型: testing" 或 "- 任务类型: coding, testing"
  const typeMatch = body.match(/任务类型:\s*([^\n]+)/i);
  const tagMatch = body.match(/标签:\s*([^\n]+)/i);

  if (!typeMatch && !tagMatch) return null;

  return {
    taskType: typeMatch ? typeMatch[1].split(/[,\s]+/).filter(Boolean) : [],
    tags: tagMatch ? tagMatch[1].split(/[,\s]+/).filter(Boolean) : [],
  };
}

// ===== 加载 skill 内容为 system prompt 片段 =====
function loadSkillBody(skillId) {
  const skill = getById(skillId);
  if (!skill) return null;
  return skill.body;
}

// ===== 加载 skill 的执行步骤（JSON 格式） =====
function loadSkillExecution(skillId) {
  const skill = getById(skillId);
  if (!skill) return null;
  return skill.execution;
}

// ===== 加载 skill 引用的外部文件 =====
function loadSkillReferences(skillId) {
  const skill = getById(skillId);
  if (!skill) return [];

  const refs = skill.references || [];
  const results = [];

  for (const ref of refs) {
    // 解析 [[path]] 格式
    const match = ref.match(/\[\[(.+)\]\]/);
    if (match) {
      const refPath = path.join(path.dirname(skill.filePath), match[1]);
      try {
        if (fs.existsSync(refPath)) {
          results.push({ path: refPath, content: fs.readFileSync(refPath, 'utf-8') });
        }
      } catch (e) { /* */ }
    }
  }

  return results;
}

// ===== 构建 skill 注入到 agent system prompt 的文本 =====
function buildSkillPrompt(skillId) {
  const skill = getById(skillId);
  if (!skill) return '';

  let prompt = `# Skill: ${skill.name} (${skill.id})\n\n${skill.body || ''}`;

  // 附加引用的文件内容
  const refs = loadSkillReferences(skillId);
  for (const ref of refs) {
    prompt += `\n\n---\n# Reference: ${ref.path}\n${ref.content}`;
  }

  return prompt;
}

// ===== 手动刷新缓存 =====
function refreshCache() {
  _cachedSkills = null;
  _cacheTimestamp = 0;
  return getSkills();
}

// ===== 导出 =====
module.exports = {
  parseFrontmatter,
  discoverSkills,
  getSkills,
  getById,
  getByCategory,
  matchForTask,
  loadSkillBody,
  loadSkillExecution,
  loadSkillReferences,
  buildSkillPrompt,
  refreshCache,
};
