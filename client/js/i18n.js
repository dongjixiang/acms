// i18n 国际化 — 运行时语言切换
// P0 v0.X: 持久化到 localStorage（刷新不丢）+ 暴露 getLang() 让 api.js 自动带 lang 给 server
const LANG_STORAGE_KEY = 'acms.lang';

const I18n = {
  _lang: 'zh',
  _data: null,

  async init(lang) {
    // 优先级：传入参数 > localStorage > navigator.language
    this._lang = lang || localStorage.getItem(LANG_STORAGE_KEY) || (navigator.language.startsWith('zh') ? 'zh' : 'en');
    localStorage.setItem(LANG_STORAGE_KEY, this._lang);
    try {
      const resp = await fetch(`/api/i18n/${this._lang}`);
      this._data = await resp.json();
    } catch (e) {
      // fallback: load built-in
      this._data = {};
    }
    this.apply();
  },

  t(path) {
    if (!this._data) return path;
    const keys = path.split('.');
    let val = this._data;
    for (const k of keys) {
      if (val && typeof val === 'object') val = val[k];
      else return path;
    }
    return val || path;
  },

  setLang(lang) {
    this._lang = lang;
    localStorage.setItem(LANG_STORAGE_KEY, lang);  // 持久化
    this.init(lang);
  },

  // P0 v0.X: 暴露当前语言，让 api.js 在调 agent API 时带上
  //   默认 'zh'（多多场景）；fallback 逻辑跟 init 一致
  getLang() {
    if (this._lang) return this._lang;
    return localStorage.getItem(LANG_STORAGE_KEY) || 'zh';
  },

  apply() {
    // 应用所有 data-i18n 属性
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const text = this.t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.dataset.i18nAttr === 'placeholder') el.placeholder = text;
        else el.value = text;
      } else {
        el.textContent = text;
      }
    });
  }
};

// 全局快捷
function t(path) { return I18n.t(path); }
