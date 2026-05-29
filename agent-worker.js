#!/usr/bin/env node
// ACMS 智能体工作进程 — Skill 驱动的事件处理
// 用法: node agent-worker.js [agent-id]

const AGENT_ID = process.argv[2] || 'agent-xiaoji';
const API = 'http://localhost:3300/api';
const KEY = 'dev-key-001';
const POLL_INTERVAL = 5000;
const MAX_RETRIES = 2;  // verify 失败后的最大重试次数

const headers = { 'Content-Type': 'application/json', 'X-API-Key': KEY };

async function call(method, path, body = null) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

// 事件类型 → Skill 映射表
const EVENT_SKILL_MAP = {
  'requirement.created': 'skill-requirement-clarify',
  'requirement.approved': 'skill-task-decompose',
};

// ============================================================
//  通用步骤执行引擎
// ============================================================

/**
 * 运行 verify checks，返回 { passed, failMsg, log[] }
 */
async function runVerifyChecks(projectId, step, cwd) {
  const log = [];
  let passed = true;
  let failMsg = '';

  for (const check of (step.checks || [])) {
    const checkDesc = check.failMsg || check.type;
    try {
      if (check.type === 'read') {
        const encodedPath = encodeURIComponent(check.path);
        // 路径中的 {module} 替换为当前模块名（这里用通配符，实际由调用方处理）
        const result = await call('GET', `/workspace/files/${projectId}/read?path=${encodedPath}`);
        const content = result.content || '';
        const size = content.length;

        if (check.expect.size_gt !== undefined && size <= check.expect.size_gt) {
          log.push(`   ❌ [验证-读] ${check.path}: 文件太小 (${size} ≤ ${check.expect.size_gt})`);
          passed = false;
          failMsg = check.failMsg;
          break;
        }
        if (check.expect.content_contains && !content.includes(check.expect.content_contains)) {
          log.push(`   ❌ [验证-读] ${check.path}: 不包含 "${check.expect.content_contains}"`);
          passed = false;
          failMsg = check.failMsg;
          break;
        }
        log.push(`   ✅ [验证-读] ${check.path}: OK (${size} chars)`);
      }
      else if (check.type === 'exec') {
        const result = await call('POST', `/workspace/files/${projectId}/exec`, {
          cmd: check.cmd, cwd: cwd || '', timeout: 15000,
        });
        const exitOk = check.expect.exitCode === undefined || result.exitCode === check.expect.exitCode;
        const stdoutOk = !check.expect.stdout_notEmpty || (result.stdout && result.stdout.trim().length > 0);

        if (!exitOk) {
          log.push(`   ❌ [验证-执行] ${check.failMsg}: exitCode=${result.exitCode}, stdout="${(result.stdout||'').substring(0, 80)}"`);
          passed = false;
          failMsg = check.failMsg + ` (exitCode=${result.exitCode})`;
          break;
        }
        if (!stdoutOk) {
          log.push(`   ❌ [验证-执行] ${check.failMsg}: stdout 为空`);
          passed = false;
          failMsg = check.failMsg + ' (stdout 为空)';
          break;
        }
        log.push(`   ✅ [验证-执行] exitCode=${result.exitCode}`);
      }
    } catch (e) {
      log.push(`   ❌ [验证-${check.type}] 异常: ${e.message}`);
      passed = false;
      failMsg = check.failMsg || e.message;
      break;
    }
  }
  return { passed, failMsg, log };
}

/**
 * 执行单个步骤，返回 { ok, log }
 */
