// ACMS 入口：替代 electron main.tsx，导出 mount 函数供 office-v3-slides 窗口使用
import { createRoot } from 'react-dom/client'
import { App } from './renderer/App'
import { LocaleProvider, setModuleLang } from './renderer/i18n/locale'
import { installScreenTips } from '@genoffice/ui'
import '@genoffice/ui/tokens.css'
import '@genoffice/ui/screentip.css'
import './renderer/styles.css'
import * as bridgeModule from './browser/slides-api-bridge'

export interface MountSlidesUIOptions {
  fileId?: string
  fileName?: string
  apiKey?: string
  buffer?: Uint8Array
}

declare global {
  interface Window {
    __slidesEditor?: {
      setPendingBytes: (b: Uint8Array | null) => void
      call: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

// Canvas fillText 不会触发 @font-face 下载，显式加载 Carlito（复用 Word UI 字体）
for (const variant of ['', 'bold ', 'italic ', 'italic bold ']) {
  document.fonts?.load?.(`${variant}16px Carlito`).catch(() => {})
}

export function mountSlidesUI(container: HTMLElement, opts: MountSlidesUIOptions = {}): void {
  installScreenTips()
  setModuleLang('zh')
  // 自动安装主进程桥（stub Electron IPC + 保存 hook → /api/office/save）
  if (!window.__slidesEditor) {
    const { installSlidesApiBridge } = bridgeModule
    window.__slidesEditor = installSlidesApiBridge({ apiKey: opts.apiKey })
  }
  // renderer 期望 window.slidesApi（~130 个 IPC 方法）——Proxy 转发到 call(channel)
  if (!window.slidesApi) {
    window.slidesApi = new Proxy({} as any, {
      get: (_t, prop) => {
        if (typeof prop !== 'string') return undefined
        if (prop.startsWith('on')) return () => () => {}
        return (...args: any[]) => window.__slidesEditor!.call(prop, ...args)
      },
    })
  }
  // 注入待打开字节 → renderer 的 consumePendingOpen 读取
  if (window.__slidesEditor && opts.buffer) {
    window.__slidesEditor.setPendingBytes(opts.buffer)
  }
  document.documentElement.removeAttribute('data-theme')
  const root = createRoot(container)
  ;(container as any).__slidesUIRoot = root
  root.render(
    <LocaleProvider initial="zh">
      <App />
    </LocaleProvider>,
  )
}

export function unmountSlidesUI(container: HTMLElement): void {
  try {
    const root = (container as any).__slidesUIRoot
    if (root && typeof root.unmount === 'function') root.unmount()
    ;(container as any).__slidesUIRoot = null
  } catch {
    /* ignore */
  }
  try {
    container.innerHTML = ''
  } catch {
    /* ignore */
  }
}
