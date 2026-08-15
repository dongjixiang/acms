// electron（slides-main 依赖面）
// ipcMain.handle 收集到 handlers map（browser shim 分发）
export const handlers: Record<string, (e: any, ...args: any[]) => any> = {}

export const ipcMain = {
  handle(channel: string, fn: (e: any, ...args: any[]) => any) {
    handlers[channel] = fn
  },
  removeHandler(_channel: string) {},
  on() {},
  once() {},
  removeListener() {},
  removeAllListeners() {},
}

export class WebContents {
  id = 'browser'
}

export const app = {
  whenReady: () => Promise.resolve(),
  getPath: () => '',
  on: () => app,
  once: () => app,
  removeListener: () => app,
  removeAllListeners: () => app,
}

export const desktopCapturer = { getSources: () => Promise.resolve([]) }

// 浏览器 stub：dialog.showOpenDialog 走原生 <input type="file">
// 解析 options.filters → accept 属性；返回 Electron 兼容的 { canceled, filePaths }
// 注意：filePaths[0] 是真实 File 对象路径占位（不是真实磁盘路径），handler 调用 readFile(path)
// 时会失败。所以 host.html 必须在 ipcMain.handle('slides:open') 之前把 call('open') 拦截，
// 走 setPendingBytes + consume-pending-open 链路（不走 readFile）。
// 这里的 fallback 仅在 host.html 未拦截时（理论上不应发生）兜底返回 canceled。
export const dialog = {
  showOpenDialog: async (_opts?: any) => ({ canceled: true, filePaths: [] as string[] }),
}

export const electronSession = { defaultSession: { setDisplayMediaRequestHandler() {} } }

export default { ipcMain, app, desktopCapturer, dialog, WebContents, session: electronSession }

// 补充导出（空实现）
export class BrowserWindow { static getAllWindows() { return [] } loadURL() {} loadFile() {} on() { return this } once() { return this } webContents = { id: 'browser', on() {} } }
export const webContents = { getAllWebContents: () => [], fromId: () => null }
export const clipboard = { readText: () => '', writeText: () => {} }
export const Menu = { buildFromTemplate: () => ({ popup() {} }), setApplicationMenu: () => {} }
export const nativeImage = { createFromPath: () => ({ toDataURL: () => '' }), createFromBuffer: () => ({ toDataURL: () => '' }) }
export const shell = { openPath: async () => '', showItemInFolder: () => {} }
export class WebContentsView { constructor() {} setBounds() {} }
export const globalShortcut = { register: () => false, unregisterAll: () => {} }
export const screen = { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) }

export const session = { defaultSession: { setDisplayMediaRequestHandler() {}, webRequest: { onBeforeSendHeaders() {} } } }
