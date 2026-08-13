// stub：@genoffice/electron-utils
export const isMac = () => false
export const isWindows = () => true
export const isLinux = () => false
export default {}

export const appMenuLabels = () => ({})
export const contextMenuLabels = () => ({})
export const configuredDefaultSaveDir = () => ''
export const installContextMenu = () => {}
export const dialogParent = () => null

export const installNavigationGuard = () => {}
export const safeExternalUrl = (u: string) => u
export const showOpenDialogWithMemory = async () => ({ canceled: true, filePaths: [] })
export const showSaveDialogWithMemory = async () => ({ canceled: true, filePath: null })
export const toggleDevToolsItem = () => {}
