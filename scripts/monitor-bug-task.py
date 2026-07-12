#!/usr/bin/env python3
"""
ACMS 任务监控脚本 — 专门为 T-MRGDBST1（主界面棋子不渲染 bug 任务）准备
驳回后自动触发：
1. 收集该任务最新状态（status、reviews、submissions、execution_log）
2. 分析 LLM 行为（轮次、tool calls、stall 信号）
3. 跑一个 root-cause 分析
4. 输出问题清单 + 改进建议

用法:
  python monitor-bug-task.py [taskId]
"""

import json
import sys
import sqlite3
import re
from datetime import datetime
from pathlib import Path

DB_PATH = r"C:/Users/swede/acms/data/acms.db"
LOG_PATH = r"C:/Users/swede/acms/data/acms.log"


def load_task(task_id):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "SELECT doc FROM tasks WHERE json_extract(doc, '$.id') = ?",
        (task_id,),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return json.loads(row[0])


def load_log_for_task(task_id, max_lines=5000):
    """从 acms.log 提取该 task 相关日志"""
    if not Path(LOG_PATH).exists():
        return []
    lines = Path(LOG_PATH).read_text(encoding="utf-8", errors="ignore").splitlines()
    relevant = []
    for line in lines[-max_lines:]:
        if task_id in line:
            relevant.append(line)
    return relevant


def analyze_execution_log(log_entries):
    """分析 execution_log 结构"""
    if not log_entries:
        return {
            "total_entries": 0,
            "rounds": 0,
            "tool_calls": 0,
            "unique_tools": set(),
            "stall_signals": [],
            "first_time": None,
            "last_time": None,
            "duration_minutes": 0,
        }
    rounds = sum(1 for e in log_entries if e.get("action", "").startswith("round_"))
    tool_calls = [
        e for e in log_entries
        if e.get("note") and ("调用工具" in e.get("note", "") or "Tool call" in e.get("note", ""))
    ]
    tool_names = set()
    for e in tool_calls:
        note = e.get("note", "")
        m = re.search(r"调用工具[:\s]+(\w+)", note)
        if m:
            tool_names.add(m.group(1))
    stall_signals = [e for e in log_entries if "stall" in e.get("note", "").lower() or "装睡" in e.get("note", "")]
    first_time = log_entries[0].get("time", "")
    last_time = log_entries[-1].get("time", "")
    duration_min = 0
    try:
        if isinstance(first_time, (int, float)) and isinstance(last_time, (int, float)):
            duration_min = (last_time - first_time) / 1000 / 60
        elif isinstance(first_time, str) and isinstance(last_time, str):
            t1 = datetime.fromisoformat(first_time.replace("Z", "+00:00"))
            t2 = datetime.fromisoformat(last_time.replace("Z", "+00:00"))
            duration_min = (t2 - t1).total_seconds() / 60
    except Exception:
        pass
    return {
        "total_entries": len(log_entries),
        "rounds": rounds,
        "tool_calls": len(tool_calls),
        "unique_tools": tool_names,
        "stall_signals": len(stall_signals),
        "first_time": first_time,
        "last_time": last_time,
        "duration_minutes": round(duration_min, 1),
    }


