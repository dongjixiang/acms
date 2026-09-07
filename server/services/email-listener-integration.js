// ACMS 邮件 v2.4 — 多账户 IMAP 监听器（node-imap 直连 + mailparser）
// v2.4（2026-09-06）：
//   A. uid 实锤修复：node-imap 的 message emitter 没有 .uid 属性（uid 只出现在 attributes 事件）
//      → 原来 uid 恒 null → _handledUids 去重失效 → 每轮轮询把存量未读全量重复触发规则
//      → 改为 msg.once('attributes') 取 attrs.uid，去重真正生效（存量一次、增量只触发一次）
//   B. 僵尸监听修复：error/close 后不重连 → pool 注册表仍显示 listening 但底层已死（真实邮件不触发）
//      → 增加自动重连（指数退避 5s→60s cap），连接恢复后自动重拉未读
// v2.3.2：弃用 mail-listener（三重不兼容），node-imap 直连 + simpleParser + 定时轮询替代 IDLE
//
// 对外 API（与 v2.3.2 一致）：
//   createListener(opts) → listener
//     opts: { user, password, host, port, tls, mailbox, onEmail, onError, pollMs, fetchOnStart, debug }
//     listener.on('server:connected') / ('server:disconnected')
//     listener.start() / listener.stop() / listener.imap / listener.mailbox

const EventEmitter = require('events');
const Imap = require('imap');
let SimpleParser = null;
try {
  // mailparser 3.x：simpleParser 是主 API（MailParser 类 + 'end' 事件老 API 已失效）
  SimpleParser = require('mailparser').simpleParser;
} catch (e) {
  console.error('[email-listener-integration] mailparser 加载失败:', e.message);
}

