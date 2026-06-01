/**
 * auth.js — 权限认证模拟模块
 * 管理用户角色、登录状态、动态权限校验
 */
(function() {
  'use strict';

  const Auth = {
    _currentUser: null,
    _rolesConfig: null,

    /**
     * 初始化：加载角色配置，恢复上次登录用户
     */
    async init() {
      // 使用内嵌角色配置（支持 file:// 协议打开）
      this._rolesConfig = {"roles":[{"id":"sales","name":"销售人员","modules":["apply","tracking","history"],"description":"提交样片申请、查看申请状态和历史"},{"id":"fae","name":"FAE工程师","modules":["apply","tracking","history","dashboard"],"description":"申请样片、查看跟踪和技术数据"},{"id":"pm","name":"产品经理(PM)","modules":["apply","approval","tracking","dashboard","ai-detection","history"],"description":"审批申请、查看数据看板和AI异常"},{"id":"admin","name":"管理员","modules":["apply","approval","tracking","dashboard","ai-detection","settings","history","erp"],"description":"系统全权限管理"},{"id":"approver","name":"审批人","modules":["approval","tracking","dashboard","history"],"description":"审批样片申请"},{"id":"finance","name":"财务/仓库","modules":["tracking","dashboard","history","erp"],"description":"发货管理、库存查看、ERP对接"}],"users":[{"id":"U001","name":"张明","role":"sales","dept":"华南销售部","avatar":"张"},{"id":"U002","name":"李华","role":"fae","dept":"应用工程部","avatar":"李"},{"id":"U003","name":"赵强","role":"pm","dept":"产品管理部","avatar":"赵"},{"id":"U004","name":"管理员","role":"admin","dept":"IT部","avatar":"管"},{"id":"U005","name":"王芳","role":"approver","dept":"审批中心","avatar":"王"},{"id":"U006","name":"仓库陈","role":"finance","dept":"财务仓库部","avatar":"陈"}],"permissionMatrix":{"apply":{"label":"① 样片申请","icon":"📋","roles":["sales","fae","pm","admin"]},"approval":{"label":"② 审批管理","icon":"✅","roles":["pm","admin","approver"]},"tracking":{"label":"③ 样片跟踪","icon":"🔍","roles":["sales","fae","pm","admin","approver","finance"]},"dashboard":{"label":"数据看板","icon":"📊","roles":["fae","pm","admin","approver","finance"]},"ai-detection":{"label":"AI异常检测","icon":"🤖","roles":["pm","admin"]},"settings":{"label":"系统设置","icon":"⚙️","roles":["admin"]},"history":{"label":"申请历史","icon":"📜","roles":["sales","fae","pm","admin","approver","finance"]},"erp":{"label":"ERP对接","icon":"🔗","roles":["admin","finance"]}}};
      if (!this._rolesConfig || !this._rolesConfig.roles) {
        console.warn('[Auth] 角色配置加载失败');
        this._rolesConfig = { roles: [], users: [], permissionMatrix: {} };
      }
      // 恢复上次登录用户
      const saved = localStorage.getItem('sampleAuth_user');
      if (saved) {
        try {
          this._currentUser = JSON.parse(saved);
        } catch(e) { this._currentUser = null; }
      }
      return this._currentUser;
    },

    /** 获取所有用户 */
    getUsers() { return this._rolesConfig?.users || []; },

    /** 获取所有角色 */
    getRoles() { return this._rolesConfig?.roles || []; },

    /** 获取权限矩阵 */
    getPermissionMatrix() { return this._rolesConfig?.permissionMatrix || {}; },

    /** 登录 */
    login(userId) {
      const user = this.getUsers().find(u => u.id === userId);
      if (!user) return false;
      this._currentUser = user;
      localStorage.setItem('sampleAuth_user', JSON.stringify(user));
      // 触发登录事件
      document.dispatchEvent(new CustomEvent('authChange', { detail: { user } }));
      return true;
    },

    /** 登出 */
    logout() {
      this._currentUser = null;
      localStorage.removeItem('sampleAuth_user');
      document.dispatchEvent(new CustomEvent('authChange', { detail: { user: null } }));
    },

    /** 获取当前用户 */
    getCurrentUser() { return this._currentUser; },

    /** 获取当前角色 */
    getCurrentRole() {
      if (!this._currentUser) return null;
      return this.getRoles().find(r => r.id === this._currentUser.role) || null;
    },

    /** 检查当前用户是否有权访问某模块 */
    canAccess(moduleKey) {
      if (!this._currentUser) return false;
      const matrix = this.getPermissionMatrix();
      const perm = matrix[moduleKey];
      if (!perm) return false;
      return perm.roles.includes(this._currentUser.role);
    },

    /** 获取当前用户可访问的模块列表（用于动态菜单） */
    getAccessibleModules() {
      if (!this._currentUser) return [];
      const matrix = this.getPermissionMatrix();
      return Object.entries(matrix)
        .filter(([, perm]) => perm.roles.includes(this._currentUser.role))
        .map(([key, perm]) => ({ key, ...perm }));
    },

    /** 获取用户角色名称 */
    getRoleName(roleId) {
      const role = this.getRoles().find(r => r.id === roleId);
      return role ? role.name : roleId;
    },

    /** 判断是否已登录 */
    isLoggedIn() { return !!this._currentUser; }
  };

  window.Auth = Auth;
  console.log('[Auth] 权限模块已加载');
})();
