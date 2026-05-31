// 项目管理视图 — 项目列表 + 创建
// 依赖: core/state.js, core/utils.js, js/api.js

async function loadProjects() {
  try {
    const projects = await Projects.list();
    const grid = document.getElementById('project-grid');
    if (!projects.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${t('projects.empty')}</div>`;
      return;
    }
    grid.innerHTML = projects.map(p => `
      <div class="project-card" onclick='enterProject(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
        <h3>📦 ${escHtml(p.name)}</h3>
        <div class="desc">${escHtml(p.description || '')}</div>
        <div class="meta"><span>${p.id}</span><span>${p.status}</span><span>${fmtDate(p.created_at)}</span></div>
        <button class="btn-small btn-reject" style="margin-top:8px;font-size:10px" onclick="event.stopPropagation();deleteProject('${p.id}','${escHtml(p.name).replace(/'/g,"\\'")}')">🗑 删除</button>
      </div>`).join('');
  } catch (e) { toast(t('common.error') + ': ' + e.message, 'error'); }
}

function toggleCreateProject() {
  const form = document.getElementById('create-project-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function doCreateProject() {
  const name = document.getElementById('proj-name').value.trim();
  if (!name) return toast(t('projects.form.namePlaceholder'), 'error');
  try {
    await Projects.create({
      name,
      slug: document.getElementById('proj-slug').value.trim(),
      description: document.getElementById('proj-desc').value.trim(),
    });
    toast(t('toast.projectCreated'), 'success');
    document.getElementById('create-project-form').style.display = 'none';
    loadProjects();
  } catch (e) { toast(t('common.error') + ': ' + e.message, 'error'); }
}

async function deleteProject(id, name) {
  if (!(await showConfirm(`确认删除项目「${name}」？所有关联的需求、任务、配置都将被删除，此操作不可撤销。`))) return;
  try {
    await api('DELETE', `/projects/${id}`);
    toast('项目已删除', 'success');
    loadProjects();
  } catch (e) { toast('删除失败: ' + e.message, 'error'); }
}
