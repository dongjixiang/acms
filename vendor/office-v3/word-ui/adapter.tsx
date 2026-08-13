// ACMS 入口：替代 electron main.tsx，导出 mount 函数供 office-v3-word 窗口动态 import
import { createRoot } from 'react-dom/client'
import { App } from './renderer/App'
import { LocaleProvider, setModuleLang } from './renderer/i18n/locale'
import { installDesktopShim, type DesktopShimOptions } from './desktop-shim'
import '@genoffice/ui/tokens.css'
import '@genoffice/ui/screentip.css'
import './renderer/styles.css'
import './renderer/fonts/fonts.css'
import { installScreenTips } from '@genoffice/ui'

export interface MountWordUIOptions extends DesktopShimOptions {
  theme?: 'light' | 'dark' | 'system'
}

export function mountWordUI(container: HTMLElement, opts: MountWordUIOptions = {}): void {
  installDesktopShim(opts)
  installScreenTips()
  setModuleLang('zh')
  const theme = opts.theme || 'system'
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
  const root = createRoot(container)
  // React 19 createRoot 不挂 _reactRootContainer，显式保存供 unmount 使用
  ;(container as any).__wordUIRoot = root
  root.render(
    <LocaleProvider initial="zh">
      <App />
    </LocaleProvider>,
  )
}

// 供外部卸载（窗口关闭/复用重挂时清理）
export function unmountWordUI(container: HTMLElement): void {
  try {
    const root = (container as any).__wordUIRoot
    if (root && typeof root.unmount === 'function') root.unmount()
    ;(container as any).__wordUIRoot = null
  } catch {
    /* ignore */
  }
  try {
    container.innerHTML = ''
  } catch {
    /* ignore */
  }
}
