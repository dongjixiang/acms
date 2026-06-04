#!/usr/bin/env bash
# =============================================================================
#  ACMS — 智能体协同管理系统 一键安装脚本
#  =============================================================================
#  用法:
#    curl -fsSL https://raw.githubusercontent.com/dongjixiang/acms/main/scripts/install.sh | bash
#
#  或本地运行:
#    bash scripts/install.sh
#
#  可选参数:
#    --non-interactive   静默安装（自动生成配置）
#    --port PORT         指定 HTTP 端口
#    --ws-port PORT      指定 WebSocket 端口
#    --api-key KEY       指定 API Key
#    --as-service        注册为系统服务
#    --help              显示帮助
# =============================================================================

set -euo pipefail

# ── 定位脚本所在目录（兼容 piped curl 和本地执行）──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null || pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── 加载库模块 ──
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/detect.sh"
source "$SCRIPT_DIR/lib/install.sh"
source "$SCRIPT_DIR/lib/configure.sh"
source "$SCRIPT_DIR/lib/service.sh"

# ── 解析参数 ──
NON_INTERACTIVE=false
AS_SERVICE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --non-interactive) NON_INTERACTIVE=true; shift ;;
    --port) ACMS_PORT="$2"; shift 2 ;;
    --ws-port) ACMS_WS_PORT="$2"; shift 2 ;;
    --api-key) ACMS_API_KEYS="\"$2\""; shift 2 ;;
    --as-service) AS_SERVICE=true; shift ;;
    --help)
      header
      echo "用法:"
      echo "  curl -fsSL https://raw.githubusercontent.com/dongjixiang/acms/main/scripts/install.sh | bash"
      echo "  bash scripts/install.sh [选项]"
      echo
      echo "选项:"
      echo "  --non-interactive   静默安装（自动生成配置）"
      echo "  --port PORT         指定 HTTP 端口（默认 3300）"
      echo "  --ws-port PORT      指定 WebSocket 端口（默认 3301）"
      echo "  --api-key KEY       指定 API Key"
      echo "  --as-service        注册为系统服务"
      echo "  --help              显示帮助"
      exit 0
      ;;
    *)
      error "未知参数: $1"
      echo "使用 --help 查看帮助"
      exit 1
      ;;
  esac
done

# ============================================================================
#  主流程
# ============================================================================

header

# ── 欢迎 ──
echo -e "${BOLD}ACMS${NC} 是一个人机协同项目管理系统。"
echo -e "项目地址: ${CYAN}https://github.com/dongjixiang/acms${NC}"
echo

if ! $NON_INTERACTIVE; then
  if ! confirm "开始安装 ACMS？" "y"; then
    info "安装已取消"
    exit 0
  fi
fi

# ── 1. 环境检测 ──
detect_all

# ── 2. 下载项目 ──
# 判断当前是否已在项目目录内
if [ -f "$REPO_ROOT/package.json" ] && [ "$(basename "$REPO_ROOT")" = "acms" ]; then
  info "已在 ACMS 项目目录中"
  TARGET_DIR="$REPO_ROOT"
else
  TARGET_DIR="$HOME/acms"
  download_acms "$TARGET_DIR"
fi

# ── 3. 安装依赖 ──
cd "$TARGET_DIR"
install_deps

# ── 4. 验证安装 ──
verify_install

# ── 5. 配置 ──
CONFIG_FILE="$TARGET_DIR/config.json"
if $NON_INTERACTIVE; then
  auto_configure "$CONFIG_FILE"
else
  interactive_configure "$CONFIG_FILE"
fi

# ── 6. 服务注册 ──
if $AS_SERVICE; then
  setup_service "$TARGET_DIR"
fi

# ── 7. 启动 ──
step "完成"

echo
echo -e "${GREEN}${BOLD}🎉 ACMS 安装完成！${NC}"
echo
echo -e "  ${BOLD}启动服务:${NC}"
echo -e "    cd ${TARGET_DIR} && node server/index.js"
echo
echo -e "  ${BOLD}访问地址:${NC}"
echo -e "    ${CYAN}http://localhost:${ACMS_PORT:-3300}/client/index.html${NC}"
echo
echo -e "  ${BOLD}更多信息:${NC}"
echo -e "    GitHub:  ${CYAN}https://github.com/dongjixiang/acms${NC}"
echo -e "    Wiki:    ${CYAN}D:\\Wiki\\02-智能体协同管理系统${NC}"
echo

if ! $AS_SERVICE; then
  if confirm "现在启动 ACMS？" "y"; then
    echo
    info "正在启动..."
    node "$TARGET_DIR/server/index.js"
  else
    info "稍后可以手动启动: cd ${TARGET_DIR} && node server/index.js"
  fi
fi
