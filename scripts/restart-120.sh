#!/bin/bash
set -e
echo "=== Killing old node processes ==="
pkill -f 'node server/index.js' 2>/dev/null || true
sleep 3
OLD_PS=$(ps -ef | grep -E 'node.*server/index' | grep -v grep || true)
if [ -n "$OLD_PS" ]; then
  echo "WARNING: still running:"
  echo "$OLD_PS"
  pkill -9 -f 'node server/index.js' 2>/dev/null || true
  sleep 2
fi
echo "=== Old process killed ==="

echo "=== Starting new service ==="
cd /root/acms
(node server/index.js > server_out_new.txt 2>&1 < /dev/null &)
sleep 5

echo "=== New PID ==="
ps -ef | grep -E 'node.*server/index' | grep -v grep

echo "=== Listening ports ==="
ss -tlnp 2>/dev/null | grep -E ':3300|:3301|:3302'

echo "=== Last log lines ==="
tail -5 /root/acms/server_out_new.txt

echo "=== DONE ==="
