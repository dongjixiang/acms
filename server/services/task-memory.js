// ACMS TaskMemory — 结构化短期工作记忆（v0.X）
//
// 设计层级（从易失到持久）：
//   L0: Prompt Context（当前 LLM 窗口）
//   L1: Execution Log（扁平 time-series）
//   L2: TaskMemory（NEW — 结构化按需持久化）← 在此
//   L3: Workspace Memory（跨任务文件热度）
//   L4: Skill / Knowledge Base（不变知识）
//
// 解决的核心问题：
//   - Context Attrition：90 轮长任务到后半段忘掉前半段的发现和决策
//   - 重启失忆：服务重启后从头探索，重复写文件
//   - 审计上下文缺失：PM 只能看扁平 log，看不出决策链路
//
// 结构（存入 task.doc.task_memory）：
//   {
//     phase: 'explore'|'design'|'implement'|'test'|'fix'|'done',
//     goals: { current: '', completed: [], pending: [] },
//     explored: { files: [{path, purpose}], key_findings: [] },
//     decisions: [{what, why}],
//     files_written: [{path, status, at_round}],
//     errors: [{what, fix}],
//     updated_at: 'ISO'
//   }
//
// 更新方式：
//   - PostToolUse hook 自动跟踪：读文件、写文件、阶段变更
//   - 目标/决策由 LLM 通过 agent_set_phase 间接表达
//   - 手工补录：PM 可以调 API 手动写

const taskStore = require('../stores/task-store');

const VALID_PHASES = ['explore', 'design', 'implement', 'test', 'fix', 'done'];

function _getOrDefault(taskId) {
  const task = taskStore.getById(taskId);
  if (!task) return null;
  try {
    const raw = typeof task.task_memory === 'string' ? JSON.parse(task.task_memory) : (task.task_memory || {});
    return {
      phase: 'explore',
      goals: { current: '', completed: [], pending: [] },
      explored: { files: [], key_findings: [] },
      decisions: [],
      files_written: [],
      errors: [],
      updated_at: new Date().toISOString(),
      ...raw,
    };
  } catch {
    return null;
  }
}

function _save(taskId, mem, rawTask) {
  taskStore.update(taskId, { task_memory: JSON.stringify(mem) });
}

// === 公开 API ===

/**
 * 获取 taskId 的 TaskMemory，不存在则初始化为默认值
 */
function get(taskId) {
  return _getOrDefault(taskId);
}

/**
 * 设置执行阶段
 */
function setPhase(taskId, phase) {
  if (!VALID_PHASES.includes(phase)) {
    console.warn(`[TaskMemory] 未知阶段: ${phase}，忽略`);
    return;
  }
  const mem = _getOrDefault(taskId);
  if (!mem) return;
  mem.phase = phase;
  _save(taskId, mem);
}

/**
 * 记录文件被读取（agent_read_file / agent_read_files）
 */
function trackFileRead(taskId, path, purpose) {
  if (!path) return;
  const mem = _getOrDefault(taskId);
  if (!mem) return;
  if (!mem.explored.files.find(f => f.path === path)) {
    mem.explored.files.push({ path, purpose: (purpose || '').substring(0, 120) });
    _save(taskId, mem);
  }
}

/**
 * 记录关键发现（从 LLM 分析中提取）
 */
function addFinding(taskId, finding) {
  if (!finding) return;
  const mem = _getOrDefault(taskId);
  if (!mem) return;
  if (!mem.explored.key_findings.includes(finding)) {
    mem.explored.key_findings.push(finding);
    // 最多保留 10 条防膨胀
    if (mem.explored.key_findings.length > 10) {
      mem.explored.key_findings = mem.explored.key_findings.slice(-10);
    }
    _save(taskId, mem);
  }
}

/**
 * 记录方案决策
 */
function addDecision(taskId, what, why) {
  if (!what) return;
  const mem = _getOrDefault(taskId);
  if (!mem) return;
  if (!mem.decisions.find(d => d.what === what)) {
    mem.decisions.push({ what: what.substring(0, 200), why: (why || '').substring(0, 300) });
    _save(taskId, mem);
  }
}