def detect_problems(task, log_lines, exec_stats):
    """检测已知问题模式"""
    problems = []

    # 1. 装睡 / 0 tool calls
    if exec_stats["tool_calls"] == 0 and exec_stats["total_entries"] > 0:
        problems.append({
            "severity": "critical",
            "category": "stall",
            "message": f"装睡信号: execution_log 有 {exec_stats['total_entries']} 条 entry，但 0 条 tool call",
            "recommendation": "agent 提交了 summary 但没调 tool，应该是装睡。需要自动 reject + 重试。",
        })

    # 2. 装睡 / submission 0 files
    subs = task.get("submissions", [])
    if isinstance(subs, str):
        subs = json.loads(subs)
    zero_file_subs = [s for s in subs if not s.get("files")]
    if zero_file_subs:
        problems.append({
            "severity": "high",
            "category": "empty-submission",
            "message": f"{len(zero_file_subs)}/{len(subs)} 次 submission 文件列表为空",
            "recommendation": "agent 嘴上说改完了但 files=[]，这是常见装睡模式。提交前必须 verify file exists。",
        })

    # 3. 反复重试 / rejection loop
    reviews = task.get("reviews", [])
    if isinstance(reviews, str):
        reviews = json.loads(reviews)
    reject_count = sum(1 for r in reviews if r.get("verdict") == "rejected")
    if reject_count >= 2:
        problems.append({
            "severity": "high",
            "category": "rejection-loop",
            "message": f"已被 reject {reject_count} 次，每次都提交但没真改东西",
            "recommendation": "自动重试机制没效果。需要在 steerMessage 里强制告诉 agent: (a) 先 read 现状 (b) 用 agent_patch_file (c) verify。",
        })

    # 4. 任务长时间 in_progress 但无进展
    if task.get("status") == "in_progress":
        updated = task.get("updated_at", "")
        try:
            t = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            minutes_idle = (datetime.now(tz=None) - t.replace(tzinfo=None)).total_seconds() / 60
            if minutes_idle > 30:
                problems.append({
                    "severity": "medium",
                    "category": "stale-task",
                    "message": f"任务 {minutes_idle:.0f} 分钟没更新",
                    "recommendation": "检测僵尸任务 (in_progress + 无进展 30min+) 自动 mark failed。",
                })
        except Exception:
            pass

    # 5. 探索轮次过多 / 探索循环
    if exec_stats["rounds"] > 30:
        problems.append({
            "severity": "high",
            "category": "over-exploration",
            "message": f"agent 跑了 {exec_stats['rounds']} 轮，超过 30 轮警戒线",
            "recommendation": "agent 在探索阶段花太多轮次。需要: (a) 一次性读多个文件 agent_read_files (b) 加轮次预算提示 (c) stall detection。",
        })

    # 6. review rejected 但 feedback 为空
    empty_feedback_rejects = [r for r in reviews if r.get("verdict") == "rejected" and not r.get("feedback", "").strip()]
    if empty_feedback_rejects:
        problems.append({
            "severity": "high",
            "category": "missing-feedback",
            "message": f"{len(empty_feedback_rejects)} 次 reject 没有写 feedback",
            "recommendation": "PM reject 但没告诉 agent 哪里不行。auto-retry 无法学习。需要模板化 reject feedback。",
        })

    # 7. 大量重复 tool call（同一文件读 N 次）
    repeated_reads = {}
    for line in log_lines:
        m = re.search(r"call:\s+(agent_\w+)\(", line)
        if m:
            tool = m.group(1)
            repeated_reads[tool] = repeated_reads.get(tool, 0) + 1
    suspicious_tools = {k: v for k, v in repeated_reads.items() if v > 15}
    if suspicious_tools:
        problems.append({
            "severity": "high",
            "category": "tool-call-loop",
            "message": f"某些 tool 被反复调用（可能装睡/卡循环）: {suspicious_tools}",
            "recommendation": "限制同类 tool call 连续次数，触发 stall detection 自动中断。",
        })

    # 8. 网络瞬断
    network_errors = [l for l in log_lines if "fetch failed" in l or "ConnectTimeout" in l or "UND_ERR" in l]
    if network_errors:
        problems.append({
            "severity": "high",
            "category": "network-flaky",
            "message": f"检测到 {len(network_errors)} 次网络错误（fetch failed / ConnectTimeout）",
            "recommendation": "网络不稳定导致 agent 任务中断。已有 scheduleRetry 但要确认它在执行。",
        })

    # 9. max rounds exceeded
    if any("Tool loop exceeded" in l for l in log_lines):
        problems.append({
            "severity": "critical",
            "category": "tool-loop-exceeded",
            "message": "agent 跑满 max rounds (90) 仍没完成",
            "recommendation": "max rounds=90 太大。降到 30-50 触发 stall detection。加轮次预算提醒。",
        })

    # 10. agent 没意识到自己在循环
    same_tool_consecutive = re.findall(r"call:\s+(\w+)\(", "\n".join(log_lines[-50:]))
    if len(same_tool_consecutive) > 0:
        from collections import Counter
        cnt = Counter(same_tool_consecutive)
        most_common, freq = cnt.most_common(1)[0]
        if freq > 10:
            problems.append({
                "severity": "high",
                "category": "consecutive-same-tool",
                "message": f"最近 50 次调用中 {most_common} 出现 {freq} 次（连续同 tool 是卡循环信号）",
                "recommendation": "加 consecutive-same-tool 检测，连续 N 次同 tool 自动中断并提示换策略。",
            })

    return problems


