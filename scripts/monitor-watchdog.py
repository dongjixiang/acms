#!/usr/bin/env python3
"""
ACMS 任务监控守护进程 — 监控 T-MRGDBST1 状态变化
驳回事件触发时自动跑详细分析 + 输出问题清单

用法:
  python monitor-watchdog.py
  python monitor-watchdog.py --task T-MRGDBST1 --interval 10
"""

import json
import sys
import time
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    WATCHDOG_AVAILABLE = True
except ImportError:
    WATCHDOG_AVAILABLE = False

DB_PATH = r"C:/Users/swede/acms/data/acms.db"
LOG_PATH = Path(r"C:/Users/swede/acms/data/acms.log")
SCRIPT_DIR = Path(__file__).parent


def get_review_count(task_id):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "SELECT json_extract(doc, '$.reviews') FROM tasks WHERE json_extract(doc, '$.id') = ?",
        (task_id,),
    )
    row = cur.fetchone()
    conn.close()
    if not row or not row[0]:
        return 0
    reviews = json.loads(row[0])
    return len(reviews)


def get_task_status(task_id):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "SELECT json_extract(doc, '$.status') FROM tasks WHERE json_extract(doc, '$.id') = ?",
        (task_id,),
    )
    row = cur.fetchone()
    conn.close()
    return row[0] if row else None


class LogChangeHandler:
    def __init__(self, task_id, on_change):
        self.task_id = task_id
        self.on_change = on_change
        self.last_review_count = get_review_count(task_id)
        self.last_status = get_task_status(task_id)
        print(f"[monitor] 启动监控 task={task_id}")
        print(f"[monitor] 当前 status={self.last_status}, reviews={self.last_review_count}")

    def check(self):
        """手动调用此方法检查状态变化"""
        try:
            current_review_count = get_review_count(self.task_id)
            current_status = get_task_status(self.task_id)
            if current_review_count != self.last_review_count:
                print(f"\n[monitor] 🔔 Reviews changed: {self.last_review_count} → {current_review_count}")
                self.last_review_count = current_review_count
                self.on_change("reviews-changed", current_review_count)
                return True
            if current_status != self.last_status:
                print(f"\n[monitor] 🔔 Status changed: {self.last_status} → {current_status}")
                self.last_status = current_status
                self.on_change("status-changed", current_status)
                return True
        except Exception as e:
            pass
        return False


def run_analysis(task_id):
    print(f"\n[monitor] 跑分析报告...")
    try:
        result = subprocess.run(
            ["python", str(SCRIPT_DIR / "monitor-bug-task.py"), task_id],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        print(result.stdout)
        if result.stderr:
            print(f"[stderr] {result.stderr}")
    except Exception as e:
        print(f"[monitor] 分析失败: {e}")


def main():
    task_id = "T-MRGDBST1"
    interval = 30  # 轮询间隔（秒）

    if "--task" in sys.argv:
        i = sys.argv.index("--task")
        if i + 1 < len(sys.argv):
            task_id = sys.argv[i + 1]
    if "--interval" in sys.argv:
        i = sys.argv.index("--interval")
        if i + 1 < len(sys.argv):
            interval = int(sys.argv[i + 1])

    print(f"[monitor] 监控 task={task_id}, interval={interval}s")
    print(f"[monitor] watchdog 可用: {WATCHDOG_AVAILABLE}")

    def run_analysis_and_notify(event_type, value):
        print(f"[monitor] 触发分析: event={event_type} value={value}")
        run_analysis(task_id)

    handler = LogChangeHandler(task_id, run_analysis_and_notify)

    try:
        while True:
            changed = handler.check()
            if not changed:
                time.sleep(interval)
            else:
                # 状态变了，跑完分析后等一会儿再继续轮询
                time.sleep(2)
            # 终态检查
            status = get_task_status(task_id)
            if status in ("done", "failed", "archived"):
                print(f"[monitor] 任务已 {status}，停止监控")
                break
    except KeyboardInterrupt:
        print("\n[monitor] 用户中断")


if __name__ == "__main__":
    main()