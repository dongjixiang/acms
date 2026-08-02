# ACMS 功能优化报告

**版本**: v0.80  
**日期**: 2026-08-02  
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

---

## 二、已发现问题分类

### 🔴 P0 级（阻塞性）

| # | 问题 | 影响 | 状态 |
|---|------|------|------|
| P0-1 | 流式响应变量作用域错误 | `ReferenceError: accumulated is not defined` | ✅ 已修复 |
| P0-2 | agent-browser 百度搜索验证码 | 无法自动搜索 | ⚠️ 已知限制 |
| P0-3 | 部分工具未注册到 tool-registry | LLM 调不到工具 | ✅ 已修复（v0.74） |

### 🟡 P1 级（重要但非阻塞）

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| P1-1 | console.log 过多（361 处） | 生产环境性能 + 日志噪音 | 加日志级别控制 |
| P1-2 | setTimeout/setInterval 过多（105 处） | 内存泄漏风险 | 统一用 ACMS.timer 管理 |
| P1-3 | 错误处理不一致 | 部分 catch 吞掉错误 | 统一错误边界 |
| P1-4 | 前端缓存策略缺失 | 频繁重复请求 | 加 HTTP cache / SWR |
| P1-5 | 后端无请求限流 | 可能被滥用 | 加 rate limiter |

### 🟢 P2 级（体验优化）

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| P2-1 | 搜索质量不稳定 | 用户感知差 | 优化同义词扩展 |
| P2-2 | 邮件附件直传未实现 | 功能缺失 | 实现 office 附件直传 |
| P2-3 | 部分工具描述不完整 | LLM 选错工具 | 补全 USE WHEN/DON'T WHEN |
| P2-4 | 无单元测试覆盖率 | 回归风险 | 加 Jest 测试 |

---

## 三、具体优化建议

### 1. 日志系统升级

**现状**: 361 处 console.log，无级别控制

**建议**:
```javascript
// 新增 logger.js
const Logger = {
  debug: (msg, ...args) => process.env.DEBUG && console.log('[DEBUG]', msg, ...args),
  info: (msg, ...args) => console.log('[INFO]', msg, ...args),
  warn: (msg, ...args) => console.warn('[WARN]', msg, ...args),
  error: (msg, ...args) => console.error('[ERROR]', msg, ...args),
};

// 替换所有 console.log → Logger.info
// 生产环境：DEBUG=1 node server/index.js
```

---

### 2. Timer 统一管理

**现状**: 105 处 setTimeout/setInterval，无统一清理

