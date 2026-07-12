#!/bin/bash
# ACMS 120 服务器启动脚本
cd /root/acms
# 杀掉旧进程（如果有）
pkill -f 'node server/index.js' 2>/dev/null
sleep 2
# 用 setsid 启动新进程（脱离 ssh 会话）
setsid node server/index.js > server_out_new.txt 2>&1 < /dev/null &
echo $!
sleep 3
# 检查是否真的起来了
if ps aux | grep -E 'node.*server/index' | grep -v grep > /dev/null; then
  echo "STARTED OK"
  ps aux | grep -E 'node.*server/index' | grep -v grep
else
  echo "START FAILED"
  tail -30 server_out_new.txt
fi