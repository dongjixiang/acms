// ACMS 内建工具 — Agent API 测试工具
// 让 agent 能发送 HTTP 请求测试外部 API 或本地服务
const { registerTool } = require('../../services/tool-registry');

registerTool({
  name: 'agent_http_request',
  description: 'Send an HTTP request to a URL and return the response. Use for testing APIs, checking service health, fetching external data. Supports GET, POST, PUT, DELETE with optional headers and body.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full URL to request (e.g. "http://localhost:3300/api/tasks" or "https://api.example.com/v1/data").' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], description: 'HTTP method (default: GET).', default: 'GET' },
      headers: { type: 'object', description: 'Optional HTTP headers as key-value pairs.', default: {} },
      body: { type: 'string', description: 'Request body (for POST/PUT/PATCH). JSON string or plain text.' },
      timeout: { type: 'integer', description: 'Request timeout in milliseconds (default: 10000).', default: 10000 },
    },
    required: ['url'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');

    // 使用 Node.js http module 发送请求
    const url = args.url.replace(/'/g, "\\'");
    const method = (args.method || 'GET').toUpperCase();
    const headers = args.headers || {};
    const body = args.body || '';
    const timeout = args.timeout || 10000;

    // 构建 headers JSON
    let headersJson = '{}';
    try {
      headersJson = JSON.stringify(headers);
    } catch(e) {}

    const nodeScript = `
const http = require('http');
const https = require('https');
const url = require('url');
const parsed = url.parse('${url}');
const client = parsed.protocol === 'https:' ? https : http;

const options = {
  hostname: parsed.hostname,
  port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
  path: parsed.path,
  method: '${method}',
  headers: ${headersJson},
  timeout: ${timeout},
};

if ('${method}' !== 'GET' && '${method}' !== 'HEAD' && '${body}') {
  options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
  options.headers['Content-Length'] = Buffer.byteLength('${body.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}');
}

const req = client.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(JSON.stringify({
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      headers: res.headers,
      body: data.slice(0, 50000),
    }));
  });
});

req.on('error', (e) => {
  console.log(JSON.stringify({ error: e.message }));
});

req.on('timeout', () => {
  req.destroy();
  console.log(JSON.stringify({ error: 'Request timeout after ' + ${timeout} + 'ms' }));
});

if ('${method}' !== 'GET' && '${method}' !== 'HEAD' && '${body}') {
  req.write('${body.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}');
}

req.end();
`;

    const result = await workspace.exec(slug, {
      cmd: `node -e "${nodeScript.replace(/"/g, '\\"')}"`,
      timeout: timeout + 5000,
    });

    try {
      const output = result.stdout || result.stderr || '';
      const match = output.match(/\{.*\}/s);
      if (match) {
        return JSON.parse(match[0]);
      }
      return { raw_output: output.slice(0, 1000) };
    } catch(e) {
      return { error: 'Parse failed: ' + e.message, raw_output: (result.stdout || '').slice(0, 500) };
    }
  },
});

console.log('[tools] HTTP 工具注册完成: agent_http_request');
