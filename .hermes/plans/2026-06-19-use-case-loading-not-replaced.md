# 2026-06-19 use_case 整理「加载中」不消失 bug 修复

## 现象
用户在聊天里点"✨ 整理"按钮触发 use_case 辅助。后端生成完毕（GET /assist 日志看到 status=done），
但前端 loading 卡片一直挂着不消失。

## 根因
后端 use-case service 写回 `req.structured_requirements` 时**没有 `generated_at_round` 字段**。
前端 `renderAssistLayer` L3593 过滤 `if (d.generated_at_round !== cr) continue` → 永远跳过 use_case →
不走 L3661-3665 就地替换 loading 卡片 → loading 永远显示。

对比其他 assist（decision_tree / scenarios 等）都通过触发端点 L760 传 `chatRound` 给 service，
service 内部会写 `generated_at_round`。use-case 触发端点已传 chatRound（route L760），
但 `runUseCaseAssistJob`（server/services/assists/use-case.js:207）接收了 opts 但没把 chatRound 写入
structured_requirements → 直接丢了。

## 修复（A 方案）
- 后端 `server/services/assists/use-case.js`:
  - L213-226 generating 状态写入加 `generated_at_round: opts.chatRound || 1`
  - L289-298 done 状态写入加 `generated_at_round: opts.chatRound || 1`
- 前端 `client/js/views/requirements.js`:
  - L3600 fingerprint 加 use_case 5 字段（businessCases/userCases/systemCases/assumptions/summary）
  - 避免 cache 误判"数据没变"导致不重渲染

## 触发端点（已正确，无须改）
- `server/routes/requirements.js:758-760` 已经传 `chatRound: manualRound` 给 service

## 改动文件
```
server/services/assists/use-case.js  |  2 处加 generated_at_round 写入
client/js/views/requirements.js     |  1 处 fingerprint 加 use_case 字段
```

## 验证步骤
1. Ctrl+C 重启本地 server（多多自己）
2. Ctrl+Shift+R 硬刷浏览器
3. 进入任意 idea 状态需求 → 聊天里点"✨ 整理"按钮
4. 预期：loading 卡片约 10-30s 后变成完整 ECSR 整理结果（业务/用户/系统三层 + 假设清单）

## 未做（硬约束）
- ❌ git add/commit/push
- ❌ 部署到 120.24.204.130
- ❌ 自动 restart ACMS 服务

## 遗留风险（按 6/16 SOP "局限必须修或显式 defer"）
1. **老 use_case 数据没 `generated_at_round`**：修完后端后，老的 use_case done 数据仍会被前端过滤掉
   → 用户得**重新点一次整理**才能看到旧数据（不影响新生成的）
2. **dispatcher.js L113/143 也有 `generated_at_round` 过滤**：但 `ACMSAssistDispatcher.loadAll/render`
   0 个调用方（已 grep 确认），是历史遗留死代码，不影响当前
3. **apply 端点写 `status: 'applied'`**（L374-380）走 `...structuredData` 展开但不含 generated_at_round：
   不会渲染（status !== 'done' 直接 continue），defer 范围
4. **use-case.js:93 写死 `data.tool !== 'use_case'`**：未来若改 method 名易踩坑，defer
5. **fingerprint 仍硬编码 17 字段**：未来加新 method 字段必须手动加，defer（建议后续抽 helper）

## 数据流（验证后）
```
[点击"整理"] chatAssist(reqId, 'use_case')
  ├─ showAssistLoading() → 插 .assist-loading-card 到 chat-stream-msgs
  ├─ POST /assist/use_case
  │     ↓ 后端 runUseCaseAssistJob(id, { chatRound: N })
  │     ↓ 写回: { status, tool, ...normalized, generated_at, generated_at_round: N, model }
  └─ startChatPolling (3s/次)
       └─ renderAssistLayer L3587:
            for (const method of ['use_case', ...]) {
              if (d.generated_at_round !== cr) continue;   ← 现在 use_case.generated_at_round === cr
            }
            ...
            L3661-3665: loadingEl.replaceWith(el)  ← 现在能走到这一步
```
