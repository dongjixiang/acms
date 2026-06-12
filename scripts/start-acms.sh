#!/bin/bash
# ACMS 启动脚本（解决 ssh 一行 n 个命令后台进程被吞的问题）
cd /root/acms
pkill -f 'node server/index.js' 2>/dev/null
sleep 2
setsid nohup node server/index.js > /root/server_out.txt 2>&1 < /dev/null &
disown
echo $! > /root/acms.pid
sleep 4
echo "PID: $(cat /root/acms.pid)"
ps -p $(cat /root/acms.pid) -o pid,cmd 2>&1 | head -3
ss -tlnp 2>/dev/null | grep -E ':3300|:3301'
curl -s -m 3 http://localhost:3300/health
echo
