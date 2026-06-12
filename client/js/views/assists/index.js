// 辅助手段前端注册表（v0.3.3 Phase 2）
// 每个 assist 独立文件，挂到 window.ACMSAssists.{method} = { render, onUse, name }
// render(reqId, data, container) → 返回 HTML 字符串
// onUse(reqId, payload) → 调 /assist/:method/use 后端
//
// 注册到 ASSIST_RENDERERS 即可被 dispatch 调用
(function () {
  const registry = {};
  function register(method, mod) {
    registry[method] = mod;
  }
  // 暴露给其他文件
  window.ACMSAssists = {
    register,
    get: (method) => registry[method] || null,
    list: () => Object.keys(registry),
  };
})();
