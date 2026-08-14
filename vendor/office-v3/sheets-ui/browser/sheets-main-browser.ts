// ACMS 浏览器版 Sheets main 层 — 替代 Electron sheets-main.ts
// 与 slides-main-browser 同模式：stub Electron/node + 内存字节打开/保存
// 关键替代：
//   - Rust sidecar（XlsxSidecarClient）→ 纯 JS：readBasicWorkbook/inventoryXlsx/applyCellEditsToXlsx + browserArchiveClient
//   - 磁盘文件 IO → 内存 FS（browser/stub-node.ts memReadBytes/memWriteBytes）
//   - 保存落盘 → setSaveBytesHook 上传 /api/office/save
//   - IronCalc 公式重算 → fail-soft 空结果（Univer 会话内重算，Excel 打开自动重算）
//   - 视觉对象/透视表落盘 → 降级跳过（P4b-2 backlog）
import { ipcMain } from './stub-electron'
import { randomUUID, join, dirname, basename, existsSync, renameSync, readFileSync, writeFileSync, memReadBytes, memWriteBytes } from './stub-node'
import {
  readBasicWorkbook,
  inventoryXlsx,
  applyCellEditsToXlsx,
  planCellEditsToXlsx,
  assembleWithJsZip,
  createBufferEntrySource,
  type CellEdit,
  type SheetStructuralOps,
} from '../gateway/xlsx-gateway'
import type { SheetEditPlan } from '../gateway/xlsx-sheets'
import { readArchiveEntryText } from '../gateway/xlsx-package-io'
import { browserArchiveClient } from './archive-client'
import { parsePivotDefinition } from '../gateway/xlsx-pivot'
import {
  workbookFileSchema,
  workbookRangeRequestSchema,
  workbookRangeResultSchema,
  workbookFormulaCellsRequestSchema,
  workbookFormulaCellsResultSchema,
  workbookRecalcRequestSchema,
  workbookRecalcResultSchema,
  workbookMediaRequestSchema,
  workbookMediaResultSchema,
  workbookPivotRequestSchema,
  workbookPivotDefinitionSchema,
  workbookSaveRequestSchema,
  localImageRequestSchema,
  type WorkbookFile,
  type WorkbookSaveRequest,
  type WorkbookRangeResult,
} from '../shared/desktop-api'
import { z } from 'zod'
import { getUiLang } from '@genoffice/i18n'
import type { CellState } from '../domain/workbook.types'

// ── 状态 ──
export interface SheetSession {
  path: string
  sha256: string
  fileName: string
  sheetNames: Map<string, string>
  cellsBySheet: Map<string, Readonly<Record<string, CellState>>>
  rowColBySheet: Map<string, { rows: number; cols: number }>
  suggestSaveAs?: string
  csvImport?: boolean
}

interface BcCellRecord {
  row: number
  column: number
  value: string | number | boolean | null
  formula?: string
  styleIndex?: number
  rich?: unknown
}

const sessions = new Map<string, SheetSession>()
let pendingBytes: Uint8Array | null = null
let pendingFileName = '工作簿.xlsx'
let pendingNewBlank = false
let saveBytesHook: ((bytes: Uint8Array, path: string) => Promise<{ ok: boolean; error?: string }>) | null = null
const untitledPaths = new Set<string>()

export function setPendingBytes(bytes: Uint8Array | null, fileName?: string): void {
  pendingBytes = bytes
  if (fileName) pendingFileName = fileName
  if (bytes) pendingNewBlank = false
}
export function listSessionIds(): string[] {
  return [...sessions.keys()]
}
export function getSessionInfo(id: string): { path: string; sheetNames: string[] } | null {
  const s = sessions.get(id)
  if (!s) return null
  return { path: s.path, sheetNames: [...s.sheetNames.values()] }
}

