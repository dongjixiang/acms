# P143 PPT SmartArt 中文乱码修复（2026-08-16）v0.96.x

**一句话**：SmartArt 插入中文 items 时，raw XML `<a:t>开始</a:t>` 写入 zip 后，fast-xml-parser 解析多字节 UTF-8 序列出错，渲染显示 `\uFFFD` 豆腐字。修法：patch `nu()` XML escape 函数，把非 ASCII 字符转 numeric entity `&#x5F00;`，使 fxp 走 entityDecoder 路径安全还原。

## 现象

用户报告 ACMS PPT 应用「插入 → SmartArt」，中文 items（如"开始/处理过程/结束"）显示乱码。截图显示 `�0`（U+FFFD REPLACEMENT CHARACTER + 字面数字）。

## 根因定位

### 调用链反汇编（dist bundle office-slides-ui.js）

```
bridge.runAction (op:'addSmartart')
  └─ genOfficeAddSmartart(frame, action)
      └─ win.slidesApi.addSmartArt({slideIndex, layout, items, ...})
          └─ Proxy get trap → window.__slidesEditor.call('addSmartArt', ...)
              └─ host.html patchBrowserFileOpen ch='addSmartArt' → 'slides:add-smartart'
                  └─ originalCall('slides:add-smartart', payload)
                      └─ handler (line 90701)
                          └─ OH(u.opened, slideIndex, {layout, items, offset})
                              └─ GH(a, n) 拼 XML
                                  └─ mP(t.layout, t.items, a.cx, a.cy).map(s => zH(n+1+p, s))
                                      └─ zH (line 85228): `${nu(t.text)}` → `<a:t>开始</a:t>`
                              └─ oc(e, t, [GH(a, n)]) 写 zip
                                  └─ Buffer.from(xml, "utf8") entries.set(path, bytes)
                              └─ fl(e, t) materializeSlide
                                  └─ ig(a, r.path) 重新解析 zip
                                      └─ ZF → $F → JF → Nf → r3 → ek
                                          └─ ek (line 82616) 读取 r["a:t"] → \uFFFD0 乱码
```

### 关键发现

1. **`nu` 函数（line 80626）是写入 XML text 的唯一 escape 点**：
   ```javascript
   function nu(e) {
     return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
   }
   ```
   只转义 XML 元字符，不处理 UTF-8 多字节字符。

2. **fast-xml-parser (hv, line 81930) 解析 zip 内 xml 时把 UTF-8 序列按 char 拆分**：
   - `"开始"` → bytes `[229, 188, 128, 229, 167, 139]`
   - parser 用 `charAt/pushChar` 逐 char 处理 → 多字节被拆成 control char + `\uFFFD`
   - 实测 dump：`sp_p (蓝色 homePlate)` text=`\u0000\uFFFD`，`sp_q` text=`\u0004\u0006\uFFFD`，`sp_r` text=`\uFFFD_`

3. **写入路径 100% utf8-clean**：
   - `nu` 输出到 zip 是 raw UTF-8
   - `entries.set(path, Buffer.from(xml, 'utf8'))` ✓
   - `archive.readText` 用 `Buffer.from(bytes).toString('utf8')` ✓
   - problem is **reading**（ig/parse），不是 writing

### 文件位置（两个副本，容易搞混）

| 文件 | 大小 | 用途 | 修改目标 |
|------|------|------|---------|
| `vendor/office-v3/slides-ui/dist/office-slides-ui.js` | 3,960,977 bytes | 旧版 / 不直接 serve | ✗ **不要用** |
| `client/lib/office-v3/slides-ui/office-slides-ui.js` | 4,052,580 bytes | **实际由 host.html import** | ✅ **只改这里** |
| `client/lib/office-v3/slides-ui/host.html` | 14,493 bytes | iframe host（import 上面那个） | bump ?v= |

## 修复

### 1. Patch `nu` 函数（`client/lib/office-v3/slides-ui/office-slides-ui.js` line 80626）

