# ACMS v0.80 流式控制 UI 更新

**版本**: v0.80  
**日期**: 2026-08-02  
**更新**: 添加流式控制按钮到小吉面板

---

## 一、新增 UI 控件

在小吉面板 header 添加了两个控制按钮：

| 按钮 | 图标 | 功能 |
|------|------|------|
| 暂停/继续 | ⏸ / ▶ | 暂停或恢复流式推送 |
| 速度调节 | ⚡ / 🔥 / 🐢 | 循环切换打字速度 |

---

## 二、速度档位

| 图标 | 速度 | 说明 |
|------|------|------|
| ⚡ | 10ms | 最快 |
| 🔥 | 20ms | 很快 |
| ⏸ | 30ms | 默认（正常） |
| 🐢 | 50ms | 较慢 |
| 🐢 | 100ms | 最慢 |

---

## 三、按钮状态

- **暂停时**: 按钮变为 ▶，标题显示"继续流式"
- **播放时**: 按钮变为 ⏸，标题显示"暂停流式"
- **悬停时**: 显示当前速度（如"速度: 30ms"）

---

## 四、CSS 样式

```css
.ap-stream-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--text3, #5a5a70);
  padding: 2px 4px;
  border-radius: 3px;
  opacity: 0.6;
  transition: opacity 0.2s, background 0.2s;
}

.ap-stream-btn:hover {
  opacity: 1;
  background: var(--bg3, #252540);
}

.ap-stream-btn.paused {
  color: var(--accent, #4ecdc4);
}

.ap-stream-btn.speed-fast {
  color: var(--success, #10b981);
}

.ap-stream-btn.speed-slow {
  color: var(--warning, #f59e0b);
}
```

---

## 五、修改文件

| 文件 | 变更 |
|------|------|
| `client/js/core/agent-buddy.js` | 添加控制按钮和事件处理 |
| `client/css/style.css` | 添加按钮样式 |

---

## 六、使用方式

1. 打开小吉面板
2. 发送消息触发流式响应
3. 点击 ⏸ 按钮暂停/继续
4. 点击 ⚡ 按钮调节速度

---

*更新时间: 2026-08-02*
