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
