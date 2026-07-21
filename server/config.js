// ACMS 服务端配置
// 加载优先级: 环境变量 > config.json > 内置默认值
const fs = require('fs');
const path = require('path');

// 从项目根目录加载 config.json（由一键安装脚本生成）
let fileConfig = {};
const configPath = path.join(__dirname, '..', 'config.json');
try {
  if (fs.existsSync(configPath)) {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log('[config] ✅ 已加载外部配置:', configPath);
  }
} catch (e) {
  console.warn('[config] ⚠️  config.json 读取失败，使用默认值:', e.message);
}

module.exports = {
  port: process.env.PORT || fileConfig.port || 3300,
  wsPort: process.env.WS_PORT || fileConfig.wsPort || 3301,
  termWSPort: process.env.TERM_WS_PORT || fileConfig.termWSPort || 3302,
  apiKeys: (process.env.ACMS_API_KEYS || (fileConfig.apiKeys ? fileConfig.apiKeys.join(',') : null) || 'dev-key-001,dev-key-002').split(',').map(k => k.trim()).filter(Boolean),
  cors: {
    origin: process.env.CORS_ORIGIN || fileConfig.corsOrigin || '*',
    headers: 'Content-Type, X-API-Key, Accept-Language',
    methods: 'GET,POST,PATCH,DELETE,OPTIONS',
  },
  static: {
    maxAge: '2min',
  },
  agnesApiKey: process.env.AGNES_API_KEY || fileConfig.agnesApiKey || '',
  // v0.47：SMTP 邮件发送配置（assist.send_email 用）
  //   加载顺序：环境变量 > config.json smtp 字段；未配置时邮件工具返回友好错误而非崩溃
  smtp: (() => {
    const envHost = process.env.SMTP_HOST;
    if (envHost) {
      return {
        host: envHost,
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        secure: (process.env.SMTP_SECURE || 'true') !== 'false',  // 465=true(SSL), 587=false(STARTTLS)
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.SMTP_FROM || (process.env.SMTP_USER || ''),
        fromName: process.env.SMTP_FROM_NAME || 'ACMS',
      };
    }
    const f = fileConfig.smtp || {};
    if (!f.host) return null;  // 未配置 SMTP
    return {
      host: f.host,
      port: parseInt(f.port || 465, 10),
      secure: f.secure !== false,
      user: f.user || '',
      pass: f.pass || '',
      from: f.from || f.user || '',
      fromName: f.fromName || 'ACMS',
    };
  })(),
  // v0.22.20: 统一 workspace 根目录（之前 image-gen.js / video.js 用了 2 层 `..` 错位到 server/workspaces/）
  // 任何地方要读写项目文件都走这个常量，避免再出现「写一个目录读另一个目录」的 bug
  workspaceRoot: path.join(__dirname, '..', 'workspaces'),
};
