# ACMS 「短视频工坊」整合方案 v0.1

> **定位**：ACMS 一个独立 App（套游戏中心集成模式），覆盖多多"看/听 + 简单处理"短视频场景。
> **核心三件套**：AI 字幕生成（A）+ AI 配音/换声（I）+ AI 封面生成（K）。
> **借鉴主参照**：SmartSub/妙幕（MIT，⭐5152，已扒 README）。
> **借鉴副参照**：VideoLingo / AutoClip / YouDub-webui / luluk（仅借鉴思路）。
> **借鉴方法论**：参考 elmo GEO 借鉴工作流（看实物 → 列借鉴清单 → 分批实现，先 UI 后引擎）。

---

## 0. 上下文与边界

| 项 | 值 |
|---|---|
| 用户 | 多多（PM，Win11，国内网络环境，强偏好自建/开源） |
| 场景 | 自己生成的本地短视频（不是爬虫） |
| 形态 | ACMS 应用中心一个新 App（Web 形态，不是 Electron 桌面） |
| 入口 | 📦应用中心→🎬短视频工坊 + 文件浏览器右键"用短视频工坊打开" |
| 集成范围 | 字幕 + 配音 + 封面三件套（其它 A-I-K 砍掉） |

---

## 1. ACMS 现状盘点（已查事实）

### ✅ 已有的底层能力（避免重造）

**多模态生成 Provider（通过 tool 调用）**：

| 类型 | Provider | 调用方式 |
|------|----------|----------|
| 图片 | MiniMax / DALL-E 3 / ComfyUI | `generate_image` tool |
| 音频 TTS | MiniMax TTS / ElevenLabs TTS | `gen-audio-minimax` / `gen-audio-elevenlabs` |
| 音乐 | Suno | `gen-audio-suno` |
| 视频生成 | MiniMax / ComfyUI HunyuanVideo / Agnes | `agnes_generate_video` / `gen-video-*` |

**应用架构（套用模式）**：

- `ACMSWin` 窗口系统 + `registerViewLoader` 模式（`client/js/core/window-manager.js`）
- 游戏中心集成（`client/js/views/game-center.js`，参考先例）
- 文件→应用 registry（`client/js/core/file-app-registry.js`，v0.74.1 抽出）
- App-as-Tool（v0.66）：前端应用通过 WS RPC 暴露能力给小吉/chat 流
- Tool 注册（`server/services/tool-registry.js`，统一入口）
- 应用中心 + 右键菜单（`client/js/views/desktop-context-menu.js`，三级菜单支持）

**关键技术约束（已知陷阱）**：

- 无 bundler，加 JS 用 `<script src="/client/js/...">` + `?v=N`
- ACMSModal **不适合**做浮层（视频工坊候选面板必须 raw DOM + position:fixed）
- 双 index.html（`client/index.html` + `server/services/index.html`），改 view JS 必查两边 `?v=`
- CSS 改必 bump `style.css?v=N`（P35 缓存陷阱）

### ❌ 缺的能力（必须新增）

- **视频播放器**（原生 `<video>` 在 ACMS 没封装成应用；play_video tool 是视频**生成**不是播放）
- **字幕生成**（无 whisper/FunASR/FireRedASR 接入）
- **翻译**（无独立通道，chat 流 LLM 偶尔顺带做但不专业）
- **声音克隆**（ElevenLabs/MiniMax TTS 都不支持声音克隆）
- **智能挑帧**（无 ffmpeg 集成）
- **字幕烧录**（无 ffmpeg 集成）

---

## 2. 借鉴清单（SmartSub 可借鉴点，按 elmo 借鉴方法论）

> **不直接 fork**（SmartSub 是 Electron，ACMS 是 Web 形态）。
> **借鉴**：产品形态、Provider 抽象、UI 模式、算法实现。
> SmartSub License = MIT，借鉴/参考合法。

### ★★★★★ 强烈借鉴

