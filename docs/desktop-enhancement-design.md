# ACMS 桌面增强 — 架构设计方案

> 2026-07-20 · 版本 v1 · 对应 v0.56

## 一、现状评估

| 领域 | 已有基础设施 | 差距 |
|------|-------------|------|
| 桌面容器 | `#acms-desktop`（CSS + DOM） | 背景纯色/渐变，无图片支持 |
| 窗口管理器 | `ACMSWin` API 完整（open/close/focus/min/max） | 无需改造 |
| 桌面图标 | `ACMSWin.registerDesktopIcon()` + `#desktop-icons` 容器 + CSS | 只有回收站 1 个，不可配置 |
| 主题系统 | `App.toggleTheme()` + localStorage `acms-theme` | 可扩展为入口 |
| 右键菜单 | `#acms-ctx-menu` CSS 存在，但 JS 未实现 | 需要从零建事件绑定 |
| 图片生成 | `image-gen.js` 渲染候选图，结果有 URL | 需加"设为壁纸"入口 |

## 二、架构总览：三层独立子系统

```
┌─────────────────────────────────────────────────┐
│                  桌面容器                         │
│              #acms-desktop                        │
│  ┌─────────────────────────────────┐             │
│  │  浮动窗口 (window-manager.js)    │             │
│  │  窗口 A  │  窗口 B  │  窗口 C    │             │
│  └─────────────────────────────────┘             │
│                                                   │
│  壁纸图层 (wallpaper.js)   │  桌面图标层           │
│  ┌──────────────────────┐ │  ┌──────────────┐    │
│  │  background-image:   │ │  │ 📦 项目管理  │    │
│  │  url(...) cover      │ │  │ 📋 需求管理  │    │
│  └──────────────────────┘ │  │ 🗑 回收站    │    │
│                           │  └──────────────┘    │
└─────────────────────────────────────────────────┘
        ▲                        ▲
        │                        │
  wallpaper.js             desktop-icons.js
  (零外部依赖)             (依赖 ACMSWin API)
```

**核心设计原则**：
- 每个子系统独立文件、独立 API、独立 localStorage key
- 子系统之间零交叉引用
- 设置窗口是「UI 消费者」，调用子系统的 API，不引入中介层

## 三、子系统设计

### 3.1 壁纸子系统 — `wallpaper.js`

**API 接口**：
```js
window.ACMSWallpaper = {
  set(url, style)       // 设置壁纸（url=图片URL/DataURL, style=cover/fill/contain）
  get()                 // 返回 { url, style, presets }
  reset()               // 恢复默认背景（CSS 变量 + 渐变）
  getPresets()          // 返回预设壁纸列表
}
```

**存储**：localStorage
```
acms-wallpaper     → { url: "...", style: "cover" }
acms-wallpaper-presets → "[\"data:...\", \"data:...\", ...]"
```

**CSS 控制**：
```css
#acms-desktop.has-wallpaper {
  background-image: var(--wallpaper-url);
  background-size: var(--wallpaper-style, cover);
  background-position: center;
  background-repeat: no-repeat;
  /* 保留渐变 overlay 保证文字可读性 */
}
```

**加载过渡**：
- 先将图片在内存（`new Image()`）中预加载 → `onload` 后才设置到 DOM
- 设 `opacity: 0` → 加载完成后 `transition: opacity 0.3s` → `opacity: 1`
- 避免闪白/闪灰

**预设壁纸**：内置 4-5 张，硬编码为 DataURL（小尺寸简约渐变/纹理，不依赖外部图片）

**与主题的关系**：壁纸可以叠加在主题之上。主题改 CSS 变量（--bg, --accent），壁纸改 background-image，互不影响。

### 3.2 桌面图标子系统 — `desktop-icons.js`

**当前已有的**（在 `window-manager.js` 中）：
- `ACMSWin.registerDesktopIcon(spec)` — 代码注册
- `ACMSWin.updateDesktopIconBadge(id, badge)` — 更新 badge
- `#desktop-icons` 容器 + CSS 样式
- 目前仅回收站 1 个图标（`app.js` 中注册）

**增强方案**：

**API 新增**：
```js
ACMSWin.pinLauncherItem(spec)
  // 从启动菜单固定一个项目到桌面
  // spec = { id, icon, label, onClick }
  // 写入 localStorage + 刷新桌面

ACMSWin.unpinDesktopIcon(id)
  // 从桌面移除图标

ACMSWin.getPinnedIcons()
  // 读取 localStorage 中已固定的图标列表
```

**存储**：localStorage `acms-desktop-pinned` → 存 `[{id, icon, label, action}]`

**"右键固定到桌面"的实现机制**：

启动菜单里每个可固定的项需要结构一致才能被通用处理。方案：

1. 给每个 `launcher-item` 加 `data-pinable="true"` 属性
2. 右键点击 launcher-item 时：
   a. 读取该元素的 `data-pin-id`（或直接用 onclick 函数名做标识）
   b. 读取该元素的图标（`.li-icon` textContent）和标签（`.li-label` textContent）
   c. 构建 spec → 调用 `ACMSWin.pinLauncherItem(spec)`
