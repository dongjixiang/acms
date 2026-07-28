// ACMS · IMAP 收件箱服务（v0.73）
// 在 ACMS 进程内连接 IMAP，查看/搜索邮件
// 依赖：npm install imap
const Imap = require('imap');
const { EventEmitter } = require('events');

// ── RFC 2047 encoded-word 解码（修复 Imap.parseHeader 把 base64 解码字节当 latin1 的 bug）──
const iconv = require('iconv-lite');

function decodeMimeWord(text) {
  if (!text) return '';
  // 匹配 =?charset?encoding?text?= （B 或 Q），允许 \\r\\n + WSP 折叠
  const re = /=\\?([^?]+)\\?([BbQq])\\?([^?]*?)\\?=/g;
  return String(text).replace(re, function(_m, charset, enc, data) {
    try {
      const encUpper = enc.toUpperCase();
      let buf;
      if (encUpper === 'B') {
        buf = Buffer.from(data, 'base64');
      } else {
        // Q encoding: '_' = ' ', =XX = hex byte
        const q = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16)));
        buf = Buffer.from(q, 'binary');
      }
      const cs = String(charset).toLowerCase().replace(/^["']|["']$/g, '');
      if (cs === 'utf-8' || cs === 'utf8') return buf.toString('utf8');
      if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb18030') return iconv.decode(buf, 'gbk');
      if (cs === 'big5') return iconv.decode(buf, 'big5');
      if (cs === 'iso-8859-1' || cs === 'latin1') return buf.toString('latin1');
      // 未知 charset 兜底：先尝试 utf8 失败再 latin1
      try { return buf.toString('utf8'); } catch (_) { return buf.toString('latin1'); }
    } catch (e) { return _m; }
  });
}

// 合并多行 encoded-word + 折叠 CRLF（RFC 5322 §2.2.3）
function decodeHeaderValue(s) {
  if (!s) return '';
  return decodeMimeWord(String(s).replace(/\\r\\n[ \\t]+/g, ''));
}

// 按 Content-Transfer-encoding 解码 raw body bytes
function decodeBodyBuffer(buf, encoding) {
  if (!buf) return '';
  const enc = String(encoding || '').toLowerCase();
  try {
    if (enc === 'base64') return Buffer.from(buf.toString('latin1').replace(/\\s+/g, ''), 'base64');
    if (enc === 'quoted-printable') return Buffer.from(buf.toString('binary')
      .replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16))), 'binary');
    // 7bit / 8bit / binary：原样
    return buf;
  } catch (e) { return buf; }
}


// 从 header 字符串提取单个字段值（处理 RFC 5322 多行折叠 + 重复行）
function extractHeaderField(headerStr, fieldName) {
  if (!headerStr) return '';
  const re = new RegExp('^' + fieldName + ':\\s*(.+)$', 'im');
  const m = headerStr.match(re);
  if (!m) return '';
  let value = m[1];
  // 合并续行（RFC 5322 §2.2.3）
  const continuation = headerStr.slice(headerStr.indexOf(m[0]) + m[0].length);
  const moreRe = new RegExp('^[ \\t]+(.+)$', 'gm');
  let cm;
  const subs = [];
  while ((cm = moreRe.exec(continuation)) !== null) {
    subs.push(cm[1]);
    if (!cm[1].match(/^[ \\t]/)) break;
  }
  return decodeMimeWord((value + (subs.length ? ' ' + subs.join(' ') : '')).trim());
}

