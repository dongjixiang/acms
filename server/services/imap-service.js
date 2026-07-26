// ACMS · IMAP 收件箱服务（v0.73）
// 在 ACMS 进程内连接 IMAP，查看/搜索邮件
// 依赖：npm install imap
const Imap = require('imap');
const { EventEmitter } = require('events');

function createImapService(config) {
  config = config || {};
  const host = config.host || 'imap.263.net';
  const port = config.port || 993;
  const user = config.user || '';
  const pass = config.pass || '';
  const tls = config.tls !== false;
  const cacheSize = config.cacheSize || 200;
  const connTimeout = config.connTimeout || 30000;

  const service = new EventEmitter();
  let _imap = null;
  let _connected = false;
  let _emailCache = [];    // 最新邮件的缓存
  let _mailboxCache = [];

  // ── 连接 ──
  function connect() {
    return new Promise((resolve, reject) => {
      if (_connected && _imap && _imap.state === 'authenticated') {
        return resolve(true);
      }
      if (_imap) { try { _imap.end(); } catch {} }
      _imap = new Imap({
        user, password: pass, host, port, tls,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout,
        authTimeout: connTimeout,
      });
      _imap.once('ready', () => {
        _connected = true;
        service.emit('connected');
        resolve(true);
      });
      _imap.once('error', (err) => {
        _connected = false;
        reject(err);
      });
      _imap.once('end', () => { _connected = false; });
      _imap.connect();
    });
  }

  // ── 断开 ──
  function disconnect() {
    if (_imap) { try { _imap.end(); } catch {} }
    _imap = null;
    _connected = false;
  }

  // ── 获取邮箱列表 ──
  function getMailboxes() {
    return new Promise((resolve, reject) => {
      if (!_connected) return reject(new Error('NOT_CONNECTED'));
      _imap.getBoxes((err, boxes) => {
        if (err) return reject(err);
        const result = [];
        function flatten(prefix, obj) {
          Object.keys(obj).forEach(key => {
            const full = prefix ? prefix + key : key;
            result.push({ name: full, delimiter: obj[key].delimiter, flags: obj[key].attribs || [] });
            if (obj[key].children) flatten(full + obj[key].delimiter, obj[key].children);
          });
        }
        flatten('', boxes);
        _mailboxCache = result;
        resolve(result);
      });
    });
  }

  // ── 打开邮箱 ──
  function openBox(mailbox) {
    return new Promise((resolve, reject) => {
      if (!_connected) return reject(new Error('NOT_CONNECTED'));
      _imap.openBox(mailbox || 'INBOX', true, (err, box) => {
        if (err) return reject(err);
        resolve(box);
      });
    });
  }

  // ── 搜索邮件 ──
  function search(criteria) {
    return new Promise((resolve, reject) => {
      if (!_connected) return reject(new Error('NOT_CONNECTED'));
      _imap.search(criteria || ['ALL'], (err, uids) => {
        if (err) return reject(err);
        resolve(uids);
      });
    });
  }

  // ── 获取邮件列表 ──
  // 返回 [ { uid, subject, from, date, flags }, ... ]
  async function listEmails(opts) {
    opts = opts || {};
    const mailbox = opts.mailbox || 'INBOX';
    const limit = Math.min(opts.limit || 20, 100);
    const offset = opts.offset || 0;
    try {
      await openBox(mailbox);
      const allUids = await search(['ALL']);
      const total = allUids.length;
      const page = allUids.slice(Math.max(0, total - offset - limit), Math.max(0, total - offset));
      if (page.length === 0) return { emails: [], total, mailbox };
      const fetch = _imap.fetch(page, { bodies: ['HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)'], struct: true });
      const emails = [];
      await new Promise((resolve, reject) => {
        fetch.on('message', (msg, seqno) => {
          let email = { uid: 0, subject: '', from: '', date: '', flags: [], hasAttachments: false, size: 0 };
          msg.on('body', (stream, info) => {
            let body = '';
            stream.on('data', chunk => body += chunk.toString('utf8'));
            stream.on('end', () => {
              const parsed = Imap.parseHeader(body);
              email.subject = (parsed.subject && parsed.subject[0]) || '';
              email.from = (parsed.from && parsed.from[0]) || '';
              email.date = (parsed.date && parsed.date[0]) || '';
              email.messageId = (parsed['message-id'] && parsed['message-id'][0]) || '';
            });
          });
          msg.on('attributes', (attrs) => {
            email.uid = attrs.uid;
            email.flags = attrs.flags || [];
            email.size = attrs.size || 0;
            if (attrs.struct) {
              // 递归检查是否有附件
              var hasAtt = false;
              function checkAtt(parts) {
                if (!Array.isArray(parts) || hasAtt) return;
                for (var ci = 0; ci < parts.length; ci++) {
                  var cp = parts[ci];
                  if (!cp) continue;
                  if (Array.isArray(cp)) { checkAtt(cp); continue; }
                  var disp = cp.disposition;
                  var hasFilename = (cp.params && cp.params.name);
                  if (disp) {
                    var dt = (disp.type || '').toLowerCase();
                    if (dt === 'attachment' || (dt === 'inline' && ((disp.params && disp.params.filename) || hasFilename))) {
                      hasAtt = true; break;
                    }
                  }
                  // 有些附件没有 Content-Disposition，只有 Content-Type name 参数
                  if (!disp && hasFilename) {
                    hasAtt = true; break;
                  }
                  if (cp.parts && Array.isArray(cp.parts)) checkAtt(cp.parts);
                }
              }
              checkAtt(attrs.struct);
              email.hasAttachments = hasAtt;
            }
          });
          msg.on('end', () => {
            if (email.uid) emails.push(email);
          });
        });
        fetch.on('error', reject);
        fetch.on('end', resolve);
      });
      // 按 uid 降序（最新在前）
      emails.sort((a, b) => b.uid - a.uid);
      return { emails, total, mailbox };
    } catch (e) {
      return { error: e.message, emails: [], total: 0, mailbox };
    }
  }

  // ── 获取邮件详情（全文 + 附件列表） ──
  // 分两阶段：Phase 1 取 header+struct → 解析文本部分的 partID → Phase 2 只取具体文本部分
  function getEmail(uid, mailbox) {
    mailbox = mailbox || 'INBOX';
    return new Promise(async (resolve, reject) => {
      try {
        await openBox(mailbox);
        const email = { uid, subject: '', from: '', to: '', cc: '', date: '', messageId: '', text: '', html: '', attachments: [] };
        let headerDone = false;
        let textDone = false;
        let fetch2 = null;

        function checkResolve() {
          if (headerDone && textDone) resolve(email);
        }

        // Phase 1: 只取 headers + struct（不取 TEXT —— 避免 MIME base64 混入正文）
        const fetch = _imap.fetch([uid], {
          bodies: 'HEADER.FIELDS (FROM SUBJECT DATE TO CC MESSAGE-ID)',
          struct: true,
        });

        fetch.on('message', (msg) => {
          msg.on('body', (stream, info) => {
            let body = '';
            stream.on('data', chunk => body += chunk.toString('utf8'));
            stream.on('end', () => {
              const parsed = Imap.parseHeader(body);
              email.subject = (parsed.subject && parsed.subject[0]) || '';
              email.from = (parsed.from && parsed.from[0]) || '';
              email.to = (parsed.to && parsed.to[0]) || '';
              email.cc = (parsed.cc && parsed.cc[0]) || '';
              email.date = (parsed.date && parsed.date[0]) || '';
              email.messageId = (parsed['message-id'] && parsed['message-id'][0]) || '';
              headerDone = true;
              checkResolve();
            });
          });

          msg.on('attributes', (attrs) => {
            if (!attrs.struct) {
              // 非 multipart：尝试用 'TEXT' 取正文
              textDone = true; checkResolve();
              return;
            }

            // 从 struct 递归找指定 subtype 的文本部分 partID
            function findTextPartId(parts, prefix, subtype) {
              if (!Array.isArray(parts)) return null;
              for (var i = 0; i < parts.length; i++) {
                var p = parts[i];
                if (!p) continue;
                if (Array.isArray(p)) {
                  var id = findTextPartId(p, prefix + (i + 1) + '.', subtype);
                  if (id) return id;
                  continue;
                }
                if (p.type === 'text' && p.subtype === subtype) {
                  return p.partID || (prefix + (i + 1));
                }
                if (p.parts && Array.isArray(p.parts)) {
                  var id = findTextPartId(p.parts, prefix + (i + 1) + '.', subtype);
                  if (id) return id;
                }
              }
              return null;
            }

            const textPartId = findTextPartId(attrs.struct, '', 'plain');
            const htmlPartId = findTextPartId(attrs.struct, '', 'html');

            // 解析附件
            var attachments = [];
            function findAttachments(parts, prefix) {
              if (!Array.isArray(parts)) return;
              for (var i = 0; i < parts.length; i++) {
                var p = parts[i];
                if (!p) continue;
                if (Array.isArray(p)) { findAttachments(p, prefix + (i + 1) + '.'); continue; }
                var disp = p.disposition;
                var hasFilename = (p.params && p.params.name);
                if (disp) {
                  var dispType = (disp.type || '').toLowerCase();
                  if (dispType === 'attachment' || dispType === 'inline') {
                    var filename = (disp.params && disp.params.filename)
                      || hasFilename
                      || '';
                    if (filename) {
                      attachments.push({
                        id: attachments.length,
                        name: filename,
                        size: p.size || 0,
                        type: (p.type || '') + '/' + (p.subtype || ''),
                        partID: p.partID || (prefix + (i + 1)),
                      });
                    }
                  }
                }
                if (!disp && hasFilename) {
                  attachments.push({
                    id: attachments.length,
                    name: hasFilename,
                    size: p.size || 0,
                    type: (p.type || '') + '/' + (p.subtype || ''),
                    partID: p.partID || (prefix + (i + 1)),
                  });
                }
                if (p.parts && Array.isArray(p.parts)) findAttachments(p.parts, prefix + (i + 1) + '.');
              }
            }
            findAttachments(attrs.struct, '');
            email.attachments = attachments;

            // Phase 2: 只取具体的文本部分（避免 base64 混入）
            var bodyParts = [];
            if (textPartId) bodyParts.push(textPartId);
            if (htmlPartId) bodyParts.push(htmlPartId);

            if (bodyParts.length > 0) {
              var partsFetched = 0;
              fetch2 = _imap.fetch([uid], { bodies: bodyParts });
              fetch2.on('message', (msg2) => {
                msg2.on('body', (stream2, info2) => {
                  let body2 = '';
                  stream2.on('data', chunk => body2 += chunk.toString('utf8'));
                  stream2.on('end', () => {
                    if (htmlPartId && info2.which === htmlPartId) {
                      email.html = body2;
                    } else {
                      email.text = body2;
                    }
                    partsFetched++;
                    if (partsFetched >= bodyParts.length) {
                      textDone = true;
                      checkResolve();
                    }
                  });
                });
              });
              fetch2.on('error', () => { textDone = true; checkResolve(); });
            } else {
              textDone = true;
              checkResolve();
            }
          });
        });

        fetch.on('error', reject);
        setTimeout(() => { headerDone = true; textDone = true; resolve(email); }, 10000);
      } catch (e) {
        reject(e);
      }
    });
  }

  // ── 获取附件内容（返回 buffer） ──
  function getAttachment(uid, partID, mailbox) {
    mailbox = mailbox || 'INBOX';
    return new Promise((resolve, reject) => {
      openBox(mailbox).then(() => {
        const fetch = _imap.fetch([uid], { bodies: [partID], struct: true });
        fetch.on('message', (msg) => {
          msg.on('body', (stream, info) => {
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
          });
        });
        fetch.on('error', reject);
        setTimeout(() => reject(new Error('FETCH_TIMEOUT')), 15000);
      }).catch(reject);
    });
  }

  // ── 搜索邮件（按关键词） ──
  async function searchEmails(keyword, opts) {
    opts = opts || {};
    const mailbox = opts.mailbox || 'INBOX';
    const limit = Math.min(opts.limit || 20, 100);
    await connect();
    await openBox(mailbox);
    // IMAP SEARCH 支持 TEXT/SUBJECT/FROM
    const criteria = [['OR', ['SUBJECT', keyword], ['FROM', keyword]]];
    const allUids = await search(['TEXT', keyword]);  // 全文搜索
    const subUids = await search([['SUBJECT', keyword]]);
    const fromUids = await search([['FROM', keyword]]);
    // 合并去重
    const uidSet = new Set([...allUids, ...subUids, ...fromUids]);
    const sorted = Array.from(uidSet).sort((a, b) => b - a);
    const page = sorted.slice(0, limit);
    if (page.length === 0) return { emails: [], total: 0, mailbox };
    // 取 header 摘要
    const fetch = _imap.fetch(page, { bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)'], struct: true });
    const emails = [];
    await new Promise((resolve, reject) => {
      fetch.on('message', (msg, seqno) => {
        let email = { uid: 0, subject: '', from: '', date: '' };
        msg.on('body', (stream, info) => {
          let body = '';
          stream.on('data', chunk => body += chunk.toString('utf8'));
          stream.on('end', () => {
            const parsed = Imap.parseHeader(body);
            email.subject = (parsed.subject && parsed.subject[0]) || '';
            email.from = (parsed.from && parsed.from[0]) || '';
            email.date = (parsed.date && parsed.date[0]) || '';
          });
        });
        msg.on('attributes', (attrs) => { email.uid = attrs.uid; });
        msg.on('end', () => { if (email.uid) emails.push(email); });
      });
      fetch.on('error', reject);
      fetch.on('end', resolve);
    });
    emails.sort((a, b) => b.uid - a.uid);
    return { emails, total: sorted.length, mailbox, keyword };
  }

  // ── 公开 API ──
  service.connect = connect;
  service.disconnect = disconnect;
  service.getMailboxes = getMailboxes;
  service.listEmails = listEmails;
  service.getEmail = getEmail;
  service.getAttachment = getAttachment;
  service.searchEmails = searchEmails;
  service._getImap = () => _imap;

  return service;
}

module.exports = { createImapService };
