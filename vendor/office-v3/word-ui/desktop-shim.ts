// ACMS browser shim: window.desktop（GenOffice Electron preload bridge → 浏览器适配）
// 打开：consumePendingOpenDocx 返回注入的 pending 文档（mount 时通过 opts 传入）
// 保存：saveDocx 系列对接 ACMS /api/office/save（content base64 直存通道）
// AI/附件/打印：浏览器环境不可用 → 空实现/拒绝（A3 阶段小吉接管 AI 通道）
export interface DesktopShimOptions {
  fileId?: string
  fileName?: string
  apiKey?: string
  buffer?: Uint8Array
}

export function installDesktopShim(opts: DesktopShimOptions): void {
  const pending = opts.buffer
    ? {
        path: opts.fileId || 'local.docx',
        name: opts.fileName || 'document.docx',
        data: opts.buffer.buffer as ArrayBuffer,
        hash: 'local',
      }
    : null

  const saveViaApi = async (name: string, buffer: Uint8Array | ArrayBuffer): Promise<{ ok: boolean; error?: string }> => {
    try {
      // saveOnce 传 ArrayBuffer（无 .length），统一转 Uint8Array
      const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
      const b64 = bytesToBase64(u8)
      const resp = await fetch('/api/office/save?api_key=' + (opts.apiKey || 'dev-key-001'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'docx', name, content: b64 }),
      })
      const r = await resp.json()
      if (r.ok) return { ok: true }
      return { ok: false, error: r.error || '保存失败' }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  const noop = () => {}
  const unsub = () => () => {}

  const desktop: Record<string, unknown> = {
    // ── 语言/主题 ──
    getLanguage: () => Promise.resolve('zh'),
    getTheme: () => Promise.resolve('system'),
    onThemeChanged: () => unsub,
    onLanguageChanged: () => unsub,
    // ── 文档打开/新建 ──
    consumePendingOpenDocx: () => Promise.resolve(pending),
    consumeNewBlankDoc: () => Promise.resolve(false),
    getRecentFiles: () => Promise.resolve([]),
    onOpenDocx: () => unsub,
    onRenamedDocx: () => unsub,
    onTeardown: () => unsub,
    openDocx: () => Promise.resolve(null),
    openDocxPath: () => Promise.resolve(null),
    getPathForFile: () => Promise.resolve(''),
    // ── 窗口/关闭确认 ──
    onCloseCheck: () => unsub,
    onCloseSaveRequest: () => unsub,
    onMenuCommand: () => unsub,
    reportCloseCheck: noop,
    reportCloseSaveResult: noop,
    reportViewMenuState: noop,
    // ── 多标签（浏览器单窗口 → 单 tab） ──
    listDocsTabs: () => Promise.resolve([]),
    focusDocsTab: noop,
    openNewTab: noop,
    // ── 保存/导出 ──
    writeRecoveryCopy: () => Promise.resolve(),
    saveDocxAs: async (name: string, buffer: Uint8Array) => saveViaApi(name, buffer),
    saveDocxNew: async (name: string, buffer: Uint8Array) => saveViaApi(name, buffer),
    saveDocx: async (_path: string, buffer: Uint8Array) => saveViaApi(opts.fileName || 'document.docx', buffer),
    print: () => Promise.reject(new Error('浏览器环境不支持打印')),
    printPdfBuffer: () => Promise.reject(new Error('浏览器环境不支持打印')),
    saveMergedPdf: () => Promise.reject(new Error('浏览器环境不支持 PDF 合并')),
    exportPdf: () => Promise.reject(new Error('浏览器环境不支持 PDF 导出')),
    // ── AI（小吉接管；此处返回默认值防崩） ──
    getAiSettings: () => Promise.resolve({ provider: 'acms', apiKey: '', model: '' }),
    aiGskLogin: () => Promise.resolve({ ok: false }),
    aiStream: () => Promise.resolve(),
    aiStreamCancel: noop,
    onAiStream: () => unsub,
    webSearch: () => Promise.resolve([]),
    imageSearch: () => Promise.resolve([]),
    fetchImage: () => Promise.reject(new Error('浏览器环境不支持图片抓取')),
    // ── 附件/图片（浏览器不可用） ──
    pickAttachments: () => Promise.resolve([]),
    pickImage: () => Promise.resolve(null),
    addAttachmentPaths: noop,
    addPastedImage: noop,
    readAttachment: () => Promise.resolve(null),
    readAttachmentImage: () => Promise.resolve(null),
  }
  ;(window as any).desktop = desktop
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) {
    chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH))))
  }
  return btoa(chunks.join(''))
}
