// 全局状态 — 所有模块共享
window.App = {
  currentProjectId: null,
  currentProject: null,
  ws: null,
  WS_URL: `ws://${location.hostname}:3301/ws`,
  statusLabels: { idea: '💡 想法', clarifying: '❓ 澄清中', review: '👀 待审核', approved: '✅ 已确认', in_execution: '🔄 执行中', done: '🎉 已完成', abandoned: '🗑 已放弃' },
  typeLabels: { coding: '💻', design: '🎨', documentation: '📝', research: '🔍', review: '👁', testing: '🧪', planning: '📐', audio: '🔊', modeling: '🗿' },
  theme: 'dark',

  // 初始化主题：localStorage > 系统偏好 > 默认 dark
  initTheme() {
    const saved = localStorage.getItem('acms-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'cream') {
      this.theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      this.theme = 'light';
    }
    document.documentElement.setAttribute('data-theme', this.theme);
    this._updateThemeButton();
    this._updateMermaidTheme();
    // 监听系统主题变化（仅当用户未手动设置时）
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('acms-theme')) {
          this.theme = e.matches ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', this.theme);
          this._updateThemeButton();
          this._updateMermaidTheme();
        }
      });
    }
  },

  // 切换主题：dark → light → cream → dark
  toggleTheme() {
    const next = { dark: 'light', light: 'cream', cream: 'dark' };
    this.theme = next[this.theme] || 'dark';
    document.documentElement.setAttribute('data-theme', this.theme);
    localStorage.setItem('acms-theme', this.theme);
    this._updateThemeButton();
    this._updateMermaidTheme();
  },

  // 更新按钮图标
  _updateThemeButton() {
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      const icons = { dark: '🌙', light: '☀️', cream: '📄' };
      btn.textContent = icons[this.theme] || '🌙';
    }
  },

  // 更新 Mermaid 主题（如果已加载）
  _updateMermaidTheme() {
    if (window.mermaid) {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: this.theme === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose'
      });
    }
  },

  // 移动端汉堡菜单 — 切换 sidebar overlay
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const btn = document.getElementById('btn-hamburger');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('sidebar-open');
    if (backdrop) backdrop.classList.toggle('sidebar-open', isOpen);
    if (btn) btn.textContent = isOpen ? '✕' : '☰';
  },

  // 关闭 sidebar（导航时调用）
  closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const btn = document.getElementById('btn-hamburger');
    if (sidebar) sidebar.classList.remove('sidebar-open');
    if (backdrop) backdrop.classList.remove('sidebar-open');
    if (btn) btn.textContent = '☰';
  },
};
