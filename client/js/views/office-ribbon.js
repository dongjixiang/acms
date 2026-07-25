// ACMS Office Ribbon 组件 — v0.62.5
// 学 ONLYOFFICE TabBar.js 设计语言, 简化重写 (AGPL 安全, 不复制 OO 代码)
// 设计思路参考 OO: apps/common/main/lib/component/TabBar.js
//   - 顶部 tab 行 (类 OO ul.tabs > li.tab)
//   - 下方 content 区, 按 tab 切换
//   - 每个 tab 包含若干 group (OO 叫 panel), 每个 group 包含若干 button
//
// API:
//   ACMSRibbon.create(host, {
//     tabs: [
//       { id, label, groups: [
//           { title, buttons: [{ id, icon, label, large?, action, active? }] }
//       ]}
//     ],
//     active: 'home'   // 初始激活 tab id
//   }) → { setActive, setButtonActive, setButtonLabel, destroy }
//
// 用法:
//   var ribbon = ACMSRibbon.create(hostEl, { tabs: [...], active: 'home' });
//   ribbon.setActive('insert');
//   ribbon.setButtonActive('bold', true);
//   ribbon.destroy();
//
// 依赖: 无 (纯原生 JS), CSS 变量定义在 office-theme.css

(function (root) {
  'use strict';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function renderTab(tab, isActive, onClick) {
    var btn = el('button', 'oo-ribbon-tab' + (isActive ? ' is-active' : ''), tab.label);
    btn.dataset.tabId = tab.id;
    btn.onclick = function () { onClick(tab.id); };
    return btn;
  }

  function renderButton(b) {
    var cls = 'oo-ribbon-btn' + (b.large ? ' is-large' : '') + (b.active ? ' is-active' : '');
    var btn = el('button', cls);
    btn.dataset.btnId = b.id || '';
    btn.title = b.label || b.id || '';
    if (b.icon) btn.appendChild(el('span', 'icon', b.icon));
    if (b.label) btn.appendChild(el('span', 'label', b.label));
    btn.onclick = function (e) {
      e.preventDefault();
      if (typeof b.action === 'function') b.action(e);
    };
    return btn;
  }

  function renderGroup(g) {
    var wrap = el('div', 'oo-ribbon-group');
    var buttons = el('div', 'oo-ribbon-buttons');
    (g.buttons || []).forEach(function (b) { buttons.appendChild(renderButton(b)); });
    wrap.appendChild(buttons);
    if (g.title) wrap.appendChild(el('div', 'oo-ribbon-group-title', g.title));
    return wrap;
  }

  function renderTabContent(tab) {
    var content = el('div', 'oo-ribbon-content');
    (tab.groups || []).forEach(function (g) { content.appendChild(renderGroup(g)); });
    return content;
  }

  function create(host, opts) {
    if (!host) throw new Error('ACMSRibbon: host required');
    if (!opts || !opts.tabs || !opts.tabs.length) throw new Error('ACMSRibbon: tabs required');
    host.innerHTML = '';
    host.classList.add('oo-ribbon');

    var state = {
      tabs: opts.tabs,
      activeTab: opts.active || opts.tabs[0].id,
      tabEls: {},       // tabId → DOM button
      contentEls: {},   // tabId → DOM content panel
    };

    var tabsRow = el('div', 'oo-ribbon-tabs');
    var contentHost = el('div', 'oo-ribbon-content-host');
    host.appendChild(tabsRow);
    host.appendChild(contentHost);

    function switchTab(tabId) {
      if (state.activeTab === tabId) return;
      // 旧 tab 失活
      if (state.tabEls[state.activeTab]) state.tabEls[state.activeTab].classList.remove('is-active');
      if (state.contentEls[state.activeTab]) state.contentEls[state.activeTab].style.display = 'none';
      // 新 tab 激活
      state.activeTab = tabId;
      if (state.tabEls[tabId]) state.tabEls[tabId].classList.add('is-active');
      if (state.contentEls[tabId]) state.contentEls[tabId].style.display = '';
      if (typeof opts.onTabChange === 'function') opts.onTabChange(tabId);
    }

    // 渲染所有 tab + content (默认隐藏非激活)
    state.tabs.forEach(function (tab) {
      var tabBtn = renderTab(tab, tab.id === state.activeTab, switchTab);
      tabsRow.appendChild(tabBtn);
      state.tabEls[tab.id] = tabBtn;

      var tabContent = renderTabContent(tab);
      if (tab.id !== state.activeTab) tabContent.style.display = 'none';
      contentHost.appendChild(tabContent);
      state.contentEls[tab.id] = tabContent;
    });

    // 找 button DOM (按 id)
    function findButtonEl(tabId, btnId) {
      var panel = state.contentEls[tabId];
      if (!panel) return null;
      var btns = panel.querySelectorAll('.oo-ribbon-btn');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].dataset.btnId === btnId) return btns[i];
      }
      return null;
    }

    return {
      setActive: switchTab,
      setButtonActive: function (tabId, btnId, active) {
        var b = findButtonEl(tabId, btnId);
        if (b) b.classList.toggle('is-active', !!active);
      },
      setButtonLabel: function (tabId, btnId, label) {
        var b = findButtonEl(tabId, btnId);
        if (b) {
          var lblEl = b.querySelector('.label');
          if (lblEl) lblEl.textContent = label;
        }
      },
      getActiveTab: function () { return state.activeTab; },
      destroy: function () {
        host.innerHTML = '';
        host.classList.remove('oo-ribbon');
      },
    };
  }

  root.ACMSRibbon = { create: create };
})(window);