# 2026-06-29 部署剧本功能 v0.22.x 修复到 120 服务器

## 三方状态表

| 位置 | HEAD | 说明 |
|---|---|---|
| 本地 | c91328c | 跟 origin/main 一致，无领先 commit |
| 远端 main | c91328c | 同上 |
| 远端 master | ab6f398 | 不同分支，忽略 |
| 服务器 | (待查) |  |

## 改动文件清单（6 个文件，323 insertions / 50 deletions）

1. `client/index.html` — bump 3 个 ?v= 版本号（screenplay-core 0.22.21→0.22.23, screenplay 0.22.21→0.22.23, dispatcher 0.22.19→0.22.22）
2. `client/js/views/assists/dispatcher.js` — regenerateBatch 标记 _explicitAssist + poll 清理（v0.22.22，修"换一批剧本不显示"）
3. `client/js/views/assists/screenplay-core.js` — textarea id 用 idx + buildCharacterPrompt/buildScenePrompt/buildSceneVideoPrompt（v0.22.22 + v0.22.23）
4. `client/js/views/assists/screenplay.js` — 视频生成用 buildSceneVideoPrompt + 收集 image_urls（v0.22.23）
5. `server/services/assists/image-gen.js` — downloadAndSaveOne 用 curl 子进程绕开 Node TLS ECONNRESET（v0.22.22）
6. `server/services/assists/video.js` — resolveImageUrlToBase64 helper + runAssistJob 统一转 base64（v0.22.24，修多图视频图片源问题）

## 未提交文件清单
无（6 个 modified 全是本次 agent 改动，按 P27 检查过无多多本地 uncommitted 混入）

## 风险点

- `server/*` 改动 2 个文件，按 P16 必须重启 ACMS 服务
- 服务器 modified 文件可能存在（待 plan 备份步骤查）
- push 失败重试 3 次按 P17

## A/B/C 方案

**A. 完整 push + 服务器 reset --hard + restart ACMS**（标准做法）
- 本地 commit + push
- 服务器 backup modified 文件 → git reset --hard origin/main
- restart ACMS（systemctl restart acms）
- 验证 + 通知多多硬刷

**B. cherry-pick 不重置**
- 不可行（本地 HEAD 跟 origin/main 一致，无独立 commit 可 cherry-pick）

**C. scp 覆盖不动 .git**
- 不可行（按 P14b 本地有 6 个文件改动，scp 不可维护一致性）

## 等待动作

✅ 多多明文说"把修改的代码提交到GIT上，同时更新到120服务器上" — 直接按方案 A 执行