async function executeStep(step, task, projectId, cwd) {
  const log = [];

  switch (step.action) {
    case 'read': {
      const encoded = encodeURIComponent(step.path);
      const result = await call('GET', `/workspace/files/${projectId}/read?path=${encoded}`);
      if (!result || result.error) {
        log.push(`[读] ${step.path}: ❌ ${(result||{}).error || 'NOT_FOUND'}`);
      } else {
        log.push(`[读] ${step.path}: ✅ (${(result.content || '').length} chars)`);
      }
      return { ok: true, log };
    }

    case 'write': {
      const result = await call('POST', `/workspace/files/${projectId}/write`, {
        path: step.path, content: step.content || '',
      });
      if (result.error) {
        log.push(`[写] ${step.path}: ❌ ${result.error}`);
        return { ok: false, log };
      }
      // 写后立即读取验证
      const verify = await call('GET', `/workspace/files/${projectId}/read?path=${encodeURIComponent(step.path)}`);
      const actualSize = (verify.content || '').length;
      log.push(`[写] ${step.path}: ✅ (${result.size || actualSize} bytes)`);
      return { ok: true, log };
    }

    case 'exec': {
      const result = await call('POST', `/workspace/files/${projectId}/exec`, {
        cmd: step.cmd, cwd: cwd || step.cwd || '', timeout: 30000,
      });
      const ok = result.exitCode === 0;
      const out = (result.stdout || '').substring(0, 120);
      log.push(`[执行] ${step.cmd}: ${ok ? '✅' : '❌'} exitCode=${result.exitCode}${out ? ' | ' + out : ''}`);
      return { ok, log, result };
    }

    case 'verify': {
      console.log(`  [验证] ${step.desc || ''}`);
      const result = await runVerifyChecks(projectId, step, cwd);
      log.push(...result.log);
      if (result.passed) {
        log.push(`[验证] ✅ 全部通过`);
      }
      return { ok: result.passed, log, failMsg: result.failMsg, verifyStep: step };
    }

    default:
      log.push(`[跳过] 未知 action: ${step.action}`);
      return { ok: true, log };
  }
}

/**
 * 尝试自动修复 verify 失败（简单的非 LLM 修复 + LLM 修复）
 */
async function attemptAutoFix(projectId, step, failInfo, task) {
  console.log(`  🔧 尝试自动修复: ${failInfo.failMsg}`);
  const fixLog = [];

  // 策略 1: 检查是否是简单的语法错误（node --check 失败）
  const syntaxCheck = failInfo.checks?.find(c =>
    c.type === 'exec' && (c.cmd || '').includes('node --check') && failInfo.failMsg?.includes('SyntaxError')
  );
  if (syntaxCheck) {
    // 读取文件，尝试基础修复
    const files = (step.checks || [])
      .filter(c => c.type === 'read')
      .map(c => c.path);
    for (const file of files) {
      try {
        const result = await call('GET', `/workspace/files/${projectId}/read?path=${encodeURIComponent(file)}`);
        if (!result.content) continue;
        let code = result.content;

        // 简单修复：补齐常见缺失的闭合符号
        const openCurly = (code.match(/{/g) || []).length;
        const closeCurly = (code.match(/}/g) || []).length;
        const openParen = (code.match(/\(/g) || []).length;
        const closeParen = (code.match(/\)/g) || []).length;

        if (openCurly > closeCurly) {
          code += '\n' + '}'.repeat(openCurly - closeCurly);
          fixLog.push(`   🔧 补齐 ${openCurly - closeCurly} 个缺失的 '}'`);
        }
        if (openParen > closeParen) {
          code += ')'.repeat(openParen - closeParen);
          fixLog.push(`   🔧 补齐 ${openParen - closeParen} 个缺失的 ')'`);
        }

        if (code !== result.content) {
          await call('POST', `/workspace/files/${projectId}/write`, { path: file, content: code });
          fixLog.push(`   ✅ 已更新 ${file}`);
        }
      } catch (e) {
        fixLog.push(`   ⚠️ 修复 ${file} 失败: ${e.message}`);
      }
    }
  }

  // 策略 2: 调用 LLM 修复（如果 ACMS 有 AI 工具可用）
  try {
    const models = await call('GET', '/models/active');
    if (models && models.id) {
      // 收集错误上下文
      const errorContext = `任务: ${task.title}\n错误: ${failInfo.failMsg}\n`;
      const fixPrompt = `你是一个代码修复专家。以下任务执行时验证失败，请分析并给出修复方案（只给出需要修改的具体代码，不要解释）。\n\n${errorContext}`;

      const fixResult = await call('POST', '/ai-tools/fix-error', {
        taskId: task.id,
        error: failInfo.failMsg,
        projectId: projectId,
        prompt: fixPrompt,
      });
      if (fixResult && fixResult.fixed) {
        fixLog.push(`   🤖 LLM 修复已应用`);
      }
    }
  } catch (e) {
    fixLog.push(`   ⚠️ LLM 修复不可用: ${e.message}`);
  }

  fixLog.forEach(l => console.log(l));
  return fixLog.length > 0;
}

// ============================================================
//  Skill 事件执行器
// ============================================================

