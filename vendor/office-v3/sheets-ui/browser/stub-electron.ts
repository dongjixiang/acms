// 浏览器 stub：electron（sheets-main 依赖面）
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
  getAppPath: () => '',
  on: () => app,
  once: () => app,
  removeListener: () => app,
  removeAllListeners: () => app,
}

export const desktopCapturer = { getSources: () => Promise.resolve([]) }

export const dialog = { showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }) }

export const electronSession = { defaultSession: { setDisplayMediaRequestHandler() {} } }

export const net = { fetch: () => Promise.reject(new Error('net not available')) }

export const screen = {
  getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
  getDisplayMatching: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
}

export const systemPreferences = {
  getColor: () => '#000000',
  isDarkMode: () => false,
  on: () => ({ removeListener() {} }),
}

export default { ipcMain, app, desktopCapturer, dialog, WebContents, session: electronSession }

// 补充导出（空实现）
export class BrowserWindow {
  static getAllWindows() { return [] }
  loadURL() {}
  loadFile() {}
  on() { return this }
  once() { return this }
  destroy() {}
  close() {}
  isDestroyed() { return true }
  webContents = { id: 'browser', on() {} }
}
export const webContents = { getAllWebContents: () => [], fromId: () => null }
export const clipboard = { readText: () => '', writeText: () => {} }
export const Menu = { buildFromTemplate: () => ({ popup() {} }), setApplicationMenu: () => {} }
export const nativeImage = { createFromPath: () => ({ toDataURL: () => '' }), createFromBuffer: () => ({ toDataURL: () => '' }) }
export const shell = { openPath: async () => '', showItemInFolder: () => {} }
export class WebContentsView { constructor() {} setBounds() {} webContents = { id: 'browser', on() {} } }
export const globalShortcut = { register: () => false, unregisterAll: () => {} }
export const session = { defaultSession: { setDisplayMediaRequestHandler() {}, webRequest: { onBeforeSendHeaders() {} } } }
