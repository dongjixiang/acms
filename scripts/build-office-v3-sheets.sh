#!/bin/bash
# 构建 sheets-ui 并部署到 ACMS client/lib/office-v3/sheets-ui/
# ⚠️ 2026-08-16: 不再删除非 zh-CN locale chunk！
#    之前删 en-gb 等导致 Univer EN_US locale 动态 import 404 → Excel 界面错乱。
#    Univer 启动时 locale 固定 en-US（App.tsx），date-fns locale chunk 按需动态 import，
#    全部 86 个 chunk 必须保留。
set -e
cd "$(dirname "$0")/../vendor/office-v3/sheets-ui"

echo "[sheets-ui] build..."
npx vite build 2>&1 | tail -8

echo "[sheets-ui] deploy all chunks to client/lib/office-v3/sheets-ui/..."
mkdir -p /c/Users/swede/acms/client/lib/office-v3/sheets-ui
cp -f dist/office-sheets-ui.js dist/adapter-*.js dist/*.js dist/*.css \
  /c/Users/swede/acms/client/lib/office-v3/sheets-ui/
# host.html 在源码目录（vite build 会清空 dist）
cp -f /c/Users/swede/acms/vendor/office-v3/sheets-ui/host.html \
  /c/Users/swede/acms/client/lib/office-v3/sheets-ui/
echo "[sheets-ui] done. chunk 数: $(ls /c/Users/swede/acms/client/lib/office-v3/sheets-ui/*.js | wc -l)"
