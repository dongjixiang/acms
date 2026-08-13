// 浏览器入口：打包 slides-main 编辑层（stub Electron/node），导出 slidesApi 分发器
// 由 host（iframe）加载后作为 window.slidesApi 注入 renderer
import { handlers, ipcMain, WebContents } from './stub-electron'
import { registerSlidesIpc, setPendingBytes, setSaveBytesHook } from './slides-main-browser'
// stub 依赖（esbuild alias 处理；这里显式 import 确保打包包含）
import './stub-register'
import './stub-i18n-main'
import './stub-ai-search'

const WC = new WebContents()

export function installSlidesApiBridge(opts: {
  apiKey?: string
}): {
  setPendingBytes: (b: Uint8Array | null) => void
  call: (channel: string, ...args: any[]) => Promise<any>
} {
  registerSlidesIpc()
  // 反向索引：renderer 方法名（camelCase）→ main channel（slides:kebab-case）
  const byCamel: Record<string, string> = {}
  Object.keys(handlers).forEach((ch) => {
    byCamel[ch.replace(/^slides:/, '').replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = ch
  })
  // 保存回调：上传 /api/office/save
  setSaveBytesHook(async (bytes: Uint8Array, path: string) => {
    try {
      const b64 = bytesToBase64(bytes)
      const name = path.split(/[\\/]/).pop() || 'document.pptx'
      const resp = await fetch('/api/office/save?api_key=' + (opts.apiKey || 'dev-key-001'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'pptx', name, content: b64 }),
      })
      const r = await resp.json()
      return r.ok ? { ok: true } : { ok: false, error: r.error || '保存失败' }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })
  return {
    setPendingBytes,
    call: async (channel: string, ...args: any[]) => {
      const fn = handlers[channel] || handlers[byCamel[channel]]
      if (!fn) throw new Error('未知 channel: ' + channel)
      return fn({ sender: WC }, ...args)
    },
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) {
    chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH))))
  }
  return btoa(chunks.join(''))
}

// 供 host 检查
;(window as any).__slidesApiBridge = true
;(window as any).installSlidesApiBridge = installSlidesApiBridge
