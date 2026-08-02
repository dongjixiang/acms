#!/usr/bin/env python3
"""
ACMS agent-browser wrapper (v0.78)
通过 os.dup2 重定向 stdout/stderr 到临时文件，避免 pipe hang
使用固定 AGENT_BROWSER_SOCKET_DIR 确保会话复用
"""
import sys
import json
import subprocess
import os
import tempfile
import time
import uuid
import shutil

# 固定 session 名称和 socket 目录
SESSION = 'acms'
SOCKET_DIR = os.path.join(tempfile.gettempdir(), f'acms-browser-{SESSION}')

def ensure_socket_dir():
    """确保 socket 目录存在"""
    os.makedirs(SOCKET_DIR, mode=0o700, exist_ok=True)

def run_command(args, timeout=45):
    """运行 agent-browser 命令"""
    cmd = f'npx agent-browser {args}'
    
    # 创建临时文件（使用唯一文件名避免冲突）
    unique_id = f'{int(time.time()*1000)}_{uuid.uuid4().hex[:8]}'
    stdout_path = os.path.join(SOCKET_DIR, f'stdout_{unique_id}.txt')
    stderr_path = os.path.join(SOCKET_DIR, f'stderr_{unique_id}.txt')
    
    # 确保 socket 目录存在
    ensure_socket_dir()
    
    # 打开文件获取 fd
    stdout_fd = os.open(stdout_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    stderr_fd = os.open(stderr_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    
    try:
        # 设置环境变量，确保会话复用
        env = os.environ.copy()
        env['AGENT_BROWSER_SOCKET_DIR'] = SOCKET_DIR
        env['AGENT_BROWSER_SESSION'] = SESSION
        env['AGENT_BROWSER_IDLE_TIMEOUT_MS'] = '300000'  # 5分钟空闲超时
        
        # 重定向子进程的 stdout/stderr 到文件 fd
        proc = subprocess.Popen(
            cmd,
            stdout=stdout_fd,
            stderr=stderr_fd,
            stdin=subprocess.DEVNULL,
            shell=True,
            close_fds=True,
            env=env,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
        
        # 关闭父进程的 fd（子进程会继承）
        os.close(stdout_fd)
        os.close(stderr_fd)
        
        # 等待完成
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            return json.dumps({'success': False, 'error': 'timeout', 'output': ''})
        
        # 读取输出
        with open(stdout_path, 'r', encoding='utf-8') as f:
            stdout = f.read().strip()
        with open(stderr_path, 'r', encoding='utf-8') as f:
            stderr = f.read().strip()
        
        # 清理临时文件
        try: os.unlink(stdout_path)
        except: pass
        try: os.unlink(stderr_path)
        except: pass
        
        return json.dumps({
            'success': proc.returncode == 0,
            'output': stdout,
            'error': stderr or (f'exit code {proc.returncode}' if proc.returncode != 0 else None)
        })
        
    except Exception as e:
        # 清理
        try: os.unlink(stdout_path)
        except: pass
        try: os.unlink(stderr_path)
        except: pass
        return json.dumps({'success': False, 'error': str(e), 'output': ''})

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No command provided'}))
        sys.exit(1)
    
    args = ' '.join(sys.argv[1:])
    result = run_command(args)
    print(result)
