#!/bin/bash
pkill -f 'node server/index.js' 2>/dev/null
sleep 3
cd /root/acms
PORT=3300 node server/index.js > server_out_new.txt 2>&1 < /dev/null &
sleep 4
ps aux | grep -E 'node.*server/index' | grep -v grep && echo "STARTED OK"
curl -s --max-time 3 -H "X-API-Key: dev-key-001" http://127.0.0.1:3300/api/kanban 2>&1 | head -c 200
echo