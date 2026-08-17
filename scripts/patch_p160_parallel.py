# Patch llm-adapter.js: 工具并行 (P160)
import re

path = r'C:\Users\swede\acms\server\services\llm-adapter.js'
with open(path, 'r', encoding='utf-8', newline='') as f:
    lines = f.readlines()

print(f'Total lines: {len(lines)}')

# line 983 (0-indexed 982) to 1067 (0-indexed 1066) — 替换 for loop
start_idx = 982
end_idx = 1067
assert lines[start_idx].strip().startswith('for (const tc of result.toolCalls)')
assert lines[end_idx-1].strip() == '}'

# helper function insertion point: after _resetCCState() line (~line 706)
helper_ins = None
for i in range(700, 720):
    if i < len(lines) and '_resetCCState()' in lines[i]:
        helper_ins = i + 1
        break
assert helper_ins is not None, 'helper_ins not found'
print(f'Helper insertion point: line {helper_ins+1}')

# Build new for-loop block
new_for_block = [
    '    // P160: 工具并行执行 — Hermes _PARALLEL_SAFE_TOOLS 借鉴\n',
    '    //   read/search/exec/git 类读操作可并发,write/patch 串行防竞态\n',
    "    const _PARALLEL_SAFE_TOOLS = new Set([\n",
    "      'agent_read_file', 'agent_list_files', 'agent_search_files',\n",
    "      'agent_exec_command', 'agent_git_status', 'agent_git_log',\n",
    "      'agent_git_diff', 'agent_set_phase',\n",
    "    ]);\n",
    '    const MAX_CONCURRENT_TOOLS = 4;\n',
    '    const parallelCalls = [];\n',
    '    const serialCalls = [];\n',
    '    for (const _tci of result.toolCalls) {\n',
    "      if (_PARALLEL_SAFE_TOOLS.has(_tci.name)) parallelCalls.push(_tci);\n",
    '      else serialCalls.push(_tci);\n',
    '    }\n',
    '    // 并行组\n',
    '    for (let i = 0; i < parallelCalls.length; i += MAX_CONCURRENT_TOOLS) {\n',
    '      const batch = parallelCalls.slice(i, i + MAX_CONCURRENT_TOOLS);\n',
    '      const batchResults = await Promise.allSettled(batch.map(async (_tc) => {\n',
    '        return await _execToolCall(_tc, toolRegistry, api, messages, toolCallHistory, round, context);\n',
    '      }));\n',
    '      for (const res of batchResults) {\n',
    "        if (res.status === 'fulfilled') {\n",
    '          const msgs = res.value;\n',
    '          if (msgs) for (const m of msgs) messages.push(m);\n',
    '        } else {\n',
    "          console.warn(`[runToolLoop] P160 并行工具失败: ${res.reason && res.reason.message || String(res.reason)}`);\n",
    '        }\n',
    '      }\n',
    '    }\n',
    '    // 串行组\n',
    '    for (const _tc of serialCalls) {\n',
    '      const sres = await _execToolCall(_tc, toolRegistry, api, messages, toolCallHistory, round, context);\n',
    '      if (sres) for (const m of sres) messages.push(m);\n',
    '    }\n',
]