1. **Provider 可插拔架构** —— 字幕/翻译/TTS/烧录各自多 Provider，接口统一；新增 Provider 只需实现 4 个方法（name/available/run/estimate）
2. **全流程免费方案产品定位** —— "本地模型 + 免费翻译 + 本地 TTS 零成本跑通" 作为 ACMS 「短视频工坊」核心卖点

### ★★★★ 重要借鉴

3. **字幕生成 UI 校对台** —— 逐句对照视频检查修改（撤销/重做/AI 润色/单行删除可恢复）
4. **时间轴对齐算法** —— TTS 配音自动对齐字幕时间（语速预控 + 实测复核 + 静音间隙借用 + 超限行列入人工处理清单）
5. **应用内模型管理** —— 首次启动检测本地模型，缺则引导下载（含进度/校验/版本号）
6. **隐私策略（首次使用确认）** —— 云端服务都是可选的，本地处理文件不出本机

### ★★★ 选择性借鉴

7. **字幕烧录所见即所得** —— 字体/字号/颜色/描边/阴影/九宫格位置实时预览
8. **硬件加速自动检测** —— NVIDIA CUDA / AMD Vulkan / Intel / Apple Core ML，按钮引导用户选最优
9. **批量处理 + 任务队列** —— 一个项目多个视频依次处理，进度可看
10. **AI 字幕精修（断句+校正）** —— LLM 语义断句 + 同音字/语气词/标点校正（连接词不吊行尾、数字不被停顿劈开）

### ★★ 不借鉴（技术栈/场景不匹配）

- Electron 桌面应用形态 —— ACMS 是 Web
- yt-dlp / lux 视频下载引擎 —— 多多场景是本地文件，不下载
- 20 个翻译服务多源设计 —— ACMS 起步接 3 个就够（Ollama 本地 + 内置免费 + DeepLX）

---

## 3. 「短视频工坊」App 设计

### 3.1 形态与命名

- **包名**：`media-studio`
- **显示名**：「短视频工坊」（或多多定名）
- **图标**：🎬
- **类别**：工具
- **窗口默认尺寸**：1280 × 800

### 3.2 入口（套游戏中心集成 SOP）

```
① 静态托管   无（前端模块，不需 client/media-studio/）
② viewLoader client/js/views/media-studio.js
③ 应用中心   client/js/views/app-center.js（待确认 + 加 menu）
④ 右键菜单   client/js/views/desktop-context-menu.js → 应用中心 → 短视频工坊
⑤ 文件关联   client/js/core/file-app-registry.js → register('media-studio', {mime: /^video\//, exts: ['mp4','mov','mkv','webm','avi','m4v']})
⑥ index.html <script src="/client/js/views/media-studio.js?v=0.1"> (ACMS 两个 index.html 都要加)
```

### 3.3 三栏布局

```
┌─────────────────────────────────────────────────────────────┐
│ [📁 导入视频] [💾 保存项目] [📤 导出]      🎬 短视频工坊    │  顶栏
├──────────────┬──────────────────────────┬──────────────────┤
│              │                          │ [字幕] [配音] [封面]│
│  项目列表     │      视频播放器           │                  │
│              │   + 时间轴 + 字幕叠加     │   AI 面板        │
│  • 视频1     │                          │   - 模型选择     │
│  • 视频2     │   ▶ ━━━●━━━━━━━ 02:34    │   - 一键执行     │
│  • 视频3     │                          │   - 结果预览     │
│              │                          │                  │
├──────────────┴──────────────────────────┴──────────────────┤
│ 状态栏：FunASR loaded | GPU CUDA | 0 任务                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 工作流（用户视角）

```
1. 拖入本地视频
   ↓
2. 自动抽取音频（ffmpeg）+ 抽取 32 关键帧（ffmpeg，每 ~3s 一帧）
   ↓
3. AI 字幕生成（FunASR 本地 / Whisper 云端 / Ollama 本地精修）
   ↓