def print_report(task_id):
    print("=" * 80)
    print(f"ACMS 任务监控报告 — {task_id}")
    print(f"生成时间: {datetime.now().isoformat()}")
    print("=" * 80)

    task = load_task(task_id)
    if not task:
        print(f"❌ 任务 {task_id} 不存在")
        return

    # 基本状态
    print(f"\n【任务基本状态】")
    print(f"  title: {task.get('title', 'N/A')[:60]}")
    print(f"  status: {task.get('status', '?')}")
    print(f"  progress: {task.get('progress', 0)}%")
    print(f"  assigned_to: {task.get('assigned_to', 'N/A')}")
    print(f"  updated_at: {task.get('updated_at', 'N/A')}")

    # execution_log 分析
    log_str = task.get("execution_log", "[]")
    log_entries = json.loads(log_str) if isinstance(log_str, str) else log_str
    stats = analyze_execution_log(log_entries)
    print(f"\n【execution_log 分析】")
    print(f"  total entries: {stats['total_entries']}")
    print(f"  rounds: {stats['rounds']}")
    print(f"  tool_calls: {stats['tool_calls']}")
    print(f"  unique_tools: {', '.join(sorted(stats['unique_tools'])) if stats['unique_tools'] else '(none)'}")
    print(f"  duration: {stats['duration_minutes']} 分钟")
    print(f"  stall signals: {stats['stall_signals']}")

    # submissions
    subs = task.get("submissions", [])
    if isinstance(subs, str):
        subs = json.loads(subs)
    print(f"\n【Submissions】")
    for i, s in enumerate(subs):
        files_count = len(s.get("files", []))
        print(f"  #{i+1}: by={s.get('submittedBy', '?')} files={files_count} time={s.get('submittedAt', '?')}")
    zero_file_subs = sum(1 for s in subs if not s.get("files"))
    if zero_file_subs:
        print(f"  ⚠️ {zero_file_subs}/{len(subs)} submissions 文件为空！")

    # reviews
    reviews = task.get("reviews", [])
    if isinstance(reviews, str):
        reviews = json.loads(reviews)
    print(f"\n【Reviews】")
    for i, r in enumerate(reviews):
        verdict = r.get("verdict", "?")
        verdict_icon = {"approved": "✅", "rejected": "❌", "pending": "⏳"}.get(verdict, "?")
        feedback_len = len(r.get("feedback", "").strip())
        print(f"  #{i+1}: {verdict_icon} {verdict} by={r.get('reviewedBy', '?')} feedback_len={feedback_len}")
        if verdict == "rejected" and feedback_len == 0:
            print(f"      ⚠️ reject 但 feedback 为空！")

    # log 文件分析
    log_lines = load_log_for_task(task_id)
    print(f"\n【acms.log 相关条目】")
    print(f"  total log lines: {len(log_lines)}")
    err_lines = [l for l in log_lines if "ERR" in l or "Error" in l]
    print(f"  error lines: {len(err_lines)}")

    # 问题检测
    problems = detect_problems(task, log_lines, stats)
    print(f"\n【检测到 {len(problems)} 个问题】")
    severity_icon = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}
    for p in sorted(problems, key=lambda x: ["critical", "high", "medium", "low"].index(x["severity"])):
        print(f"  {severity_icon[p['severity']]} [{p['category']}] {p['message']}")
        print(f"      → {p['recommendation']}")

    print("\n" + "=" * 80)
    print("【改进建议汇总】")
    if not problems:
        print("  ✅ 未检测到明显问题")
    else:
        categories = {}
        for p in problems:
            categories.setdefault(p["category"], []).append(p)
        for cat, probs in categories.items():
            print(f"\n  [{cat}]")
            for p in probs:
                print(f"    - {p['recommendation']}")
    print("=" * 80)


if __name__ == "__main__":
    task_id = sys.argv[1] if len(sys.argv) > 1 else "T-MRGDBST1"
    print_report(task_id)