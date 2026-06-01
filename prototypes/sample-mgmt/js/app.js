/**
 * app.js — 主程序入口
 * 应用初始化、全局事件绑定、工具函数
 */
(function() {
  'use strict';

  const App = {
    initialized: false,

    async init() {
      if (this.initialized) return;
      await Auth.init();

      // 如果已有登录用户，直接渲染
      if (Auth.isLoggedIn()) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appLayout').style.display = 'flex';
        // 触发 renderApp
        if (typeof renderApp === 'function') renderApp();
      }

      this.initialized = true;
      console.log('[App] 应用初始化完成');
    },

    /** 显示 Toast 通知 */
    showToast(message, type = 'info') {
      let container = document.querySelector('.toast-container');
      if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      const icons = { success: '✅', error: '❌', info: 'ℹ️' };
      toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
      container.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    },

    /** 格式化日期 */
    formatDate(date) {
      const d = new Date(date);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    },

    /** 格式化金额 */
    formatMoney(amount) {
      return '¥' + (amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    }
  };

  window.App = App;

  // 自动初始化
  document.addEventListener('DOMContentLoaded', () => App.init());

  console.log('[App] 主程序模块已加载');
})();