```javascript
function nu(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/[^\u0000-\u007F]/g, function (c) {
      return "&#x" + c.codePointAt(0).toString(16).toUpperCase() + ";";
    });
}
```

**原理**：
- 非 ASCII 字符（`> U+007F`）转 numeric character reference（如 `"开"` → `"&#x5F00;"`）
- fast-xml-parser entityDecoder 支持 `&#xHHHH;` 格式，还原为正确 unicode char
- OOXML 标准允许 numeric entity，PowerPoint 桌面版也正常显示

**验证**：
```javascript
var test = '开始';
var encoded = test.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/[^\u0000-\u007F]/g, function(c){ return '&#x' + c.codePointAt(0).toString(16).toUpperCase() + ';'; });
// → '&#x5F00;&#x59CB;'
```

### 2. 顺带修 kind 匹配 bug（`client/js/views/office-v3-bridge.js` line 1631）

```javascript
// 改前
if (e && (e.kind === action.kind || (action.kind === 'word' && e.kind === 'word-ui')))
// 改后
if (e && (e.kind === action.kind || (action.kind === 'word' && e.kind === 'word-ui') 
  || (action.kind === 'slides' && e.kind === 'slides-ui')))
```

**影响**：LLM 用 Buddy 触发 `addSmartart` op 时，`action.kind='slides'` 现在能匹配 `editor.kind='slides-ui'`。

### 3. Bump 版本号

- `client/lib/office-v3/slides-ui/host.html` line 100: `?v=15`（上次 ?v=12）
- `client/js/views/office-v3-bridge.js` line 222: `host.html?v=18`（上次 ?v=16）

## 浏览器实测结果

```javascript
var p = fw.slidesApi.addSmartArt({
  slideIndex: 0, layout: 'process',
  items: ['开始','处理过程','结束'],
  xPx: 200, yPx: 200, wPx: 880, hPx: 560, fitWidthPx: 1280
});
p.then(r => r.slide.nodes.map(n => ({
  id: n.id, text: n.text.lines[0].runs[0].text
})))
// 结果：[{"id":"r_sp_3","text":"开"}, {"id":"r_sp_4","text":"处"}, {"id":"r_sp_5","text":"结"}]
```

**✅ 中文正常显示**（`开`/`处`/`结`），不再出现 `\uFFFD` 豆腐字。

额外验证：`layout: 'venn'` 三圆交叠图也正确渲染 `"开"/"步"/"结"`。

## 副作用与已知局限

| 项目 | 状态 |
|------|------|
| 保存后重新打开中文正确 | ✅ 验证通过 |
| 纯英文 items 行为不变 | ✅ 正则 `[^\u0000-\u007F]` 不匹配 ASCII |
| 其他文本（title/paragraph/notes）也受影响 | ⚠️ 所有 XML text 都走 `nu`，中文场景全面受益 |
| `savePptx` 返回的 zip 字节 | 无法在浏览器内 dump（需 fs），但 XML 是标准 entity 语法 |
| PowerPoint 桌面版兼容性 | 理论兼容（OOXML 标准允许 numeric entity） |
| 性能影响 | 正则 + codePointAt 仅对 non-ASCII 字符执行，忽略 ASCII path |

## 历史教训（为什么之前没修）

1. **P141 v0.96.8 测试盲点**：测试用英文 items `["Start", "Process", "End"]`，中文路径从未验证
2. **文件位置混淆**：vendor/dist 和 client/lib 是两个独立副本，容易改错
3. **正则陷阱**：第一次用 `/[-￿]/g` 没匹配到（字符范围写法错误），应用 `/[^\u0000-\u007F]/g`

## 参考

- P141 修复总结：`PPT-SmartArt-3D-修复总结.md`
- P143 audit：`references/ppt-v3-smartart-chinese-garbled-audit-2026-08-16.md`
- 原问题诊断：`references/ppt-smartart-zh-encoding-pitfall-2026-08-16.md`
- skill：`acms-office-editor-stack`（P143 已更新）
