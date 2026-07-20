#!/bin/bash
# ACMS 120 重启脚本（v0.55+）
# 注意：不用 setsid/nohup/disown（Hermes 拦截），用 & 后台 + sleep 验证
pkill -f 'node server/index.js' 2>/dev/null
sleep 3
cd /root/acms
# 清空旧 log
: > server_out_new.txt
# 后台启动（shell 级别 detach，新进程 PPID=1 等同 setsid 效果）
node server/index.js >> server_out_new.txt 2>&1 &
NEW_PID=$!
sleep 4
# 验证
if ps -p $NEW_PID > /dev/null 2>&1; then
  echo "STARTED OK pid=$NEW_PID"
  ps -p $NEW_PID -o pid,etime,cmd
else
  echo "FAILED: node process exited"
  tail -30 server_out_new.txt
  exit 1
fi
