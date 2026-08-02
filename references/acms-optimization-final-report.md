# ACMS 功能优化报告

**版本**: v0.80  
**生成时间**: 2026-08-02 16:50  
**状态**: 分析完成

---

## 一、系统概况

| 维度 | 数据 |
|------|------|
| 前端代码 | ~30,000 行，70+ JS 文件 |
| 后端代码 | ~38,000 行，90+ JS 文件 |
| 总代码量 | ~68,000 行 JavaScript |
| 参考文档 | 77 个 .md 文件 |
| 已知 Pitfalls | P1-P127+（127+ 个） |
| 服务器状态 | ✅ 运行中（PID 1804，端口 3300） |

---

## 二、已修复问题

### ✅ P0-1: 流式响应变量作用域错误

**问题**: `ReferenceError: accumulated is not defined`

**根因**: `accumulated` 和 `actionData` 在 `handleStream` 内部声明，但 `finalizeStream` 被 `startStream` 的 catch 处理器调用时作用域丢失。

**修复**: 提升到 `sendMessage` 作用域（line 1237-1238）

**验证**:
```bash
grep "var accumulated" client/js/core/agent-buddy.js
# var accumulated = '';            // v0.80: 提升作用域，供 finalizeStream 使用
```

---

## 三、待优化问题清单

### 🔴 P1 级（阻塞性体验问题）

| # | 问题 | 影响 | 预估工时 | 文件 |
|---|------|------|----------|------|
| P1-1 | console.log 过多（361 处） | 生产性能 + 日志噪音 | 2h | server/**/*.js, client/js/**/*.js |
| P1-2 | setTimeout 无统一管理（105 处） | 内存泄漏风险 | 4h | timer-manager.js + 3 个调用点 |
| P1-3 | 错误处理不一致 | 静默失败 | 3h | error-boundary.js |

### 🟡 P2 级（重要功能缺失）

