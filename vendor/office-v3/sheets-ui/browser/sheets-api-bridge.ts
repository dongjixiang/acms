// ACMS 浏览器入口：注册 sheets main 层 handlers + 构造 window.desktopApi（renderer 依赖）
// 由 host（iframe）加载后作为 window.desktopApi 注入 renderer（替代 Electron preload）
import { handlers, ipcMain, WebContents } from './stub-electron'
import { registerSheetsIpc, setPendingBytes, setSaveBytesHook, hasPendingBytes, listSessionIds, getSessionInfo, snapshotForSummary } from './sheets-main-browser'

const WC = new WebContents()

export function installSheetsApiBridge(opts: { apiKey?: string }): {
  setPendingBytes: (b: Uint8Array | null, fileName?: string) => void
  call: (channel: string, ...args: any[]) => Promise<any>
} {
  registerSheetsIpc()
  setSaveBytesHook(async (bytes: Uint8Array, fileName: string) => {
    try {
      const b64 = bytesToBase64(bytes)
      const name = fileName || '工作簿.xlsx'
      const resp = await fetch('/api/office/save?api_key=' + (opts.apiKey || 'dev-key-001'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'xlsx', name, content: b64 }),
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
      const fn = handlers[channel]
      if (!fn) throw new Error('未知 channel: ' + channel)
      return fn({ sender: WC }, ...args)
    },
  }
}

// window.desktopApi — 显式方法表（方法名 → IPC channel，对齐 preload/index.ts）
export function installDesktopApi(apiKey?: string): void {
  const bridge = installSheetsApiBridge({ apiKey })
  // host/adapter 通过 window.__sheetsEditor 注入待打开字节
  ;(window as any).__sheetsEditor = bridge
  const call = bridge.call
  const noop = () => {}
  const unsub = () => () => {}
  const desktopApi: Record<string, unknown> = {
    getLanguage: () => call('app:get-language'),
    onLanguageChanged: () => unsub,
    getTheme: () => call('app:get-theme'),
    onThemeChanged: () => unsub,
    onChromePressed: () => unsub,
    selectWorkbook: () => call('workbook:select'),
    readWorkbookRange: (request: unknown) => call('workbook:read-range', request),
    readWorkbookFormulas: (request: unknown) => call('workbook:read-formulas', request),
    recalcWorkbook: (request: unknown) => call('workbook:recalc', request),
    readWorkbookMedia: (request: unknown) => call('workbook:read-media', request),
    readPivotDefinition: (request: unknown) => call('workbook:read-pivot-definition', request),
    readLocalImage: (request: unknown) => call('shell:read-local-image', request),
    captureScreenSources: () => call('sheets:capture-screen-sources'),
    captureScreenSource: (request: unknown) => call('sheets:capture-screen-source', request),
    saveWorkbookEdits: (request: unknown) => call('workbook:save', request),
    writeWorkbookRecovery: (request: unknown) => call('workbook:write-recovery', request),
    autoRenameWorkbook: (sessionId: unknown, baseName: unknown) => call('workbook:auto-rename', sessionId, baseName),
    exportPdf: (request: unknown) => call('workbook:export-pdf', request),
    closeWorkbook: (sessionId: unknown) => call('workbook:close', sessionId),
    openExternal: (url: unknown) => call('shell:open-external', url),
    onMenuAction: () => unsub,
    onWorkbookRenamed: () => unsub,
    notifyPendingEdits: noop,
    onCloseSaveRequest: () => unsub,
    reportCloseSaveResult: noop,
    consumeNewBlankWorkbook: () => call('sheets:consume-new-blank'),
    hasQueuedWorkbook: () => call('sheets:has-queued-workbook'),
    getAiSettings: () => call('ai:get-settings'),
    setAiSettings: (settings: unknown) => call('ai:set-settings', settings),
    aiChat: (request: unknown) => call('ai:chat', request),
    aiStream: (request: unknown) => call('ai:stream', request),
    aiStreamCancel: (requestId: unknown) => call('ai:stream-cancel', requestId),
    aiGskStatus: () => call('ai:gsk-status'),
    aiGskLogin: () => call('ai:gsk-login'),
    webSearch: () => Promise.resolve([]),
    onAiStream: () => unsub,
    pickAttachments: () => call('sheets:files-pick'),
    addAttachmentPaths: () => call('sheets:files-add', []),
    addPastedImage: () => call('sheets:files-add-pasted-image', new Uint8Array(0), 'png'),
    readAttachment: () => call('sheets:files-read', '', 0, 1000),
    readAttachmentImage: () => call('sheets:files-read-image', ''),
    getPathForFile: () => '',
  }
  ;(window as any).desktopApi = desktopApi
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) {
    chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH))))
  }
  return btoa(chunks.join(''))
}

;(window as any).__sheetsApiBridge = true
;(window as any).installSheetsApiBridge = installSheetsApiBridge
;(window as any).installDesktopApi = installDesktopApi
;(window as any).__sheetsHasPending = hasPendingBytes
// 调试：session 列表 + 摘要快照（E3/E4 验证保存链路 / 小吉动作卡用）
;(window as any).__sheetsDebug = {
  listSessions: listSessionIds,
  sessionInfo: getSessionInfo,
  snapshot: snapshotForSummary,
}
