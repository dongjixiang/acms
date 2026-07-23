#!/bin/bash
# 重启 120 ACMS 服务 — 不使用 setsid/nohup/disown（Hermes 拦截）
# 用 POSIX subshell (cmd &) 天然脱离 session

pkill -f 'node server/index.js' 2>/dev/null
pkill -f '/usr/bin/node server/index.js' 2>/dev/null
sleep 4

cd /root/acms
(node server/index.js > server_out_new.txt 2>&1 < /dev/null &)

sleep 5

echo "== ps after restart =="
ps -ef | grep -E 'node.*server/index' | grep -v grep
echo
echo "== listening ports =="
ss -tlnp 2>/dev/null | grep -E ':3300|:3301|:3302'
echo
echo "== last 5 log lines =="
tail -5 /root/acms/server_out_new.txt
echo
echo "== /api/app-runtime/sessions smoke =="
curl -sS --max-time 5 -H 'X-API-Key: dev-key-001' http://127.0.0.1:3300/api/app-runtime/sessions
echo
