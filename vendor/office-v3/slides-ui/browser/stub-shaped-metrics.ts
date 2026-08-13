// stub：shaped-metrics（harfbuzzjs 复杂脚本度量降级为估算）
export async function shapedMetricsReady(): Promise<void> { /* 浏览器无 harfbuzzjs，跳过复杂脚本精确度量 */ }
export const shapedMetricsReadySync = () => true
export const refineComplexWidths = async () => false
export const shapedMetricsEnabled = () => false
