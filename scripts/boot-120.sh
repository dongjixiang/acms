#!/bin/bash
cd /root/acms
(node server/index.js > server_out_new.txt 2>&1 < /dev/null &)
sleep 6
PID=$(ps -ef | grep -E 'node.*server/index' | grep -v grep | awk '{print $2}')
if [ -n "$PID" ]; then
  echo "started pid=$PID"
  ss -tlnp 2>/dev/null | grep -E ':3300|:3301|:3302'
else
  echo "failed"
fi