async function executeSkillForEvent(event, skill) {
  const skillName = skill.name;
  console.log(`[Worker] 🎯 匹配到 Skill: ${skillName}`);

  if (event.type === 'requirement.created' && skill.id === 'skill-requirement-clarify') {
    return handleClarifySkill(event, skill);
  }
  if (event.type === 'requirement.approved' && skill.id === 'skill-task-decompose') {
    return handleDecomposeSkill(event, skill);
  }

  console.log(`[Worker] Skill ${skill.id} 无对应执行器，跳过`);
}

// ===== Skill: 需求澄清 =====
async function handleClarifySkill(event, skill) {
  const reqId = event.target_id;
  console.log(`[Skill:需求澄清] 处理需求: ${reqId}`);

  const req = await call('GET', `/requirements/${reqId}`);
  if (!req || req.error) { console.log(`[Skill:需求澄清] 需求不存在`); return; }

  console.log(`[Skill:需求澄清] 标题: ${req.title}`);

  const questions = generateClarifyingQuestions(req);
  for (const q of questions) {
    await call('POST', `/requirements/${reqId}/clarify`, {
      question: q,
      agentId: AGENT_ID,
    });
    console.log(`[Skill:需求澄清] 提问: ${q}`);
    await sleep(800);
  }

  if (req.status === 'idea') {
    await call('POST', `/requirements/${reqId}/transition`, { targetStatus: 'clarifying' });
    console.log(`[Skill:需求澄清] 需求 → clarifying`);
  }
}

function generateClarifyingQuestions(req) {
  const desc = (req.description || '').toLowerCase();
  const questions = [];

  if (!desc.includes('性能') && !desc.includes('帧率') && !desc.includes('fps')) {
    questions.push('是否有性能方面的要求？比如帧率、响应时间、并发量等？');
  }
  if (!desc.includes('用户') && !desc.includes('场景')) {
    questions.push('这个功能的目标用户是谁？主要使用场景是什么？');
  }
  if (!desc.includes('集成') && !desc.includes('对接') && !desc.includes('兼容')) {
    questions.push('是否需要和现有系统或模块集成？如果有，具体是哪些？');
  }
  if (questions.length < 2) {
    questions.push('验收标准可以再具体一些吗？比如"完成"的具体定义是什么？');
    questions.push('有没有技术上需要避免的方案，或者偏好的实现方式？');
  }
  return questions.slice(0, 3);
}

// ===== Skill: 任务分解 =====
async function handleDecomposeSkill(event, skill) {
  const reqId = event.target_id;
  console.log(`[Skill:任务分解] 处理需求: ${reqId}`);

  const req = await call('GET', `/requirements/${reqId}`);
  if (!req || req.error) { console.log(`[Skill:任务分解] 需求不存在`); return; }

  const srs = JSON.parse(req.srs || '{}');
  const scopeIn = srs.scopeIn || [req.title];
  const descLen = (req.description || '').length + (req.structured_description || '').length;
  const tasks = [];

  if (scopeIn.length <= 1 && descLen < 300) {
    tasks.push({ title: scopeIn[0] || req.title, type: 'coding', estimatedHours: 3, requiredSkills: { coding: 1.0 } });
  } else if (scopeIn.length <= 2) {
    tasks.push({ title: `${scopeIn[0]} — 核心实现`, type: 'coding', estimatedHours: 6, requiredSkills: { coding: 1.5 } });
    if (scopeIn.length > 1) {
      tasks.push({ title: `${scopeIn[1]} — 实现`, type: 'coding', estimatedHours: 4, requiredSkills: { coding: 1.5 } });
    }
    tasks.push({ title: '测试验证', type: 'testing', estimatedHours: 2, requiredSkills: { testing: 1.0 } });
  } else {
    if (scopeIn.length > 0) {
      tasks.push({ title: `${scopeIn[0]} — 核心功能实现`, type: 'coding', estimatedHours: 8, requiredSkills: { coding: 1.5 } });
    }
    if (scopeIn.length > 1) {
      tasks.push({ title: `${scopeIn[1]} — 实现`, type: 'coding', estimatedHours: 6, requiredSkills: { coding: 1.5 } });
    }
    if (scopeIn.length > 2) {
      tasks.push({ title: `${scopeIn[2]} — 补充实现`, type: 'coding', estimatedHours: 4, requiredSkills: { coding: 1.0 } });
    }
    tasks.push({ title: '测试验证', type: 'testing', estimatedHours: 4, requiredSkills: { testing: 1.0 } });
    tasks.push({ title: '文档更新', type: 'documentation', estimatedHours: 2, requiredSkills: { writing: 1.0 } });
  }

  const result = await call('POST', `/requirements/${reqId}/decompose`, { tasks });
  console.log(`[Skill:任务分解] 已分解为 ${result.count} 个任务`);
}

