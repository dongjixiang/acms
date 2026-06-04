#!/usr/bin/env bash
# ACMS 安装脚本 — 环境检测模块
# 用法: source "$(dirname "$0")/lib/detect.sh"

# ── 检测 Node.js ──
check_nodejs() {
  local min_version="18.0.0"
  if ! has_cmd node; then
    error "未检测到 Node.js。ACMS 需要 Node.js v18+"
    echo
    info "请安装 Node.js:"
    info "  - 推荐: https://nodejs.org (LTS 版本)"
    info "  - Linux: 使用系统包管理器或 nvm"
    info "    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
    info "  - macOS: brew install node"
    info "  - Windows: https://nodejs.org 下载安装包"
    echo
    return 1
  fi

  local version; version=$(node -v | sed 's/^v//')
  if ! ver_ge "$version" "$min_version"; then
    error "Node.js 版本过低: v${version}，需要 v${min_version}+"
    return 1
  fi
  ok "Node.js v${version}"
}

# ── 检测 npm ──
check_npm() {
  if ! has_cmd npm; then
    warn "未检测到 npm（通常随 Node.js 一起安装）"
    return 1
  fi
  local version; version=$(npm -v)
  ok "npm v${version}"
}

# ── 检测 git ──
check_git() {
  if has_cmd git; then
    local version; version=$(git --version | awk '{print $3}')
    ok "git ${version}"
    return 0
  fi
  warn "未检测到 git，将使用 curl 下载 tarball"
  return 1
}

# ── 检测 curl ―─
check_curl() {
  if has_cmd curl; then
    ok "curl 可用"
    return 0
  fi
  error "需要 curl 来下载项目文件"
  info "请安装 curl:"
  info "  - Linux: sudo apt-get install -y curl 或 sudo yum install -y curl"
  info "  - macOS: 已预装"
  info "  - Windows git-bash: 已预装"
  return 1
}

# ── 检测 build tools（用于编译 better-sqlite3）──
check_build_tools() {
  local os; os=$(get_os)

  if [ "$os" = "windows" ]; then
    # Windows 下 better-sqlite3 通常有预编译二进制
    if has_cmd python; then
      ok "Python 可用（用于 node-gyp fallback）"
    else
      warn "未检测到 Python，better-sqlite3 编译可能需要"
    fi
    return 0
  fi

  # Linux/macOS: 检测 C++ 编译工具
  if has_cmd g++ || has_cmd clang++ || has_cmd cc; then
    ok "C++ 编译工具可用（用于 better-sqlite3）"
  else
    warn "未检测到 C++ 编译器"
    warn "  Linux: sudo apt-get install -y build-essential"
    warn "  macOS: xcode-select --install"
    warn "  better-sqlite3 可能使用预编译二进制，跳过"
  fi
}

# ── 一站式环境检测 ──
detect_all() {
  step "环境检测"

  local ok=true

  check_nodejs   || ok=false
  check_npm      || ok=false
  check_curl     || ok=false
  check_git      || true  # git 可选，记录结果即可
  check_build_tools || true

  if ! $ok; then
    error "环境检测未通过，请先安装缺失的依赖"
    exit 1
  fi
  echo
  ok "环境检测通过"
}
