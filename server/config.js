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
};
