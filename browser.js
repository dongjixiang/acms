// ACMS 内建工具 — Agent 浏览器工具（4 工具）
// 让 agent 能像人类一样"看"页面：截图、读 console、检查 DOM、获取元素列表
// 依赖：browser-ninja MCP server 或 Puppeteer
const { registerTool } = require('../../services/tool-registry');

registerTool({
  name: 'browser_snapshot',
  description: 'Get the accessibility tree of the current browser page. Returns interactive elements with ref IDs (like @e1, @e2) for clicking/typeing. Use this to understand page structure, find buttons/forms, and verify content. Equivalent to reading the page\'s DOM in text form.',
  parameters: {
    type: 'object',
    properties: {
      full: { type: 'boolean', description: 'If true, returns complete page content. If false (default), returns compact view with only interactive elements.', default: false },
    },
    required: [],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    // 通过 workspace 执行 puppeteer 脚本
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    const result = await workspace.exec(slug, {
      cmd: `node -e "
const puppeteer = require('puppeteer');
(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    // Navigate to the project index.html
    const indexPath = require('path').join(process.cwd(), '${slug === 'jjgame' ? 'workspaces/jjgame' : 'workspaces/' + slug}', 'index.html');
    await page.goto('file://' + indexPath, { waitUntil: 'networkidle0', timeout: 15000 });
    // Get accessibility snapshot
    const snapshot = await page.accessibility.snapshot();
    console.log(JSON.stringify({ ok: true, snapshot: JSON.stringify(snapshot) }));
    await browser.close();
  } catch(e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
  }
})();
"`,
      timeout: 20000,
    });
    try {
      const output = result.stdout || result.stderr || '';
      const match = output.match(/\{.*\}/s);
      if (match) {
        const data = JSON.parse(match[0]);
        if (data.ok) return { snapshot: JSON.parse(data.snapshot) };
        return { error: data.error };
      }
      return { raw_output: output.slice(0, 500) };
    } catch(e) {
      return { error: 'Parse failed: ' + e.message, raw_output: (result.stdout || '').slice(0, 500) };
    }
  },
});

registerTool({
  name: 'browser_console',
  description: 'Get browser console output and JavaScript errors from the current page. Returns console.log/warn/error/info messages and uncaught JS exceptions. Use this to detect silent JavaScript errors, failed API calls, and application warnings. Optionally evaluate JavaScript expressions in the page context.',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'JavaScript expression to evaluate in the page context. Returns the result. Example: "document.querySelectorAll(\'a\').length" or "window.__gameState"' },
      clear: { type: 'boolean', description: 'If true, clear the message buffers after reading.', default: false },
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
    const expr = args.expression || 'null';
    const result = await workspace.exec(slug, {
      cmd: `node -e "
const puppeteer = require('puppeteer');
(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const indexPath = require('path').join(process.cwd(), '${slug === 'jjgame' ? 'workspaces/jjgame' : 'workspaces/' + slug}', 'index.html');
    await page.goto('file://' + indexPath, { waitUntil: 'networkidle0', timeout: 15000 });
    // Wait a bit for scripts to execute
    await page.waitForTimeout(1000);
    // Evaluate expression or get console messages
    const result = await page.evaluate(() => {
      try {
        return JSON.stringify({ value: ${expr} });
      } catch(e) {
        return JSON.stringify({ error: e.message });
      }
    });
    // Get console messages
    const messages = [];
    page.on('console', msg => {
      messages.push({ type: msg.type(), text: msg.text(), location: msg.location() });
    });
    // Re-evaluate to capture console
    await page.evaluate(() => { ${expr} });
    console.log(JSON.stringify({ result: JSON.parse(result), console: messages }));
    await browser.close();
  } catch(e) {
    console.log(JSON.stringify({ error: e.message }));
  }
})();
"`,
      timeout: 20000,
    });
    try {
      const output = result.stdout || result.stderr || '';
      const match = output.match(/\{.*\}/s);
      if (match) {
        const data = JSON.parse(match[0]);
        return data;
      }
      return { raw_output: output.slice(0, 500) };
    } catch(e) {
      return { error: 'Parse failed: ' + e.message, raw_output: (result.stdout || '').slice(0, 500) };
    }
  },
});

