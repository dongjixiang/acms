// ACMS 内建工具 — Agent 浏览器截图工具
// 让 agent 能对页面截图，用于视觉验证
const { registerTool } = require('../../services/tool-registry');

registerTool({
  name: 'browser_screenshot',
  description: 'Take a screenshot of the current browser page and return the base64-encoded PNG image. Use this for visual verification of UI changes, layout checks, and catching rendering bugs that text snapshots miss.',
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Optional: save screenshot to this file path (relative to workspace root). If not provided, returns base64 data.' },
      fullPage: { type: 'boolean', description: 'If true, capture the full scrollable page. If false (default), capture only the viewport.', default: false },
    },
    required: [],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    const result = await workspace.exec(slug, {
      cmd: `node -e "
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const indexPath = path.join(process.cwd(), '${slug === 'jjgame' ? 'workspaces/jjgame' : 'workspaces/' + slug}', 'index.html');
    await page.goto('file://' + indexPath, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.waitForTimeout(1000);
    const fullPage = ${args.fullPage ? 'true' : 'false'};
    const buf = await page.screenshot({ fullPage, type: 'png' });
    const b64 = buf.toString('base64');
    if (${!!args.filePath}) {
      const savePath = path.join(process.cwd(), '${args.filePath || 'screenshot.png'}');
      fs.writeFileSync(savePath, buf);
      console.log(JSON.stringify({ saved: true, path: savePath, size: buf.length }));
    } else {
      console.log(JSON.stringify({ base64: b64.slice(0, 500000), size: b64.length }));
    }
    await browser.close();
  } catch(e) {
    console.log(JSON.stringify({ error: e.message }));
  }
})();
"`,
      timeout: 30000,
    });
    try {
      const output = result.stdout || result.stderr || '';
      const match = output.match(/\{.*\}/s);
      if (match) {
        return JSON.parse(match[0]);
      }
      return { raw_output: output.slice(0, 500) };
    } catch(e) {
      return { error: 'Parse failed: ' + e.message, raw_output: (result.stdout || '').slice(0, 500) };
    }
  },
});

console.log('[tools] 截图工具注册完成: browser_screenshot');