4. 校对台逐句修改（撤销/重做/AI 润色）
   ↓
5. 翻译成其它语言（Ollama 本地 / 内置免费 / DeepLX）
   ↓
6. AI 配音（ElevenLabs 已接入通道 / CosyVoice 自建 / MiniMax TTS）
   + 声音克隆（ZipVoice 零样本 / CosyVoice 3s 克隆）
   + 时间轴自动对齐
   ↓
7. AI 封面生成（ffmpeg 抽帧 + 美学评分 + ACMS 已有生图通道 + PIL 中文标题合成）
   ↓
8. 字幕烧录（ffmpeg 硬字幕）+ 导出 mp4
```

### 3.5 数据模型

```sql
-- 媒体项目（每个视频一个项目）
CREATE TABLE media_projects (
  id TEXT PRIMARY KEY,                    -- mp_<uuid>
  name TEXT NOT NULL,                     -- 显示名
  source_video_path TEXT NOT NULL,        -- 本地绝对路径
  source_video_url TEXT,                  -- ACMS file URL（用于播放）
  duration_sec REAL,                      -- ffmpeg probe 出来
  width INTEGER, height INTEGER,          -- ffmpeg probe
  created_at INTEGER, updated_at INTEGER,
  status TEXT DEFAULT 'draft',            -- draft / working / done
  config TEXT                             -- JSON: 字幕/翻译/配音 Provider 选型
);

-- 媒体轨道（一个项目可有多条字幕轨/配音轨/封面候选）
CREATE TABLE media_tracks (
  id TEXT PRIMARY KEY,                    -- mt_<uuid>
  project_id TEXT NOT NULL,               -- FK media_projects
  type TEXT NOT NULL,                     -- subtitle | dub | cover | original
  variant TEXT,                           -- 中文字幕 | 英文翻译 | 我的声音 | 备选封面1
  content TEXT,                           -- JSON: subtitle=SRT 数组 / dub=音轨信息 / cover=图片路径
  output_path TEXT,                       -- 输出文件路径（字幕 .srt / 配音 .wav / 封面 .png）
  metadata TEXT,                          -- JSON: 模型名 / provider / 时长 / 字数
  created_at INTEGER
);

CREATE INDEX idx_tracks_project ON media_tracks(project_id, type);
```

---

## 4. 整合到 ACMS 的具体路径

### 4.1 后端新增文件

```
server/
├── routes/
│   └── media-studio.js                   # REST API（项目 CRUD + 轨道 CRUD + 任务提交）
├── services/
│   └── media-studio/
│       ├── project-store.js              # SQLite 封装
│       ├── track-store.js
│       ├── ffmpeg-runner.js              # ffmpeg 命令行封装（抽音频/抽帧/probe）
│       ├── task-queue.js                 # 任务队列（多视频串行 + SSE 进度推送）
│       ├── model-manager.js              # 本地模型检测/下载/状态
│       └── providers/                    # Provider 抽象（核心借鉴 SmartSub）
│           ├── transcription/
│           │   ├── base.js               # 抽象基类
│           │   ├── funasr.js             # 本地 FunASR（中文 SOTA）
│           │   ├── whisper-cpp.js        # 本地 whisper.cpp（多语种）
│           │   └── openai-whisper.js     # 云端 API 兜底
│           ├── translation/
│           │   ├── base.js
│           │   ├── free-bing.js          # 内置免费翻译
│           │   ├── ollama.js             # 本地 Ollama
│           │   └── deeplx.js             # DeepLX 免费
│           ├── tts/
│           │   ├── base.js
│           │   ├── elevenlabs.js         # ACMS 已有通道（不直接调，复用 gen-audio-elevenlabs）
│           │   ├── minimax-tts.js        # ACMS 已有通道
│           │   └── cosyvoice.js          # 自建（本地声音克隆）
│           ├── cover/
│           │   ├── base.js
│           │   ├── minimax-image.js      # ACMS 已有通道
│           │   ├── dalle.js              # ACMS 已有通道
│           │   └── comfyui.js            # ACMS 已有通道
│           └── registry.js               # Provider 注册表 + getProvider() 工厂
└── tools/
    └── media-studio.js                   # 注册 5 个 server tool（agentTools 暴露给小吉）
