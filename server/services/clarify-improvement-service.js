// 澄清自我改进引擎 — 分析澄清会话，优化领域 Skill
// 触发时机: 需求审批通过后
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills', 'prompts');

/**
 * 分析一次澄清会话，生成改进建议
 * @param {object} requirement — 含 clarifications 历史
 * @returns {{ suggestions: [], skillPatches: [] }}
 */
function analyzeClarification(requirement, clarificationHistory) {
  const history = clarificationHistory || [];
  const srs = JSON.parse(requirement.srs || '{}');
  const originalDesc = requirement.description || '';

  const suggestions = [];
  const skillPatches = [];
  const domain = detectDomain(requirement);

  // 1. 轮次分析: 澄清了几轮？
  const userMessages = history.filter(h => h.role === 'user');
  const agentMessages = history.filter(h => h.role === 'agent' || h.role === 'assistant');
  const totalRounds = userMessages.length;

  if (totalRounds >= 4) {
    suggestions.push({
      type: 'TOO_MANY_ROUNDS',
      severity: 'warning',
      title: `澄清了 ${totalRounds} 轮才完成，可能需要优化 Skill`,
      detail: `领域: ${domain}。检查是否缺少关键追问维度导致多轮往返`,
      suggestedAction: `在 skill-clarify-${domain} 中增加首轮必问清单`,
    });
  }

  // 2. vaguenessWarnings 分析: 哪些模糊模式反复出现？
  const allWarnings = [];
  for (const m of agentMessages) {
    try {
      const raw = m.content || '';
      // content 可能是 AI 返回的 JSON 字符串
      const content = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (content.vaguenessWarnings && Array.isArray(content.vaguenessWarnings)) {
        allWarnings.push(...content.vaguenessWarnings);
      }
    } catch (e) { /* 非JSON内容，跳过 */ }
  }

  const warningFreq = {};
  for (const w of allWarnings) {
    const key = extractPattern(w);
    warningFreq[key] = (warningFreq[key] || 0) + 1;
  }
  const frequentWarnings = Object.entries(warningFreq).filter(([,c]) => c >= 2);

  // 3. 模糊→具体 转化分析: 从描述变化中提取澄清模式
  const clarificationGaps = detectClarificationGaps(originalDesc, srs, history);

  // 4. 新领域检测: 是否出现了现有 domain skill 覆盖不到的领域？
  if (domain === 'general' && clarificationGaps.length >= 2) {
    const newDomain = inferNewDomain(requirement, clarificationGaps);
    if (newDomain) {
      suggestions.push({
        type: 'NEW_DOMAIN_NEEDED',
        severity: 'info',
        title: `建议创建新领域 Skill: ${newDomain}`,
        detail: `需求 "${requirement.title}" 类型为 ${domain}，但出现了 ${clarificationGaps.length} 个领域特定的澄清缺口`,
        suggestedAction: `创建 skill-clarify-${newDomain}，包含以下追问维度: ${clarificationGaps.join(', ')}`,
      });
    }
  }

  // 5. 生成 Skill 补丁: 高频模糊模式 → 建议加入现有 Skill
  if (frequentWarnings.length > 0) {
    const patchLines = frequentWarnings.map(([pattern, count]) =>
      `${count}次出现: "${pattern}" → 在 skill-clarify-${domain} 中增加对应的具体性规则`
    );
    skillPatches.push({
      domain,
      skillId: `skill-clarify-${domain}`,
      reason: `澄清中反复出现 ${frequentWarnings.length} 类模糊模式`,
      suggestedAdditions: patchLines,
    });
  }

  return {
    domain,
    totalRounds,
    totalVaguenessWarnings: allWarnings.length,
    frequentPatterns: frequentWarnings.map(([p, c]) => ({ pattern: p, count: c })),
    clarificationGaps,
    suggestions,
    skillPatches,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * 将改进建议应用到领域 Skill 文件
 * @param {object} skillPatch — analyzeClarification 返回的 skillPatches[0]
 * @returns {{ patched: boolean }}
 */
function applySkillPatch(skillPatch) {
  const skillFile = path.join(SKILLS_DIR, `${skillPatch.skillId}.md`);
  if (!fs.existsSync(skillFile)) return { patched: false, reason: 'skill file not found' };

  const content = fs.readFileSync(skillFile, 'utf-8');
  const additions = skillPatch.suggestedAdditions.map(line => `// [AUTO-PATCH] ${new Date().toISOString()}\n${line}`).join('\n\n');

  // 追加到文件末尾
  const updated = content + '\n\n' +
    `---\n## 自动优化 (${new Date().toLocaleDateString('zh-CN')})\n` +
    `> 触发原因: ${skillPatch.reason}\n\n` +
    skillPatch.suggestedAdditions.map((l, i) => `${i + 1}. ${l}`).join('\n') + '\n';

  fs.writeFileSync(skillFile, updated, 'utf-8');
  return { patched: true, file: skillFile };
}

/**
 * 分析评审反馈 — 从 review_report 中提取常见问题模式
 * @param {object} requirement
 * @returns {Array} suggestions
 */
function analyzeReviewFeedback(requirement) {
  const reviewReport = typeof requirement.review_report === 'string'
    ? JSON.parse(requirement.review_report) : (requirement.review_report || {});
  if (!reviewReport.issues || reviewReport.issues.length === 0) return [];

  // 按维度统计错误频率
  const dimCounts = {};
  for (const issue of reviewReport.issues) {
    const dim = issue.dimension || '其他';
    dimCounts[dim] = (dimCounts[dim] || 0) + 1;
  }

  const suggestions = [];
  const threshold = Math.ceil(reviewReport.issues.length / 2);
  for (const [dim, count] of Object.entries(dimCounts)) {
    if (count >= threshold) {
      suggestions.push({
        type: 'REVIEW_PATTERN',
        severity: 'info',
        title: `评审中「${dim}」维度问题出现 ${count} 次`,
        detail: `该维度问题占比 ${Math.round(count / reviewReport.issues.length * 100)}%，建议增强对应 Prompt 规则`,
        suggestedAction: `在 clarifiy-smart 或对应领域 Skill 中增加「${dim}」专项检查`,
      });
    }
  }
  return suggestions;
}

/**
 * 分析执行反馈 — 从缺陷的 root_cause 中提取需求层面的改进信号
 * @param {string} projectId
 * @returns {Array} suggestions
 */
function analyzeExecutionFeedback(projectId) {
  const taskStore = require('../stores/task-store');
  const tasks = taskStore.list({ projectId }).filter(t => t.type === 'bug' && t.status === 'done');
  if (tasks.length === 0) return [];

  const scopeInMissCount = tasks.filter(t => {
    try {
      const artifacts = JSON.parse(t.artifacts || '{}');
      return (artifacts.rootCause || t.description || '').includes('scopeIn') ||
             (artifacts.rootCause || t.description || '').includes('遗漏');
    } catch { return false; }
  }).length;

  if (scopeInMissCount >= 2) {
    return [{
      type: 'SCOPE_IN_MISS',
      severity: 'warning',
      title: `${scopeInMissCount} 个缺陷与 scopeIn 遗漏相关`,
      detail: '执行中发现需求范围内缺失的功能或边界问题',
      suggestedAction: '检查最近需求在澄清时是否遗漏了「用户流程完整性」检查',
    }];
  }
  return [];
}

// ===== 导出增强 =====
module.exports.analyzeReviewFeedback = analyzeReviewFeedback;
module.exports.analyzeExecutionFeedback = analyzeExecutionFeedback;

// ═══════════════════════════════════════
// 分析辅助函数
// ═══════════════════════════════════════

function detectDomain(requirement) {
  const text = (requirement.title + ' ' + (requirement.description || '')).toLowerCase();
  if (/游戏|game|关卡|角色|NPC|BOSS|战斗|技能|副本/.test(text)) return 'game';
  if (/API|接口|后端|服务|REST|GraphQL|端点/.test(text)) return 'api';
  if (/页面|前端|UI|组件|表单|路由|SPA/.test(text)) return 'webapp';
  if (/文档|Wiki|手册|教程|指南/.test(text)) return 'documentation';
  if (/竞品|产品规划|商业模式|定价|用户画像|市场分析|差异化|MVP|楔子|RICE/.test(text)) return 'product';
  return 'general';
}

function extractPattern(warning) {
  const w = (warning || '').replace(/[""「」]/g, '').trim();
  // 提取核心模糊词
  const matches = [
    w.match(/[\d]+[~～\-][\d]+\s*个?\S*(关卡|角色|页面|接口|模块|功能|武器|地形|英雄|端点)/),
    w.match(/(剧情|NPC|BOSS|关卡|地形|人物|角色|页面|端点|模块|接口).*未说明/),
    w.match(/(未说明|缺少|无具体|无名字|无设定)/),
  ];
  for (const m of matches) {
    if (m) return m[0].substring(0, 40);
  }
  return w.substring(0, 40);
}

function detectClarificationGaps(originalDesc, srs, history) {
  const gaps = [];
  const scopeIn = srs.scopeIn || [];

  // 检查: 原始描述中的模糊词是否最终被澄清了？
  const vaguePatterns = [
    { regex: /(\d+)\s*[~～\-]\s*(\d+)\s*个/, label: '数量范围无具体清单' },
    { regex: /若干|一些|几个|多种|各种/, label: '模糊数量词' },
    { regex: /剧情|故事/, label: '剧情/故事' },
    { regex: /有趣|独特|好玩|酷|炫/, label: '主观形容词' },
    { regex: /现代.*框架|合适的.*数据库/, label: '未决策技术方案' },
  ];

  for (const { regex, label } of vaguePatterns) {
    if (regex.test(originalDesc)) {
      const clarified = scopeIn.some(s => s.length > 20); // 有具体描述
      if (!clarified) {
        gaps.push(label);
      }
    }
  }
  return gaps;
}

function inferNewDomain(requirement, gaps) {
  const text = (requirement.title + ' ' + (requirement.description || '')).toLowerCase();
  if (/部署|CI|CD|pipeline|docker|k8s|服务器|运维/.test(text)) return 'devops';
  if (/数据|分析|报表|BI|图表|统计|指标/.test(text)) return 'analytics';
  if (/移动|App|iOS|Android|小程序|手机/.test(text)) return 'mobile';
  if (/AI|机器学习|模型|训练|预测|NLP|CV/.test(text)) return 'ai-ml';
  return null;
}

module.exports = { analyzeClarification, applySkillPatch, detectDomain, analyzeReviewFeedback, analyzeExecutionFeedback };

