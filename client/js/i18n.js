// i18n 国际化 — 运行时语言切换
const I18n = {
  _lang: 'zh',
  _data: null,

  async init(lang) {
    this._lang = lang || (navigator.language.startsWith('zh') ? 'zh' : 'en');
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
    this.init(lang);
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