```

### 4.2 前端新增文件

```
client/
├── js/
│   └── views/
│       └── media-studio.js               # viewLoader + window.mediaStudioAPI
└── css/
    └── media-studio.css                  # 样式（v=N 必 bump）
```

### 4.3 接入点（修改现有文件）

```
client/js/core/file-app-registry.js       # register('media-studio', ...)
client/js/views/desktop-context-menu.js   # 加 短视频工坊 菜单项
client/index.html                         # 加 <script src> + bump ?v=
server/services/index.html                # 加 <script src> + bump ?v=
```

### 4.4 App-as-Tool 暴露给小吉/chat 流（v0.66 模式）

```js
// client/js/views/media-studio.js
window.mediaStudioAPI = {
  transcribe: async (projectId, provider) => { ... },
  translate: async (projectId, targetLang) => { ... },
  dub: async (projectId, voiceRef) => { ... },
  generateCover: async (projectId, style) => { ... },
  burnSubtitles: async (projectId, options) => { ... },
};

ACMS.registerPackage('media-studio', {
  title: '短视频工坊',
  icon: '🎬',
  category: '工具',
  defaultSize: { w: 1280, h: 800 },
  loader: mediaStudioLoader,
  agentTools: [
    { name: 'media_transcribe', description: 'USE WHEN: ...', parameters: {...}, handler: ... },
    { name: 'media_translate', ... },
    { name: 'media_dub', ... },
    { name: 'media_cover', ... },
    { name: 'media_burn', ... },
  ],
});
```

5 个 tool 的 description 必须含 `USE WHEN:` 前缀（acms-app-as-tool P77）。

### 4.5 测试

- `server/__tests__/media-studio.test.js` —— Provider 注册 / 项目 CRUD / 转写 round-trip
- 浏览器手动：拖入视频 → 全流程跑通 → 导出 mp4

---

## 5. 关键技术决策（5 条已拍板）

| 决策 | 方案 | 理由 |
|---|---|---|
| **字幕引擎主选** | FunASR 本地 | 中文 SOTA + MIT License + 8k 行业模型 + 说话人分离 + 标点预测 |
| **配音引擎主选** | CosyVoice 自建 + ACMS 已有通道兜底 | CosyVoice 中文声音克隆天花板（Apache 2.0），fallback 到 ElevenLabs/MiniMax TTS |
| **封面图生图** | ACMS 已有 3 个 provider 任选 | 不引入新依赖，复用 generate_image tool 的能力 |
| **智能挑帧算法** | ffmpeg 抽 32 帧 + LAION Aesthetic 评分 | 零成本 + 美学业界标准 + 可本地跑 |
| **中文标题渲染** | PIL/Pillow 后期合成 | AI 生图文字弱，PIL 稳定可控，支持任意中文字体 |
| **字幕烧录** | 后端 ffmpeg 命令行（subtitles 滤镜） | 比 ffmpeg.wasm 快 10×，不阻塞前端 |
| **视频播放器** | 原生 `<video>` + 自定义控件 | 简洁可控，ACMS 已用 jQuery/原生 DOM，不引入 video.js |
| **声音克隆 UI** | 必须勾选"已获本人授权"+ 免责声明 | 法律边界（避免诈骗/侵权） |

---

## 6. 分阶段实施路线（按 elmo 借鉴 SOP）

> **借鉴 elmo SOP**：先做可演示 UI 组件（多多刷新即见效果）→ 再做需数据的算法（先 mock 预览 + 数据通道，后升级引擎拿真数据）→ 每批汇报改了什么 + 验证方法 + 版本号

### Stage 0 — 架构骨架（半天）

- [ ] 写本方案文档定稿（本文）
- [ ] 创建 `media_projects` + `media_tracks` SQLite 表
- [ ] 创建 `server/services/media-studio/` 目录骨架（空 stub）
- [ ] 创建 `client/js/views/media-studio.js` 空壳（只渲染三栏布局 + "导入视频"按钮）
- [ ] 应用注册（应用中心 + 右键菜单）
- [ ] **验证**：能开窗口 + 看到三栏空骨架

### Stage 1 — 视频播放器 + 项目管理（2 天）

- [ ] 原生 `<video>` + 自定义控件（播放/暂停/进度/倍速/全屏）
- [ ] 拖入本地视频 / 文件浏览器右键"用短视频工坊打开"
- [ ] 项目 CRUD（创建/打开/删除/重命名）
- [ ] ffmpeg probe（拿 duration/width/height）
- [ ] 状态栏：当前项目 + 路径 + 时长
- [ ] **验证**：拖入 mp4 → 播放 + 项目保存到 DB + 重启后能打开

### Stage 2 — 字幕生成 MVP（3 天）—— 核心价值

- [ ] ffmpeg 抽音频到 wav
- [ ] Provider 抽象（`base.js` + `whisper-cpp.js` 实现）
- [ ] 字幕生成 UI（流式显示 + 进度条）
- [ ] 字幕时间轴叠加（video 上方一行）
- [ ] SRT 导出
- [ ] **验证**：拖入 1 分钟视频 → 30s 内出字幕 → 导出 SRT

### Stage 3 — 字幕校对 + 翻译（2 天）

- [ ] 校对台（按 SmartSub 借鉴 ★★★★）
- [ ] 撤销/重做/AI 润色/单行删除可恢复
- [ ] 翻译 Provider 抽象 + Ollama/DeepLX/内置免费 三选一
- [ ] 双语字幕显示（原文 + 译文）
- [ ] **验证**：英 → 中双语字幕生成 + 校对体验

### Stage 4 — AI 配音 + 声音克隆（3 天）

- [ ] TTS Provider 抽象
- [ ] ElevenLabs / MiniMax TTS 接入（复用 ACMS 已有通道）
- [ ] CosyVoice 自建集成（如 GPU 可用；否则 ElevenLabs 兜底）
- [ ] ZipVoice 零样本克隆
- [ ] 时间轴对齐算法（按 SmartSub 借鉴 ★★★★）
- [ ] 声音克隆法律边界（勾选 + 免责声明）
- [ ] **验证**：上传 10s 参考音频 → 用你的声音给视频配音

### Stage 5 — 智能封面生成（2 天）

- [ ] ffmpeg 抽 32 关键帧
- [ ] LAION Aesthetic 评分（本地小模型）
- [ ] ACMS 已有生图通道集成（MiniMax / DALL-E / ComfyUI）
- [ ] PIL 中文标题合成（任意字体/位置/字号）
- [ ] 候选封面选择 UI
- [ ] **验证**：拖入视频 → 30s 出 3 张候选封面 + 中文标题

### Stage 6 — 字幕烧录 + 导出（2 天）

- [ ] 后端 ffmpeg 烧录（硬字幕 + 字体/样式/位置）
- [ ] 样式所见即所得（CSS 预览）
- [ ] 导出 mp4（带烧录字幕 + 配音混音）
- [ ] **验证**：完整跑通 A→I→K 全流程 < 10 分钟

### Stage 7 — 打磨 + 文档 + 测试（1 天）

- [ ] 错误处理 + 用户提示
- [ ] 文档（README + 用户使用指南）
- [ ] 测试（server `__tests__/media-studio.test.js` + 浏览器手动）
- [ ] 版本号 bump + `?v=` 审计

**总计：~15 工作日（含模型部署，多多 GPU 可用假设）**

---

## 7. 风险与依赖

### 🚨 高风险

- **GPU 依赖**：FunASR / CosyVoice 都需 NVIDIA GPU（推荐 RTX 3060 12G+，显存 < 8G 跑不了 CosyVoice）
  - **依赖**：确认多多环境 GPU 型号（之前 ComfyUI 接了，应该有 3060+）
  - **降级方案**：先全部用云端 API（ElevenLabs + OpenAI Whisper + ElevenLabs Instant Voice Clone），后期逐步替换自建

- **声音克隆法律风险**
  - **强制**：UI 必须勾选"已获本人授权"+ 服务端记录同意时间戳
  - **禁止**：不能克隆公众人物/他人声音

### ⚠️ 中风险

- **长视频处理时间**（>10 分钟）→ 必须进度条 + 异步任务 + 可取消
- **本地模型首次下载**（FunASR ~2GB + CosyVoice ~3GB）→ 用户首次启动耐心
- **Web 形态 vs 桌面形态** —— Web 形态够用，但 ffmpeg.wasm 在前端跑字幕烧录太慢（所以烧录用后端）

### 💡 低风险

- **多模态生图通道 ACMS 已有**，直接复用无新依赖
- **应用架构 ACMS 成熟**，套游戏中心集成 + file-app-registry + agentTools 三套先例
- **Provider 抽象借鉴 SmartSub**，是业界验证过的模式

---

## 8. 待核实清单

> 多多拍板后我就开始按 Stage 0-7 推进

1. **GPU 型号**：多多本地 GPU 是什么？显存多大？（决定 CosyVoice/FunASR 能否本地跑）
2. **App 命名**：「短视频工坊」OK 吗？还是多多想用别的名字？
3. **目标用户场景**：只是多多自己用，还是要让 ACMS 其他用户也能用？（影响默认 Provider 选型 + 文档）
4. **声音克隆**：要不要做？做的话 GPU 要求高（CosyVoice 需 12G+），或者用 ElevenLabs API 兜底？
5. **翻译 Provider 默认**：Ollama 本地（需装 Ollama）还是内置免费（必应/谷歌接口，可能不稳）？

---

## 9. 验收标准（每 Stage 必达）

- **多多刷新生效**：纯前端改动 Ctrl+Shift+R 即可，无需重启 3300
- **每 Stage 可演示**：演示给多多看效果，再继续下一 Stage
- **完整跑通**：Stage 6 完成后，拖入 1 分钟视频 → 10 分钟内出"字幕+配音+封面+烧录"完整成片
- **小吉可调用**：chat 流说"帮我把刚拍的 vlog 自动加字幕" → 小吉调 `media_transcribe` tool
- **文件浏览器集成**：右键 mp4 → "用短视频工坊打开" → 直接进入工作流

---

## 10. 参考资料

### 借鉴主参照

- **SmartSub / 妙幕** (buxuku/SmartSub) ⭐5152 MIT
  - GitHub: https://github.com/buxuku/SmartSub
  - 关键借鉴：Provider 可插拔 + 校对台 + 时间轴对齐 + 全流程免费方案

### 借鉴副参照

- VideoLingo (Huanshere/VideoLingo) ⭐18437 Apache-2.0
- YouDub-webui (liuzhao1225) ⭐5478 Apache-2.0
- AutoClip (zhouxiaoka/autoclip) ⭐7319 MIT
- luluk (ayaoplus/luluk) GPL-3.0（仅借鉴产品指标，不 fork）

### ACMS 内部

- `acms-game-center-integration` skill —— 应用集成模式
- `acms-app-as-tool` skill —— 应用-as-tool 模式（v0.66）
- `acms-file-app-registry` skill —— 文件→应用注册
- `client/js/views/game-center.js` —— 同类集成先例
- `server/tools/leisure.js` —— 已有多模态 tool 参考

### 待写文档（Stage 0 产出）

- `references/media-studio-integration-plan-v1.md` —— 本文档
- `references/media-studio-provider-interface.md` —— Provider 抽象契约
- `references/media-studio-ui-flow.md` —— UI 工作流与状态机