registerTool({
  name: 'browser_click',
  description: 'Click on an element identified by its ref ID from the accessibility tree snapshot (e.g., @e5). Use this to interact with buttons, links, and form elements on the page.',
  parameters: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'The element reference from the snapshot (e.g., @e1, @e12)' },
    },
    required: ['ref'],
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
(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const indexPath = require('path').join(process.cwd(), '${slug === 'jjgame' ? 'workspaces/jjgame' : 'workspaces/' + slug}', 'index.html');
    await page.goto('file://' + indexPath, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.waitForTimeout(1000);
    // Click element by ref
    const ref = '${args.ref}'.replace('@', '');
    const idx = parseInt(ref);
    // Get all interactive elements
    const elements = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      return els.filter(el => el.onclick || el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' || el.tagName === 'SELECT').map((el, i) => ({ index: i, tag: el.tagName, text: (el.textContent || '').slice(0, 50), id: el.id, className: el.className }));
    });
    if (idx > 0 && idx <= elements.length) {
      // Click the nth interactive element
      const target = elements[idx - 1];
      await page.evaluate((idx) => {
        const els = Array.from(document.querySelectorAll('*'));
        const interactive = els.filter(el => el.onclick || el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' || el.tagName === 'SELECT');
        if (interactive[idx]) interactive[idx].click();
      }, idx);
      console.log(JSON.stringify({ clicked: true, element: target }));
    } else {
      console.log(JSON.stringify({ clicked: false, error: 'Ref not found', available: elements.length, elements }));
    }
    await browser.close();
  } catch(e) {
    console.log(JSON.stringify({ error: e.message }));
  }
})();
"`,
      timeout: 20000,
    });
    try {
      const output = result.stdout || result.stderr || '';
      const match = output.match(/\{.*\}/s);
      if (match) return JSON.parse(match[0]);
      return { raw_output: output.slice(0, 500) };
    } catch(e) {
      return { error: 'Parse failed: ' + e.message, raw_output: (result.stdout || '').slice(0, 500) };
    }
  },
});

registerTool({
  name: 'browser_type',
  description: 'Type text into an input field. Clears the field first, then types the new text. Use ref ID from browser_snapshot.',
  parameters: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'The element reference from the snapshot (e.g., @e3)' },
      text: { type: 'string', description: 'The text to type into the field' },
    },
    required: ['ref', 'text'],
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
(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const indexPath = require('path').join(process.cwd(), '${slug === 'jjgame' ? 'workspaces/jjgame' : 'workspaces/' + slug}', 'index.html');
    await page.goto('file://' + indexPath, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.waitForTimeout(1000);
    const ref = '${args.ref}'.replace('@', '');
    const idx = parseInt(ref);
    const text = \`${args.text.replace(/\\/g, '\\\\').replace(/\`/g, '\\\`').replace(/\$/g, '\\$')}\`;
    const elements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea, [contenteditable=true]')).map((el, i) => ({ index: i, tag: el.tagName, type: el.type, placeholder: el.placeholder }));
    });
    if (idx > 0 && idx <= elements.length) {
      await page.evaluate((idx, text) => {
        const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable=true]'));
        if (inputs[idx]) {
          inputs[idx].focus();
          inputs[idx].value = text;
          inputs[idx].dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, idx, text);
      console.log(JSON.stringify({ typed: true, element: elements[idx-1], text }));
    } else {
      console.log(JSON.stringify({ typed: false, error: 'Ref not found', available: elements.length }));
    }
    await browser.close();
  } catch(e) {
    console.log(JSON.stringify({ error: e.message }));
  }
})();
"`,
      timeout: 20000,
    });
    try {
      const output = result.stdout || result.stderr || '';
      const match = output.match(/\{.*\}/s);
      if (match) return JSON.parse(match[0]);
      return { raw_output: output.slice(0, 500) };
    } catch(e) {
      return { error: 'Parse failed: ' + e.message, raw_output: (result.stdout || '').slice(0, 500) };
    }
  },
});

console.log('[tools] 浏览器工具注册完成: browser_snapshot, browser_console, browser_click, browser_type');