/**
 * 记录文件被写入（agent_write_file / agent_patch_file / agent_multi_patch）
 */
function trackFileWritten(taskId, path, status, round) {
  if (!path) return;
  const mem = _getOrDefault(taskId);
  if (!mem) return;
  const existing = mem.files_written.find(f => f.path === path);
  if (existing) {
    existing.status = status || 'done';
    if (round !== undefined) existing.at_round = round;
  } else {
    mem.files_written.push({
      path,
      status: status || 'done',
      at_round: round !== undefined ? round : -1,
    });
  }
  _save(taskId, mem);
}

/**
 * 记录执行中遇到的错误和修复
 */
function addError(taskId, what, fix) {
  if (!what) return;
  const mem = _getOrDefault(taskId);
  if (!mem) return;
  mem.errors.push({
    what: what.substring(0, 200),
    fix: (fix || '').substring(0, 300),
  });
  // 最多保留 20 条
  if (mem.errors.length > 20) {
    mem.errors = mem.errors.slice(-20);
  }
  _save(taskId, mem);
}

/**
 * 压缩为 prompt 注入文本（~500-800 tokens）
 * 返回 markdown 字符串，或 null（无内容时跳过注入）
 */
function compressToPrompt(taskId) {
  const mem = _getOrDefault(taskId);
  if (!mem) return null;

  // 判断是否真的有内容
  const hasContent = mem.goals.current ||
    mem.goals.completed.length ||
    mem.goals.pending.length ||
    mem.decisions.length ||
    mem.explored.files.some(f => f.purpose) ||
    mem.explored.key_findings.length ||
    mem.files_written.length;
  if (!hasContent) return null;

  const lines = [];

  // 阶段
  lines.push(`= 执行阶段: ${mem.phase}`);

  // 当前目标
  if (mem.goals.current) {
    lines.push(`= 当前目标: ${mem.goals.current}`);
  }

  // 已完成 / 待完成
  if (mem.goals.completed.length) {
    lines.push(`= 已完成目标: ${mem.goals.completed.join(', ')}`);
  }
  if (mem.goals.pending.length) {
    lines.push(`= 待完成目标: ${mem.goals.pending.join(', ')}`);
  }

  // 已了解的文件（只列有 purpose 的，防 noise）
  const knownFiles = mem.explored.files.filter(f => f.purpose);
  if (knownFiles.length) {
    lines.push(`= 已了解的关键文件: ${knownFiles.map(f => `${f.path}（${f.purpose}）`).join('; ')}`);
  }

  // 关键发现
  if (mem.explored.key_findings.length) {
    lines.push(`= 关键发现: ${mem.explored.key_findings.join('; ')}`);
  }

  // 已定方案
  if (mem.decisions.length) {
    lines.push(`= 已定方案: ${mem.decisions.map(d => `${d.what}（原因: ${d.why}）`).join('; ')}`);
  }

  // 已创建文件
  const doneFiles = mem.files_written.filter(f => f.status === 'done');
  const wipFiles = mem.files_written.filter(f => f.status === 'in_progress');
  if (doneFiles.length) {
    lines.push(`= 已创建文件: ${doneFiles.map(f => f.path).join(', ')}`);
  }
  if (wipFiles.length) {
    lines.push(`= 正在写的文件: ${wipFiles.map(f => f.path).join(', ')}`);
  }

  // 已修复问题（最近 3 条）
  if (mem.errors.length) {
    const recent = mem.errors.slice(-3);
    lines.push(`= 已修复问题: ${recent.map(e => `${e.what} → ${e.fix}`).join('; ')}`);
  }

  // 如果只有一行（只有 phase），不注入
  if (lines.length <= 1) return null;

  return `# 🧠 任务记忆（跨轮 context 保护）\n\n` +
    `以下是本轮之前已经完成的工作摘要，帮助你不要重复探索或重新做决定：\n\n` +
    lines.join('\n') + `\n\n` +
    `以上是已有进展。继续当前目标，不要重复已经完成的工作。`;
}

module.exports = {
  get,
  setPhase,
  trackFileRead,
  addFinding,
  addDecision,
  trackFileWritten,
  addError,
  compressToPrompt,
};
