// ===== 架构宪法展示（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L168-277，110 行）
// 跨文件依赖：api / escHtml / toast / showConfirm / safeParse（全局）
//              openRequirement（主文件，script 顺序保证已加载）

function renderArchSpec(req) {
  const archSpec = safeParse(req.arch_spec);
  const childIds = safeParse(req.child_ids || '[]');
  const hasArch = archSpec && (archSpec.domain || archSpec.technical || archSpec.contracts || archSpec.decisions);
  if (!hasArch && childIds.length === 0) return '';

  const s = [];
  s.push('<div class="arch-spec-panel" style="margin-top:16px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:8px">');
  s.push('<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">');
  s.push('<h3 style="margin:0">🏛️ 架构宪法</h3>');
  s.push(`<button class="btn-small" onclick="toggleArchSpecEdit('${req.id}')" style="background:rgba(78,205,196,0.1);color:var(--green)">✏️ 编辑</button>`);
  s.push('</div>');

  if (!hasArch) {
    s.push('<div style="color:var(--text2);font-size:13px">尚未定义架构宪法。拆分需求前建议先定义跨模块边界、技术决策和接口契约。</div>');
    s.push(`<div id="arch-spec-edit-${req.id}" style="display:none;margin-top:12px">${archSpecEditor(req.id, archSpec)}</div>`);
    s.push('</div>');
    return s.join('');
  }

  // 业务架构
  if (archSpec.domain) {
    const d = archSpec.domain;
    if (d.boundaries && d.boundaries.length > 0) {
      s.push('<div style="margin-bottom:8px"><strong>📐 模块边界</strong></div>');
      d.boundaries.forEach(b => {
        s.push(`<div style="font-size:12px;padding:4px 8px;margin:2px 0;background:var(--bg);border-radius:4px">`);
        s.push(`<strong>${escHtml(b.module)}</strong>`);
        if (b.owns) s.push(` — 管辖: ${escHtml(b.owns.join(', '))}`);
        if (b.dependsOn) s.push(`<br>↳ 依赖: ${escHtml(b.dependsOn.join(', '))}`);
        s.push('</div>');
      });
    }
    if (d.glossary && d.glossary.length > 0) {
      s.push('<div style="margin-top:8px"><strong>📖 术语表</strong></div>');
      d.glossary.forEach(g => s.push(`<div style="font-size:12px;color:var(--text2)">• <strong>${escHtml(g.term)}</strong>: ${escHtml(g.definition)}</div>`));
    }
    if (d.businessRules && d.businessRules.length > 0) {
      s.push('<div style="margin-top:8px"><strong>📋 业务规则</strong></div>');
      d.businessRules.forEach(r => s.push(`<div style="font-size:12px;color:var(--text2)">• ${escHtml(r.rule)} (主责: ${escHtml(r.owner)})</div>`));
    }
  }

  // 技术架构
  if (archSpec.technical || archSpec.decisions) {
    const tech = archSpec.technical || archSpec;
    s.push('<div style="margin-top:8px"><strong>🔧 技术决策</strong></div>');
    if (tech.decisions) {
      Object.entries(tech.decisions).forEach(([k, v]) => s.push(`<div style="font-size:12px;color:var(--text2)">• ${escHtml(k)}: ${escHtml(v)}</div>`));
    }
    if (tech.sharedSchemas && tech.sharedSchemas.length > 0) {
      s.push('<div style="margin-top:4px"><strong>🗄 共享 Schema</strong></div>');
      tech.sharedSchemas.forEach(sc => s.push(`<div style="font-size:12px;color:var(--text2)">• ${escHtml(sc.name)}</div>`));
    }
    if (tech.repository) {
      s.push('<div style="margin-top:4px"><strong>📂 目录规划</strong></div>');
      s.push(`<div style="font-size:12px;color:var(--text2)">策略: ${tech.repository.strategy || '-'}</div>`);
      if (tech.repository.layout) {
        Object.entries(tech.repository.layout).forEach(([k, v]) => s.push(`<div style="font-size:12px;color:var(--text2)">  ${k} → ${v}</div>`));
      }
    }
    if (tech.constraints) {
      s.push('<div style="margin-top:4px"><strong>📏 全局约束</strong></div>');
      Object.entries(tech.constraints).forEach(([k, v]) => s.push(`<div style="font-size:12px;color:var(--text2)">• ${escHtml(k)}: ${escHtml(v)}</div>`));
    }
  }

  // 模块契约
  if (archSpec.contracts || archSpec.interfaceRegistry) {
    const contracts = archSpec.contracts || archSpec.interfaceRegistry || [];
    if (contracts.length > 0) {
      s.push('<div style="margin-top:8px"><strong>🤝 模块契约</strong></div>');
      contracts.forEach(c => {
        const commitment = c.commitment || c.contract || '';
        const slaText = c.sla ? ' (SLA:' + c.sla + ')' : '';
        s.push(`<div style="font-size:12px;color:var(--text2)">• ${escHtml(c.from)} → ${escHtml(c.to)}: ${escHtml(commitment)}${slaText}</div>`);
      });
    }
  }

  s.push(`<div id="arch-spec-edit-${req.id}" style="display:none;margin-top:12px">${archSpecEditor(req.id, archSpec)}</div>`);
  s.push('</div>');
  return s.join('');
}

function archSpecEditor(reqId, archSpec) {
  return `<textarea id="arch-spec-textarea-${reqId}" style="width:100%;min-height:200px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:12px;font-family:monospace;resize:vertical">${escHtml(JSON.stringify(archSpec, null, 2))}</textarea>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button class="btn-accept" onclick="saveArchSpec('${reqId}')">💾 保存宪法</button>
      <button class="btn-back" onclick="toggleArchSpecEdit('${reqId}')">取消</button>
    </div>`;
}

function toggleArchSpecEdit(reqId) {
  const el = document.getElementById(`arch-spec-edit-${reqId}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function saveArchSpec(reqId) {
  const textarea = document.getElementById(`arch-spec-textarea-${reqId}`);
  if (!textarea) return;
  try {
    const archSpec = JSON.parse(textarea.value);
    await api('PATCH', `/requirements/${reqId}/arch-spec`, { archSpec });
    toast('架构宪法已保存 ✅', 'success');
    openRequirement(reqId);
  } catch (e) {
    toast('保存失败: ' + (e.message || 'JSON 格式错误'), 'error');
  }
}
