import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// 浏览器构建：产出 office-slides-ui.js（动态 import 到 ACMS office-v3-slides 窗口）
// 复用 word-ui 的 alias/stub 经验
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '../../../../../packages/pptx-engine/src/smartart-layout', replacement: resolve(__dirname, '../engine/pptx-engine/smartart-layout.ts') },
      // 子路径精确项（必须先于裸路径——字符串 find 前缀匹配会吞子路径）
      { find: '@genoffice/pptx-engine/background-promote', replacement: resolve(__dirname, '../engine/pptx-engine/background-promote.ts') },
      { find: '@genoffice/pptx-engine/table-grid', replacement: resolve(__dirname, '../engine/pptx-engine/table-grid.ts') },
      // 裸路径最后兜底
      { find: '@genoffice/pptx-engine', replacement: resolve(__dirname, '../engine/pptx-engine/index.ts') },
      { find: '@genoffice/pptx-render/preset-geometry', replacement: resolve(__dirname, '../engine/pptx-render/preset-geometry.ts') },
      { find: '@genoffice/pptx-render', replacement: resolve(__dirname, '../engine/pptx-render/index.ts') },
      // node 内置模块 → 浏览器 stub（引擎 zip.ts 等）
      { find: 'node:fs/promises', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:crypto', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:zlib', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:child_process', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:fs', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:os', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:path', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: '@genoffice/font-metrics', replacement: resolve(__dirname, '../engine/font-metrics/index.ts') },
      { find: '@genoffice/docx-engine', replacement: resolve(__dirname, '../engine/docx-engine/index.ts') },
      { find: '@genoffice/i18n', replacement: resolve(__dirname, '../word-ui/packages_i18n/src/index.ts') },
      { find: '@genoffice/ui/tokens.css', replacement: resolve(__dirname, '../word-ui/packages_ui/src/tokens.css') },
      { find: '@genoffice/ui/screentip.css', replacement: resolve(__dirname, '../word-ui/packages_ui/src/screentip.css') },
      { find: '@genoffice/ui', replacement: resolve(__dirname, '../word-ui/packages_ui/src/index.ts') },
      { find: '@genoffice/agent-core', replacement: resolve(__dirname, '../word-ui/packages_stub/agent-core.ts') },
      { find: '@genoffice/ai-provider', replacement: resolve(__dirname, '../word-ui/packages_stub/ai-provider.ts') },
      { find: 'electron', replacement: resolve(__dirname, 'browser/stub-electron.ts') },
      { find: './i18n-main', replacement: resolve(__dirname, 'browser/stub-i18n-main.ts') },
      { find: './tiff-decode', replacement: resolve(__dirname, 'browser/stub-tiff.ts') },
      { find: './fonts', replacement: resolve(__dirname, 'browser/stub-fonts.ts') },
      { find: './shaped-metrics', replacement: resolve(__dirname, 'browser/stub-shaped-metrics.ts') },
      { find: './ai-ipc', replacement: resolve(__dirname, 'browser/ai-ipc.ts') },
      { find: './presenter-show', replacement: resolve(__dirname, 'browser/presenter-show.ts') },
      { find: './attachments-ipc', replacement: resolve(__dirname, 'browser/attachments-ipc.ts') },
      { find: '@genoffice/ai-search', replacement: resolve(__dirname, 'browser/stub-ai-search.ts') },
      { find: '@genoffice/electron-utils', replacement: resolve(__dirname, 'browser/stub-electron-utils.ts') },
      { find: '@genoffice/project-store', replacement: resolve(__dirname, 'browser/stub-project-store.ts') },
    ],
  },
  build: {
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'adapter.tsx'),
      name: 'OfficeSlidesUI',
      formats: ['es'],
      fileName: () => 'office-slides-ui.js',
    },
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,  // 资源外链（避免内联）
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'konva', 'react-konva'],
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    __dirname: '""',
    __filename: '""',
  },
});
