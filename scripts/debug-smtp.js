// 一次性 SMTP 调试脚本：开 nodemailer debug,直连 263 服务器
// 用法: node scripts/debug-smtp.js
const nodemailer = require('nodemailer');

const smtp = require('../server/config').smtp;
console.log('[debug] smtp config:', JSON.stringify({ ...smtp, pass: '***' }));

const transporter = nodemailer.createTransport({
  host: smtp.host,
  port: smtp.port,
  secure: smtp.secure,
  auth: { user: smtp.user, pass: smtp.pass },
  debug: true,   // 打印 SMTP 协议交互
  logger: true,  // 打印 transport 日志
});

(async () => {
  try {
    // 先 verify:不动手发,只校验 SMTP 认证能不能过
    console.log('\n[verify] 正在连接 ' + smtp.host + ':' + smtp.port + ' 校验认证...');
    const ok = await transporter.verify();
    console.log('[verify] ✅ 认证通过:', ok);
  } catch (e) {
    console.error('\n[verify] ❌ 认证失败:', e.message);
    if (e.response) console.error('[verify] SMTP 响应:', e.response);
    if (e.responseCode) console.error('[verify] 响应码:', e.responseCode);
  }
  process.exit(0);
})();
