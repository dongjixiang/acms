#!/usr/bin/env bash
# ACMS 安装脚本 — 服务注册模块
# 用法: source "$(dirname "$0")/lib/service.sh"

# ── 注册系统服务 ──
setup_service() {
  local acms_dir="$1"
  local os; os=$(get_os)

  step "服务注册"

  if ! confirm "是否注册为系统服务（后台常驻运行）？" "n"; then
    info "跳过服务注册"
    info "手动启动: cd ${acms_dir} && node server/index.js"
    return 0
  fi

  case "$os" in
    linux)
      if has_cmd systemctl; then
        install_systemd "$acms_dir"
      elif has_cmd pm2; then
        install_pm2 "$acms_dir"
      elif confirm "是否安装 PM2（进程管理器）？" "y"; then
        npm install -g pm2 && install_pm2 "$acms_dir"
      else
        warn "未注册为服务，请使用 pm2 或 nohup 保持运行"
      fi
      ;;
    macos)
      if has_cmd brew && has_cmd brew services; then
        install_pm2 "$acms_dir"
      else
        info "macOS 推荐使用 PM2: npm install -g pm2"
        info "或手动启动: cd ${acms_dir} && nohup node server/index.js &"
      fi
      ;;
    windows)
      install_windows_service "$acms_dir"
      ;;
    *)
      warn "未知操作系统，跳过服务注册"
      ;;
  esac
}

# ── Linux: systemd ──
install_systemd() {
  local acms_dir="$1"
  local service_name="acms"
  local service_file="/etc/systemd/system/${service_name}.service"

  info "注册 systemd 服务..."

  if [ -f "$service_file" ]; then
    warn "服务已存在: ${service_name}"
    if ! confirm "是否覆盖？" "n"; then
      info "保留现有服务配置"
      return 0
    fi
  fi

  local node_path; node_path=$(which node)
  local user; user=$(whoami)

  sudo tee "$service_file" > /dev/null <<-EOF
[Unit]
Description=ACMS — Agent Collaboration Management System
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${acms_dir}
ExecStart=${node_path} ${acms_dir}/server/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable "$service_name"
  sudo systemctl start "$service_name"

  ok "systemd 服务已注册: ${service_name}"
  info "  sudo systemctl status ${service_name}"
  info "  sudo systemctl stop ${service_name}"
  info "  sudo journalctl -u ${service_name} -f"
}

# ── PM2 ──
install_pm2() {
  local acms_dir="$1"
  local app_name="acms"

  info "通过 PM2 注册服务..."

  if ! has_cmd pm2; then
    warn "未安装 PM2"
    if confirm "是否全局安装 PM2？" "y"; then
      npm install -g pm2
    else
      warn "跳过 PM2 注册"
      return 0
    fi
  fi

  cd "$acms_dir"
  pm2 start server/index.js --name "$app_name"
  pm2 save
  pm2 startup 2>/dev/null || true

  ok "PM2 进程已启动: ${app_name}"
  info "  pm2 status"
  info "  pm2 logs ${app_name}"
  info "  pm2 stop ${app_name}"
}

# ── Windows: 启动脚本 + 计划任务 ──
install_windows_service() {
  local acms_dir="$1"

  # 创建启动脚本
  local start_script="${acms_dir}/start.bat"
  cat > "$start_script" <<-EOF
@echo off
cd /d "${acms_dir//\//\\}"
echo [ACMS] 正在启动...
node server/index.js
pause
EOF

  ok "启动脚本已创建: start.bat"

  info ""
  info "Windows 下推荐以下方式保持后台运行："
  info "  1. 双击 start.bat（前台运行）"
  info "  2. 使用 Windows 任务计划程序创建开机启动任务"
  info "  3. 使用 NSSM (https://nssm.cc) 注册为 Windows 服务"
  echo
  info "任务计划程序注册方法（需管理员权限）："
  info "  schtasks /create /tn ACMS /tr \"${acms_dir//\//\\}\\start.bat\" /sc onstart /ru SYSTEM"
  echo
  if confirm "是否立即通过任务计划程序注册？" "n"; then
    powershell.exe -Command "Start-Process powershell -Verb runAs -ArgumentList 'schtasks /create /tn ACMS /tr \"${acms_dir//\//\\}\\start.bat\" /sc onstart /ru SYSTEM'"
    warn "请在弹出的 UAC 确认窗口中点击「是」"
  fi
}
