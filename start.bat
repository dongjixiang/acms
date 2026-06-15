@echo off
REM ===========================================================================
REM  ACMS — Windows 开发环境快速启动脚本
REM  用法: 双击本文件，或从命令行运行
REM ===========================================================================

title ACMS — 智能体协同管理系统

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   ACMS — 智能体协同管理系统              ║
echo  ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM 检查 Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 Node.js，请先安装: https://nodejs.org
    pause
    exit /b 1
)

node -v
echo.

REM 检查 node_modules
if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] npm install 失败
        pause
        exit /b 1
    )
    echo [完成] 依赖安装完成
)

echo [信息] 正在启动 ACMS...
echo [信息] 访问地址: http://localhost:3300/client/index.html
echo [信息] 按 Ctrl+C 停止服务
echo.

REM 启用 elicitor skill（v0.4 收官后默认开启；想关掉就注释此行）
set ELICITOR_ENABLED=true

node server/index.js

pause
