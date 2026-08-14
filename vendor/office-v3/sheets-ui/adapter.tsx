// ACMS 入口：替代 electron main.tsx，导出 mount 函数供 office-v3-xlsx 窗口动态 import
import { createRoot } from 'react-dom/client'
import React from 'react'
import { App } from './renderer/App'
import { LocaleProvider, setModuleLang } from './renderer/i18n/locale'
import { installScreenTips } from '@genoffice/ui'
import '@genoffice/ui/tokens.css'
import '@genoffice/ui/screentip.css'
import '@univerjs/preset-sheets-core/lib/index.css'
import './renderer/styles.css'
import { installDesktopApi } from './browser/sheets-api-bridge'

export interface MountSheetsUIOptions {
  fileId?: string
  fileName?: string
  apiKey?: string
  buffer?: Uint8Array
}

declare global {
  interface Window {
    __sheetsEditor?: {
      setPendingBytes: (b: Uint8Array | null, fileName?: string) => void
      call: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

// ACMS 小吉桥：Excel AI 面板消息 → /api/agent-buddy/office-action 生成器 → 应用
// ctx 由 App.handleSend 传入（appendChat/setMessage/setAiBusy/propose/apply/persistChatMessage）
;(window as any).__acmsOfficeAction = async function (
  instruction: string,
  _attachments: unknown[],
  ctx: {
    appendChat: (m: { role: string; text: string; tools?: unknown[]; isError?: boolean; streaming?: boolean }) => void
    setMessage: (s: string) => void
    setAiBusy: (b: boolean) => void
    propose: (ops: unknown[], summary: string) => { ok: boolean; error?: string; plan?: any }
    apply: (plan: any) => Promise<{ error?: string }> | { error?: string }
    persistChatMessage: (role: string, text: string) => void
  },
): Promise<void> {
  ctx.setAiBusy(true)
  ctx.appendChat({ role: 'assistant', text: '', tools: [], streaming: true })
  try {
    // 1. 组装 docContext（sheets-main-browser 打开时解析的 cells 缓存）
    const debug = (window as any).__sheetsDebug
    const sids = debug && typeof debug.listSessions === 'function' ? debug.listSessions() : []
    let doc: unknown = null
    if (sids.length && debug && typeof debug.snapshot === 'function') {
      doc = debug.snapshot(sids[0], 5, 12, 10)
    }
    if (!doc) throw new Error('工作簿未加载')
    // 2. 调小吉生成器
    const apiKey = (window as any).__acmsApiKey || 'dev-key-001'
    const resp = await fetch('/api/agent-buddy/office-action?api_key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'xlsx', docContext: doc, instruction: String(instruction).slice(0, 600) }),
    })
    const data = await resp.json()
    if (!data || !data.ok || !data.action) {
      throw new Error((data && data.error) || '生成编辑动作失败')
    }
    const action = data.action
    // 3. 执行（GenOffice 语义：立即应用 + 可撤销）
    if (action.op === 'propose' && action.operations && action.operations.length) {
      const pr = ctx.propose(action.operations, action.summary || '小吉编辑')
      if (!pr || !pr.ok) throw new Error((pr && pr.error) || '生成计划失败')
      const ap = await ctx.apply(pr.plan)
      if (ap && (ap as { error?: string }).error) throw new Error((ap as { error?: string }).error)
      const okText = '✅ ' + (action.summary || ('已应用 ' + action.operations.length + ' 个操作'))
      ctx.setMessage(okText)
      ctx.appendChat({ role: 'assistant', text: okText, tools: [], isError: false })
      ctx.persistChatMessage('assistant', okText)
    } else {
      const errText = '❌ ' + ((action && action.error) || '无法执行该指令')
      ctx.appendChat({ role: 'assistant', text: errText, tools: [], isError: true })
    }
  } catch (e: any) {
    const errText = '❌ ' + (e && e.message ? e.message : String(e))
    ctx.appendChat({ role: 'assistant', text: errText, tools: [], isError: true })
  } finally {
    ctx.setAiBusy(false)
  }
}

export function mountSheetsUI(container: HTMLElement, opts: MountSheetsUIOptions = {}): void {
  // ── 诊断：React 打包状态（GenOffice 白屏定位用）──
  try {
    console.error('[sheets-ui] DIAG React:', typeof React, 'useRef:', typeof (React && React.useRef), 'keys:', React ? Object.keys(React as object).slice(0, 8).join(',') : 'null')
  } catch (e: any) {
    console.error('[sheets-ui] DIAG React check failed:', e && e.message)
  }
  installScreenTips()
  setModuleLang('zh')
  document.documentElement.removeAttribute('data-theme')
  ;(window as any).__acmsApiKey = opts.apiKey || 'dev-key-001'
  // 安装主进程桥（stub Electron IPC + 保存 hook → /api/office/save）+ window.desktopApi
  installDesktopApi(opts.apiKey)
  // 注入待打开字节 → renderer 的 workbook:select 读取
  if (opts.buffer && window.__sheetsEditor) {
    window.__sheetsEditor.setPendingBytes(opts.buffer, opts.fileName)
  }
  const root = createRoot(container, {
    onUncaughtError: (error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error('[sheets-ui] React uncaught error:', err.message)
      console.error('[sheets-ui] STACK:', err.stack || 'no stack')
      try {
        parent.postMessage({ type: 'iframe-console', level: 'error', msg: 'REACT-ERR: ' + err.message + ' || ' + (err.stack || '').slice(0, 800) }, '*')
      } catch (e) { /* ignore */ }
    },
  })
  ;(container as any).__sheetsUIRoot = root
  root.render(
    <LocaleProvider initial="zh">
      <App />
    </LocaleProvider>,
  )
}

export function unmountSheetsUI(container: HTMLElement): void {
  try {
    const root = (container as any).__sheetsUIRoot
    if (root && typeof root.unmount === 'function') root.unmount()
    ;(container as any).__sheetsUIRoot = null
  } catch {
    /* ignore */
  }
  try {
    container.innerHTML = ''
  } catch {
    /* ignore */
  }
}
