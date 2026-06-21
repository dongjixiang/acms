// URL 安全检查 — SSRF 防护（v0.14 fetch_url 工具）
//
// 拒绝抓取内网 URL 防 SSRF（Server-Side Request Forgery）。
// 攻击场景：用户传 http://10.0.0.1/admin 或 http://localhost:6379/，
// 服务器 fetch 时直接命中内网服务（数据库/Redis/管理后台）。
//
// 防护要点：
// 1. URL 协议必须 http/https（拒绝 file/gopher/ftp）
// 2. 主机名不能是 localhost / 127.x / ::1
// 3. 解析后的 IP 不能在私有网段（10/8、172.16/12、192.168/16、169.254/16）
// 4. IPv4-mapped IPv6 (::ffff:10.0.0.1) 也要拦截
//
// 限制：不做 DNS rebinding 防护（首次解析 IP 安全，但 TTL 过期后可能 rebind）
//  生产环境应使用 https://github.com/l0co/nodejs-ssrf-proxy 之类
//  或维护 IP allowlist + 强制走代理

const dns = require('dns').promises;
const net = require('net');

// 私有/回环/链路本地 IPv4 网段
const PRIVATE_V4_RANGES = [
  [0x0A000000, 0x0AFFFFFF],   // 10.0.0.0/8
  [0xAC100000, 0xAC1FFFFF],   // 172.16.0.0/12
  [0xC0A80000, 0xC0A8FFFF],   // 192.168.0.0/16
  [0xA9FE0000, 0xA9FEFFFF],   // 169.254.0.0/16（链路本地）
  [0x7F000000, 0x7FFFFFFF],   // 127.0.0.0/8（回环）
  [0x00000000, 0x00FFFFFF],   // 0.0.0.0/8（含 0.0.0.0）
  [0x64400000, 0x647FFFFF],   // 100.64.0.0/10（CGNAT）
];

// 私有 IPv6 网段
const PRIVATE_V6_PREFIXES = [
  '::1',                       // 回环
  'fc00::/7',                  // 唯一本地（ULA）
  'fe80::/10',                 // 链路本地
  '::ffff:',                   // IPv4-mapped（按 IPv4 段判断）
];

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function isPrivateV4(ip) {
  const int = ipv4ToInt(ip);
  return PRIVATE_V4_RANGES.some(([start, end]) => int >= start && int <= end);
}

function isPrivateV6(ip) {
  const lower = ip.toLowerCase();
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) — 提取 IPv4 段判断
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.substring(7);
    return isPrivateV4(v4);
  }
  return PRIVATE_V6_PREFIXES.some(p => {
    if (p.endsWith('/7') || p.endsWith('/10')) {
      // 简化：只检查前 4 字符（fc00/fe80/...）
      return lower.startsWith(p.substring(0, 4));
    }
    return lower === p || lower.startsWith(p);
  });
}

function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) return isPrivateV4(ip);
  if (net.isIP(ip) === 6) return isPrivateV6(ip);
  return true;  // 未知格式按"不安全"处理（拒绝）
}

/**
 * 检查 URL 是否安全（允许 fetch）
 * @param {string} urlStr
 * @returns {Promise<{safe: boolean, reason?: string, ip?: string}>}
 */
async function checkUrlSafety(urlStr) {
  let url;
  try {
    url = new URL(urlStr);
  } catch (e) {
    return { safe: false, reason: 'URL 格式无效' };
  }

  // 1. 协议白名单
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { safe: false, reason: `不允许的协议 ${url.protocol}（仅 http/https）` };
  }

  // 2. 主机名黑名单（无需 DNS 解析的快速检查）
  const hostname = url.hostname.toLowerCase();
  if (['localhost', '0.0.0.0', '::', '[::1]'].includes(hostname)) {
    return { safe: false, reason: `不允许的主机名 ${hostname}` };
  }

  // 3. 纯数字 IP 直接判断（避免 DNS 查询）
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { safe: false, reason: `内网 IP ${hostname}`, ip: hostname };
    }
    return { safe: true, ip: hostname };
  }

  // 4. 域名 → 解析所有 IP → 全部必须非私有（防 DNS rebinding 到内网）
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch (e) {
    return { safe: false, reason: `DNS 解析失败: ${e.message}` };
  }
  if (!addresses || addresses.length === 0) {
    return { safe: false, reason: 'DNS 无返回结果' };
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      return { safe: false, reason: `域名 ${hostname} 解析到内网 IP ${address}`, ip: address };
    }
  }

  return { safe: true, ip: addresses[0].address };
}

module.exports = { checkUrlSafety, isPrivateIp, isPrivateV4, isPrivateV6 };
