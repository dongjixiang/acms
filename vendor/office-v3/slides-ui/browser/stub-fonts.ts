// stub：fonts（主进程字体工具，浏览器用启发式度量——引擎内置的确定性 fallback）
// ⚠️ P137：createSystemFontMetrics 被 getFontMetrics() 同步调用（session-state.ts:260），
// 绝不能写成 async —— 否则返回 Promise 被当 FontMetricsProvider 使用，
// 报 "t.measure is not a function"，openBytes 失败 → PPT 空白。
import { HeuristicMetrics } from '@genoffice/pptx-render'

export const createSystemFontMetrics = () => new HeuristicMetrics()
export const fontMetricsFor = () => null
export const listInstalledFonts = () => []
export const faceVerticalMetrics = () => null
export default {}
