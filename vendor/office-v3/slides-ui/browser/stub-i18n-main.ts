// 浏览器 stub：i18n-main（主进程翻译字典，renderer 有自己的 i18n）
export function tm(key: string): string {
  return key
}
export const getUiLang = () => 'zh'
export const normalizeLang = (l: string) => l
export const setUiLang = () => {}
export default { tm, getUiLang, normalizeLang, setUiLang }
