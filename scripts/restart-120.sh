#!/bin/bash
# ACMS 120 server restart script
# 目标：杀掉旧 PID，避开端口 TIME_WAIT，拉起新服务让 3300/3301/3302 都生效
set -e
cd /root/acms
echo "[restart] HEAD=$(git rev-parse HEAD)  PORT=3300  WS=3301  TERM_WS=3302"
# 1. 杀掉旧服务
pkill -f 'node server/index.js' 2>/dev/null || true
# 2. 等老进程彻底退、端口释放（最多 30s）
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if ! pgrep -f 'node server/index.js' > /dev/null; then
    echo "[restart] old process gone after ${i}s"
    break
  fi
  sleep 1
done
# 3. 清空启动日志
: > server_out_new.txt
# 4. 启动新服务
cd /root/acms
node server/index.js > server_out_new.txt 2>&1 &
NEW_PID=$!
disown $NEW_PID 2>/dev/null || true
echo "[restart] new_pid=$NEW_PID"
# 5. 等待 server 起来
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if curl -fsS --max-time 2 http://127.0.0.1:3300/health > /dev/null 2>&1; then
    echo "[restart] healthy after ${i}s"
    break
  fi
  sleep 1
done
# 6. 验证进程
ps -eo pid,etime,cmd | grep 'node server/index.js' | grep -v grep || echo "[restart] NO PROCESS"
# 7. 端口
echo "[restart] listening ports:"
(ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null) | grep -E ':(3300|3301|3302) ' || echo "[restart] NO PORT"
# 8. 启动日志尾部
echo "[restart] log tail:"
tail -40 server_out_new.txt