function createListener(opts) {
  if (!opts || !opts.user || !opts.password) {
    throw new Error('createListener: 缺少 user 或 password');
  }
  if (typeof opts.onEmail !== 'function') {
    throw new Error('createListener: 缺少 onEmail 回调函数');
  }
  if (!SimpleParser) {
    throw new Error('createListener: mailparser 不可用，无法解析邮件');
  }

  const listener = new EventEmitter();
  const mailbox = opts.mailbox || 'INBOX';
  const pollMs = Math.max(10000, opts.pollMs || 30000);
  const email = opts.user;

  let _imap = null;              // 当前连接实例（重连时重建）
  let _started = false;          // start() 被调过（幂等）
  let _stopped = false;          // stop() 被调过（永不重连）
  let _fetching = false;
  let _pollTimer = null;
  let _reconnectTimer = null;
  let _reconnectDelay = 5000;    // 退避起点 5s
  let _reconnectAttempts = 0;
  let _lastMaxUid = null;        // v2.4.2: UID 水位（已处理的 max uid；null = 首启未初始化）
  let _firstRunDone = false;     // v2.4.2: 首启存量处理是否完成（完成前轮询不跑）
  const _handledUids = new Set(); // 已触发过的 UID（内存去重：存量只触发一次，轮询只收增量）

  // ── 连接配置（每次重连复用）──
  function _connConfig() {
    return {
      user: opts.user,
      password: opts.password,
      host: opts.host || 'imap.263.net',
      port: opts.port || 993,
      tls: opts.tls !== false,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: opts.connTimeout || 20000,
      authTimeout: opts.authTimeout || 20000,
      keepalive: true,
      debug: opts.debug,
    };
  }

  function _safeOnError(err) {
    try {
      if (typeof opts.onError === 'function') opts.onError(err);
    } catch (e) {
      console.error('[email-listener-integration] onError 回调异常:', e.message);
    }
  }

  // ── 拉取未读邮件并逐封解析（首启存量通道：只处理 UNSEEN 一次，完成后回调）──
  function fetchUnseen(doneCb) {
    const cur = _imap;
    if (!cur || _fetching || _stopped) { if (doneCb) doneCb(); return; }
    if (cur.state !== 'authenticated' && cur.state !== 'selected') { if (doneCb) doneCb(); return; } // 连接未就绪
    _fetching = true;
    cur.search(['UNSEEN'], function (searchErr, results) {
      _fetching = false;
      if (searchErr) {
        console.log('[email-listener-integration] fetchUnseen search 错误:', searchErr.message);
        _safeOnError(searchErr);
        if (doneCb) doneCb();
        return;
      }
      if (!Array.isArray(results) || results.length === 0) { if (doneCb) doneCb(); return; }
      doFetchBatch(results, doneCb);
    });
  }

  // ── 轮询主通道（v2.4.2）：UID 水位增量检测 ──
  // 原 UNSEEN 检测的缺陷：邮件被打开阅读/客户端同步/自发自收标成 \Seen 后，
  // 规则引擎永远收不到触发（用户场景：发测试询价给自己→打开看→已读→无草稿）。
  // 改：记住已处理的 max UID，新邮件 = uid 大于水位（不管已读未读），读没读都触发。
  function searchAllUids(cb) {
    const cur = _imap;
    if (!cur || _stopped) return cb(null);
    cur.search(['ALL'], function (e, uids) { cb(e ? null : (Array.isArray(uids) ? uids : [])); });
  }
  function maxOf(uids) { return (uids && uids.length) ? Math.max.apply(null, uids) : null; }
  function setWatermarkFromAll() {
    searchAllUids(function (uids) { const m = maxOf(uids); if (m) _lastMaxUid = m; });
  }
  function pollTick() {
    if (!_firstRunDone) return; // 首启存量处理中，先不轮询
    checkNewByUid();
  }
  function checkNewByUid() {
    const cur = _imap;
    if (!cur || _fetching || _stopped) return;
    if (cur.state !== 'authenticated' && cur.state !== 'selected') return;
    if (_lastMaxUid === null) return; // 首启水位未就绪（等 fetchUnseen 完成）
    _fetching = true;
    // 263 会话快照 quirk：SELECT 后新到达的邮件对旧会话不可见（NOOP 不推送新 EXISTS），
    // SEARCH 永远返回旧快照 → 每次轮询前重新 SELECT 刷新（imap-service 每操作 openBox 同理）
    cur.openBox(mailbox, false, function (boxErr) {
      if (boxErr || _stopped) {
        _fetching = false;
        console.warn('[email-listener-integration] checkNewByUid 重新 SELECT 失败:', boxErr && boxErr.message);
        if (boxErr) _safeOnError(boxErr);
        return;
      }
      cur.search(['ALL'], function (searchErr, results) {
        _fetching = false;
        if (searchErr || !Array.isArray(results)) return;
        const all = results.filter(function (u) { return typeof u === 'number'; });
        const maxAll = maxOf(all);
        if (!maxAll || maxAll <= _lastMaxUid) return; // 无新邮件
        const newUids = all.filter(function (u) { return u > _lastMaxUid; });
        if (!newUids.length) { _lastMaxUid = maxAll; return; }
        console.log('[email-listener-integration] UID 水位 ' + _lastMaxUid + ' → ' + maxAll + '，新邮件 ' + newUids.length + ' 封');
        doFetchBatch(newUids, function () { _lastMaxUid = maxAll; }); // 全部处理完再推进水位
      });
    });
  }

  function doFetchBatch(results, doneCb) {
    const cur = _imap;
    if (_stopped || !cur) { if (doneCb) doneCb(); return; }
    // 邮件可能很多（首次启动 20+ 封），每批 6 封串行拉完，避免单次大响应卡死
    const BATCH = 6;
    let idx = 0;
    let active = 0;
    let doneFired = false;
    const maybeDone = function () {
      if (!doneFired && active === 0 && idx >= results.length && doneCb) {
        doneFired = true;
        doneCb();
      }
    };
    const fetchNext = function () {
      if (_stopped || !_imap) { maybeDone(); return; }
      while (idx < results.length) {
        let chunk = results.slice(idx, idx + BATCH).filter(function (u) { return !_handledUids.has(u); });
        idx += BATCH;
        if (chunk.length === 0) continue;
        // 预先登记，防止并发/重入重复处理
        chunk.forEach(function (u) { _handledUids.add(u); });
        active++;
        const f = _imap.fetch(chunk, { bodies: '' });
        f.on('message', function (msg) {
          let raw = '';
          let msgUid = null;
          // uid 实锤修复：node-imap message emitter 无 .uid 属性，uid 在 attributes 事件里
          msg.once('attributes', function (attrs) {
            if (attrs && typeof attrs.uid !== 'undefined') msgUid = attrs.uid;
          });
          msg.on('body', function (stream) {
            stream.on('data', function (ch) {
              raw += ch.toString('utf8');
              if (raw.length > 2000000) raw = raw.slice(0, 2000000); // 2MB 上限
            });
          });
          msg.once('end', function () {
            if (!SimpleParser) return;
            SimpleParser(raw)
              .then(function (mail) { emitParsedMail(mail, msgUid); })
              .catch(function (pe) {
                console.warn('[email-listener-integration] mailparser 解析失败:', (pe && pe.message) || pe);
              });
          });
        });
        f.once('end', function () { active--; fetchNext(); }); // 完成一批继续下一批
        f.once('error', function (fetchErr) {
          console.warn('[email-listener-integration] fetch 错误:', fetchErr.message);
          _safeOnError(fetchErr);
          active--;
          fetchNext(); // 出错不阻塞后续批
        });
        return; // 串行：一批 end 后再发下一批
      }
      maybeDone();
    };
    fetchNext();
    console.log('[email-listener-integration] 开始拉取（共 ' + results.length + ' 封，每批 ' + BATCH + ' 封串行）');
  }

  function emitParsedMail(mail, uid) {
    try {
      // mailparser 3.x：from/to 为 { value:[{address,name}], text }；老版本为数组——统一取值
      const pickFirst = function (addr) {
        if (!addr) return null;
        if (Array.isArray(addr)) return addr[0] || null;
        if (addr.value && Array.isArray(addr.value)) return addr.value[0] || null;
        return addr;
      };
      const fromObj = pickFirst(mail.from);
      const toObj = pickFirst(mail.to);
      opts.onEmail({
        subject: mail.subject || '',
        from: fromObj ? (fromObj.address || fromObj.value || '') : '',
        fromName: fromObj ? (fromObj.name || '') : '',
        to: toObj ? (toObj.address || '') : '',
        date: mail.date ? (mail.date.toISOString ? mail.date.toISOString() : String(mail.date)) : '',
        messageId: mail.messageId || '',
        text: (mail.text || '').slice(0, 2000),
        html: (mail.html || '').slice(0, 2000),
        snippet: String(mail.text || mail.html || '').replace(/<[^>]+>/g, ' ').slice(0, 500),
        uid: uid || null,
        mailbox,
      });
    } catch (e) {
      console.error('[email-listener-integration] 处理新邮件失败:', e.message);
      _safeOnError(e);
    }
  }

  // ── 断线自动重连（指数退避 5s→10s→20s→40s→60s cap；stop 后不再重连）──
  function scheduleReconnect(reason) {
    if (_stopped || _reconnectTimer) return;
    const delay = Math.min(_reconnectDelay * Math.pow(2, _reconnectAttempts), 60000);
    _reconnectAttempts++;
    console.warn('[email-listener-integration] 连接断开(' + email + ')：' + reason + ' → ' + (delay / 1000) + 's 后自动重连（第 ' + _reconnectAttempts + ' 次）');
    _reconnectTimer = setTimeout(function () {
      _reconnectTimer = null;
      if (_stopped) return;
      console.log('[email-listener-integration] 正在重连 ' + email + ' …');
      boot();
    }, delay);
    if (_reconnectTimer.unref) _reconnectTimer.unref();
  }

  // ── 建立连接（ready → openBox → 首次拉取 + 启动轮询）──
  function boot() {
    if (_stopped) return;
    try {
      if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
      _imap = new Imap(_connConfig());

      _imap.on('error', function (err) {
        console.warn('[email-listener-integration] IMAP Connection error (' + email + '):', err && (err.message || err.source || err));
        _safeOnError(err);
        // error 后连接通常随之 close（close 事件里统一重连调度）
      });

      _imap.on('close', function () {
        listener.emit('server:disconnected');
        scheduleReconnect('连接关闭');
      });

      _imap.once('ready', function () {
        if (_stopped) return;
        _reconnectAttempts = 0; // 连上后重置退避
        listener.emit('server:connected');
        _imap.openBox(mailbox, false, function (boxErr) {
          if (boxErr) {
            console.warn('[email-listener-integration] openBox(' + mailbox + ') 失败:', boxErr.message);
            _safeOnError(boxErr);
            return;
          }
          // 新邮件检测 v2.4.2：首启处理存量 UNSEEN 一次（完成回调里初始化 UID 水位），
          // 之后轮询走 UID 水位增量（新邮件 uid > 水位即触发，不管已读未读——修复
          // 「打开阅读/客户端同步/自发自收标已读后规则收不到触发」）
          const initDone = function () {
            _firstRunDone = true;
            setWatermarkFromAll(); // 水位 = 当前 max uid，此后新 uid 才触发
            console.log('[email-listener-integration] 首启存量处理完成，UID 水位已初始化，进入增量轮询');
          };
          if (opts.fetchOnStart !== false) {
            fetchUnseen(initDone);
          } else {
            initDone();
          }
          _pollTimer = setInterval(pollTick, pollMs);
          if (_pollTimer.unref) _pollTimer.unref();
        });
      });

      _imap.connect();
    } catch (e) {
      console.error('[email-listener-integration] imap.connect 异常:', e.message);
      _safeOnError(e);
      scheduleReconnect('connect 异常: ' + e.message);
    }
  }

  listener.start = function () {
    if (_started) return;
    _started = true;
    _stopped = false;
    boot();
  };

  listener.stop = function () {
    _stopped = true;
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    try { if (_imap) _imap.end(); } catch (e) { /* ignore */ }
    listener.emit('server:disconnected');
  };

  // 暴露当前 imap 实例（重连后引用会变——调用方勿缓存，需实时读 listener.imap）
  Object.defineProperty(listener, 'imap', {
    get: function () { return _imap; },
    enumerable: true,
  });
  listener.mailbox = mailbox;
  listener._handledUids = _handledUids; // 诊断用
  // v2.4.2 诊断暴露：水位 + 手动触发一次增量检测
  Object.defineProperty(listener, 'lastMaxUid', {
    get: function () { return _lastMaxUid; },
    enumerable: true,
  });
  listener._debugPollOnce = function () { checkNewByUid(); };

  return listener;
}

module.exports = {
  createListener,
};