| # | 问题 | 影响 | 预估工时 | 文件 |
|---|------|------|----------|------|
| P2-1 | 前端无缓存策略 | 重复请求，体验差 | 4h | cache.js |
| P2-2 | 后端无限流 | 可能被滥用 | 2h | rate-limiter.js |
| P2-3 | 部分工具描述不完整 | LLM 选错工具 | 6h | server/tools/*.js |

### 🟢 P3 级（长期优化）

| # | 问题 | 影响 | 预估工时 | 文件 |
|---|------|------|----------|------|
| P3-1 | 单元测试覆盖低 | 回归风险 | 20h | server/__tests__/*.test.js |
| P3-2 | 搜索质量不稳定 | 用户感知差 | 8h | tool-retriever.js |
| P3-3 | 内存泄漏排查 | 长时间运行后卡顿 | 4h | 多个文件 |

---

## 四、具体优化方案

### 4.1 日志系统升级（P1-1）

**现状**: 361 处 console.log，无级别控制

**方案**:
```javascript
// server/services/logger.js
const Logger = {
  debug: (msg, ...args) => process.env.DEBUG && console.log('[DEBUG]', msg, ...args),
  info: (msg, ...args) => console.log('[INFO]', msg, ...args),
  warn: (msg, ...args) => console.warn('[WARN]', msg, ...args),
  error: (msg, ...args) => console.error('[ERROR]', msg, ...args),
};

module.exports = Logger;
```

**使用**:
```javascript
// 开发环境
DEBUG=1 node server/index.js

// 生产环境
node server/index.js  // 只输出 info+
```

---

### 4.2 Timer 统一管理（P1-2）

**现状**: 105 处 setTimeout/setInterval，无统一清理

**方案**:
```javascript
// client/js/core/timer-manager.js
class TimerManager {
  constructor() {
    this.timers = new Map();
  }
  
  setTimeout(fn, delay, ...args) {
    const id = setTimeout(fn, delay, ...args);
    this.timers.set(id, { fn, id });
    return id;
  }
  
  clearTimeout(id) {
    clearTimeout(id);
    this.timers.delete(id);
  }
  
  clearAll() {
    this.timers.forEach(({ id }) => clearTimeout(id));
    this.timers.clear();
  }
}

window.ACMSTimers = new TimerManager();
```

**高风险点**:
- `agent-buddy.js`: action card 轮询（2000ms）
- `kanban.js`: 任务状态轮询
- `desktop-icons.js`: 拖拽检测

---

### 4.3 错误边界统一（P1-3）

**现状**: 部分 catch 吞掉错误

**方案**:
```javascript
// client/js/core/error-boundary.js
window.ACMSErrorHandler = {
  handle(error, context) {
    console.error(`[${context}]`, error);
    if (window.ACMSAnalytics) {
      window.ACMSAnalytics.captureError(error, context);
    }
    if (error.userMessage) {
      toast(error.userMessage, 'error');
    }
  }
};

// 使用
try {
  await fetch('/api/xxx');
} catch (err) {
  window.ACMSErrorHandler.handle(err, 'api-call');
}
```

---

### 4.4 前端缓存策略（P2-1）

**现状**: 无缓存，每次刷新都重新请求

**方案**:
```javascript
// client/js/core/cache.js
class SimpleCache {
  constructor(ttl = 300000) { // 5分钟 TTL
    this.store = new Map();
    this.ttl = ttl;
  }
  
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  
  set(key, value) {
    this.store.set(key, {
      value,
      expires: Date.now() + this.ttl
    });
  }
}

window.ACMSCache = new SimpleCache();
```

**缓存目标**:
- Dashboard 统计数据
- 项目列表
- 需求列表
- 任务列表

---

### 4.5 后端请求限流（P2-2）

**现状**: 无限流，可能被滥用

**方案**:
```javascript
// server/middleware/rate-limiter.js
const limiter = require('express-rate-limit');

const chatLimiter = limiter({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 最多30次
  message: { error: '请求过于频繁，请稍后再试' }
});

module.exports = { chatLimiter };
```

**使用**:
```javascript
const { chatLimiter } = require('../middleware/rate-limiter');
router.post('/chat', chatLimiter, async (req, res) => {
  // ...
});
```

---

### 4.6 工具描述补全（P2-3）

**现状**: 部分工具缺少 DON'T WHEN 说明

**检查清单**:
```bash
grep -rn "description" server/tools/*.js | grep -v "DON'T WHEN"
```

**建议模板**:
```javascript
{
  name: 'generate_image',
  description: `
**USE WHEN:** 用户要求生成/创作图片时
**DON'T WHEN:** 
- 用户要求搜索/查找图片时（用 web_search）
- 用户要求编辑已有图片时（用 image_resize/crop）
**返回:** { file_ids: [...], asset_path: '...', image_url: '...' }
`
}
```

---

## 五、优先级排序

| 优先级 | 项目 | 工作量 | 收益 | 执行时间 |
|--------|------|--------|------|----------|
| P0 | 流式响应修复 | ✅ 已完成 | 高 | - |
| P1 | 日志系统升级 | 2h | 中 | Day 1 |
| P1 | Timer 统一管理 | 4h | 高 | Day 1-2 |
| P1 | 错误边界统一 | 3h | 高 | Day 2 |
| P2 | 前端缓存 | 4h | 中 | Day 3-4 |
| P2 | 后端限流 | 2h | 中 | Day 4 |
| P2 | 工具描述补全 | 6h | 中 | Week 2 |
| P3 | 单元测试 | 20h | 高 | Month 1 |
| P3 | 搜索优化 | 8h | 中 | Month 2 |
| P3 | 内存排查 | 4h | 高 | Month 2 |

---

## 六、立即行动项

### 今天可执行（P1）

1. **日志系统升级**（2小时）
   - 创建 `server/services/logger.js`
   - 替换关键 console.log → Logger.info/warn/error
   - 加 DEBUG 环境变量控制

2. **Timer 管理**（4小时）
   - 创建 `client/js/core/timer-manager.js`
   - 修改 agent-buddy.js 轮询
   - 修改 kanban.js 轮询

### 本周可执行（P2）

3. **前端缓存**（4小时）
   - 创建 `client/js/core/cache.js`
   - 缓存 dashboard/项目/需求列表

4. **后端限流**（2小时）
   - 安装 express-rate-limit
   - 配置 chat/search 端点限流

---

## 七、参考文档

| 文档 | 路径 |
|------|------|
| 完整优化报告 | `references/acms-optimization-report-v080.md` |
| 可执行清单 | `references/acms-optimization-todo.md` |
| Bug 修复报告 | `references/stream-bug-fix-report.md` |
| Pitfalls 汇总 | `acms/SKILL.md` §7 |
| Agent 小吉 | `acms-agent-buddy/SKILL.md` |

---

## 八、总结

**已完成**:
- ✅ 流式响应作用域修复
- ✅ 服务器重启
- ✅ 优化报告生成

**待执行**:
- P1: 日志/Timer/错误边界（9小时）
- P2: 缓存/限流/工具描述（12小时）
- P3: 单元测试/搜索/内存（32小时）

**建议**: 从 P1 级开始，本周完成核心稳定性优化。

---

*报告生成时间: 2026-08-02 16:50*  
*分析人: Agnes*
