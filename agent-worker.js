#!/usr/bin/env node
// ACMS 智能体工作进程 — 监听事件并自动响应
// 用法: node agent-worker.js [agent-id]

const AGENT_ID = process.argv[2] || 'agent-xiaoji';
const API = 'http://localhost:3300/api';
const KEY = 'dev-key-001';
const POLL_INTERVAL = 5000; // 5秒轮询

const headers = { 'Content-Type': 'application/json', 'X-API-Key': KEY };

async function call(method, path, body = null) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

// 获取智能体信息和订阅
async function getAgentInfo() {
  const agent = await call('GET', `/agents/${AGENT_ID}`);
  const sub = await call('POST', `/agents/${AGENT_ID}/subscribe`);
  return { agent, subscriptions: sub.subscriptions };
}

// 获取上次处理的事件时间戳
let lastEventTime = Date.now() - 60000;
let processedEvents = new Set(); // 防止重复处理

async function pollEvents(subscriptions) {
  const events = await call('GET', `/agents/${AGENT_ID}/notifications`);
  const newEvents = events.filter(e => e.timestamp > lastEventTime && !processedEvents.has(e.id));
  lastEventTime = Date.now();
  for (const e of newEvents) processedEvents.add(e.id);
  // 限制 Set 大小
  if (processedEvents.size > 1000) processedEvents = new Set([...processedEvents].slice(-500));
  return newEvents;
}

// ===== 分析师: 处理新需求 =====
async function handleNewRequirement(event) {
  const reqId = event.target_id;
  console.log(`[分析师] 收到新需求: ${reqId}`);

  // 读取需求详情
  const req = await call('GET', `/requirements/${reqId}`);
  console.log(`[分析师] 分析需求: ${req.title}`);

  // 生成澄清问题
  const questions = generateClarifyingQuestions(req);
  for (const q of questions) {
    await call('POST', `/requirements/${reqId}/clarify`, {
      question: q,
      agentId: AGENT_ID,
    });
    console.log(`[分析师] 提问: ${q}`);
    // 间隔一下，模拟思考
    await sleep(800);
  }

  // 如果需求还在 idea 状态，推进到 clarifying
  if (req.status === 'idea') {
    await call('POST', `/requirements/${reqId}/transition`, { targetStatus: 'clarifying' });
    console.log(`[分析师] 需求 → clarifying`);
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
  // 至少问2个
  if (questions.length < 2) {
    questions.push('验收标准可以再具体一些吗？比如"完成"的具体定义是什么？');
    questions.push('有没有技术上需要避免的方案，或者偏好的实现方式？');
  }
  return questions.slice(0, 3);
}

// ===== 规划师: 处理需求确认 =====
async function handleRequirementApproved(event) {
  const reqId = event.target_id;
  console.log(`[规划师] 需求已确认: ${reqId}`);

  const req = await call('GET', `/requirements/${reqId}`);
  console.log(`[规划师] 分析需求: ${req.title}`);

  // 自动生成任务分解
  const srs = JSON.parse(req.srs || '{}');
  const scopeIn = srs.scopeIn || [req.title];
  const tasks = [];

  if (scopeIn.length > 0) {
    // 核心实现
    tasks.push({ title: `${scopeIn[0]} — 核心功能实现`, type: 'coding', estimatedHours: 8, requiredSkills: { coding: 1.5 } });
  }
  if (scopeIn.length > 1) {
    tasks.push({ title: `${scopeIn[1]} — 实现`, type: 'coding', estimatedHours: 6, requiredSkills: { coding: 1.5 } });
  }
  // 通用任务
  tasks.push({ title: `测试验证`, type: 'testing', estimatedHours: 4, requiredSkills: { testing: 1.0 } });
  tasks.push({ title: `文档更新`, type: 'documentation', estimatedHours: 2, requiredSkills: { writing: 1.0 } });

  const result = await call('POST', `/requirements/${reqId}/decompose`, { tasks });
  console.log(`[规划师] 已分解为 ${result.count} 个任务`);
}

// ===== 执行者: 处理新任务 =====
async function handleNewTask(event) {
  const taskId = event.target_id;
  const task = await call('GET', `/tasks/${taskId}`);
  console.log(`[执行者] 发现新任务: ${task.title}`);

  // 检查技能匹配
  const matches = await call('GET', `/agents/${AGENT_ID}/match-tasks`);
  const match = matches.find(m => m.taskId === taskId);
  if (match && match.score > 2) {
    // 认领高匹配任务
    const result = await call('POST', `/tasks/${taskId}/claim`, { agentId: AGENT_ID });
    if (!result.error) {
      console.log(`[执行者] 认领了任务: ${task.title} (匹配度: ${match.score})`);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== 主循环 =====
async function main() {
  console.log(`[Worker] 智能体 ${AGENT_ID} 启动`);
  const { agent, subscriptions } = await getAgentInfo();
  console.log(`[Worker] 角色: ${JSON.parse(agent.roles || '[]')}, 订阅: ${subscriptions.join(', ')}`);

  while (true) {
    try {
      const events = await pollEvents(subscriptions);
      for (const event of events) {
        if (event.type === 'requirement.created' && subscriptions.includes('requirement.created')) {
          await handleNewRequirement(event);
        } else if (event.type === 'requirement.approved' && subscriptions.includes('requirement.approved')) {
          await handleRequirementApproved(event);
        } else if (event.type === 'task.created' && subscriptions.includes('task.created')) {
          await handleNewTask(event);
        }
      }
    } catch (e) {
      console.error(`[Worker] 错误: ${e.message}`);
    }
    await sleep(POLL_INTERVAL);
  }
}

main().catch(e => { console.error('[Worker] 致命错误:', e.message); process.exit(1); });
