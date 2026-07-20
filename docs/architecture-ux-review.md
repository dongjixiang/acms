# ACMS 架构与体验审查报告
> 2026-07-20 · 基于 v0.56 代码库

---

## 一、架构问题（按严重程度排序）

### 🔴 A1: `enable()` 每次重建桌面 → 状态丢失

**症状**：每次进入项目，`enable()` 执行 `desktop.remove()` 再 `ensureDesktop()` 重建 `#acms-desktop`。导致：

- 壁纸 CSS 变量丢失（已 patch 补回，但增加复杂度）
- 窗口全关（`closeAll()`）——如果用户有打开窗口，切换项目再回来全部丢失
- 切换项目有「闪一下」的感觉

**根因**：`enable()` 函数第 277-280 行无条件移除旧桌面。

**建议**：改为条件重建——只有当桌面不存在或 DOM 失效时才重建；只是切换项目/聚焦时只做 `desktop.style.display = 'block'`。

```js
function enable() {
  var d = ensureDesktop();          // 不复存在就创建，存在就复用
  closeAll();                       // 关窗口，不关桌面
  d.style.display = 'block';
  desktopShown = true;
  renderDesktopIcons();
  // 壁纸应用...
}
```

---

### 🔴 A2: 视图加载器注册散落各处

**当前状态**：

| 位置 | 注册的视图 |
|------|-----------|
| `index.html` 内联 `<script>` | admin, projects, chat |
| `file-browser.js` IIFE | file-manager |
| `wallpaper-settings.js` IIFE | wallpaper |
| `web-browser.js` IIFE | web-browser |
| `desktop-icons.js` IIFE | desktop-icons-manager |

**问题**：
- 同一件事（注册加载器）做了 4 种不同方式
- 内联 `<script>` 里的注册要手动匹配 script 加载顺序
- 新开发者不知道应该放哪

**建议**：统一为一种模式——每个视图文件自己注册（如 file-browser.js 的做法），index.html 里的内联注册逐步迁移出去。

---

### 🔴 A3: 内联 onclick 字符串既难解析又难维护

**症状**：启动菜单条目用 `onclick="if(window.ACMSWin){if(!ACMSWin.isActive())ACMSWin.enable();ACMSWin.open('file-manager',{w:800,h:520,title:'文件浏览器'})}"`：

- `desktop-icons.js` 的 `parseLauncherAction()` 靠正则匹配，解析不了复杂表达式
- 改尺寸/标题要改 HTML，不灵活
- 右键固定到桌面后的行为跟点击启动菜单不一致

**建议**：所有启动项统一改为 `onclick="launchView('file-manager')"` 格式，窗口尺寸在 loader 内部控制。

---

### 🔴 A4: `setupWorkspaceNav()` 重复绑定事件（P18）

每次 `enterProject()` 调用都在 `#sidebar .nav-btn` 上附加新的 click 监听器，从不清理旧监听。多次进出项目后可能触发多次 `showWorkspaceView()`。

---

### 🟡 A5: desktop-icons 通过内部钩子耦合到 window-manager

`replaceDesktopIcons`、`_onDesktopIconMoved`、`_onDesktopIconsReordered` 都是通过 `ACMSWin._xxx` 内部钩子通讯的。这比 monkey-patch 好，但仍然不是正式 API。

**建议**：正式化为 `ACMSWin.onDesktopIconsChange(fn)` 注册监听器模式。

---

### 🟡 A6: CSS 有冗余/冲突定义

- `#acms-desktop` 在 style.css 中定义了至少 2 次（不同位置，不同属性）
- 桌面图标相关的 CSS 在多次迭代后有多余的 `.dragging`、`.drag-over` 样式残留

---

### 🟡 A7: 全局函数污染

所有视图都以 `window.FB_xxx`、`window.WB_xxx` 暴露全局函数。ACMS 的约定如此，但随着视图增多，全局命名空间越来越拥挤。

**建议**：函数名加统一前缀或 namespace，当前至少保持 `FB_`、`WB_` 命名习惯一致。

---

## 二、用户体验问题（按用户感知排序）

### 🔴 U1: 反馈一致性差

