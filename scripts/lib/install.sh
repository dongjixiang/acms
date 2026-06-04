#!/usr/bin/env bash
# ACMS 安装脚本 — 下载 + 安装模块
# 用法: source "$(dirname "$0")/lib/install.sh"

ACMS_REPO="https://github.com/dongjixiang/acms.git"
ACMS_TARBALL="https://github.com/dongjixiang/acms/archive/refs/heads/main.tar.gz"

# ── 下载项目 ──
download_acms() {
  local target_dir="$1"

  if [ -d "$target_dir" ]; then
    warn "目标目录已存在: $target_dir"
    if confirm "是否重新安装？（将覆盖现有文件）" "n"; then
      rm -rf "$target_dir"
    else
      info "使用现有目录继续"
      cd "$target_dir"
      return 0
    fi
  fi

  step "下载 ACMS"

  if has_cmd git; then
    info "通过 git clone 下载..."
    git clone --depth 1 "$ACMS_REPO" "$target_dir" 2>/dev/null || {
      warn "git clone 失败，尝试 tarball 下载..."
      download_tarball "$target_dir"
    }
  else
    download_tarball "$target_dir"
  fi

  cd "$target_dir"
}

# ── tarball 方式下载 ──
download_tarball() {
  local target_dir="$1"
  info "通过 tarball 下载..."
  local tmpdir; tmpdir=$(mktemp -d)
  curl -fsSL "$ACMS_TARBALL" -o "$tmpdir/acms.tar.gz" || {
    error "下载失败！请检查网络连接: $ACMS_TARBALL"
    rm -rf "$tmpdir"
    exit 1
  }
  mkdir -p "$target_dir"
  tar -xzf "$tmpdir/acms.tar.gz" -C "$tmpdir"
  # tarball 解压后目录名为 acms-main
  if [ -d "$tmpdir/acms-main" ]; then
    cp -r "$tmpdir/acms-main"/* "$target_dir"/
    cp -r "$tmpdir/acms-main"/.[!.]* "$target_dir"/ 2>/dev/null || true
  fi
  rm -rf "$tmpdir"
  ok "下载完成"
}

# ── npm install ──
install_deps() {
  step "安装依赖"

  if [ ! -f package.json ]; then
    error "未找到 package.json，请确保在 ACMS 项目根目录"
    exit 1
  fi

  info "执行 npm install..."

  local npm_output
  npm_output=$(npm install 2>&1) || {
    echo "$npm_output"
    error "npm install 失败"

    # 尝试修复常见问题
    if echo "$npm_output" | grep -qi "better-sqlite3"; then
      warn "better-sqlite3 编译失败，尝试安装 build tools 后重试..."
      info "  Linux: sudo apt-get install -y build-essential python3"
      info "  macOS: xcode-select --install"
      info "  Windows: npm install --global windows-build-tools"
    fi
    exit 1
  }

  ok "依赖安装完成"
}

# ── 验证安装 ──
verify_install() {
  step "验证安装"

  local errors=0

  # 检查核心文件是否存在
  for f in server/index.js server/config.js server/app.js package.json; do
    if [ -f "$f" ]; then
      ok "  ✅ $f"
    else
      error "  ❌ 缺少 $f"
      errors=$((errors + 1))
    fi
  done

  # 检查 node_modules
  if [ -d node_modules ]; then
    ok "  ✅ node_modules"
  else
    error "  ❌ 缺少 node_modules"
    errors=$((errors + 1))
  fi

  # 核心依赖
  for pkg in express better-sqlite3 ws uuid; do
    if [ -d "node_modules/$pkg" ]; then
      ok "  ✅ $pkg"
    else
      error "  ❌ 缺少依赖: $pkg"
      errors=$((errors + 1))
    fi
  done

  if [ "$errors" -gt 0 ]; then
    error "验证发现 ${errors} 个问题，请检查"
    return 1
  fi
  ok "安装验证通过"
}