# Build helper function
helper_code = [
    '\n',
    '  // P160: 工具调用执行 helper — 返回 messages 数组\n',
    '  async function _execToolCall(tc, toolReg, api, msgs, hist, rnd, ctx) {\n',
    '    const tool = toolReg.getTool(tc.name);\n',
    '    const argsPreview = JSON.stringify(tc.args || {}).slice(0, 200);\n',
    '    console.log(`[runToolLoop]   call: ${tc.name}(${argsPreview})`);\n',
    '    const out = [];\n',
    '    if (!tool) {\n',
    '      const allTools = toolReg.listTools ? toolReg.listTools() : [];\n',
    '      const validNames = new Set(allTools);\n',
    '      const repaired = repairToolName(tc.name, validNames);\n',
    '      if (repaired !== tc.name && validNames.has(repaired)) {\n',
    '        const repairedTool = toolReg.getTool(repaired);\n',
    '        if (repairedTool) {\n',
    "          console.log(`[runToolLoop] v0.33 tool name repair: \"${tc.name}\" → \"${repaired}\"`);\n",
    "          hist.push({ round: rnd + 1, tool: repaired, args: argsPreview, result: 'REPAIRED_NAME' });\n",
    '          try {\n',
    '            const toolResult = await repairedTool.handler(tc.args, ctx);\n',
    '            const truncatedResult = truncateToolResult(repaired, toolResult);\n',
    '            if (truncatedResult.truncated) {\n',
    "              console.log(`[runToolLoop] v0.33 truncated ${repaired} result: ${truncatedResult.origSize} → ${TOOL_RESULT_TRUNCATE_BYTES} bytes`);\n",
    '            }\n',
    '            hist[hist.length - 1].resultPreview = JSON.stringify(truncatedResult.result).slice(0, 300);\n',
    '            out.push(toolRegistry.makeToolResult(api, tc.id, truncatedResult.result));\n',
    '          } catch (e) {\n',
    '            hist[hist.length - 1].error = e.message;\n',
    '            out.push(toolRegistry.makeToolResult(api, tc.id, { error: e.message }));\n',
    '          }\n',
    '          return out;\n',
    '        }\n',
    '      }\n',
    "      console.log(`[runToolLoop]   -> 未知工具: ${tc.name}`);\n",
    "      hist.push({ round: rnd + 1, tool: tc.name, args: argsPreview, result: 'UNKNOWN_TOOL' });\n",
    "      out.push(toolRegistry.makeToolResult(api, tc.id, { error: `未知工具: ${tc.name}` }));\n",
    '      return out;\n',
    '    }\n',
    "    const callKey = `${tc.name}:${JSON.stringify(tc.args)}`;\n",
    '    if (callKey === lastToolCallKey) {\n',
    "      console.warn(`[runToolLoop]   -> 检测到连续两轮同 tool+args — 警告 LLM，不强制退出 (round ${rnd + 1}/${maxRounds})`);\n",
    "      hist.push({ round: rnd + 1, tool: tc.name, args: argsPreview, result: 'WARN_REPEAT' });\n",
    '      out.push(toolRegistry.makeToolResult(api, tc.id, {\n',
    "        warning: `You just called ${tc.name} with the same arguments in the previous round. This is a repeated call. If you have enough information, write the files or finish. If you need different info, try a different tool or different arguments. Do NOT call the same tool with the same arguments again — you have limited rounds left (${maxRounds - rnd - 1} rounds remaining).`,\n",
    '        _duplicateCall: true,\n',
    '      }));\n',
    '      lastToolCallKey = callKey;\n',
    '      return out;\n',
    '    }\n',
    '    lastToolCallKey = callKey;\n',
    '    try {\n',
    '      const pre = await runPreHooks(tc.name, tc.args, ctx);\n',
    '      if (pre.abort) {\n',
    "        hist.push({ round: rnd + 1, tool: tc.name, args: argsPreview, result: 'PRE_HOOK_ABORT', error: pre.abortReason });\n",
    "        out.push(toolRegistry.makeToolResult(api, tc.id, { ok: false, aborted: true, reason: pre.abortReason }));\n",
    '        return out;\n',
    '      }\n',
    '      const finalArgs = pre.args || tc.args;\n',
    '      const toolResult = await tool.handler(finalArgs, ctx);\n',
    '      const resultPreview = JSON.stringify(toolResult).slice(0, 300);\n',
    '      const postResult = await runPostHooks(tc.name, finalArgs, toolResult, ctx);\n',
    '      const truncated = truncateToolResult(tc.name, postResult);\n',
    '      if (truncated.truncated) {\n',
    "        console.log(`[runToolLoop] v0.33 truncated ${tc.name} result: ${truncated.origSize} → ${TOOL_RESULT_TRUNCATE_BYTES} bytes`);\n",
    '      }\n',
    "      console.log(`[runToolLoop]   -> result (${resultPreview.length} chars): ${resultPreview}`);\n",
    "      hist.push({ round: rnd + 1, tool: tc.name, args: argsPreview, resultPreview });\n",
    "      out.push(toolRegistry.makeToolResult(api, tc.id, truncated.result));\n",
    '    } catch (e) {\n',
    "      console.log(`[runToolLoop]   -> ERROR: ${e.message}`);\n",
    "      hist.push({ round: rnd + 1, tool: tc.name, args: argsPreview, error: e.message });\n",
    "      out.push(toolRegistry.makeToolResult(api, tc.id, { error: e.message }));\n",
    '    }\n',
    '    return out;\n',
    '  }\n',
    '\n',
]

# Assemble
new_lines = lines[:start_idx] + new_for_block + lines[end_idx:]
new_lines = new_lines[:helper_ins] + helper_code + new_lines[helper_ins:]

# Ensure CRLF
src_out = ''.join(new_lines)
crlf_count = src_out.count('\r\n')
lf_only = src_out.count('\n') - crlf_count
print(f'Before CRLF fix: CRLF={crlf_count}, bare LF={lf_only}')
if lf_only > 0 and crlf_count > 0:
    src_out = re.sub(r'(?<!\r)\n', '\r\n', src_out)
elif lf_only > 0 and crlf_count == 0:
    src_out = src_out.replace('\n', '\r\n')

crlf2 = src_out.count('\r\n')
lf2 = src_out.count('\n') - crlf2
print(f'After fix: CRLF={crlf2}, bare LF={lf2}')

with open(path, 'wb') as f:
    f.write(src_out.encode('utf-8'))

# Verify
import subprocess
r = subprocess.run(['node', '--check', path], capture_output=True, text=True, timeout=10)
print(f'node --check: {r.returncode}')
if r.stderr:
    print('stderr:', r.stderr[:400])
else:
    print('Syntax OK')

lines_final = src_out.splitlines()
print(f'Total lines: {len(lines_final)}')
print(f'_execToolCall defs: {src_out.count("async function _execToolCall")}')
print(f'_execToolCall calls: {src_out.count("_execToolCall(")}')
print(f'P160: {src_out.count("P160")}')
print(f'Promise.allSettled: {src_out.count("Promise.allSettled")}')
