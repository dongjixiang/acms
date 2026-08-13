// 浏览器 stub：node 内置模块（slides-main 依赖面：fs/crypto/os/path/child_process）
export const readFile = async () => { throw new Error('浏览器环境不支持文件系统') }
export const writeFile = async () => { throw new Error('浏览器环境不支持文件系统') }
export const rm = async () => { throw new Error('浏览器环境不支持文件系统') }
export const stat = async () => { throw new Error('浏览器环境不支持文件系统') }
export const mkdir = async () => { throw new Error('浏览器环境不支持文件系统') }
export const open = async () => { throw new Error('浏览器环境不支持文件系统') }
export const existsSync = () => false
export const mkdirSync = () => {}

export const createHash = () => ({
  update() { return this },
  digest() { return 'local-hash' },
})
export const randomUUID = () => 'browser-' + Math.random().toString(36).slice(2)

export const userInfo = () => ({ username: 'browser' })

export const dirname = () => ''
export const join = () => ''
export const resolve = () => ''

export const execFile = async () => { throw new Error('浏览器环境不支持子进程') }

export default {}

// 补充导出（zlib 等）
export const deflateSync = (d: Uint8Array) => d
export const inflateSync = (d: Uint8Array) => d
export const gunzipSync = (d: Uint8Array) => d
export const gzipSync = (d: Uint8Array) => d
export const createDeflate = () => ({ on() {}, push() {}, end() {} })
export const createInflate = () => ({ on() {}, push() {}, end() {} })
export const Readable = class { pipe() { return this } on() { return this } }
export const Writable = class {}
export const Buffer = {
  from: (x: any, enc?: string) => (typeof x === 'string' ? new Uint8Array(new TextEncoder().encode(x)) : new Uint8Array(x)),
  isBuffer: () => false,
  alloc: (n: number) => new Uint8Array(n),
  concat: (arrs: Uint8Array[]) => { const t = arrs.reduce((a, b) => a + b.length, 0); const o = new Uint8Array(t); let p = 0; arrs.forEach((a) => { o.set(a, p); p += a.length; }); return o },
}
export const btoa = (s: string) => globalThis.btoa(s)
