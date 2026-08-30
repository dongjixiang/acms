#!/bin/bash
# 启动心跳探测脚本（120 远程后台运行）
cd /root/acms || exit 1
nohup node /tmp/qwen-probe-heartbeat.js > /tmp/qwen-probe-hb.log 2>&1 &
echo "started pid=$!"