// 小吉集成：文档摘要快照（buildOfficeDocContext 用，从打开时解析的 cells 缓存读）
export function snapshotForSummary(
  sessionId: string,
  maxSheets = 5,
  maxRows = 12,
  maxCols = 10,
): { sheets: { id: string; name: string; rows: (string | number | boolean)[][] }[] } | null {
  const s = sessions.get(sessionId)
  if (!s) return null
  const sheets: { id: string; name: string; rows: (string | number | boolean)[][] }[] = []
  for (const [sid, name] of s.sheetNames) {
    const cells = s.cellsBySheet.get(sid)
    const rows: (string | number | boolean)[][] = []
    for (let r = 1; r <= maxRows; r++) {
      const row: (string | number | boolean)[] = []
      for (let c = 0; c < maxCols; c++) {
        const cell = cells ? cells[toA1(r - 1, c)] : undefined
        row.push(cell ? (cell.formula ? '=' + cell.formula : (cell.value != null ? cell.value : '')) : '')
      }
      rows.push(row)
    }
    sheets.push({ id: sid, name, rows })
    if (sheets.length >= maxSheets) break
  }
  return { sheets }
}
export function setSaveBytesHook(
  fn: (bytes: Uint8Array, path: string) => Promise<{ ok: boolean; error?: string }>,
): void {
  saveBytesHook = fn
}
export function hasPendingBytes(): boolean {
  return pendingBytes !== null
}

function sha256Fixed(): string {
  return 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
}

function toA1(row: number, col: number): string {
  let letters = ''
  let remaining = col + 1
  while (remaining > 0) {
    remaining -= 1
    letters = String.fromCharCode(65 + (remaining % 26)) + letters
    remaining = Math.floor(remaining / 26)
  }
  return `${letters}${row + 1}`
}

function parseAddressToRowCol(addr: string): { row: number; col: number } | null {
  const m = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(addr)
  if (!m) return null
  let col = 0
  for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64)
  return { row: parseInt(m[2], 10) - 1, col: col - 1 }
}

// ── 打开（内存字节）──
async function openWorkbookSessionBrowser(
  bytes: Uint8Array,
  fileName: string,
  suggestSaveAs?: string,
  csvImport?: boolean,
): Promise<WorkbookFile> {
  const parsed = await readBasicWorkbook(bytes)
  const sessionId = randomUUID()
  const path = `/memfs/tmp/${sessionId}.xlsx`
  memWriteBytes(path, bytes)
  const entryCount = (await inventoryXlsx(bytes)).length

  const sheetNames = new Map<string, string>()
  const cellsBySheet = new Map<string, Readonly<Record<string, CellState>>>()
  const rowColBySheet = new Map<string, { rows: number; cols: number }>()
  const sheets: WorkbookFile['sheets'] = []
  for (const sheet of parsed.snapshot.sheets) {
    sheetNames.set(sheet.id, sheet.name)
    cellsBySheet.set(sheet.id, sheet.cells)
    let maxRow = -1
    let maxCol = -1
    for (const addr of Object.keys(sheet.cells)) {
      const rc = parseAddressToRowCol(addr)
      if (rc) {
        if (rc.row > maxRow) maxRow = rc.row
        if (rc.col > maxCol) maxCol = rc.col
      }
    }
    rowColBySheet.set(sheet.id, { rows: maxRow + 1, cols: maxCol + 1 })
    sheets.push({
      id: sheet.id,
      name: sheet.name,
      rowCount: Math.max(maxRow + 1, 1),
      columnCount: Math.max(maxCol + 1, 1),
      columnWidths: [],
      defaultRowHeight: null,
      defaultColumnWidth: null,
      freeze: null,
      hidden: false,
      tabColor: null,
      showGridLines: true,
      tables: [],
      comments: [],
      pivotRanges: [],
      pivotTables: [],
      sparklines: [],
    })
  }

  sessions.set(sessionId, {
    path,
    sha256: sha256Fixed(),
    fileName,
    sheetNames,
    cellsBySheet,
    rowColBySheet,
    ...(suggestSaveAs === undefined ? {} : { suggestSaveAs }),
    ...(csvImport ? { csvImport } : {}),
  })

  return workbookFileSchema.parse({
    sessionId,
    name: fileName,
    path,
    sha256: sha256Fixed(),
    entryCount,
    sheets,
    styles: [],
    dxfStyles: [],
    visuals: [],
    definedNames: [],
    readOnly: false,
    needsSaveAs: suggestSaveAs !== undefined,
  })
}