3. 桌面渲染时：读 `acms-desktop-pinned` → 每个 spec 重建 DOM + 绑定 click handler

**注意事项**：
- 新建对话（需要先创建 session）这种特殊 action，固定时用函数名字符串，点击时调用同名全局函数
- 简单的 `launchView('kanban')` 类型，固定时存 viewName，点击时直接调用 `ACMSWin.open(viewName)`

**桌面图标容器位置**：
- 目前右下角固定（right: 16px, bottom: 56px），对少数图标 OK
- 图标增多后改为弹性网格（flex-wrap），支持垂直扩展
- 支持拖拽排序（交互独立，不影响其他子系统）

### 3.3 文件浏览器 — `file-browser.js`

**这是一个独立的窗口视图，与壁纸/桌面图标无耦合。**

**后端**：
```
GET /api/files?path=/workspace/project-xxx
→ {
    currentPath: "/workspace/project-xxx",
    parentPath: "/workspace",
    entries: [
      { name: "src", type: "dir", size: null, mtime: "2026-07-20T...", icon: "📁" },
      { name: "README.md", type: "file", size: 2048, mtime: "2026-07-19T...", icon: "📄" },
      { name: "logo.png", type: "file", size: 128000, mtime: "2026-07-18T...", icon: "🖼" },
    ]
  }
```

**权限控制**：
- 非 admin 用户：限制在 `workspaces/<project_id>/` 目录下
- admin 用户：无限制（可浏览整个服务器文件系统）

**路由**：`POST /api/files/read` 读取文件内容（文本/JSON），`GET /api/files/raw?path=...` 获取文件二进制

**前端组件**（`file-browser.js`）：
- 使用 `ACMSWin.registerViewLoader('file-browser', loader)` 注册
- 界面：地址栏 + 面包屑导航 + 文件列表（名称/大小/修改时间/类型图标）
- 双击目录 → 进入
- 点击图片文件 → 预览浮层 + "设为壁纸"按钮（调用 `ACMSWallpaper.set(url)`）
- 右上角搜索/过滤

**与壁纸的集成**：
- 在文件浏览器中选中图片 → 底部按钮 "设为壁纸"
- 在 `image-gen.js` 的每张候选图下方加一个 "🖼 设为壁纸" 按钮

### 3.4 设置入口与 UI

#### 入口 A：桌面右键菜单

当前 `#acms-ctx-menu` CSS 已有但 JS 未实现。新建 `desktop-context-menu.js`：

```
┌─ 桌面 ──────────────┐
│ 🖼 设置壁纸...       │ → 打开壁纸设置窗口
│ 📌 管理桌面图标...   │ → 打开图标管理窗口
│ ────────────────    │
│ 🖼 选择预设壁纸     │ → 子菜单（4-5 个预设）
│ 🗑 清除壁纸         │ → 调用 ACMSWallpaper.reset()
│ ────────────────    │
│ 📂 文件浏览器       │ → ACMSWin.open('file-browser')
└─────────────────────┘
```

#### 入口 B：🎨 主题浮层扩展现有入口

当前 `#tb-theme-btn` 点击只做 `App.toggleTheme()` 循环切换。改为：

点击 🎨 → 弹出浮层（替代 now 的直接切换）：

```
┌─ 🎨 主题与桌面 ─────┐
│ 主题：🌙 ☀️ 📄     │ ← 三个主题按钮，保持现有行为
│ ────────────────    │
│ 壁纸：              │
│ [预览缩略图]        │ ← 当前壁纸预览
│ [更换壁纸] [清除]   │ ← 按钮
│ ────────────────    │
│ 桌面图标：          │
│ 📌 已固定 3 个      │
│ [管理图标]          │
└─────────────────────┘
```

#### 入口 C：启动菜单

启动器新增 "桌面设置" 项（可选），打开设置窗口。

#### 壁纸设置窗口

```
┌─ 🖼 壁纸设置 ──────────────┐
│                            │
│   ┌──────────────────┐    │
│   │  壁纸预览区域     │    │
│   │  (當前壁紙縮略)   │    │
│   └──────────────────┘    │
│                            │
│  来源：                    │
│  [📁 上传图片] [📂 文件浏览器] │
│  [🎨 从图片生成中选取]     │
│                            │
│  缩放方式：                │
│  ◉ 铺满 (cover)  ○ 适应 (contain)  ○ 拉伸 (fill) │
│                            │
│  预设壁纸：                │
│  [■] [■] [■] [■] [■]     │
│                            │
│  [清除壁纸]     [应用]     │
└────────────────────────────┘
```

#### 桌面图标管理窗口

