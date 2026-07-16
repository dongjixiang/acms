#!/bin/bash
pkill -f 'node server/index.js' 2>/dev/null
sleep 3
cd /root/acms
setsid node server/index.js > server_out_new.txt 2>&1 < /dev/null &
sleep 4
ps aux | grep -E 'node.*server/index' | grep -v grep && echo "STARTED_OK"