// ── 读取 range（从打开时解析的 cells 缓存）──
function readRangeFromSession(session: SheetSession, sheetId: string, range: { startRow: number; endRow: number; startColumn: number; endColumn: number }): WorkbookRangeResult {
  const cells = session.cellsBySheet.get(sheetId)
  const rc = session.rowColBySheet.get(sheetId) ?? { rows: 0, cols: 0 }
  const result: BcCellRecord[] = []
  if (cells) {
    for (let r = range.startRow; r <= range.endRow && r < rc.rows; r++) {
      for (let c = range.startColumn; c <= range.endColumn && c < rc.cols; c++) {
        const cell = cells[toA1(r, c)]
        if (!cell) continue
        const rec: BcCellRecord = { row: r, column: c, value: cell.value }
        if (cell.formula !== undefined) rec.formula = cell.formula
        if ((cell as any).styleIndex !== undefined) rec.styleIndex = (cell as any).styleIndex
        if ((cell as any).rich !== undefined) rec.rich = (cell as any).rich
        result.push(rec)
      }
    }
  }
  return {
    cells: result,
    rows: [],
    merges: [],
    hyperlinks: [],
    conditionalRules: [],
    autoFilter: null,
    dataValidations: [],
    sheetProtection: null,
    indexedThroughRow: rc.rows - 1,
    indexingComplete: true,
  }
}

