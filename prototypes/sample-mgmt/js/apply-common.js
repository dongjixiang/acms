/**
 * apply-common.js — 样片申请通用逻辑
 * 提供申请表单的共享工具函数、数据管理
 */
(function() {
  'use strict';

  const ApplyCommon = {
    /** 获取当前用户（从Auth模块） */
    getCurrentUser() {
      return window.Auth ? Auth.getCurrentUser() : { name: '张明', dept: '华南销售部' };
    },

    /** 获取型号列表 */
    getModels() {
      return window.MockData ? MockData.models : [];
    },

    /** 获取型号下拉选项HTML */
    getModelOptions(selected) {
      return this.getModels().map(m =>
        `<option value="${m.name}" ${m.name === selected ? 'selected' : ''}>${m.name} (${m.manufacturer})</option>`
      ).join('');
    },

    /** 保存草稿 */
    saveDraft(key, data) {
      try {
        localStorage.setItem('apply_draft_' + key, JSON.stringify(data));
      } catch(e) { /* ignore */ }
    },

    /** 加载草稿 */
    loadDraft(key) {
      try {
        const data = localStorage.getItem('apply_draft_' + key);
        return data ? JSON.parse(data) : null;
      } catch(e) { return null; }
    },

    /** 清除草稿 */
    clearDraft(key) {
      localStorage.removeItem('apply_draft_' + key);
    },

    /** 生成申请ID */
    generateAppId() {
      const now = new Date();
      return 'APP-' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '-' + String(Math.floor(Math.random() * 10000)).padStart(4,'0');
    },

    /** 模拟提交 */
    async submitApplication(data) {
      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 800));
      const appId = this.generateAppId();
      console.log('[Apply] 申请提交成功:', appId, data);
      return { success: true, appId, message: '样片申请已提交，等待PM审批' };
    }
  };

  window.ApplyCommon = ApplyCommon;
  console.log('[ApplyCommon] 申请通用模块已加载');
})();
