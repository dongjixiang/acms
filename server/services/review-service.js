// 审核服务 — Reviewer Agent 核心逻辑 v2
// Phase 1: 契约核查 | Phase 2: 代码质量扫描(12项) | Phase 3: 验收执行 | Phase 4: 四层报告
//
// ACMS Skills 关联:
//   skill-code-review  → 4-phase 审查总流程
//   skill-review-contract  → Phase 1 契约核查
//   skill-review-security  → Phase 2 安全扫描
//   skill-review-acceptance → Phase 3 验收执行
//
// 增强来源 (Hermes skills):
//   requesting-code-review → 安全扫描模式 + 自审清单
//   github-code-review → 审查维度 + Critical/Warnings/Suggestions 输出格式
//   codebase-inspection → pygount LOC 度量

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// Phase 1: 契约核查
// ═══════════════════════════════════════════════════════════

async function verifyContracts(task, workspace, projectSlug) {
  const dependsContract = JSON.parse(task.depends_contract || '[]');
  const results = [];
  let passed = true;

  if (dependsContract.length === 0) {
    return { passed: true, checked: 0, results: [{ contract: '无前置契约', status: 'skipped', note: '任务无 depends_contract，跳过契约核查' }] };
  }

  for (const dc of dependsContract) {
    const filePath = dc.file;
    const contract = dc.contract || '';

    try {
      const fileList = workspace.listFiles(projectSlug);
      const filePaths = fileList.map(f => f.path || f.name || '');
      const exists = filePaths.some(fp => fp.includes(filePath) || filePath.includes(fp));

      if (!exists) {
        passed = false;
        results.push({ contract, file: filePath, status: 'missing', tier: 'critical', note: `产出文件 ${filePath} 不存在` });
        continue;
      }

      const fileContent = workspace.readFile(projectSlug, filePath);
      if (!fileContent || fileContent.trim().length === 0) {
        passed = false;
        results.push({ contract, file: filePath, status: 'empty', tier: 'critical', note: '文件为空' });
        continue;
      }

      const exportNames = extractExportedNames(fileContent);
      const contractKeywords = extractKeywords(contract);
      const found = [];
      const missing = [];
      for (const kw of contractKeywords) {
        if (exportNames.some(name => name.toLowerCase().includes(kw.toLowerCase()))) {
          found.push(kw);
        } else {
          missing.push(kw);
        }
      }

      if (missing.length > 0) {
        passed = false;
        results.push({
          contract, file: filePath, status: 'partial', tier: 'critical',
          found, missing, exports: exportNames.slice(0, 10),
          note: `缺少承诺的导出: ${missing.join(', ')}`
        });
      } else {
        results.push({
          contract, file: filePath, status: 'found', tier: 'passed',
          matched: found, exports: exportNames.slice(0, 10),
          note: '契约兑现'
        });
      }
    } catch (e) {
      passed = false;
      results.push({ contract, file: filePath, status: 'error', tier: 'critical', note: `读取失败: ${e.message}` });
    }
  }

  return { passed, checked: dependsContract.length, results };
}

// ═══════════════════════════════════════════════════════════
// Phase 2: 代码质量扫描（12项，分层输出）
// ═══════════════════════════════════════════════════════════

async function scanCodeQuality(workspace, projectSlug, description) {
  let fileList;
  try {
    fileList = workspace.listFiles(projectSlug);
  } catch (e) {
    fileList = [];
  }
  const filePaths = fileList.map(f => f.path || f.name || '');

  // 读取所有文本文件内容（只读文本类文件）
  const fileContents = {};
  for (const fp of filePaths) {
    const ext = path.extname(fp).toLowerCase();
    if (['.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.json', '.md', '.py', '.yaml', '.yml', '.env', '.sh'].includes(ext)) {
      try {
        fileContents[fp] = workspace.readFile(projectSlug, fp) || '';
      } catch (e) { /* skip */ }
    }
  }

  const scan = { critical: [], warnings: [], suggestions: [], passed: [] };

  // ── 🔴 安全扫描 (3项) ──
  scanSecurity(fileContents, scan);

  // ── 🟡 代码卫生 (4项) ──
  scanHygiene(fileContents, scan);

  // ── 🟢 结构检查 (3项) ──
  await scanStructure(workspace, projectSlug, filePaths, fileContents, description, scan);

  // ── 📊 度量检查 (2项) ──
  scanMetrics(filePaths, fileContents, description, scan);

  const hasBlocking = scan.critical.length > 0;
  return {
    passed: !hasBlocking,
    hasWarnings: scan.warnings.length > 0,
    hasSuggestions: scan.suggestions.length > 0,
    ...scan,
  };
}

