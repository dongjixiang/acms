---
skill_id: skill-multimodal-generation
category: generation
created: 2026-06-07
updated: 2026-06-07
version: 1.1.0
---

# 多模态生成（图片与音频）— MiniMax 一体化版

> 为需求提供图片生成（image-gen）和音频生成（audio-gen）能力。支持 MiniMax 统一方案（一条 API Key 覆盖文本+视觉+图片生成+语音合成），以及 DALL-E、ComfyUI、ElevenLabs、Suno 等扩展 provider。生成的媒体自动进入项目知识库。

## 匹配规则

| 匹配维度 | 值 |
|---------|-----|
| 任务类型 | `image-gen`, `audio-gen` |
| 标签 | 图片, 音频, 生成, 配图, 音效, 语音, 配音, 多模态, MiniMax |
| 所需技能 | `multimodal: 1.0` |

## 触发场景

1. **需求澄清阶段** — LLM 检测到需求涉及配图、UI 原型图、角色语音、背景音效等 → 向用户建议创建 `image-gen` / `audio-gen` 子需求
2. **任务分解阶段** — `ai-tools-service.js` 的任务类型选择中包含 `image-gen` / `audio-gen`，LLM 自动识别需要多模态生成的任务
3. **手动创建** — 用户直接在需求详情页创建 `image-gen` 或 `audio-gen` 类型任务

---

## 执行步骤

### Step 1 — 解析任务要求

从任务描述中提取：
- **生成类型**: 图片 | 音频
- **内容描述**: 需要生成什么（主题、风格、参考）
- **规格参数**: 尺寸、格式、时长、音色等
- **关联需求**: 生成的媒体将服务于哪个需求/模块

### Step 2 — 选择 Provider

| 场景 | 推荐 Provider | 理由 |
|------|-------------|------|
| 产品配图 / UI 原型 | DALL-E 3 | 质量高、延迟低 |
| 游戏资源 / 像素风 | ComfyUI + SD | 风格可定制、可批量 |
| **通用图片生成** | **MiniMax 图片生成** | **一条 Key 覆盖，无需额外配置** |
| 角色对话语音 | ElevenLabs | 自然度最高 |
| **通用语音合成** | **MiniMax TTS** | **复用模型 Key，零额外配置** |
| 背景音乐 / 音效 | Suno | 完整曲目 |
| 简单图示 / 图标 | DALL-E 3 / MiniMax | 最快出图 |

**MiniMax 一体化优势**：只需在大模型配置里配一次 API Key，`modelRef` 自动继承给 `minimax-image` 和 `minimax-tts` 两个生成器，无需重复输入。

### Step 3 — 构建 Prompt

从以下来源构建 prompt：
- 任务描述的 `description` 字段
- 关联需求（`parent_id`）的 SRS scopeIn / acceptanceCriteria
- 关联需求的澄清记录（提取用户偏好的风格描述）
- 项目知识库中已有的媒体文件作为参考

### Step 4 — 调用 Generation Adapter

```javascript
const result = await genAdapter.generateImage({
  projectSlug, providerId, prompt, params
});
// 返回: { success, assetPath, mime, metadata }
```

### Step 5 — 保存到 Workspace Assets

```
workspaces/{projectSlug}/assets/2026-06-07/{prompt}_{hash}.png
```

### Step 6 — 验证生成结果

| 类型 | 验证方式 |
|------|---------|
| 图片 | Vision AI 检查是否包含描述要素、风格匹配 |
| 语音 | 检查文件存在 + 长度合理 |

### Step 7 — 录入知识库

生成完成后自动调用 `scanGeneratedAsset()`：
1. 运行 scanner pipeline
2. AI 视觉分析（图片）
3. 创建 entities/{name}.md
4. 自动关联到源需求

### Step 8 — 提交任务

提交时附上 assetPath、MIME、metadata。

---

## 注册的生成器

| ID | Provider | 能力 | Key 来源 |
|----|---------|------|---------|
| `gen-img-openai` | openai-dalle | DALL-E 3 图片 | 自己的 config |
| `gen-img-minimax` | minimax-image | MiniMax 图片 | `modelRef` 复用大模型 Key |
| `gen-img-comfyui` | comfyui | 本地 Stable Diffusion | 自己的 config |
| `gen-audio-minimax` | minimax-tts | MiniMax 语音合成 | `modelRef` 复用大模型 Key |
| `gen-audio-elevenlabs` | elevenlabs | TTS 语音 | 自己的 config |
| `gen-audio-suno` | suno | 音乐生成 | 自己的 config |

---

## 任务模板

| 维度 | 值 |
|------|-----|
| 标题 | 模板: {description} 生成 |
| 类型 | `image-gen` (图片) 或 `audio-gen` (音频) |
| 预估工时 | 2h（图片）、3h（音频含迭代） |
| 所需技能 | `multimodal: 1.0` |

---

*由 ACMS Skill 系统管理*
