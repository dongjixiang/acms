// ACMS App Tools Runtime — v0.66
// 客户端 app-tool 注册中心 + WebSocket invoke handler
//
// 用法（应用 IIFE 末尾）：
//   ACMS.registerPackage('file-manager', {
//     title: '...', icon: '...', loader: ld,
//     agentTools: [
//       {
//         name: 'file_search',
//         description: '...',
//         parameters: { type:'object', properties:{...}, required:[...] },
//         handler: async (args, ctx) => ({ files: [...] })
//       }
//     ]
//   });
//
// 链路：
//   ACMS.registerPackage 检测 agentTools → ACMSAppTools.register(appId, tools)
//     → 发 WS {type:'app_tools:register', appId, tools: [meta]}
//     → 服务端 app-tools-registry 镜像存储
//   服务端 tool-registry.execute() 找不到 server tool → 路由到 app-tool
//     → WS 推 {type:'app_tool:invoke', reqId, ...} 给客户端
//     → 本文件 handleInvoke 执行本地 handler
//     → WS 发回 {type:'app_tool:result', reqId, payload}

(function() {
  'use strict';

  // toolName → {appId, handler, description, parameters, timeoutMs}
  const registry = new Map();

  // 工具注册：handler 是函数，其他字段会原样转发给服务端（meta only）
  function register(appId, tools) {
    if (!appId || !Array.isArray(tools)) return;
    for (const t of tools) {
      if (!t || !t.name || typeof t.handler !== 'function') {
        console.warn('[AppTools] Invalid tool definition (name=' + (t && t.name) + ', hasHandler=' + (t && typeof t.handler === 'function') + ') in ' + appId);
        continue;
      }
      registry.set(t.name, {
        appId,
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || { type: 'object', properties: {} },
        handler: t.handler,
        timeoutMs: t.timeoutMs,
      });
    }
    // 把元数据发到服务端（不含 handler）
    sendRegisterToServer(appId, tools);
  }

  function unregister(appId) {
    for (const [name, entry] of registry.entries()) {
      if (entry.appId === appId) registry.delete(name);
    }
    if (window.App && window.App.ws && window.App.ws.readyState === 1) {
      window.App.ws.send(JSON.stringify({
        type: 'app_tools:unregister',
        appId,
      }));
    }
  }

  function sendRegisterToServer(appId, tools) {
    if (!window.App || !window.App.ws) {
      // ws 还没初始化，延后重试
      setTimeout(function() { sendRegisterToServer(appId, tools); }, 1500);
      return;
    }
    if (window.App.ws.readyState !== 1) {
      // ws 未 OPEN，延后重试
      setTimeout(function() { sendRegisterToServer(appId, tools); }, 1500);
      return;
    }
    const meta = tools.map(function(t) {
      return {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        timeoutMs: t.timeoutMs,
      };
    });
    try {
      window.App.ws.send(JSON.stringify({
        type: 'app_tools:register',
        appId: appId,
        tools: meta,
      }));
    } catch (e) {
      console.warn('[AppTools] send register failed:', e);
    }
  }

  // 服务端 invoke 本地 handler
  async function handleInvoke(msg) {
    var reqId = msg.reqId;
    var appId = msg.appId;
    var toolName = msg.toolName;
    var args = msg.args || {};
    var ctx = msg.ctx || {};

    var tool = registry.get(toolName);
    if (!tool) {
      sendResult(reqId, {
        ok: false,
        error: 'TOOL_NOT_REGISTERED',
        message: '客户端未注册 tool ' + toolName,
      });
      return;
    }
    if (tool.appId !== appId) {
      sendResult(reqId, {
        ok: false,
        error: 'APP_ID_MISMATCH',
        message: 'tool ' + toolName + ' 属于 ' + tool.appId + '，而非 ' + appId,
      });
      return;
    }

    var startTs = Date.now();
    try {
      var result = await tool.handler(args, ctx);
      var elapsed = Date.now() - startTs;
      // handler 必须返回 ok 字段或 result 直接为值
      var payload;
      if (result === undefined || result === null) {
        payload = { ok: true, _elapsedMs: elapsed };
      } else if (typeof result === 'object') {
        payload = Object.assign({ ok: true, _elapsedMs: elapsed }, result);
      } else {
        payload = { ok: true, value: result, _elapsedMs: elapsed };
      }
      sendResult(reqId, payload);
    } catch (e) {
      sendResult(reqId, {
        ok: false,
        error: 'HANDLER_ERROR',
        message: e && e.message ? e.message : String(e),
        stack: e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : null,
        _elapsedMs: Date.now() - startTs,
      });
    }
  }

  function sendResult(reqId, payload) {
    if (!window.App || !window.App.ws || window.App.ws.readyState !== 1) {
      console.warn('[AppTools] ws not open, dropping result for ' + reqId);
      return;
    }
    try {
      window.App.ws.send(JSON.stringify({
        type: 'app_tool:result',
        reqId: reqId,
        payload: payload,
      }));
    } catch (e) {
      console.warn('[AppTools] send result failed:', e);
    }
  }

  // 调试 API
  function listLocal() {
    return Array.from(registry.values()).map(function(t) {
      return { appId: t.appId, name: t.name, description: t.description };
    });
  }

  // 暴露 API
  window.ACMSAppTools = {
    register: register,
    unregister: unregister,
    handleInvoke: handleInvoke,
    listLocal: listLocal,
  };
})();