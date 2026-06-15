#!/bin/bash
cd /c/Users/swede/acms
# 启用 elicitor skill（v0.4 收官后默认开启；想关掉就注释此行）
export ELICITOR_ENABLED=true
exec node server/index.js 2>&1
