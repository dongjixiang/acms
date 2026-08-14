#!/bin/bash
# 构建 sheets-ui 并部署到 ACMS client/lib/office-v3/sheets-ui/
# 清理非 zh-CN locale chunk（univer-locales 只动态 import zh-CN；en-US 已同步进主包）
set -e
cd "$(dirname "$0")/../vendor/office-v3/sheets-ui"

echo "[sheets-ui] build..."
npx vite build 2>&1 | tail -8

echo "[sheets-ui] cleanup locale chunks (keep zh-CN / main / entry / css / host)..."
cd dist
# 删除除了 office-sheets-ui.js / adapter-*.js / zh-CN-*.js / acms-office-sheets-ui.css / host.html 之外的所有文件
find . -maxdepth 1 -type f \( -name "*.js" -o -name "*.css" \) \
  ! -name "office-sheets-ui.js" \
  ! -name "adapter-*.js" \
  ! -name "zh-CN-*.js" \
  ! -name "acms-office-sheets-ui.css" \
  -delete
echo "剩余文件："
ls -la | awk '{print $5, $9}'
echo "总大小：$(du -sh . | cut -f1)"

echo "[sheets-ui] deploy to client/lib/office-v3/sheets-ui/..."
mkdir -p /c/Users/swede/acms/client/lib/office-v3/sheets-ui
cp -f office-sheets-ui.js adapter-*.js zh-CN-*.js acms-office-sheets-ui.css \
  /c/Users/swede/acms/client/lib/office-v3/sheets-ui/
# host.html 在源码目录（vite build 会清空 dist）
cp -f /c/Users/swede/acms/vendor/office-v3/sheets-ui/host.html \
  /c/Users/swede/acms/client/lib/office-v3/sheets-ui/
echo "[sheets-ui] done."
