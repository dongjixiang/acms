#!/bin/bash
cd /root/acms
(node server/index.js > server_out_new.txt 2>&1 < /dev/null &)
sleep 5
echo "PID check:"
ps -ef | grep -E 'node.*server/index' | grep -v grep
echo "Port check:"
ss -tlnp 2>/dev/null | grep -E ':3300|:3301|:3302'
