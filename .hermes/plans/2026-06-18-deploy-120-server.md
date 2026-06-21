# 2026-06-18 部署 v0.10 + fix 到 120 服务器

## 用户原始诉求
> "本地代码是最新最正确的，用本地代码刷新 120 服务器"

## 诊断结论(已完)

**三方状态(2026-06-18 早):**

| 位置 | HEAD | 说明 |
|---|---|---|
| 本地 main (Windows) | `ff39069` | 领先 origin/main 1 commit |
| 远端 origin/main | `efa1b63` | v0.10 线,跟本地几乎一致 |
| 远端 origin/master | `ab6f398` | **v1.6 独立分支**,跟本地/服务器完全分叉,85+ commit 不在本地 |
| 120 服务器 HEAD | `b6f03b7` | 卡在 v0.9,**缺 v0.10 (efa1b63) + fix (ff39069)** |
| 120 服务器 origin/master (fetch) | `ab6f398` | 服务器 fetch URL 拿到的是 master=v1.6 |

**远端两条分支完全独立 — 这是部署谜团的根源。**

## v0.10 改了什么(已确认是纯前端)

```
efa1b63 feat(chat-upload): v0.10 聊天 textarea 支持 Ctrl+V 粘贴截图
  client/js/views/requirements.js | 61 ++++++++++++-------- (53 新增 8 删除)

ff39069 fix(dt): examples 拆分正则加中文顿号、...
  client/index.html                        | 2 +-
  client/js/views/assists/decision-tree.js | 4 ++--
```

**零后端改动。** v0.10 不需要 `npm install` / 不需要 `pkill` 重启 node。
部署后用户 Ctrl+Shift+R 硬刷浏览器即生效。

## 120 服务器未提交状态(已全列出)

**Modified(6):**
- `client/css/style.css` (105938B, 6/17 改)
- `client/index.html` (29679B, **6/18 00:12 改 — 今天凌晨**)
- `client/js/core/markdown.js`
- `client/js/views/assists/decision-tree.js`
- `package-lock.json`
- (服务器 HEAD=b6f03b7 跟本地 ff39069 不对应 → 这 5 个文件可能来自多多手改或 origin/master 残留)

**Untracked(9):**
- **`server/services/requirements.js` (50166B, 6/16 改) ← 关键**
- `call_acms.js` / `client/decision-tree.js` / `client/js/views/{index.html,package.json,package-lock.json,style.css,thinking-brief.js}` / `nohup.out` / `projects/`

**已确认 `server/services/requirements.js` 是孤儿:**
- 工作代码无人 `require` (grep 全空)
- `server/routes/requirements.js` 才是真正在跑的路由
- `origin/main` 上**没有**这个文件 (git show fatal)

**结论:这个孤儿文件可以丢,无影响。**

## 风险点(必须告知多多)

1. **5 个 modified 文件可能含多多的工作** — `client/index.html` mtime 是今天 00:12,可能是多多昨晚改的 UI 调试代码,reset --hard 会丢
2. **进程已经在跑** — PID 1446864 监听 3300/3301,reset 不影响它(它读 .js 文件是 fs.readFile,改了会重新读)
3. **不动 PID/不重启服务** — 多多硬约束

## 推荐方案 A:标准 push + reset + 备份

```bash
# === 步骤 1:本地推 main 到远端 ===
cd /c/Users/swede/acms
git push origin main:main

# === 步骤 2:120 服务器备份(只备份疑似有用的文件) ===
ssh root@120.24.204.130
cd ~/acms
mkdir -p /root/acms-backup-20260618
cp client/css/style.css /root/acms-backup-20260618/
cp client/index.html /root/acms-backup-20260618/
cp client/js/core/markdown.js /root/acms-backup-20260618/
cp client/js/views/assists/decision-tree.js /root/acms-backup-20260618/
cp package-lock.json /root/acms-backup-20260618/
cp server/services/requirements.js /root/acms-backup-20260618/  # 孤儿,备份只为审计
echo "=== 备份完成,列表: ==="
ls -la /root/acms-backup-20260618/

# === 步骤 3:服务器 fetch + reset ===
git fetch origin
git reset --hard origin/main  # 现在 HEAD = ff39069 = 本地

# === 步骤 4:验证 ===
git log -3 --oneline
grep -c "chatHandlePaste" client/js/views/requirements.js  # 应该 > 0
```

**预期结果:**
- 服务器 HEAD = ff39069
- 截图粘贴功能到位
- 服务器不再有 v0.9 老旧 + untracked noise
- 备份在 /root/acms-backup-20260618/ 可供多多 audit / 恢复
- **服务不需要重启**(纯前端改动)
- 用户 Ctrl+Shift+R 硬刷即看到新功能

**风险:** 步骤 3 丢 5 个 modified 文件,已全部备份,多多可从 /root/ 恢复任意一个。

## 备选方案 B:不重置,只 cherry-pick 2 commit

```bash
# 本地 push 后,服务器:
git fetch origin
git cherry-pick efa1b63 ff39069
```

**优点:** 不破坏服务器 untracked 状态(包括孤儿 requirements.js 和多多手改)
**缺点:** 服务器 HEAD 不会前进,git log 看起来怪
**适用:** 如果多多强烈要求保留服务器现有 untracked 内容

## 备选方案 C:完全不 reset,只 scp 覆盖文件

```bash
# 本地:
git archive HEAD | gzip > /tmp/acms-ff39069.tar.gz
scp /tmp/acms-ff39069.tar.gz root@120.24.204.130:/tmp/
# 服务器:
cd ~/acms && tar xzf /tmp/acms-ff39069.tar.gz --overwrite
```

**优点:** 不动 .git,不动 untracked
**缺点:** git log 跟实际代码不一致(HEAD 还是 b6f03b7,工作树却是 ff39069);git status 会大量报"已修改但不在 HEAD"

## 多多拍板事项

执行 A 之前需要多多确认 2 件事:

1. **孤儿 `server/services/requirements.js` 怎么处置?**
   - 丢(已确认无人 require)
   - 备份到 /root 后丢(方案 A 默认)
   - 保留(几乎肯定无意义,但多多可能有别的打算)

2. **5 个 modified 文件是否要从备份恢复?**
   - 全部不恢复(默认,纯用 ff39069 干净的代码)
   - 逐个看 diff 再决定(慢但稳)

## 等待动作
- 等多多明文说"按 A 走" / "按 B 走" / "按 C 走"
- 收到指令后我按方案执行(分步可中断)
- 完成后让多多 Ctrl+Shift+R 硬刷验证
