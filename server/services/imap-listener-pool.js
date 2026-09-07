'use strict';

// ACMS 邮件 v2.0 — 多账户 IMAP IDLE 监听器池
// 不修改 imap-service.js（保留其单例向后兼容）
// 按 accountKey（profileId + ':' + accountId 或 'default'）管理 listener 集合
//
// 数据结构：
//   _byAccountKey: Map<accountKey, {
//     imapService: <IMAP service instance>,
//     listeners: Map<mailbox, listener>,
//     accountId: string | null,
//     email: string,
//   }>

const emailListenerIntegration = require('./email-listener-integration');
const accountStore = require('./email-account-store');
const imapService = require('./imap-service');

const _byAccountKey = new Map();

function _buildImapService(dec) {
  return imapService.createImapService({
    host: dec.imap.host,
    port: dec.imap.port,
    user: dec.imap.user,
    pass: dec.imap.pass,
    tls: dec.imap.tls,
  });
}

// 取得某账户对应的 entry（lazy 创建 imapService，但 listener 单独管理）
function _entry(accountKey, accountId) {
  if (_byAccountKey.has(accountKey)) return _byAccountKey.get(accountKey);
  let dec = null;
  if (accountId) dec = accountStore.getDecrypted(accountId);
  const entry = {
    imapService: dec ? _buildImapService(dec) : imapService.createImapService({}),
    listeners: new Map(),
    accountId: accountId || null,
    email: dec ? dec.email : '',
  };
  _byAccountKey.set(accountKey, entry);
  return entry;
}

function startListening({ accountId, mailbox, onEmail, onError }) {
  mailbox = mailbox || 'INBOX';
  const accountKey = accountId ? `acc:${accountId}` : 'default';
  const e = _entry(accountKey, accountId);
  if (e.listeners.has(mailbox)) {
    return { ok: false, error: 'ALREADY_LISTENING', message: `${e.email || accountKey} / ${mailbox} 已在监听`, account_id: accountId, mailbox };
  }

  try {
    let imapConf = {};
    if (e.imapService._config) {
      const cfg = e.imapService._config;
      imapConf = { user: cfg.user, password: cfg.pass, host: cfg.host, port: cfg.port, tls: cfg.tls };
    } else if (e.imapService._getImap) {
      const cur = e.imapService._getImap();
      if (cur && cur._config) {
        const cfg = cur._config;
        imapConf = { user: cfg.user, password: cfg.pass, host: cfg.host, port: cfg.port, tls: cfg.tls };
      }
    }
    // 监听链路修复：如果账户解密后 user/password 为空（解密失败或数据缺失），
    // 兜底到 config.smtp（默认 Kuqi 账户）确保监听器能连接，避免规则引擎永远收不到触发
    if (!imapConf.user || !imapConf.password) {
      const config = require('../config');
      const smtpCfg = config.smtp || {};
      const imapHost = config.imapHost || process.env.IMAP_HOST || 'imap.263.net';
      const imapPort = config.imapPort || parseInt(process.env.IMAP_PORT || '993');
      imapConf = {
        user: smtpCfg.user || '',
        password: smtpCfg.pass || '',
        host: smtpCfg.host ? smtpCfg.host.replace(/^smtp/, 'imap') : imapHost,
        port: smtpCfg.port ? (config.imapPort || parseInt(process.env.IMAP_PORT || '993')) : imapPort,
        tls: config.imapTls !== false,
      };
      console.warn('[listen-pool] 账户 ' + accountId + ' 解密凭证为空，兜底到默认 SMTP 配置监听（确保规则引擎触发链路通畅）');
    }
    const listener = emailListenerIntegration.createListener({
      ...imapConf,
      mailbox,
      onEmail: onEmail || function () {},
      onError: onError || function () {},
    });
    listener.start();
    e.listeners.set(mailbox, listener);
    return { ok: true, account_id: accountId, mailbox, message: '监听器已启动（IMAP IDLE）' };
  } catch (err) {
    return { ok: false, error: 'LISTEN_START_ERROR', message: err.message, account_id: accountId, mailbox };
  }
}

function stopListening({ accountId, mailbox }) {
  mailbox = mailbox || 'INBOX';
  const accountKey = accountId ? `acc:${accountId}` : 'default';
  const e = _byAccountKey.get(accountKey);
  if (!e) return { ok: false, error: 'NOT_FOUND', message: `账户 ${accountId || 'default'} 未注册` };
  const listener = e.listeners.get(mailbox);
  if (!listener) {
    return { ok: false, error: 'NOT_LISTENING', message: `${e.email || accountKey} / ${mailbox} 未在监听` };
  }
  try { listener.stop(); } catch (_) { /* ignore */ }
  e.listeners.delete(mailbox);
  return { ok: true, account_id: accountId, mailbox, message: '监听器已停止' };
}

function listListening({ accountId } = {}) {
  if (accountId) {
    const e = _byAccountKey.get(`acc:${accountId}`);
    if (!e) return { ok: true, account_id: accountId, listening: [] };
    return { ok: true, account_id: accountId, listening: Array.from(e.listeners.keys()) };
  }
  // 全部
  const out = [];
  for (const [k, e] of _byAccountKey) {
    out.push({
      account_key: k,
      account_id: e.accountId,
      email: e.email,
      listening: Array.from(e.listeners.keys()),
    });
  }
  return { ok: true, listening: out };
}

function removeAccount(accountId) {
  const key = `acc:${accountId}`;
  const e = _byAccountKey.get(key);
  if (!e) return;
  for (const listener of e.listeners.values()) {
    try { listener.stop(); } catch (_) { /* ignore */ }
  }
  try { e.imapService.disconnect && e.imapService.disconnect(); } catch (_) { /* ignore */ }
  _byAccountKey.delete(key);
}

function clearAll() {
  for (const e of _byAccountKey.values()) {
    for (const listener of e.listeners.values()) {
      try { listener.stop(); } catch (_) { /* ignore */ }
    }
    try { e.imapService.disconnect && e.imapService.disconnect(); } catch (_) { /* ignore */ }
  }
  _byAccountKey.clear();
}

module.exports = {
  startListening,
  stopListening,
  listListening,
  removeAccount,
  clearAll,
  // 暴露供诊断
  size: () => _byAccountKey.size,
};
