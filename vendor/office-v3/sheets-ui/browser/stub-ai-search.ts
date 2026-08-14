// 浏览器 stub：@genoffice/ai-search（AI 由小吉/ACMS 侧处理，此处禁用）
export const gskApiKey = () => ''
export const setGskProxyUrl = () => {}
export const gskLoginInfo = async () => ({ loggedIn: false })
export const hasGskAuth = () => false
export const ensureGenofficeLogin = async () => ({ ok: false, error: '浏览器环境禁用' })
export const webSearch = async () => []
export const imageSearch = async () => []
export const aiSearch = async () => []
export const aiSearchImages = async () => []
