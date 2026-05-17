// ACMS 服务端配置
module.exports = {
  port: process.env.PORT || 3300,
  wsPort: process.env.WS_PORT || 3301,
  apiKeys: (process.env.ACMS_API_KEYS || 'dev-key-001,dev-key-002').split(',').map(k => k.trim()).filter(Boolean),
  cors: {
    origin: '*',
    headers: 'Content-Type, X-API-Key, Accept-Language',
    methods: 'GET,POST,PATCH,DELETE,OPTIONS',
  },
  static: {
    maxAge: '1h',
  },
};