// ===== Skill: 任务执行（重写 — 真正执行步骤 + verify + 自动修复重试） =====
async function handleExecuteSkill(event, skill) {
  const taskId = event.target_id;
  const task = await call('GET', `/tasks/${taskId}`);
  console.log(`[Skill:任务执行] 任务: ${task.title}`);

  // 认领
  const claimResult = await call('POST', `/tasks/${taskId}/claim`, { agentId: AGENT_ID });
  if (claimResult.error) {
    console.log(`[Skill:任务执行] 认领失败: ${claimResult.error}`);
    return;
  }
  console.log(`[Skill:任务执行] ✅ 已认领`);

  const projectId = task.project_id;
  const exec = JSON.parse(skill.execution || '{}');
  const steps = exec.steps || [];
  const execMode = exec.mode;  // "api" | "handler" | undefined (legacy)

  // 判断步骤格式：object-style 有 action 字段，string-style 是纯字符串
  const isObjectStyle = steps.length > 0 && typeof steps[0] === 'object' && !!steps[0].action;

  // === Path A: Legacy 字符串步骤（旧版 Skill，模拟执行） ===
  if (!isObjectStyle) {
    console.log(`[Skill:任务执行] 旧版 Skill (${steps.length} 步骤)，模拟执行...`);
    steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    await sleep(2000);

    await call('POST', `/tasks/${taskId}/submit`, {
      agentId: AGENT_ID,
      notes: `⚠️ 按 Skill "${skill.name}" 模拟执行完成（旧版 Skill，无 verify）。\n步骤: ${steps.join(' → ')}`,
    });
    console.log(`[Skill:任务执行] 已提交（旧版模式）`);
    return;
  }

  // === Path B: Object-style 步骤（真正执行 read/write/exec/verify） ===
  console.log(`[Skill:任务执行] 执行 ${steps.length} 步骤 (mode=${execMode || 'api'})...`);

  const execLog = [];
  let allPassed = true;
  let retryCount = 0;
  const cwd = exec.cwd || '';

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`  步骤 ${i + 1}/${steps.length}: ${step.action} — ${step.desc || step.path || ''}`);

    if (retryCount >= MAX_RETRIES) {
      execLog.push(`⛔ 已达最大重试次数 (${MAX_RETRIES})，放弃`);
      allPassed = false;
      break;
    }

    const result = await executeStep(step, task, projectId, cwd);
    execLog.push(...result.log);

    if (!result.ok) {
      if (step.action === 'verify' && result.failMsg) {
        console.log(`  ❌ 验证失败: ${result.failMsg}`);
        execLog.push(`❌ ${result.failMsg}`);

        // 尝试自动修复
        const fixed = await attemptAutoFix(projectId, step, result, task);
        if (fixed) {
          retryCount++;
          console.log(`  🔄 重试第 ${retryCount} 次...`);
          execLog.push(`🔄 自动修复后重试 (第 ${retryCount} 次)`);

          // 重新执行前一步 (通常 verify 前面是 write 或 exec)
          // 回退一步，让下次循环重新执行 verify
          i--;  // 重新执行当前 verify 步骤
          continue;
        }

        allPassed = false;
        break;
      } else {
        // 非 verify 步骤失败（write/exec 失败）
        execLog.push(`❌ 步骤失败，终止执行`);
        allPassed = false;
        break;
      }
    }
  }

  // === 提交 ===
  const statusIcon = allPassed ? '✅' : '❌';
  const statusText = allPassed
    ? `按 Skill "${skill.name}" 执行完成，所有验证通过。`
    : `按 Skill "${skill.name}" 执行，验证未通过。`;

  // 验证失败时自动创建缺陷
  if (!allPassed && execLog.some(l => l.includes('❌'))) {
    await autoCreateBug(projectId, task, execLog, skill);
  }

  const notes = `${statusIcon} ${statusText}\n---\n执行日志:\n${execLog.join('\n')}`;
  await call('POST', `/tasks/${taskId}/submit`, { agentId: AGENT_ID, notes });
  console.log(`[Skill:任务执行] 已提交: ${statusIcon} ${allPassed ? '通过' : '失败'}`);
}

