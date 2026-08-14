// 浏览器 stub：node:* 内置模块（sheets gateway/main 依赖面）
// 内存文件系统：path → Uint8Array|string（浏览器无真实磁盘，全部驻留内存）

const memFS = new Map<string, Uint8Array | string>()
const memDirs = new Set<string>(['/memfs'])

// ── 供 sheets-main-browser 使用的内存 FS 桥 ──
export function memReadBytes(path: string): Uint8Array | null {
  const v = memFS.get(norm(path))
  if (v == null) return null
  return typeof v === 'string' ? new TextEncoder().encode(v) : v
}
export function memWriteBytes(path: string, bytes: Uint8Array): void {
  memFS.set(norm(path), bytes)
}
export function memDelete(path: string): void {
  memFS.delete(norm(path))
}
export function memList(): string[] {
  return [...memFS.keys()]
}

function norm(p: string): string {
  return String(p).replace(/\\/g, '/').replace(/\/+/g, '/')
}
function join2(a: string, b: string): string {
  const l = String(a).replace(/\/+$/, '')
  const r = String(b).replace(/^\/+/, '')
  return norm(l + '/' + r)
}
function dirname2(p: string): string {
  const n = norm(p).replace(/\/+$/, '')
  const i = n.lastIndexOf('/')
  return i <= 0 ? '/memfs' : n.slice(0, i)
}

// node:path
export function join(...parts: string[]): string {
  return norm(parts.filter(Boolean).join('/'))
}
export function dirname(p: string): string {
  return dirname2(p)
}
export function basename(p: string): string {
  const n = norm(p).replace(/\/+$/, '')
  return n.slice(n.lastIndexOf('/') + 1)
}
export function isAbsolute(p: string): boolean {
  return String(p).startsWith('/')
}
export const resolve = join

// node:os
export function tmpdir(): string {
  return '/memfs/tmp'
}
export const userInfo = () => ({ username: 'browser' })

// node:crypto
export function createHash(_algo: string): {
  update: (data: unknown) => any
  digest: (_enc?: string) => string
} {
  // P131 经验：originalHash 仅存档标识用途，固定值即可
  const fake = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
  return {
    update() { return this },
    digest() { return fake },
  }
}
export function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// node:fs/promises
export async function mkdtemp(prefix: string): Promise<string> {
  const p = norm(prefix) + '/' + randomUUID()
  memDirs.add(p)
  return p
}
export async function mkdir(p: string, _opts?: unknown): Promise<void> {
  memDirs.add(norm(p))
}
export async function readFile(p: string, enc?: string): Promise<string | Uint8Array> {
  const n = norm(p)
  const v = memFS.get(n)
  if (v == null) {
    const err: any = new Error(`ENOENT: no such file or directory, open '${p}'`)
    err.code = 'ENOENT'
    throw err
  }
  if (enc === 'utf8' || enc === 'utf-8') {
    return typeof v === 'string' ? v : new TextDecoder().decode(v)
  }
  return typeof v === 'string' ? new TextEncoder().encode(v) : v
}
export async function writeFile(
  p: string,
  content: string | Uint8Array,
  enc?: string,
): Promise<void> {
  const n = norm(p)
  if (enc === 'utf8' || enc === 'utf-8' || typeof content === 'string') {
    memFS.set(n, typeof content === 'string' ? content : new TextDecoder().decode(content))
  } else {
    memFS.set(n, content)
  }
  memDirs.add(dirname2(n))
}
export async function rename(oldP: string, newP: string): Promise<void> {
  const o = norm(oldP)
  const n = norm(newP)
  const v = memFS.get(o)
  if (v != null) {
    memFS.set(n, v)
    memFS.delete(o)
  }
}
export async function rm(p: string, _opts?: { force?: boolean; recursive?: boolean }): Promise<void> {
  const n = norm(p)
  memFS.delete(n)
  for (const k of [...memFS.keys()]) {
    if (k.startsWith(n + '/')) memFS.delete(k)
  }
}
export async function open(_p: string, _flags?: string): Promise<{ sync(): Promise<void>; close(): Promise<void> }> {
  // 内存文件无需 flush（syncFileBestEffort 浏览器直接 no-op）
  return { sync: async () => {}, close: async () => {} }
}
export const stat = async (p: string) => {
  const n = norm(p)
  const v = memFS.get(n)
  if (v == null && !memDirs.has(n)) {
    const err: any = new Error(`ENOENT: no such file or directory, stat '${p}'`)
    err.code = 'ENOENT'
    throw err
  }
  return { size: v == null ? 0 : typeof v === 'string' ? new TextEncoder().encode(v).length : v.length, isFile: () => v != null, isDirectory: () => memDirs.has(n) }
}
export const existsSync = (p: string): boolean => {
  const n = norm(p)
  return memFS.has(n) || memDirs.has(n)
}
export const mkdirSync = (p: string): void => {
  memDirs.add(norm(p))
}
export const readFileSync = (p: string, enc?: string): string | Uint8Array => {
  const n = norm(p)
  const v = memFS.get(n)
  if (v == null) {
    const err: any = new Error(`ENOENT: no such file or directory, open '${p}'`)
    err.code = 'ENOENT'
    throw err
  }
  if (enc === 'utf8' || enc === 'utf-8') return typeof v === 'string' ? v : new TextDecoder().decode(v)
  return typeof v === 'string' ? new TextEncoder().encode(v) : v
}
export const writeFileSync = (p: string, content: string | Uint8Array): void => {
  memFS.set(norm(p), typeof content === 'string' ? content : content)
}
export const renameSync = (oldP: string, newP: string): void => {
  const o = norm(oldP)
  const n = norm(newP)
  const v = memFS.get(o)
  if (v != null) {
    memFS.set(n, v)
    memFS.delete(o)
  }
}
export const createReadStream = () => {
  throw new Error('createReadStream not available in browser')
}
export const createWriteStream = () => {
  throw new Error('createWriteStream not available in browser')
}

// node:child_process / node:readline / node:http — 浏览器不可用
export const spawn = () => {
  throw new Error('child_process.spawn not available in browser')
}
export const createInterface = () => {
  throw new Error('readline not available in browser')
}
export const createServer = () => {
  throw new Error('http.createServer not available in browser')
}
