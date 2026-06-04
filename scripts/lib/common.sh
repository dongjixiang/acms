#!/usr/bin/env bash
# ACMS 安装脚本 — 共享函数库
# 用法: source "$(dirname "$0")/lib/common.sh"

set -euo pipefail

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── 日志 ──
info()  { echo -e "${BLUE}ℹ️${NC}  $*"; }
ok()    { echo -e "${GREEN}✅${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠️${NC}  $*"; }
error() { echo -e "${RED}❌${NC}  $*"; }
step()  { echo; echo -e "${CYAN}━━━ $* ━━━${NC}"; }
header() {
  echo
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${CYAN}║   ACMS — 智能体协同管理系统 一键安装     ║${NC}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
  echo
}

# ── 错误处理 ──
trap_err() {
  echo
  error "安装过程中发生错误，请检查上方日志。"
  error "如需帮助请提交 Issue: https://github.com/dongjixiang/acms/issues"
  exit 1
}
trap trap_err ERR

# ── 确认提示 ──
confirm() {
  local prompt="$1"
  local default="${2:-y}"
  local yn
  read -r -p "$(echo -e "${YELLOW}?${NC} ${prompt} [${default}/N] ")" yn
  yn="${yn:-$default}"
  [[ "$yn" =~ ^[Yy]$ ]]
}

# ── 检测命令是否存在 ──
has_cmd() { command -v "$1" &>/dev/null; }

# ── 版本比较（>=） ──
ver_ge() {
  local v1="$1" v2="$2"
  [ "$(printf '%s\n' "$v1" "$v2" | sort -V | head -n1)" = "$v2" ]
}

# ── 获取操作系统信息 ──
get_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)       echo "unknown" ;;
  esac
}

# ── 获取包管理器 ──
get_pkg_manager() {
  if has_cmd apt-get;   then echo "apt"
  elif has_cmd yum;     then echo "yum"
  elif has_cmd dnf;     then echo "dnf"
  elif has_cmd apk;     then echo "apk"
  elif has_cmd brew;    then echo "brew"
  else echo ""
  fi
}

# ── 安装系统包 ──
pkg_install() {
  local pkg="$1"
  local pm; pm=$(get_pkg_manager)
  case "$pm" in
    apt) sudo apt-get install -y "$pkg" ;;
    yum) sudo yum install -y "$pkg" ;;
    dnf) sudo dnf install -y "$pkg" ;;
    apk) sudo apk add "$pkg" ;;
    brew) brew install "$pkg" ;;
    *) warn "请手动安装: $pkg" ; return 1 ;;
  esac
}

# ── 写入配置文件 ──
write_config() {
  local config_file="$1"
  cat > "$config_file" <<-EOF
{
  "port": ${ACMS_PORT:-3300},
  "wsPort": ${ACMS_WS_PORT:-3301},
  "apiKeys": [${ACMS_API_KEYS:-\"dev-key-001\"}],
  "corsOrigin": "${ACMS_CORS_ORIGIN:-*}"
}
EOF
  ok "配置文件已写入: $config_file"
}

# ── 生成随机 API Key ──
gen_api_key() {
  if has_cmd openssl; then
    openssl rand -hex 16
  else
    date +%s | sha256sum | head -c 32
  fi
}