// ── 保存（writeWorkbookTo 的 sheetName 映射逻辑 + applyCellEditsToXlsx）──
async function writeWorkbookToBrowser(
  session: SheetSession,
  request: WorkbookSaveRequest,
  targetPath: string,
): Promise<{ touchedEntries: string[]; removedEntries: string[]; addedEntries: string[] }> {
  const addedSheetNames = new Map<string, string>()
  const duplicateSources = new Map<string, string>()
  const renames: { sheetName: string; newName: string }[] = []
  const removals: string[] = []
  const hiddenChanges: { sheetName: string; hidden: boolean }[] = []
  let orderChanged = false
  for (const op of request.sheetOps) {
    if (op.kind === 'add-sheet') {
      addedSheetNames.set(op.sheetId, op.name)
      continue
    }
    if (op.kind === 'duplicate-sheet') {
      const sourceName = session.sheetNames.get(op.sourceSheetId)
      if (!sourceName) throw new Error(`Unknown duplicate source ${op.sourceSheetId}.`)
      addedSheetNames.set(op.sheetId, op.name)
      duplicateSources.set(op.sheetId, sourceName)
      continue
    }
    if (op.kind === 'reorder-sheets') {
      orderChanged = true
      continue
    }
    const sheetName = addedSheetNames.get(op.sheetId) ?? session.sheetNames.get(op.sheetId)
    if (!sheetName) throw new Error(`Unknown worksheet ${op.sheetId}.`)
    if (op.kind === 'rename-sheet') renames.push({ sheetName, newName: op.newName })
    else if (op.kind === 'set-sheet-hidden') hiddenChanges.push({ sheetName, hidden: op.hidden })
    else removals.push(sheetName)
  }
  const renameByOriginal = new Map(renames.map((rename) => [rename.sheetName, rename.newName]))
  const resolveSheetName = (sheetId: string): string => {
    const sheetName = addedSheetNames.get(sheetId) ?? session.sheetNames.get(sheetId)
    if (!sheetName) throw new Error(`Unknown worksheet ${sheetId}.`)
    return sheetName
  }
  let sheetPlan: SheetEditPlan | undefined
  if (request.sheetOps.length > 0) {
    sheetPlan = {
      renames,
      additions: [...addedSheetNames].map(([sheetId, name]) => ({
        name,
        sourceSheetName: duplicateSources.get(sheetId),
      })),
      removals,
      hiddenChanges,
      orderChanged,
      order: request.sheetOrder.map((sheetId) => {
        const original = resolveSheetName(sheetId)
        return addedSheetNames.has(sheetId)
          ? original
          : (renameByOriginal.get(original) ?? original)
      }),
    }
  }

  const edits: CellEdit[] = request.edits.map((edit) => ({
    sheetName: resolveSheetName(edit.sheetId),
    row: edit.row,
    column: edit.column,
    writeValue: edit.writeValue,
    cell: { value: edit.value, formula: edit.formula },
    style: edit.style,
    rich: edit.rich,
    styleReset: edit.styleReset,
  }))
  const opsBySheet = new Map<string, SheetStructuralOps['ops'][number][]>()
  for (const op of request.structuralOps) {
    const sheetName = resolveSheetName(op.sheetId)
    const sheetOps = opsBySheet.get(sheetName) ?? []
    if ('range' in op) {
      sheetOps.push({ kind: op.kind, range: op.range })
    } else if ('size' in op) {
      sheetOps.push({ kind: op.kind, start: op.start, end: op.end, size: op.size })
    } else if ('level' in op) {
      sheetOps.push({
        kind: op.kind,
        start: op.start,
        end: op.end,
        level: op.level,
        ...(op.collapsed === undefined ? {} : { collapsed: op.collapsed }),
      })
    } else if ('hidden' in op) {
      sheetOps.push({ kind: op.kind, start: op.start, end: op.end, hidden: op.hidden })
    } else if ('before' in op) {
      sheetOps.push({ kind: op.kind, index: op.index, count: op.count, before: op.before })
    } else {
      sheetOps.push({ kind: op.kind, index: op.index, count: op.count })
    }
    opsBySheet.set(sheetName, sheetOps)
  }
  const structuralOps: SheetStructuralOps[] = [...opsBySheet].map(([sheetName, ops]) => ({
    sheetName,
    ops,
  }))
  const filterStates = request.filterStates.map((state) => ({
    sheetName: resolveSheetName(state.sheetId),
    filter: state.filter,
    hiddenRows: state.hiddenRows,
    visibilityRange: state.visibilityRange,
  }))
  const linksBySheet = new Map<string, { row: number; column: number; target: string | null }[]>()
  for (const link of request.hyperlinkEdits) {
    const sheetName = resolveSheetName(link.sheetId)
    const sheetLinks = linksBySheet.get(sheetName) ?? []
    sheetLinks.push({ row: link.row, column: link.column, target: link.target })
    linksBySheet.set(sheetName, sheetLinks)
  }
  const hyperlinkEdits = [...linksBySheet].map(([sheetName, links]) => ({ sheetName, edits: links }))
  const cfStates = request.cfStates.map((state) => ({
    sheetName: resolveSheetName(state.sheetId),
    rules: state.rules,
  }))
  const dvStates = request.dvStates.map((state) => ({
    sheetName: resolveSheetName(state.sheetId),
    rules: state.rules,
  }))
  const sheetProtections = request.sheetProtections.map((state) => ({
    sheetName: resolveSheetName(state.sheetId),
    protected: state.protected,
  }))
  const pageSetupStates = request.pageSetupStates.map(({ sheetId, ...state }) => ({
    sheetName: resolveSheetName(sheetId),
    ...state,
  }))
  const noteStates = request.noteStates.map(({ sheetId, notes }) => ({
    sheetName: resolveSheetName(sheetId),
    notes,
  }))
  const formulaValuesBySheet = new Map<string, { row: number; column: number; value: string | number | boolean | null }[]>()
  for (const cell of request.formulaValues) {
    const sheetName = resolveSheetName(cell.sheetId)
    const list = formulaValuesBySheet.get(sheetName) ?? []
    list.push({ row: cell.row, column: cell.column, value: cell.value })
    formulaValuesBySheet.set(sheetName, list)
  }
  const formulaValues = [...formulaValuesBySheet].map(([sheetName, cells]) => ({ sheetName, cells }))
  // 视觉对象/表格/透视（P4b-2：从原 writeWorkbookTo 完整移植，落盘不再降级）
  const visualAdditions = request.visualAdditions.map((addition) => ({
    sheetName: resolveSheetName(addition.sheetId),
    anchor: addition.anchor,
    chart: addition.chart,
    shape: addition.shape,
    image: addition.image,
  }))
  const tableAdditions = request.tableAdditions.map((table) => ({
    sheetName: resolveSheetName(table.sheetId),
    area: table.area,
    name: table.name,
    columnNames: table.columnNames,
    style: table.style,
    bandedRows: table.bandedRows,
  }))
  const pivotAdditions = request.pivotAdditions.map((pivot) => ({
    sheetName: resolveSheetName(pivot.sheetId),
    sourceSheetName: resolveSheetName(pivot.sourceSheetId),
    sourceArea: pivot.sourceArea,
    location: pivot.location,
    name: pivot.name,
    fieldNames: pivot.fieldNames,
    rowFieldIndices: pivot.rowFieldIndices,
    columnFieldIndex: pivot.columnFieldIndex,
    pageFieldIndices: pivot.pageFieldIndices,
    rowItems: pivot.rowItems,
    rowLevelItems: pivot.rowLevelItems,
    rowLines: pivot.rowLines,
    columnItems: pivot.columnItems,
    columnFieldIndices: pivot.columnFieldIndices,
    colLevelItems: pivot.colLevelItems,
    colLines: pivot.colLines,
    groupings: pivot.groupings,
    filters: pivot.filters,
    rowHiddenItems: pivot.rowHiddenItems,
    colHiddenItems: pivot.colHiddenItems,
    values: pivot.values,
  }))
  const sparklineAdditions = request.sparklineAdditions.map(({ sheetId, ...group }) => ({
    sheetName: resolveSheetName(sheetId),
    ...group,
  }))
  const pivotRefreshUpdates = request.pivotRefreshUpdates.map((update) => ({
    cachePath: update.cachePath,
    sheetName: resolveSheetName(update.sheetId),
    newOutputRef: update.newOutputRef,
    ...(update.relayout === undefined
      ? {}
      : {
          relayout: (({ sheetId: _sheetId, sourceSheetId, ...rest }) => ({
            ...rest,
            sourceSheetName: resolveSheetName(sourceSheetId),
          }))(update.relayout),
        }),
  }))

  // 浏览器版：纯 JS 保存（planCellEditsToXlsx 完整参数 + assembleWithJsZip 内存重打包）
  const source = memReadBytes(session.path)
  if (!source) throw new Error(`Workbook bytes missing: ${session.path}`)
  const plan = await planCellEditsToXlsx(
    await createBufferEntrySource(source),
    edits,
    structuralOps,
    request.chartEdits,
    sheetPlan,
    filterStates,
    hyperlinkEdits,
    cfStates,
    dvStates,
    sheetProtections,
    request.definedNamesState,
    visualAdditions,
    pageSetupStates,
    noteStates,
    tableAdditions,
    pivotAdditions,
    request.pivotCacheRefreshPaths,
    pivotRefreshUpdates,
    request.visualEdits,
    sparklineAdditions,
    formulaValues,
  )
  const mutation = await assembleWithJsZip(source, plan)
  memWriteBytes(targetPath, mutation.buffer)
  if (saveBytesHook) {
    // 传真实文件名（保存到服务器用），非内存路径
    const res = await saveBytesHook(mutation.buffer, session.fileName)
    if (!res.ok) throw new Error(res.error || '保存失败')
  }
  return {
    touchedEntries: mutation.touchedEntries,
    removedEntries: mutation.removedEntries,
    addedEntries: mutation.addedEntries,
  }
}

