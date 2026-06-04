#!/usr/bin/env bash
# ACMS 安装脚本 — 配置向导模块
# 用法: source "$(dirname "$0")/lib/configure.sh"

# ── 交互式配置 ──
interactive_configure() {
  local config_file="$1"

  # 如果已有配置文件，确认是否重新配置
  if [ -f "$config_file" ]; then
    warn "配置文件已存在: $config_file"
    if ! confirm "是否重新配置？" "n"; then
      info "保留现有配置"
      # 加载现有配置到环境变量
      local tmp; tmp=$(cat "$config_file")
      ACMS_PORT=$(echo "$tmp" | grep -o '"port":[^,]*' | grep -o '[0-9]*')
      ACMS_WS_PORT=$(echo "$tmp" | grep -o '"wsPort":[^,]*' | grep -o '[0-9]*')
      ACMS_CORS_ORIGIN=$(echo "$tmp" | grep -o '"corsOrigin":"[^"]*"' | sed 's/"corsOrigin":"//;s/"//')
      return 0
    fi
  fi

  step "配置向导"

  echo -e "${CYAN}按 Enter 使用默认值${NC}"

  # 端口
  read -r -p "HTTP 端口 [3300]: " input_port
  ACMS_PORT="${input_port:-3300}"

  # WebSocket 端口
  read -r -p "WebSocket 端口 [3301]: " input_ws
  ACMS_WS_PORT="${input_ws:-3301}"

  # API Key
  local default_key; default_key=$(gen_api_key)
  read -r -p "API Key [${default_key}]: " input_key
  ACMS_API_KEYS="\"${input_key:-$default_key}\""
  ACMS_API_KEY_VALUE="${input_key:-$default_key}"

  # CORS
  read -r -p "CORS 跨域来源（* 表示允许所有）[*]: " input_cors
  ACMS_CORS_ORIGIN="${input_cors:--}"

  # 写入配置文件
  write_config "$config_file"

  echo
  info "配置摘要:"
  info "  HTTP 端口:     ${ACMS_PORT}"
  info "  WebSocket 端口: ${ACMS_WS_PORT}"
  info "  API Key:       ${ACMS_API_KEY_VALUE}"
  echo
  echo -e "${YELLOW}请妥善保管 API Key！连接智能体时需要用到。${NC}"
}

# ── 静默配置（非交互模式）─
auto_configure() {
  local config_file="$1"

  # 如果已有配置文件则跳过
  if [ -f "$config_file" ]; then
    info "使用现有配置文件"
    return 0
  fi

  ACMS_PORT="${ACMS_PORT:-3300}"
  ACMS_WS_PORT="${ACMS_WS_PORT:-3301}"
  ACMS_API_KEYS="\"$(gen_api_key)\""
  ACMS_CORS_ORIGIN="${ACMS_CORS_ORIGIN:--}"

  write_config "$config_file"
  info "已自动生成配置（API Key: ${ACMS_API_KEY_VALUE:-$(echo "$ACMS_API_KEYS" | tr -d '"')}）"
}
