// ACMS 通用 Modal 弹窗组件（v0.1 — Phase 2 #9）
// 用途：替换所有视图里的 prompt()/confirm()/alert()，统一弹窗体验
// 路径：client/js/core/acms-modal.js
//
// 用法：
//   const result = await window.ACMSModal.show({
//     title: '新建品牌',
//     message: '添加一个品牌',
//     fields: [
//       { name: 'name', label: '名称', required: true, placeholder: 'MiniMax' },
//       { name: 'domain', label: '域名', required: true },
//     ],
//     actions: [
//       { label: '取消', value: null, className: 'acms-modal-btn' },
//       { label: '确定', value: 'SUBMIT', className: 'acms-modal-btn acms-modal-btn-primary' },
//     ],
//     root: wRef.$c,  // 可选：挂载到指定容器（浮窗内），默认 document.body
//   });
//   if (!result) return; // 取消
//   const name = result.name; // 字段值
//
// 特性：
//   - Promise 风格（async/await 友好）
//   - required 字段校验（空值红框 + focus）
//   - ESC 关闭 / 点击遮罩关闭
//   - 主题跟随：用 ACMS 全局 CSS 变量（--bg/--text/--border/--accent1）
//   - 样式动态注入（单次），不依赖外部 CSS 文件

(function () {
  'use strict';

  let styleInjected = false;

  // 注入样式（用 ACMS 全局变量，主题自动跟随）
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement('style');
    style.textContent = `
.acms-modal-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: acms-modal-fade 0.15s ease-out;
}
.acms-modal {
  background: var(--bg2, #ffffff);
  border: 1px solid var(--border, #ddd);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  min-width: 360px;
  max-width: 520px;
  display: flex;
  flex-direction: column;
}
.acms-modal-title {
  padding: 14px 18px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #222);
  border-bottom: 1px solid var(--border, #ddd);
}
.acms-modal-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.acms-modal-message {
  font-size: 13px;
  color: var(--text, #222);
  line-height: 1.6;
  white-space: pre-line;
}
.acms-modal-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.acms-modal-label {
  font-size: 11px;
  color: var(--text2, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.acms-modal-input {
  background: var(--bg, #f8f8f8);
  border: 1px solid var(--border, #ddd);
  color: var(--text, #222);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
}
.acms-modal-input:focus {
  outline: none;
  border-color: var(--accent1, #0ea89d);
}
.acms-modal-actions {
  padding: 12px 18px;
  border-top: 1px solid var(--border, #ddd);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.acms-modal-btn {
  background: var(--bg3, #f0f0f0);
  border: 1px solid var(--border, #ddd);
  color: var(--text, #222);
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.acms-modal-btn:hover {
  filter: brightness(0.97);
}
.acms-modal-btn-primary {
  background: var(--accent1, #0ea89d);
  border-color: var(--accent1, #0ea89d);
  color: #fff;
}
.acms-modal-btn-primary:hover {
  filter: brightness(1.08);
}
@keyframes acms-modal-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;
    document.head.appendChild(style);
  }

  // 主入口
  function show(options = {}) {
    const {
      title = '',
      message = '',
      fields = [],
      actions = null,
      root = null,
    } = options;

    injectStyle();

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'acms-modal-overlay';

      const modal = document.createElement('div');
      modal.className = 'acms-modal';

      if (title) {
        const t = document.createElement('div');
        t.className = 'acms-modal-title';
        t.textContent = title;
        modal.appendChild(t);
      }

      const body = document.createElement('div');
      body.className = 'acms-modal-body';

      if (message) {
        const m = document.createElement('div');
        m.className = 'acms-modal-message';
        m.textContent = message;
        body.appendChild(m);
      }

      const inputs = {};
      for (const field of fields) {
        const wrap = document.createElement('div');
        wrap.className = 'acms-modal-field';
        if (field.label) {
          const lbl = document.createElement('div');
          lbl.className = 'acms-modal-label';
          lbl.textContent = field.label;
          wrap.appendChild(lbl);
        }
        const input = document.createElement('input');
        input.className = 'acms-modal-input';
        input.type = field.type || 'text';
        input.placeholder = field.placeholder || '';
        input.value = field.value || '';
        if (field.required) input.required = true;
        wrap.appendChild(input);
        inputs[field.name] = input;
        body.appendChild(wrap);
      }
      modal.appendChild(body);

      const act = document.createElement('div');
      act.className = 'acms-modal-actions';
      const btnList = actions || [
        { label: '取消', value: null },
        { label: '确定', value: 'SUBMIT', className: 'acms-modal-btn-primary' },
      ];
      btnList.forEach((b) => {
        const btn = document.createElement('button');
        btn.className = 'acms-modal-btn ' + (b.className || '');
        btn.textContent = b.label;
        btn.onclick = () => {
          if (b.value === 'SUBMIT') {
            for (const field of fields) {
              if (field.required && !inputs[field.name].value.trim()) {
                inputs[field.name].focus();
                inputs[field.name].style.borderColor = '#e53935';
                return;
              }
            }
            const result = {};
            for (const field of fields) result[field.name] = inputs[field.name].value.trim();
            cleanup(result);
          } else {
            cleanup(b.value);
          }
        };
        act.appendChild(btn);
      });
      modal.appendChild(act);

      overlay.onclick = (e) => {
        if (e.target === overlay) cleanup(null);
      };

      overlay.appendChild(modal);

      // 挂载位置：优先 root（浮窗内），fallback document.body
      const mountRoot = root || document.body;
      mountRoot.appendChild(overlay);

      // ESC 关闭
      const escHandler = (e) => {
        if (e.key === 'Escape') cleanup(null);
      };
      document.addEventListener('keydown', escHandler);

      // 自动 focus 第一个输入
      const firstInput = Object.values(inputs)[0];
      if (firstInput) setTimeout(() => firstInput.focus(), 50);

      function cleanup(value) {
        document.removeEventListener('keydown', escHandler);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(value);
      }
    });
  }

  // 暴露全局
  window.ACMSModal = { show };

  // 方便调试
  if (typeof console !== 'undefined') console.log('[acms-modal] 组件已加载');
})();