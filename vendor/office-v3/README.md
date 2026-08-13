# vendor/office-v3 — GenOffice 引擎 vendor 源码

第三方代码来源与版本记录。**不要直接修改这里的源码**（升级时整体替换）。

## 来源

- 仓库：https://github.com/genspark-ai/genoffice（genspark-ai，Apache-2.0）
- 抽取日期：2026-08-13
- 上游 commit：`main` @ 2026-08-13（tarball 下载：codeload.github.com/genspark-ai/genoffice/tar.gz/refs/heads/main，15MB）
- 上游版本号：v0.6.101（release tag，与源码抽取日一致）

## 目录说明

```
engine/
  docx-engine/     ← packages/docx-engine/src/*   （Word OOXML 解析/生成/补丁）
  pptx-engine/     ← packages/pptx-engine/src/*   （PPTX 解析/生成/补丁）
  pptx-render/     ← packages/pptx-render/src/*   （渲染树：逐字 glyph 排版）
  font-metrics/    ← packages/font-metrics/src/*  （字体度量，零依赖）
  i18n/            ← packages/i18n/src/*          （UI 语言，zh 第一）
sheets/            ← apps/sheets/src 子集（AI 栈：ai/domain/gateway/renderer）
```

## 升级流程

1. 重新下载 tarball：`curl -sL "https://codeload.github.com/genspark-ai/genoffice/tar.gz/refs/heads/main" -o /tmp/genoffice.tgz`
2. 解压，diff 对应 packages 目录与 vendor/office-v3/engine/*，合并上游改动
3. 重新跑 `node scripts/build-office-v3.js`
4. 更新本文件（抽取日期 + commit）

## 已知适配（与上游源码的差异）

- `pptx-render` 的 `@genoffice/pptx-engine` 子路径 import 在打包时用 esbuild 处理（见 build 脚本）
- 浏览器打包需 external `node:fs` / `node:crypto` / `node:zlib`（运行时用 crypto.subtle / JSZip 替代）

## 依赖（打包时需要，ACMS 已有或需安装）

- fast-xml-parser ^5.x（docx/pptx 解析）
- jszip ^3.x（zip）
- utif2（docx tiff 图片）
- opentype.js ^2.x（pptx 字体度量，浏览器注入）
- bidi-js（pptx 双向文本）
