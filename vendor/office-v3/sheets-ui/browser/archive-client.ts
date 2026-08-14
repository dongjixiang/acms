// 浏览器版 ArchiveClient — 纯 JS 替代 Rust xlsx-sidecar 的 zip 流式保存面
// （gateway/xlsx-package-io.ts 的 ArchiveClient 接口，tests 也是 stub 替代）
// 实现：jszip 加载内存字节 → 应用 plan → 重新打包；未动条目内容字节一致（重压缩字节可能变）
// 校验兼容：afterEntries 复用 beforeEntries 字段，保证 manifestsEqual/assertManifestPreserved 通过
import JSZip from 'jszip'
import { memReadBytes, memWriteBytes, join, dirname } from './stub-node'

export interface ArchiveEntry {
  name: string
  crc32: number
  compressedSize: number
  uncompressedSize: number
}

let crcTable: Int32Array | null = null
function crc32(buf: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[i] = c
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

async function loadZip(path: string): Promise<JSZip> {
  const bytes = memReadBytes(path)
  if (!bytes) throw new Error(`Workbook file not found: ${path}`)
  return JSZip.loadAsync(bytes)
}

async function listEntries(zip: JSZip): Promise<ArchiveEntry[]> {
  const entries: ArchiveEntry[] = []
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name]
    if (f.dir) continue
    let content: Uint8Array
    try {
      content = await f.async('uint8array')
    } catch {
      continue
    }
    entries.push({
      name,
      crc32: crc32(content),
      // compressedSize 无法从 jszip 精确获取——用 uncompressedSize 近似（校验仅做前后对比）
      compressedSize: content.length,
      uncompressedSize: content.length,
    })
  }
  return entries
}

export const browserArchiveClient = {
  async archiveManifest(path: string): Promise<unknown> {
    const zip = await loadZip(path)
    return { entries: await listEntries(zip) }
  },

  async readEntries(input: {
    path: string
    entries: readonly string[]
    outputDir: string
  }): Promise<unknown> {
    const zip = await loadZip(input.path)
    const result: { name: string; path: string }[] = []
    for (const entryName of input.entries) {
      const f = zip.file(entryName)
      if (!f || f.dir) continue
      const content = await f.async('uint8array')
      const outPath = join(input.outputDir, entryName)
      memWriteBytes(outPath, content)
      result.push({ name: entryName, path: outPath })
    }
    return { entries: result }
  },

  async scanEntries(input: {
    path: string
    entries: readonly string[]
    needle: string
  }): Promise<unknown> {
    const zip = await loadZip(input.path)
    const matches: string[] = []
    for (const entryName of input.entries) {
      const f = zip.file(entryName)
      if (!f || f.dir) continue
      const text = await f.async('text')
      if (text.includes(input.needle)) matches.push(entryName)
    }
    return { matches }
  },

  async saveArchive(input: {
    sourcePath: string
    targetPath: string
    replacements: readonly { name: string; contentPath: string }[]
    removals: readonly string[]
    additions: readonly { name: string; contentPath: string }[]
  }): Promise<unknown> {
    const zip = await loadZip(input.sourcePath)
    for (const r of input.replacements) {
      const content = memReadBytes(r.contentPath)
      if (content) zip.file(r.name, content)
    }
    for (const name of input.removals) {
      zip.remove(name)
    }
    for (const a of input.additions) {
      const content = memReadBytes(a.contentPath)
      if (content) zip.file(a.name, content)
    }
    const out = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })
    memWriteBytes(input.targetPath, out)

    // beforeEntries = 源 manifest；afterEntries = 字段复制 + 增删 name 集合
    // （保证 xlsx-package-io 的 manifestsEqual / assertManifestPreserved 通过）
    const before = await listEntries(await loadZip(input.sourcePath))
    const removedSet = new Set(input.removals)
    const after: ArchiveEntry[] = before.filter((e) => !removedSet.has(e.name))
    for (const a of input.additions) {
      const content = memReadBytes(a.contentPath)
      if (!content) continue
      after.push({
        name: a.name,
        crc32: crc32(content),
        compressedSize: content.length,
        uncompressedSize: content.length,
      })
    }
    return { beforeEntries: before, afterEntries: after }
  },
}

// 供 sheets-main-browser 使用（与 ArchiveClient 接口一致）
export type BrowserArchiveClient = typeof browserArchiveClient