// ── IPC handlers ──
let registered = false
export function registerSheetsIpc(): void {
  if (registered) return
  registered = true

  ipcMain.on('workbook:pending-edits', () => {})
  ipcMain.on('workbook:close-save-result', () => {})

  ipcMain.handle('app:get-language', () => getUiLang())
  ipcMain.handle('app:get-theme', () => 'system')

  ipcMain.handle('sheets:consume-new-blank', () => {
    if (pendingNewBlank) {
      pendingNewBlank = false
      return true
    }
    return false
  })
  ipcMain.handle('sheets:has-queued-workbook', () => pendingBytes !== null || pendingNewBlank)

  // 打开：ACMS 注入的 pendingBytes（文件浏览器 → bridge → 这里）
  ipcMain.handle('workbook:select', async () => {
    if (!pendingBytes) return null
    const bytes = pendingBytes
    pendingBytes = null
    return openWorkbookSessionBrowser(bytes, pendingFileName)
  })

  ipcMain.handle('workbook:read-range', async (_e, input: unknown) => {
    const request = workbookRangeRequestSchema.parse(input)
    const session = sessions.get(request.sessionId)
    if (!session) throw new Error('Unknown workbook session.')
    return workbookRangeResultSchema.parse(
      readRangeFromSession(session, request.sheetId, request.range),
    )
  })

  ipcMain.handle('workbook:read-formulas', async (_e, input: unknown) => {
    const request = workbookFormulaCellsRequestSchema.parse(input)
    const session = sessions.get(request.sessionId)
    if (!session) throw new Error('Unknown workbook session.')
    const cells = session.cellsBySheet.get(request.sheetId)
    const records: BcCellRecord[] = []
    if (cells) {
      for (const [addr, cell] of Object.entries(cells)) {
        if (!cell.formula) continue
        const rc = parseAddressToRowCol(addr)
        if (!rc) continue
        const rec: BcCellRecord = { row: rc.row, column: rc.col, value: cell.value, formula: cell.formula }
        records.push(rec)
      }
    }
    return workbookFormulaCellsResultSchema.parse({
      cells: records,
      indexingComplete: true,
      truncated: false,
    })
  })

  // IronCalc 重算 → fail-soft 空结果（Univer 会话内已重算；保存的公式缓存值不刷新，Excel 打开自动重算）
  ipcMain.handle('workbook:recalc', async (_e, input: unknown) => {
    const request = workbookRecalcRequestSchema.parse(input)
    if (!sessions.has(request.sessionId)) throw new Error('Unknown workbook session.')
    return workbookRecalcResultSchema.parse({ cells: [], cached: true })
  })

  ipcMain.handle('workbook:read-media', async (_e, input: unknown) => {
    const request = workbookMediaRequestSchema.parse(input)
    if (!sessions.has(request.sessionId)) throw new Error('Unknown workbook session.')
    // 浏览器版无视觉对象落盘 → 读不到 media（P4b-2 backlog）
    throw new Error('Media not available in browser.')
  })

  ipcMain.handle('workbook:read-pivot-definition', async (_e, input: unknown) => {
    const request = workbookPivotRequestSchema.parse(input)
    const session = sessions.get(request.sessionId)
    if (!session) throw new Error('Unknown workbook session.')
    const [pivotXml, cacheXml] = await Promise.all([
      readArchiveEntryText(browserArchiveClient as any, session.path, request.path),
      readArchiveEntryText(browserArchiveClient as any, session.path, request.cachePath),
    ])
    return workbookPivotDefinitionSchema.parse(parsePivotDefinition(pivotXml, cacheXml))
  })

  ipcMain.handle('workbook:save', async (_e, input: unknown) => {
    const request = workbookSaveRequestSchema.parse(input)
    const session = sessions.get(request.sessionId)
    if (!session) throw new Error('Unknown workbook session.')
    let targetPath = session.path
    if (request.mode === 'save-as' || session.suggestSaveAs !== undefined) {
      targetPath = session.suggestSaveAs ?? session.path
    }
    const mutation = await writeWorkbookToBrowser(session, request, targetPath)
    // 保存后重开 session（未来读取匹配新字节）
    const savedBytes = memReadBytes(targetPath)
    sessions.delete(request.sessionId)
    const file = savedBytes
      ? await openWorkbookSessionBrowser(savedBytes, session.path.split('/').pop() || '工作簿.xlsx')
      : null
    return { canceled: false, file, touchedEntries: mutation.touchedEntries }
  })

  ipcMain.handle('workbook:write-recovery', async (_e, input: unknown) => {
    const request = workbookSaveRequestSchema.parse(input)
    const session = sessions.get(request.sessionId)
    if (!session || session.suggestSaveAs !== undefined) return { ok: false }
    try {
      const recoveryPath = `/memfs/tmp/recovery-${session.path.split('/').pop()}`
      await writeWorkbookToBrowser(session, request, recoveryPath)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('workbook:close', async (_e, sessionId: unknown) => {
    const validated = z.string().uuid().parse(sessionId)
    sessions.delete(validated)
  })

  ipcMain.handle('workbook:auto-rename', (_e, sessionId: unknown, baseName: unknown) => {
    const validatedSessionId = z.string().uuid().parse(sessionId)
    const session = sessions.get(validatedSessionId)
    if (!session || !untitledPaths.has(session.path)) return { renamed: false }
    const base = String(baseName).replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 100)
    if (!base) return { renamed: false }
    const dir = dirname(session.path)
    let target = join(dir, `${base}.xlsx`)
    for (let i = 2; existsSync(target) && i < 100; i++) target = join(dir, `${base}-${i}.xlsx`)
    if (existsSync(target) || target === session.path) return { renamed: false }
    try {
      renameSync(session.path, target)
    } catch {
      return { renamed: false }
    }
    untitledPaths.delete(session.path)
    sessions.set(validatedSessionId, { ...session, path: target })
    return { renamed: true, name: basename(target) }
  })

  ipcMain.handle('workbook:export-pdf', async () => {
    throw new Error('PDF 导出在浏览器环境不可用')
  })

  ipcMain.handle('shell:open-external', async (_e, url: unknown) => {
    const validated = z.string().url().parse(url)
    window.open(validated, '_blank', 'noopener')
  })

  ipcMain.handle('shell:read-local-image', async (_e, input: unknown) => {
    localImageRequestSchema.parse(input)
    throw new Error('本地图片读取在浏览器环境不可用')
  })

  ipcMain.on('menu:action', () => {})
  ipcMain.on('workbook:renamed', () => {})

  // ── AI（小吉接管，浏览器 stub）──
  ipcMain.handle('ai:get-settings', () => ({ provider: 'acms', apiKey: '', model: '' }))
  ipcMain.handle('ai:set-settings', () => ({}))
  ipcMain.handle('ai:chat', async () => {
    throw new Error('AI 由小吉接管')
  })
  ipcMain.handle('ai:stream', async () => {})
  ipcMain.handle('ai:stream-cancel', async () => {})
  ipcMain.handle('ai:gsk-status', async () => ({ loggedIn: false, email: null }))
  ipcMain.handle('ai:gsk-login', async () => {})

  // ── 截图/附件（浏览器 stub）──
  ipcMain.handle('sheets:capture-screen-sources', async () => ({ status: 'denied', sources: [] }))
  ipcMain.handle('sheets:capture-screen-source', async () => null)
  ipcMain.handle('sheets:files-pick', async () => null)
  ipcMain.handle('sheets:files-add', async () => ({ accepted: [], rejected: [] }))
  ipcMain.handle('sheets:files-add-pasted-image', async () => ({ accepted: [], rejected: ['浏览器不支持'] }))
  ipcMain.handle('sheets:files-read', async () => ({ ok: false, error: '浏览器不支持附件读取' }))
  ipcMain.handle('sheets:files-read-image', async () => ({ ok: false, error: '浏览器不支持附件读取' }))
}

export { readFileSync, writeFileSync }