// body 解码后按 charset 转字符串
function charsetToString(buf, charset) {
  if (!buf) return '';
  const cs = String(charset || '').toLowerCase().replace(/^["']|["']$/g, '');
  if (cs === 'utf-8' || cs === 'utf8') return buf.toString('utf8');
  if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb18030') { try { return iconv.decode(buf, 'gbk'); } catch (_) {} }
  if (cs === 'big5') { try { return iconv.decode(buf, 'big5'); } catch (_) {} }
  if (cs === 'iso-8859-1' || cs === 'latin1') return buf.toString('latin1');
  // 默认 utf8
  return buf.toString('utf8');
}


// 在 struct 中找 partID 对应的 part（含 encoding/charset 等）
function findPartInStruct(parts, partID) {
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    if (!p) continue;
    if (Array.isArray(p)) {
      const f = findPartInStruct(p, partID);
      if (f) return f;
      continue;
    }
    if (p.partID === partID) return p;
  }
  return null;
}



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
              const headerStr = decodeHeaderValue(body);
              email.subject = extractHeaderField(headerStr, 'subject') || '';
              // v0.74.1 debug: 输出 decode 后的 subject
              console.log('[IMAP-DBG] uid=' + email.uid + ' raw subject: ' + JSON.stringify(body.match(/Subject:[^\n]*/)?.[0] || '') + ' → decoded: ' + JSON.stringify(email.subject));
              email.from = extractHeaderField(headerStr, 'from') || '';
              email.date = extractHeaderField(headerStr, 'date') || '';
              email.messageId = extractHeaderField(headerStr, 'message-id') || '';
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
              const headerStr = decodeHeaderValue(body);
              email.subject = extractHeaderField(headerStr, 'subject') || '';
              email.from = extractHeaderField(headerStr, 'from') || '';
              email.to = extractHeaderField(headerStr, 'to') || '';
              email.cc = extractHeaderField(headerStr, 'cc') || '';
              email.date = extractHeaderField(headerStr, 'date') || '';
              email.messageId = extractHeaderField(headerStr, 'message-id') || '';
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
                  const chunks = [];
                  stream2.on('data', chunk => chunks.push(chunk));
                  stream2.on('end', () => {
                    const rawBuf = Buffer.concat(chunks);
                    // 按 part 的 encoding 解码（struct 中已包含）
                    const partInfo = findPartInStruct(attrs.struct, info2.which);
                    const encoding = partInfo && partInfo.encoding;
                    const charset = partInfo && partInfo.params && partInfo.params.charset;
                    const decoded = decodeBodyBuffer(rawBuf, encoding);
                    const body2 = charsetToString(decoded, charset);
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
            const headerStr = decodeHeaderValue(body);
            email.subject = extractHeaderField(headerStr, 'subject') || '';
            email.from = extractHeaderField(headerStr, 'from') || '';
            email.date = extractHeaderField(headerStr, 'date') || '';
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

  // ── 删除邮件（标记 \Deleted + EXPUNGE；返回删除数） ──
  function deleteMessages(uid, opts) {
    opts = opts || {};
    const mailbox = opts.mailbox || 'INBOX';
    const uids = Array.isArray(uid) ? uid : [uid];
    return new Promise((resolve, reject) => {
      if (!_connected) return reject(new Error('NOT_CONNECTED'));
      openBox(mailbox).then(() => {
        _imap.addFlags(uids, ['\\Deleted'], (err) => {
          if (err) return reject(err);
          _imap.expunge(uids, (err2, removed) => {
            if (err2) return reject(err2);
            // 兼容 node-imap 不同版本：removed 可能为 undefined
            resolve({ removed: Array.isArray(removed) ? removed.length : uids.length, mailbox, uids });
          });
        });
      }).catch(reject);
    });
  }

  // ── 移动邮件（UID COPY 到目标 + 源标记 \Deleted + EXPUNGE）──
  // node-imap 的 moveMessages 在不同邮箱服务器（特别是 IMAP4rev1 老版本）兼容性差，
  // 用「COPY + STORE + EXPUNGE」三步走更稳：
  //   1. UID COPY uids → toMailbox （服务器端复制）
  //   2. UID STORE uids +Flags \Deleted （标记源邮件删除）
  //   3. UID EXPUNGE （物理删除已标记邮件）
  function moveMessages(uid, fromMailbox, toMailbox) {
    fromMailbox = fromMailbox || 'INBOX';
    const uids = Array.isArray(uid) ? uid : [uid];
    return new Promise((resolve, reject) => {
      if (!_connected) return reject(new Error('NOT_CONNECTED'));
      if (!toMailbox) return reject(new Error('MISSING_TARGET_MAILBOX'));
      if (fromMailbox === toMailbox) return reject(new Error('SOURCE_EQUALS_TARGET'));

      function copyStep() {
        // UID COPY 用同一个 _imap 实例，库内部会把第一个参数当 uid
        _imap.copy(uids, toMailbox, (err) => {
          if (err) {
            // 某些服务器 COPY 后不会自动 \Recent；用 try/catch 包裹避免 unwritable 报错
            if (/try copying/.test(err.message || '')) return resolve({ copied: uids.length, toMailbox, fromMailbox, fallback: true });
            return reject(err);
          }
          flagAndExpunge();
        });
      }

      function flagAndExpunge() {
        openBox(fromMailbox).then(() => {
          _imap.addFlags(uids, ['\\Deleted'], (err) => {
            if (err) return reject(err);
            _imap.expunge(uids, (err2, removed) => {
              if (err2) return reject(err2);
              resolve({ copied: uids.length, removed: Array.isArray(removed) ? removed.length : uids.length, fromMailbox, toMailbox });
            });
          });
        }).catch(reject);
      }

      openBox(fromMailbox).then(copyStep).catch(reject);
    });
  }

  // ── 设置/清除标志（用于"标记已读"） ──
  function setFlags(uid, flags, opts) {
    opts = opts || {};
    const mailbox = opts.mailbox || 'INBOX';
    const mode = opts.mode === 'remove' ? 'del' : 'add';
    const uids = Array.isArray(uid) ? uid : [uid];
    return new Promise((resolve, reject) => {
      if (!_connected) return reject(new Error('NOT_CONNECTED'));
      openBox(mailbox).then(() => {
        const cb = (err) => { if (err) return reject(err); resolve({ uid: uids, flags, mode, mailbox }); };
        if (mode === 'add') _imap.addFlags(uids, flags, cb);
        else _imap.delFlags(uids, flags, cb);
      }).catch(reject);
    });
  }

  // ── 公开 API ──
  service.connect = connect;
  service.disconnect = disconnect;
  service.getMailboxes = getMailboxes;
  service.listEmails = listEmails;
  service.getEmail = getEmail;
  service.getAttachment = getAttachment;
  service.searchEmails = searchEmails;
  service.deleteMessages = deleteMessages;
  service.moveMessages = moveMessages;
  service.setFlags = setFlags;
  service._getImap = () => _imap;

  return service;
}

module.exports = { createImapService };