```
┌─ 📌 桌面图标管理 ──────────┐
│                            │
│  已固定的桌面图标：        │
│  ┌──────────────────────┐ │
│  │ 🗑 回收站        [×] │ │
│  │ 📦 项目管理      [×] │ │
│  │ 📋 需求管理      [×] │ │
│  └──────────────────────┘ │
│                            │
│  可添加的启动项：          │
│  ┌──────────────────────┐ │
│  │ 📊 仪表盘    [+固定] │ │
│  │ 📌 任务看板  [+固定] │ │
│  │ 🐛 缺陷管理  [+固定] │ │
│  │ 🤖 智能体    [+固定] │ │
│  └──────────────────────┘ │
└────────────────────────────┘
```

## 四、文件清单与改动半径

### 新增文件

| 文件 | 职责 | 预估行数 | 依赖 |
|------|------|---------|------|
| `client/js/views/wallpaper.js` | 壁纸核心（API + CSS 控制 + 存储） | ~120 | 无 |
| `client/js/views/desktop-icons.js` | 桌面图标可配置化（固定/取消/排序） | ~150 | `ACMSWin` API |
| `client/js/views/file-browser.js` | 文件浏览器窗口视图 | ~200 | `ACMSWin.registerViewLoader` |
| `client/js/views/desktop-context-menu.js` | 桌面右键菜单 | ~80 | `ACMSWallpaper`, `ACMSWin` |
| `server/routes/files.js` | 文件浏览后端 API | ~60 | Express router |
| `client/js/core/wallpaper-api.js` | 可选：前端 API 层 | 0（合并入 wallpaper.js） | |

### 改动文件

| 文件 | 改动 | 幅度 |
|------|------|------|
| `client/index.html` | 加 4 个 `<script>` 引用 + 右键菜单入口 | +5 行 |
| `client/css/style.css` | 壁纸 CSS 变量 + 桌面图标增强 + 文件浏览器样式 | +~60 行 |
| `client/js/views/taskbar.js` | 🎨 主题按钮改为弹出浮层 | 改 `bindEvents()` ~20 行 |
| `client/js/views/assists/image-gen.js` | 候选图和成图下加"设为壁纸"按钮 | +~10 行 |
| `client/js/views/window-manager.js` | 增强 `registerDesktopIcon` 支持用户配置 | +~30 行 |
| `client/js/app.js` | 初始化时调用 `initDesktopFeatures()` | +~5 行 |
| `server/app.js` | 挂载 `/api/files` 路由 | +2 行 |

### 不需要改的

- `state.js`（主题系统）— 不耦合
- `router.js` — 路由不变
- 各个视图的 loader（admin, kanban, chat 等）— 不耦合
- 后端任务系统 — 不涉及

## 五、集成点到 image_gen

在 `image-gen.js` 的 done 状态渲染中，每个候选图下方增加一个按钮：

```js
// 在每个候选图下方
'<div style="margin-top:2px;display:flex;gap:4px;justify-content:center">' +
  '<button class="btn-small" onclick="event.stopPropagation();' +
    'ACMSWallpaper && ACMSWallpaper.set(\'' + escHtml(assetUrl || cdnUrl) + '\')" ' +
    'style="font-size:10px">🖼 设为壁纸</button>' +
'</div>'
```

同样的，在单图模式（legacy）的渲染中也加一个"设为壁纸"按钮。

## 六、实现顺序（渐进式）

```
Phase 1 ─ 桌面右键菜单 + 壁纸核心
  ├── wallpaper.js（核心 + API + CSS）
  ├── desktop-context-menu.js（右键菜单 + 预设/清除）
  ├── 🎨 浮层改造
  └── image-gen.js 集成点

Phase 2 ─ 桌面图标可配置化
  ├── desktop-icons.js（固定/取消/排序）
  ├── 启动菜单右键固定
  └── 管理窗口

Phase 3 ─ 文件浏览器
  ├── 后端 routes/files.js
  ├── 前端 file-browser.js
  └── 文件浏览 + 设为壁纸集成

Phase 4 ─ 壁纸设置窗口
  ├── 上传 + 预设选择 + 缩放切换
  └── 完整预览
```

## 七、几个设计校验

### 这是低耦合的吗？
是。壁纸、桌面图标、文件浏览器是三个独立文件，互相不引用。右键菜单是 UI 层，调用它们的 API。即使以后移除某个子系统，不影响其他功能。

### 这是可扩展的吗？
是。新注册制沿用已有模式（viewLoader + registerDesktopIcon）。未来再加桌面小部件（时钟、天气）可以走同样的 `registerDesktopWidget()` API，不需要改现有代码。

### 用户体验直观吗？
- 右键桌面 → 最自然的桌面操作范式
- 🎨 浮层 → 主题和壁纸放在一起，用户认知一致（"装饰桌面"）
- 右键启动菜单项固定 → 类比手机桌面"添加到主屏幕"
- 文件浏览器选图设为壁纸 → 类比 macOS Finder/Windows 资源管理器

### 回退方案？
所有功能是渐进增强。如果某个功能出问题，不影响 ACMS 核心功能（窗口、聊天、看板、项目）。localStorage 存储，清除即可恢复默认状态。