// ─── 🔴 安全扫描 ───

function scanSecurity(fileContents, scan) {
  const secretPatterns = [
    { name: '硬编码密钥', regex: /(api[_-]?key|apiKey|secret|password|passwd|token|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/gi, tier: 'critical' },
    { name: 'AWS 凭证', regex: /(AKIA[0-9A-Z]{16}|aws_access_key_id|aws_secret_access_key)/gi, tier: 'critical' },
    { name: '内网地址硬编码', regex: /(10\.\d{1,3}|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}/gi, tier: 'warnings' },
  ];

  const dangerousPatterns = [
    { name: 'eval() 调用', regex: /\beval\s*\(/g, tier: 'critical' },
    { name: 'exec() 调用', regex: /\bexec\s*\(/g, tier: 'critical' },
    { name: 'Function() 构造器', regex: /\bnew\s+Function\s*\(/g, tier: 'critical' },
    { name: 'child_process exec', regex: /(exec|execSync|spawn)\s*\(/g, tier: 'warnings' },
  ];

  const injectionPatterns = [
    { name: '可疑 SQL 拼接', regex: /(execute|query)\s*\(\s*[`'"].*\$(\{|[a-zA-Z])/gi, tier: 'critical' },
    { name: 'innerHTML 赋值', regex: /\.innerHTML\s*=\s*(?!['"]\s*['"]\s*;)/g, tier: 'warnings' },
  ];

  for (const [fp, content] of Object.entries(fileContents)) {
    for (const p of secretPatterns) {
      const matches = [...content.matchAll(p.regex)];
      for (const m of matches) {
        const line = getLineNumber(content, m.index);
        scan[p.tier].push({ type: 'security', subtype: p.name, file: fp, line, detail: `发现敏感信息: ${p.name}` });
      }
    }
    for (const p of dangerousPatterns) {
      const matches = [...content.matchAll(p.regex)];
      for (const m of matches) {
        const line = getLineNumber(content, m.index);
        scan[p.tier].push({ type: 'security', subtype: p.name, file: fp, line, detail: `危险函数调用: ${m[0].substring(0, 40)}` });
      }
    }
    for (const p of injectionPatterns) {
      const matches = [...content.matchAll(p.regex)];
      for (const m of matches) {
        const line = getLineNumber(content, m.index);
        scan[p.tier].push({ type: 'security', subtype: p.name, file: fp, line, detail: `可能的注入风险: ${m[0].substring(0, 60)}` });
      }
    }
  }
}

// ─── 🟡 代码卫生 ───

function scanHygiene(fileContents, scan) {
  for (const [fp, content] of Object.entries(fileContents)) {
    // debugger 残留
    for (const m of content.matchAll(/\bdebugger\b/g)) {
      scan.warnings.push({ type: 'hygiene', subtype: 'debugger', file: fp, line: getLineNumber(content, m.index), detail: 'debugger 语句残留，生产代码应移除' });
    }
    // console.log 残留（排除合理的 console.error/warn）
    for (const m of content.matchAll(/console\.(log|debug|dir|trace)\s*\(/g)) {
      scan.suggestions.push({ type: 'hygiene', subtype: 'console_log', file: fp, line: getLineNumber(content, m.index), detail: `console.${m[1]} 残留，考虑移除或改用日志框架` });
    }
    // TODO/FIXME/HACK/XXX
    for (const m of content.matchAll(/\b(TODO|FIXME|HACK|XXX)\b/g)) {
      scan.suggestions.push({ type: 'hygiene', subtype: 'todo', file: fp, line: getLineNumber(content, m.index), detail: `${m[0]} 标记: ${getContextLine(content, m.index)}` });
    }
    // 合并冲突标记
    for (const m of content.matchAll(/^(<<<<<<<|>>>>>>>|=======)/gm)) {
      scan.critical.push({ type: 'hygiene', subtype: 'merge_conflict', file: fp, line: getLineNumber(content, m.index), detail: '未解决的合并冲突标记' });
    }
    // 大段被注释的代码（连续 5 行以上以 // 开头的非空行）
    const commentedBlocks = detectCommentedCode(content);
    for (const cb of commentedBlocks) {
      scan.suggestions.push({ type: 'hygiene', subtype: 'commented_code', file: fp, line: cb.line, detail: `被注释的代码块 (${cb.lines} 行)，建议删除或用版本控制回溯` });
    }
  }
}

// ─── 🟢 结构检查 ───
// 使用多语言 linter-service 替换 node --check
async function scanStructure(workspace, projectSlug, filePaths, fileContents, description, scan) {
  const linterService = require('./linter-service');
  const workspacePath = workspace.getPath(projectSlug);

  // 按文件扩展名分类 lint
  for (const fp of filePaths) {
    const ext = path.extname(fp).toLowerCase();
    const config = linterService.LINTER_CONFIG[ext];
    if (!config || !config.cmd) continue;

    try {
      const result = await linterService.lintFile(fp, workspacePath);
      
      // 按严重度分发到 scan 的各层
      const errorCount = result.issues.filter(i => i.severity === 'error').length;
      const warnCount = result.issues.filter(i => i.severity === 'warning').length;
      const suggCount = result.issues.filter(i => i.severity === 'suggestion').length;

      if (result.passed && result.issues.length === 0) {
        scan.passed.push({ type: 'structure', subtype: 'lint_ok', file: fp, tool: result.tool, detail: `${result.tool} 检查通过` });
      } else if (result.issues.length === 0 && result.note) {
        // 工具不可用 (如 cppcheck 未安装)
        scan.warnings.push({ type: 'structure', subtype: 'lint_skipped', file: fp, tool: result.tool, detail: result.note });
      } else {
        for (const issue of result.issues) {
          const entry = {
            type: 'structure', subtype: `lint_${result.tool}`,
            file: issue.file || fp, line: issue.line, rule: issue.rule || '',
            detail: issue.message,
          };
          if (issue.severity === 'error') scan.critical.push(entry);
          else if (issue.severity === 'warning') scan.warnings.push(entry);
          else scan.suggestions.push(entry);
        }
        if (errorCount === 0 && warnCount === 0) {
          scan.passed.push({ type: 'structure', subtype: 'lint_ok', file: fp, tool: result.tool, detail: `${result.tool}: ${suggCount} 建议` });
        }
      }
    } catch (e) {
      scan.warnings.push({ type: 'structure', subtype: 'lint_error', file: fp, detail: `Lint 异常: ${e.message}` });
    }
  }

  // 未匹配到 linter 的文件 — 保持原有 node --check 作为兜底
  const lintedFiles = new Set();
  for (const fp of filePaths) {
    const ext = path.extname(fp).toLowerCase();
    if (linterService.LINTER_CONFIG[ext]?.cmd) lintedFiles.add(fp);
  }
  const unlintedJS = filePaths.filter(f => /\.(js|ts)$/i.test(f) && !lintedFiles.has(f));
  for (const f of unlintedJS) {
    try {
      const result = await workspace.exec(projectSlug, { cwd: '.', cmd: `node --check "${f}" 2>&1`, timeout: 10000 });
      if (result.exitCode !== 0) {
        scan.critical.push({ type: 'structure', subtype: 'syntax_error', file: f, detail: (result.stderr || result.stdout || '').substring(0, 200) });
      } else {
        scan.passed.push({ type: 'structure', subtype: 'syntax_ok', file: f, detail: '语法检查通过' });
      }
    } catch (e) {
      scan.warnings.push({ type: 'structure', subtype: 'syntax_check_failed', file: f, detail: e.message });
    }
  }

  // 文件大小约束
  const sizeConstraints = extractSizeConstraints(description);
  for (const sc of sizeConstraints) {
    const matchFile = filePaths.find(f => f.includes(sc.filePattern));
    if (matchFile && fileContents[matchFile]) {
      const actualBytes = Buffer.byteLength(fileContents[matchFile], 'utf-8');
      if (actualBytes > sc.maxBytes) {
        scan.warnings.push({ type: 'structure', subtype: 'size_exceeded', file: matchFile, detail: `文件 ${Math.round(actualBytes/1024)}KB 超过约束 ${Math.round(sc.maxBytes/1024)}KB` });
      } else {
        scan.passed.push({ type: 'structure', subtype: 'size_ok', file: matchFile, detail: `${Math.round(actualBytes/1024)}KB (约束 ${Math.round(sc.maxBytes/1024)}KB)` });
      }
    }
  }

  // 交付物完整性
  const outputFiles = extractOutputFiles(description);
  for (const of of outputFiles.filter(f => f.op === 'create')) {
    const found = filePaths.some(fl => fl.includes(of.path) || of.path.includes(fl));
    if (!found) {
      scan.critical.push({ type: 'structure', subtype: 'missing_deliverable', file: of.path, detail: '要求的产出文件未创建' });
    } else {
      scan.passed.push({ type: 'structure', subtype: 'deliverable_found', file: of.path, detail: '产出文件已创建' });
    }
  }
}

// ─── 📊 度量检查 ───

function scanMetrics(filePaths, fileContents, description, scan) {
  // LOC 总量检查（从验收条件中提取行数约束）
  const locConstraints = extractLocConstraints(description);
  for (const lc of locConstraints) {
    let totalLines = 0;
    for (const [fp, content] of Object.entries(fileContents)) {
      if (fp.includes(lc.filePattern)) {
        totalLines += content.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('#')).length;
      }
    }
    if (lc.minLines && totalLines < lc.minLines) {
      scan.warnings.push({ type: 'metrics', subtype: 'loc_below_min', file: lc.filePattern, detail: `有效代码 ${totalLines} 行，低于最低要求 ${lc.minLines} 行` });
    }
    if (lc.maxLines && totalLines > lc.maxLines) {
      scan.suggestions.push({ type: 'metrics', subtype: 'loc_above_max', file: lc.filePattern, detail: `有效代码 ${totalLines} 行，超过建议上限 ${lc.maxLines} 行` });
    }
    scan.passed.push({ type: 'metrics', subtype: 'loc_count', file: lc.filePattern, detail: `有效代码 ${totalLines} 行` });
  }

  // 注释/代码比例
  for (const [fp, content] of Object.entries(fileContents)) {
    const ext = path.extname(fp).toLowerCase();
    if (!['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs'].includes(ext)) continue;
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 20) continue; // 小文件跳过
    const commentLines = lines.filter(l => /^\s*(\/\/|#|\/\*|\*|""")/.test(l.trim())).length;
    const commentRatio = commentLines / lines.length;
    if (commentRatio < 0.05) {
      scan.suggestions.push({ type: 'metrics', subtype: 'low_comments', file: fp, detail: `注释率 ${(commentRatio*100).toFixed(0)}%，建议 ≥ 5%` });
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Phase 3: 验收命令执行
// ═══════════════════════════════════════════════════════════

async function runAcceptance(workspace, projectSlug, commands) {
  const results = [];
  let passed = true;

  if (commands.length === 0) {
    return { passed: true, results: [{ cmd: '(none)', status: 'skipped', note: '无可自动执行的验收命令' }] };
  }

  for (const cmd of commands) {
    try {
      const result = await workspace.exec(projectSlug, { cwd: '.', cmd, timeout: 120000 });
      const ok = result.exitCode === 0;
      results.push({
        cmd, exitCode: result.exitCode, status: ok ? 'passed' : 'failed',
        output: (result.stdout || '').substring(0, 500),
        stderr: (result.stderr || '').substring(0, 200),
      });
      if (!ok) passed = false;
    } catch (e) {
      passed = false;
      results.push({ cmd, status: 'error', output: e.message });
    }
  }

  return { passed, results };
}

// ═══════════════════════════════════════════════════════════
// Phase 4: 四层结构化报告
// ═══════════════════════════════════════════════════════════

function generateReport(phases, reviewerId) {
  const scores = computeScores(phases);
  const hasBlocking = scores.critical > 0;
  const hasUnverifiable = phases.acceptance.results?.some(r => r.status === 'skipped');

  return {
    verdict: hasBlocking ? 'rejected' : 'approved',
    reviewerId,
    reviewedAt: new Date().toISOString(),
    requiresHumanReview: hasUnverifiable && !hasBlocking,
    skillsUsed: [
      { id: 'skill-code-review', role: '审查总流程' },
      { id: 'skill-review-contract', role: 'Phase 1 契约核查' },
      { id: 'skill-review-security', role: 'Phase 2 安全扫描' },
      { id: 'skill-review-acceptance', role: 'Phase 3 验收执行' },
      { id: 'skill-lint-javascript', role: 'JS/TS 检查' },
      { id: 'skill-lint-vue', role: 'Vue 检查' },
      { id: 'skill-lint-python', role: 'Python 检查' },
      { id: 'skill-lint-css', role: 'CSS 检查' },
      { id: 'skill-lint-html', role: 'HTML 检查' },
      { id: 'skill-lint-markdown', role: 'Markdown 检查' },
      { id: 'skill-lint-json', role: 'JSON 检查' },
      { id: 'skill-lint-java', role: 'Java 检查' },
    ],
    scores: {
      critical: scores.critical,
      warnings: scores.warnings,
      suggestions: scores.suggestions,
      passed: scores.passed,
    },
    phases: {
      contract: phases.contract,
      quality: {
        passed: phases.quality.passed,
        hasWarnings: phases.quality.hasWarnings,
        hasSuggestions: phases.quality.hasSuggestions,
        critical: phases.quality.critical || [],
        warnings: phases.quality.warnings || [],
        suggestions: phases.quality.suggestions || [],
        passed: phases.quality.passed || [],
      },
      acceptance: phases.acceptance,
    },
    summary: buildSummary(phases, scores, hasUnverifiable),
    details: buildDetails(phases),
    checklist: buildChecklist(phases, scores),
  };
}

function computeScores(phases) {
  let critical = 0, warnings = 0, suggestions = 0, passCount = 0;

  // 契约未通过 → critical
  if (!phases.contract.passed) critical += phases.contract.results?.filter(r => r.status !== 'skipped' && r.status !== 'found').length || 0;

  // 质量扫描分等级
  critical += (phases.quality.critical || []).length;
  warnings += (phases.quality.warnings || []).length;
  suggestions += (phases.quality.suggestions || []).length;
  passCount += (phases.quality.passed || []).length;

  // 验收失败 → critical
  if (!phases.acceptance.passed) {
    critical += phases.acceptance.results?.filter(r => r.status === 'failed' || r.status === 'error').length || 0;
  }
  passCount += phases.acceptance.results?.filter(r => r.status === 'passed').length || 0;

  return { critical, warnings, suggestions, passed: passCount };
}

function buildSummary(phases, scores, hasUnverifiable) {
  const parts = [];
  parts.push(`契约: ${phases.contract.passed ? '✅' : '❌'} ${phases.contract.checked}项`);
  parts.push(`质量: ${scores.critical > 0 ? '❌' : '✅'} 🔴${scores.critical} 🟡${scores.warnings} 💡${scores.suggestions} ✅${scores.passed}`);
  const acceptCount = phases.acceptance.results?.filter(r => r.status !== 'skipped').length || 0;
  const passCount = phases.acceptance.results?.filter(r => r.status === 'passed').length || 0;
  parts.push(`验收: ${phases.acceptance.passed ? '✅' : '❌'} ${passCount}/${acceptCount}通过`);
  if (hasUnverifiable) parts.push('⚠️ 含不可自动验证项');
  return parts.join(' | ');
}

function buildDetails(phases) {
  const lines = [];

  lines.push('## 🔴 Critical');
  let hasCritical = false;

  // 契约失败
  if (phases.contract.results?.length) {
    for (const r of phases.contract.results) {
      if (r.status !== 'found' && r.status !== 'skipped') {
        hasCritical = true;
        lines.push(`- ❌ **契约**: ${r.file || ''} — ${r.note}`);
      }
    }
  }

  // 质量 Critical
  for (const i of (phases.quality.critical || [])) {
    hasCritical = true;
    lines.push(`- ❌ **[${i.subtype}]** ${i.file}${i.line ? ':' + i.line : ''} — ${i.detail}`);
  }

  // 验收失败
  for (const r of (phases.acceptance.results || [])) {
    if (r.status === 'failed' || r.status === 'error') {
      hasCritical = true;
      lines.push(`- ❌ **验收**: \`${r.cmd}\` exit=${r.exitCode ?? 'N/A'}`);
    }
  }

  if (!hasCritical) lines.push('- 无严重问题');

  // Warnings
  lines.push('\n## 🟡 Warnings');
  let hasWarnings = false;
  for (const i of (phases.quality.warnings || [])) {
    hasWarnings = true;
    lines.push(`- ⚠️ **[${i.subtype}]** ${i.file}${i.line ? ':' + i.line : ''} — ${i.detail}`);
  }
  if (!hasWarnings) lines.push('- 无警告');

  // Suggestions
  lines.push('\n## 💡 Suggestions');
  let hasSuggestions = false;
  for (const i of (phases.quality.suggestions || [])) {
    hasSuggestions = true;
    lines.push(`- 💡 **[${i.subtype}]** ${i.file}${i.line ? ':' + i.line : ''} — ${i.detail}`);
  }
  if (!hasSuggestions) lines.push('- 无建议');

  // Passed
  lines.push('\n## ✅ Passed');
  let hasPassed = false;
  if (phases.contract.results?.length) {
    for (const r of phases.contract.results) {
      if (r.status === 'found') { hasPassed = true; lines.push(`- ✅ 契约: ${r.file} — ${r.note}`); }
    }
  }
  for (const i of (phases.quality.passed || [])) {
    hasPassed = true;
    lines.push(`- ✅ **[${i.subtype}]** ${i.file} — ${i.detail}`);
  }
  for (const r of (phases.acceptance.results || [])) {
    if (r.status === 'passed') { hasPassed = true; lines.push(`- ✅ \`${r.cmd}\` exit=0`); }
  }
  if (!hasPassed) lines.push('- 无通过项');

  return lines.join('\n');
}

function buildChecklist(phases, scores) {
  const items = [];

  // Security
  const secCritical = (phases.quality.critical || []).filter(i => i.type === 'security').length;
  const secWarnings = (phases.quality.warnings || []).filter(i => i.type === 'security').length;
  items.push({
    category: '🔐 安全', status: secCritical > 0 ? 'fail' : secWarnings > 0 ? 'warn' : 'pass',
    detail: secCritical > 0 ? `${secCritical} 个严重问题` : secWarnings > 0 ? `${secWarnings} 个潜在风险` : '未发现安全漏洞'
  });

  // Contract
  items.push({
    category: '📋 契约', status: phases.contract.passed ? 'pass' : 'fail',
    detail: phases.contract.passed ? `${phases.contract.checked} 项全部兑现` : '契约未兑现'
  });

  // Acceptance
  const acceptFail = phases.acceptance.results?.filter(r => r.status !== 'passed' && r.status !== 'skipped').length || 0;
  items.push({
    category: '🧪 验收', status: phases.acceptance.passed ? 'pass' : 'fail',
    detail: acceptFail > 0 ? `${acceptFail} 项失败` : '全部通过'
  });

  // Code Quality
  items.push({
    category: '🧹 卫生', status: scores.warnings > 3 ? 'warn' : 'pass',
    detail: `debugger:${(phases.quality.warnings||[]).filter(i=>i.subtype==='debugger').length} console:${(phases.quality.suggestions||[]).filter(i=>i.subtype==='console_log').length} TODO:${(phases.quality.suggestions||[]).filter(i=>i.subtype==='todo').length}`
  });

  // Structure
  const syntaxErrors = (phases.quality.critical || []).filter(i => i.subtype === 'syntax_error').length;
  items.push({
    category: '🏗️ 结构', status: syntaxErrors > 0 ? 'fail' : 'pass',
    detail: syntaxErrors > 0 ? `${syntaxErrors} 个语法错误` : '结构完整'
  });

  // Metrics
  const locItems = (phases.quality.passed || []).filter(i => i.type === 'metrics');
  items.push({
    category: '📊 度量', status: 'pass',
    detail: locItems.length > 0 ? locItems.map(i => i.detail).join('; ') : '无度量约束'
  });

  return items;
}

// ═══════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════

function extractExportedNames(code) {
  const names = [];
  for (const m of code.matchAll(/export\s+(?:default\s+)?(?:function|class|const|let|var|async\s+function)\s+(\w+)/g)) {
    names.push(m[1]);
  }
  const cjsMatch = code.match(/module\.exports\s*=\s*\{([^}]+)\}/);
  if (cjsMatch) {
    for (const m of cjsMatch[1].matchAll(/(\w+)/g)) {
      if (!['require', 'module', 'exports'].includes(m[1])) names.push(m[1]);
    }
  }
  for (const m of code.matchAll(/module\.exports\.(\w+)/g)) { names.push(m[1]); }
  for (const m of code.matchAll(/exports\.(\w+)/g)) { names.push(m[1]); }
  return [...new Set(names)];
}

function extractKeywords(contract) {
  const identifiers = contract.match(/\b([A-Z][a-z]+(?=[A-Z])|[a-z]+[A-Z]|[A-Z][a-zA-Z]*|[a-z]+)\b/g) || [];
  const stopWords = new Set([
    'the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did',
    'will','would','could','should','may','might','can','shall','to','of','in','for','on','with','at',
    'by','from','as','into','through','during','before','after','above','below','between','under',
    'and','but','or','nor','not','so','yet','both','either','neither','each','every','all','any',
    'few','more','most','other','some','such','no','only','own','same','than','too','very','just',
    'that','this','these','those','it','its','需要','必须','包含','导出','字段','接口','文件','类','函数',
    '对象','数组','字符串','数字','js','ts','jsx','tsx','json','css','html','md','py','go','rs','java',
  ]);
  return [...new Set(identifiers.filter(id => id.length > 1 && !stopWords.has(id.toLowerCase()) && !/^\d+$/.test(id)))];
}

function extractSizeConstraints(description) {
  const constraints = [];
  for (const m of description.matchAll(/(\S+\.\w{2,4})\s*(?:文件大小|大小)\s*[≤<=]\s*(\d+)\s*(KB|MB|kb|mb|字节)/gi)) {
    let maxBytes = parseInt(m[2]);
    const unit = m[3].toUpperCase();
    if (unit === 'KB') maxBytes *= 1024;
    if (unit === 'MB') maxBytes *= 1024 * 1024;
    constraints.push({ filePattern: m[1], maxBytes });
  }
  return constraints;
}

function extractLocConstraints(description) {
  const constraints = [];
  for (const m of description.matchAll(/(\S+\.\w{2,4})\s*(?:有效代码|代码行数|LOC|行数)\s*[≥>]\s*(\d+)/gi)) {
    constraints.push({ filePattern: m[1], minLines: parseInt(m[2]) });
  }
  for (const m of description.matchAll(/(\S+\.\w{2,4})\s*(?:有效代码|代码行数|LOC|行数)\s*[≤<]\s*(\d+)/gi)) {
    constraints.push({ filePattern: m[1], maxLines: parseInt(m[2]) });
  }
  return constraints;
}

function extractOutputFiles(description) {
  const files = [];
  const sectionMatch = description.match(/##\s*涉及文件([\s\S]*?)(?=\n##\s|$)/i);
  if (!sectionMatch) return files;
  for (const line of sectionMatch[1].split('\n')) {
    const match = line.match(/[-*]\s+(.+?)\s*[\(（](新建|创建|修改|只读|读取)[\)）]/);
    if (match) {
      files.push({ path: match[1].trim(), op: /新建|创建/.test(match[2]) ? 'create' : /修改/.test(match[2]) ? 'modify' : 'read' });
    }
  }
  return files;
}

function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

function getContextLine(content, index) {
  const lines = content.split('\n');
  const lineNum = getLineNumber(content, index) - 1;
  return (lines[lineNum] || '').trim().substring(0, 80);
}

function detectCommentedCode(content) {
  const blocks = [];
  const lines = content.split('\n');
  let inBlock = false, blockStart = 0, blockCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const isCommented = trimmed.startsWith('//') || trimmed.startsWith('#');
    if (isCommented && /[{}=;()[\]<>]/.test(trimmed)) {
      if (!inBlock) { inBlock = true; blockStart = i + 1; blockCount = 1; }
      else { blockCount++; }
    } else {
      if (inBlock && blockCount >= 5) {
        blocks.push({ line: blockStart, lines: blockCount });
      }
      inBlock = false; blockCount = 0;
    }
  }
  if (inBlock && blockCount >= 5) blocks.push({ line: blockStart, lines: blockCount });
  return blocks;
}

module.exports = {
  verifyContracts,
  scanCodeQuality,
  runAcceptance,
  generateReport,
  // 子模块导出（用于单独测试）
  scanSecurity,
  scanHygiene,
  scanStructure,
  scanMetrics,
  // 工具函数
  extractExportedNames,
  extractKeywords,
  extractSizeConstraints,
  extractOutputFiles,
  detectCommentedCode,
};
