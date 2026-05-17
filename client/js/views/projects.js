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
      wikiVaultPath: document.getElementById('proj-wiki').value.trim(),
    });
    toast(t('toast.projectCreated'), 'success');
    document.getElementById('create-project-form').style.display = 'none';
    loadProjects();
  } catch (e) { toast(t('common.error') + ': ' + e.message, 'error'); }
}
