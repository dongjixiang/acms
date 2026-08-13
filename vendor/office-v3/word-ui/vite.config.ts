import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// 浏览器构建：产出 office-word-ui.js（动态 import 到 ACMS office-v3-word 窗口）
// - 不打包 fonts（运行时从 /client/lib/office-v3/fonts/ 加载）
// - node:* 全 external（浏览器环境无 node）
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // workspace 包 → 源码直接引用（免 npm link）
      '@genoffice/docx-engine': resolve(__dirname, '../engine/docx-engine/index.ts'),
      '@genoffice/pptx-render/preset-geometry': resolve(__dirname, '../engine/pptx-render/preset-geometry.ts'),
      '../../../../../packages/pptx-render/src/preset-geometry': resolve(__dirname, '../engine/pptx-render/preset-geometry.ts'),
      '@genoffice/pptx-render': resolve(__dirname, '../engine/pptx-render/index.ts'),
      '@genoffice/font-metrics': resolve(__dirname, '../engine/font-metrics/index.ts'),
      '@genoffice/i18n': resolve(__dirname, 'packages_i18n/src/index.ts'),
      '@genoffice/ui/tokens.css': resolve(__dirname, 'packages_ui/src/tokens.css'),
      '@genoffice/ui/screentip.css': resolve(__dirname, 'packages_ui/src/screentip.css'),
      '@genoffice/ui': resolve(__dirname, 'packages_ui/src/index.ts'),
      // AI 相关包 → stub（小吉接管）
      '@genoffice/agent-core': resolve(__dirname, 'packages_stub/agent-core.ts'),
      '@genoffice/ai-provider': resolve(__dirname, 'packages_stub/ai-provider.ts'),
      '@genoffice/project-store': resolve(__dirname, 'packages_stub/project-store.ts'),
    },
  },
  build: {
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'adapter.tsx'),
      name: 'OfficeWordUI',
      formats: ['es'],
      fileName: () => 'office-word-ui.js',
    },
    rollupOptions: {
      external: [],
    },
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,  // 字体外链（避免 27MB CSS 内联；集成时随 dist 拷贝）
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@tiptap/core', '@tiptap/pm'],
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