/**
 * 验证失败时自动创建缺陷
 */
async function autoCreateBug(projectId, task, execLog, skill) {
  try {
    const failMsg = execLog.filter(l => l.includes('❌')).join('; ');
    const title = `🐛 [verify失败] ${task.title}`;
    const description = [
      `## 自动创建的缺陷`,
      ``,
      `**来源**: verify_failure`,
      `**任务**: ${task.id} — ${task.title}`,
      `**Skill**: ${skill.name} (${skill.id})`,
      ``,
      `### 验证失败详情`,
      failMsg,
      ``,
      `### 完整执行日志`,
      execLog.join('\n'),
    ].join('\n');

    const result = await call('POST', '/bugs', {
      projectId,
      title,
      description,
      severity: 'major',
      source: 'verify_failure',
      sourceTaskId: task.id,
      linkedRequirementId: task.parent_id || '',
    });
    console.log(`[自动缺陷] ✅ 已创建缺陷 BUG: ${result.task ? result.task.id : 'OK'}`);
  } catch (e) {
    console.log(`[自动缺陷] ⚠️ 创建失败: ${e.message}`);
  }
}

// ===== 主循环 =====
async function main() {
  console.log(`[Worker] 智能体 ${AGENT_ID} 启动 (Skill 驱动模式)`);

  const skills = await call('GET', '/skills');
  console.log(`[Worker] 已加载 ${skills.length} 个 Skill:`);
  skills.forEach(s => console.log(`  - ${s.id}: ${s.name}`));

  const agent = await call('GET', `/agents/${AGENT_ID}`);
  const sub = await call('POST', `/agents/${AGENT_ID}/subscribe`);
  const subscriptions = sub.subscriptions || [];
  console.log(`[Worker] 订阅事件: ${subscriptions.join(', ')}`);

  let lastEventTime = Date.now() - 60000;
  const processedEvents = new Set();

  while (true) {
    try {
      const events = await call('GET', `/agents/${AGENT_ID}/notifications`);
      const newEvents = events.filter(e => e.timestamp > lastEventTime && !processedEvents.has(e.id));
      lastEventTime = Date.now();
      for (const e of newEvents) processedEvents.add(e.id);
      if (processedEvents.size > 1000) {
        const arr = [...processedEvents];
        processedEvents.clear();
        arr.slice(-500).forEach(x => processedEvents.add(x));
      }

      for (const event of newEvents) {
        const skillId = EVENT_SKILL_MAP[event.type];
        if (skillId) {
          const skill = skills.find(s => s.id === skillId);
          if (skill) {
            await executeSkillForEvent(event, skill);
            continue;
          }
        }

        if (event.type === 'task.created') {
          const taskId = event.target_id;
          const matches = await call('GET', `/skills/match/${taskId}`);
          if (matches && matches.length > 0 && matches[0].score >= 3) {
            await handleExecuteSkill(event, matches[0].skill);
          }
        }

        if (event.type === 'requirement.changed') {
          await handleRequirementChanged(event);
        }
      }
    } catch (e) {
      console.error(`[Worker] 错误: ${e.message}`);
    }
    await sleep(POLL_INTERVAL);
  }
}

async function handleRequirementChanged(event) {
  try {
    const payload = event.payload || {};
    const impact = payload.impact || {};
    const affectedIds = [
      ...(impact.adjusted || []).map(t => t.id),
      ...(impact.discarded || []).map(t => t.id),
    ];
    if (!affectedIds.length) return;

    for (const taskId of affectedIds) {
      const task = await call('GET', `/tasks/${taskId}`);
      if (!task || !task.id) continue;
      if (task.assignedTo !== AGENT_ID) continue;

      if (task.status === 'frozen') {
        console.log(`[Worker] ⚠️ 任务 ${taskId} "${task.title}" 因需求变更被冻结，等待重新评估`);
      } else if (task.status === 'archived') {
        console.log(`[Worker] 🗑 任务 ${taskId} "${task.title}" 因需求变更被归档，自动放弃`);
      }
    }
  } catch (e) {
    console.error(`[Worker] 变更处理错误: ${e.message}`);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error('[Worker] 致命错误:', e.message); process.exit(1); });
