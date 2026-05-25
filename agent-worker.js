#!/usr/bin/env node
// ACMS 智能体工作进程 — Skill 驱动的事件处理
// 用法: node agent-worker.js [agent-id]

const AGENT_ID = process.argv[2] || 'agent-xiaoji';
const API = 'http://localhost:3300/api';
const KEY = 'dev-key-001';
const POLL_INTERVAL = 5000;

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

// 事件 → Skill 执行器
async function executeSkillForEvent(event, skill) {
  const skillName = skill.name;
  const exec = JSON.parse(skill.execution || '{}');
  const steps = exec.steps || [];
  
  console.log(`[Worker] 🎯 匹配到 Skill: ${skillName}`);
  console.log(`[Worker] 执行步骤 (${steps.length} 步):`);
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

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

  // 生成澄清问题
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

  // 根据复杂度调整任务数
  if (scopeIn.length <= 1 && descLen < 300) {
    // 简单需求：只一个核心实现任务
    tasks.push({ title: scopeIn[0] || req.title, type: 'coding', estimatedHours: 3, requiredSkills: { coding: 1.0 } });
  } else if (scopeIn.length <= 2) {
    // 中等需求
    tasks.push({ title: `${scopeIn[0]} — 核心实现`, type: 'coding', estimatedHours: 6, requiredSkills: { coding: 1.5 } });
    if (scopeIn.length > 1) {
      tasks.push({ title: `${scopeIn[1]} — 实现`, type: 'coding', estimatedHours: 4, requiredSkills: { coding: 1.5 } });
    }
    tasks.push({ title: '测试验证', type: 'testing', estimatedHours: 2, requiredSkills: { testing: 1.0 } });
  } else {
    // 复杂需求：完整分解
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

// ===== Skill: 任务执行 =====
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
  console.log(`[Skill:任务执行] 已认领: ${task.title}`);

  // 读取执行步骤
  const exec = JSON.parse(skill.execution || '{}');
  const steps = exec.steps || [];
  console.log(`[Skill:任务执行] 执行 ${steps.length} 步:`);
  for (const step of steps) console.log(`  → ${step}`);

  // 模拟执行
  await sleep(2000);

  // 提交
  await call('POST', `/tasks/${taskId}/submit`, {
    agentId: AGENT_ID,
    notes: `按 Skill "${skill.name}" 执行完成。\n步骤: ${steps.join(' → ')}`,
  });
  console.log(`[Skill:任务执行] 已提交审核`);
}

// ===== 主循环 =====
async function main() {
  console.log(`[Worker] 智能体 ${AGENT_ID} 启动 (Skill 驱动模式)`);

  // 加载所有 Skill
  const skills = await call('GET', '/skills');
  console.log(`[Worker] 已加载 ${skills.length} 个 Skill:`);
  skills.forEach(s => console.log(`  - ${s.id}: ${s.name}`));

  // 订阅事件
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
        // 事件 → Skill 匹配
        const skillId = EVENT_SKILL_MAP[event.type];
        if (skillId) {
          const skill = skills.find(s => s.id === skillId);
          if (skill) {
            await executeSkillForEvent(event, skill);
            continue;
          }
        }

        // 任务事件：用 Skill 匹配
        if (event.type === 'task.created') {
          const taskId = event.target_id;
          const matches = await call('GET', `/skills/match/${taskId}`);
          if (matches && matches.length > 0 && matches[0].score >= 3) {
            await handleExecuteSkill(event, matches[0].skill);
          }
        }

        // 需求变更事件：检查自己被分配的任务是否受影响
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

// 需求变更处理：检查自己被分配的任务是否被冻结/归档
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
        // 可选：释放任务分配（如果 archived 状态仍保留 assignedTo）
      }
    }
  } catch (e) {
    console.error(`[Worker] 变更处理错误: ${e.message}`);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error('[Worker] 致命错误:', e.message); process.exit(1); });
