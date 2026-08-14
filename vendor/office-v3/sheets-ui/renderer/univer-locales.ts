/**
 * Univer UI locale wiring. createUniver boots with en-US (the packs
 * are needed synchronously); once the runtime exists, the app language picks
 * the matching Univer language packs — every preset ships all 19 — and
 * switches LocaleService, which re-renders the whole Univer React tree
 * (rule-management panels, dialogs, menus). Languages Univer has no pack for
 * (th/nl/ms/he/hi) stay English.
 */
import { LocaleService, LocaleType, mergeLocales, type ILocales } from '@univerjs/core'

import type { UniverRuntime } from './univer-state'

type LocalePack = Record<string, unknown>

const UNIVER_LOCALES: Record<
  string,
  { type: LocaleType; load(): Promise<{ default: LocalePack }[]> }
> = {
  zh: {
    type: LocaleType.ZH_CN,
    load: () =>
      Promise.all([
        import('@univerjs/preset-sheets-core/locales/zh-CN'),
        import('@univerjs/preset-sheets-conditional-formatting/locales/zh-CN'),
        import('@univerjs/preset-sheets-data-validation/locales/zh-CN'),
        import('@univerjs/preset-sheets-drawing/locales/zh-CN'),
        import('@univerjs/preset-sheets-filter/locales/zh-CN'),
        import('@univerjs/preset-sheets-find-replace/locales/zh-CN'),
        import('@univerjs/preset-sheets-note/locales/zh-CN'),
        import('@univerjs/preset-sheets-sort/locales/zh-CN'),
        import('@univerjs/preset-sheets-table/locales/zh-CN'),
      ]),
  },
}

export function univerLocaleFor(lang: string): LocaleType | null {
  return UNIVER_LOCALES[lang]?.type ?? null
}

export async function applyUniverLocale(runtime: UniverRuntime, lang: string): Promise<void> {
  const entry = UNIVER_LOCALES[lang]
  if (!entry) return
  const packs = (await entry.load()).map((mod) => mod.default)
  const merged = mergeLocales(...packs) as Record<string, Record<string, unknown>>
  // sheets-ui 0.25.1 references these two keys but no shipped pack has them;
  // keep the English fallback so the raw key never surfaces (same patch as
  // the en-US boot locale in App.tsx).
  merged['sheets-ui'] = {
    ...merged['sheets-ui'],
    info: {
      ...(merged['sheets-ui']?.info as Record<string, string> | undefined),
      error: 'Number stored as text',
      forceStringInfo:
        'The value in this cell is stored as text — it will not be treated as a ' +
        'number in formulas.',
    },
  }
  const localeService = runtime.univer.__getInjector().get(LocaleService)
  localeService.load({ [entry.type]: merged } as unknown as ILocales)
  localeService.setLocale(entry.type)
}