**建议**:
```javascript
// 新增 timer-manager.js
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

**修改点**:
- `agent-buddy.js` 轮询 action card（2000ms）
- `kanban.js` 轮询任务状态
- `desktop-icons.js` 拖拽检测

---

### 3. 错误边界统一

**现状**: 部分 catch 吞掉错误，无统一错误处理

**建议**:
```javascript
// 新增 error-boundary.js
window.ACMSErrorHandler = {
  handle(error, context) {
    console.error(`[${context}]`, error);
    // 上报到监控
    if (window.ACMSAnalytics) {
      window.ACMSAnalytics.captureError(error, context);
    }
    // 用户提示
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

### 4. 前端缓存策略

**现状**: 无缓存，每次刷新都重新请求

**建议**:
```javascript
// 新增 cache.js
class SimpleCache {
  constructor(ttl = 60000) {
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

window.ACMSCache = new SimpleCache(5 * 60 * 1000); // 5分钟 TTL

// 使用
async function fetchData(url) {
  const cached = window.ACMSCache.get(url);
  if (cached) return cached;
  
  const data = await fetch(url).then(r => r.json());
  window.ACMSCache.set(url, data);
  return data;
}
```

---

### 5. 后端请求限流

**现状**: 无限流，可能被滥用

**建议**:
```javascript
// 新增 rate-limiter.js
const limiter = require('express-rate-limit');

const chatLimiter = limiter({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 最多30次
  message: { error: '请求过于频繁，请稍后再试' }
});

router.post('/chat', chatLimiter, async (req, res) => {
  // ...
});
```

---

### 6. 工具描述补全

**现状**: 部分工具缺少 DON'T WHEN 说明

**检查清单**:
```bash
# 检查所有工具描述是否完整
grep -rn "description" server/tools/*.js | grep -v "USE WHEN"
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
- 用户要求获取图片信息时（用 image_get_info）
**返回:** { file_ids: [...], asset_path: '...', image_url: '...' }
`
}
```

---

### 7. 单元测试覆盖

**现状**: 仅 1 个测试文件

**建议优先级**:
1. `tool-registry.js` - 工具注册/查询
2. `llm-adapter.js` - LLM 调用/解析
3. `agent-buddy-action.js` - 路由逻辑
4. `requirement-service.js` - 需求 CRUD
5. `imap-service.js` - 邮件收发

**测试模板**:
```javascript
// server/__tests__/tool-registry.test.js
const { describe, it, expect } = require('jest');
const { registerTool, getTool, listTools } = require('../services/tool-registry');

describe('tool-registry', () => {
  it('should register and retrieve tools', () => {
    registerTool({ name: 'test_tool', handler: () => 'ok' });
    expect(getTool('test_tool')).toBeTruthy();
    expect(listTools().length).toBeGreaterThan(0);
  });
});
```

---

### 8. 搜索质量优化

**现状**: keyword 模式 top-5 准确率 ~85-90%

**优化方向**:
1. 扩展同义词库（SYNONYM_MAP）
2. 加用户反馈收集（搜索失败率）
3. BGE 模式普及（需部署 ONNX 模型）
4. 搜索缓存（重复查询直接返回）

---

### 9. 内存泄漏排查

**高风险点**:
| 文件 | 问题 | 建议 |
|------|------|------|
| `agent-buddy.js` | 轮询 action card 未清理 | 窗口关闭时 clearInterval |
| `kanban.js` | SSE 连接未断开 | 页面 unload 时 close |
| `desktop-icons.js` | 拖拽事件监听未移除 | 窗口关闭时 removeEventListener |

**排查命令**:
```bash
# 查找可能的内存泄漏
grep -rn "setInterval\|addEventListener" client/js --include="*.js" | grep -v "remove"
```

---

### 10. 性能优化

**现状**: 部分页面加载慢

**优化点**:
1. **懒加载**: 按需加载视图 JS
2. **代码分割**: 大文件拆分（office-excel.js 2082行 → 拆分为 editor + toolbar + menu）
3. **缓存**: 静态资源加 ETag
4. **压缩**: gzip 压缩响应

---

## 四、功能增强建议

### 1. 主动建议系统扩展

**现状**: v0.80 已实现基础建议系统

**扩展方向**:
- 基于用户行为的个性化推荐
- 历史任务相似性匹配
- 项目阶段智能提示

---

### 2. 多语言支持

**现状**: 仅中文

**扩展方向**:
- i18n 框架集成
- 语言包管理
- RTL 布局支持

---

### 3. 数据可视化

**现状**: Dashboard 简单统计

**扩展方向**:
- 任务完成趋势图
- 需求状态分布
- Agent 性能指标

---

### 4. 导出格式扩展

**现状**: 支持 Word/Excel/PPT

**扩展方向**:
- PDF 导出
- Markdown 导出
- HTML 报告

---

## 五、安全加固建议

### 1. API Key 管理

**现状**: 硬编码 `dev-key-001`

**建议**:
```javascript
// config.yaml
api_keys:
  - key: "prod-key-xxx"
    user_id: "u_123"
    permissions: ["read", "write"]
  - key: "admin-key-yyy"
    user_id: "admin"
    permissions: ["read", "write", "admin"]
```

---

### 2. 输入验证

**现状**: 部分接口未验证输入

**建议**:
```javascript
// 新增 validator.js
const Joi = require('joi');

const chatSchema = Joi.object({
  message: Joi.string().min(1).max(2000).required(),
  context: Joi.object({
    currentView: Joi.string().optional(),
    userName: Joi.string().optional()
  }).optional()
});

router.post('/chat', (req, res, next) => {
  const { error } = chatSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  next();
});
```

---

### 3. SQL 注入防护

**现状**: 使用 SQLite，参数化查询

**建议**: 保持现有风格，新增接口时注意参数化

---

## 六、优先级排序

| 优先级 | 项目 | 工作量 | 收益 |
|--------|------|--------|------|
| P0 | 流式响应修复 | ✅ 已完成 | 高 |
| P1 | 日志系统升级 | 2h | 中 |
| P1 | Timer 统一管理 | 4h | 高 |
| P1 | 错误边界统一 | 3h | 高 |
| P2 | 前端缓存 | 4h | 中 |
| P2 | 后端限流 | 2h | 中 |
| P2 | 工具描述补全 | 6h | 中 |
| P3 | 单元测试 | 20h | 高 |
| P3 | 搜索优化 | 8h | 中 |
| P3 | 内存泄漏排查 | 4h | 高 |

---

## 七、下一步行动

### 短期（1-2周）
1. ✅ 流式响应作用域修复
2. 日志级别控制
3. Timer 统一管理
4. 错误边界统一

### 中期（1个月）
1. 前端缓存策略
2. 后端请求限流
3. 工具描述补全
4. 内存泄漏排查

### 长期（3个月）
1. 单元测试覆盖
2. 搜索质量优化
3. 多语言支持
4. 数据可视化

---

## 八、参考文档

- Pitfalls 文档: `references/*.md`（77 个文件）
- 架构文档: `acms/SKILL.md`
- Agent 小吉: `acms-agent-buddy/SKILL.md`
- 文件浏览器: `acms-file-browser/SKILL.md`
- Office 编辑器: `acms-office-editor-stack/SKILL.md`

---

*报告生成时间: 2026-08-02 16:45*  
*分析人: Agnes*