| 场景 | 反馈方式 | 问题 |
|------|---------|------|
| 文件浏览器加载 | 「⏳ 加载中...」 | 不透明的"一直转" |
| 文件操作成功/失败 | 部分有 toast，部分没有 | 用户不确定操作是否成功 |
| 右键菜单选择 | 立即执行，无确认 | 删除无二次确认 |
| 拖拽排序 | 视觉反馈有但延迟 | 不够跟手 |

**建议**：所有操作成功后显示一个统一风格的 toast（绿色），失败显示红色并附带错误原因。删除操作加确认弹窗。

---

### 🔴 U2: 加载状态缺少骨架屏

窗口打开时：`w.$c.innerHTML = '⏳ 加载中...'`。一个居中的小文本在这种大桌面空间里几乎看不见。用户经常以为「点了一下没反应」。

**建议**：至少用一个更大的居中 spinner + "正在加载"文字组合，或者内容骨架占位。

---

### 🔴 U3: 错误处理静默失败

多处代码用 `try { ... } catch(e) {}` 吃掉异常，用户看不到错误。例如：
- 文件浏览器 API 调用失败时只在 debug 控制台输出
- 壁纸加载失败静默跳过
- 桌面图标持久化失败不通知

---

### 🟡 U4: 启动菜单条目行为不一致

| 条目 | 行为 |
|------|------|
| 项目管理 | 打开窗口 |
| 系统管理 | 打开窗口 |
| 文件浏览器 | 打开窗口 |
| 对话 | hover 展开子菜单 |
| 退出登录 | 直接跳转 |

没有视觉提示区分「打开窗口」「展开子菜单」「执行操作」。用户不知道点击还是悬停。

---

### 🟡 U5: 窗口之间缺乏数据同步

A 窗口改了数据，B 窗口不会自动刷新（P3/P23已知问题）。用户需要手动关窗重开。

---

### 🟡 U6: 桌面上「自动排列」状态不直观

右键菜单里「自动排列」显示 ☑/☐，但用户拖拽图标后会静默关闭自动排列（写在 localStorage 里），没有任何提示。用户可能不理解为什么突然不能自动对齐了。

---

### 🟡 U7: 文件浏览器排序只有默认排序

没有点击列头切换排序（按名称、大小、时间），也没有筛选。目录一多就难找。

---

### 🟡 U8: 壁纸设置窗口缺少「应用」按钮

当前设置壁纸是即时生效的（点预设/上传立刻应用）。用户可能想选好后再确认。

---

## 三、短期可修的 Quick Wins

| 优先级 | 问题 | 改动量 | 影响面 |
|--------|------|--------|--------|
| P0 | A1: enable() 重建桌面 | 改 window-manager.js ~5 行 | 全系统 |
| P0 | 文件浏览器 type 匹配（已修） | 已修 | 文件浏览器 |
| P1 | 启动菜单统一为 `launchView()` | 改 index.html 启动项 + desktop-icons.js | 启动菜单 + 桌面图标 |
| P1 | U1: 操作反馈 toast | 在各操作点加 toast 调用 | 全系统 |
| P2 | A4: 重复绑定 | router.js ~3 行 | 导航 |
| P2 | U3: 静默错误增加 console.warn | 各 catch 块 | 全系统 |
| P3 | A6: CSS 清理 | style.css 清理冗余 | 界面 |
| P3 | U7: 文件列表列头排序 | file-browser.js +~50 行 | 文件浏览器 |

---

## 四、架构原则回顾（跟你的偏好对标）

| 你的要求 | 当前符合度 | 主要差距 |
|---------|-----------|---------|
| 低耦合 | ✅ 基本 OK | window-manager 和 desktop-icons 的内部钩子、内联 onclick 依赖 |
| 注册/插件模式 | ✅ OK | viewLoader + AppManager 模式已建立 |
| 最小半径改动 | ⚠️ 有时妥协 | 为快修引入了一些临时耦合（如 enable() 壁纸 patch） |
| 治根因不治症状 | ⚠️ 有改进空间 | 壁纸丢失根因是 enable() 重建桌面，patch 是治症状 |
| 最小耦合 | ✅ 大部分路径对 | desktop-icons 模块设计符合原则 |
| 用户体验连贯 | ⚠️ 有碎片 | toast 不统一、加载状态不明显、反馈缺失 |
