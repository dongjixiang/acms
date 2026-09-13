// P199/P200: 角色档案库客户端 API 封装
//   P200: list(docId, scope) 按文档隔离；assignDoc 批量绑定；create 时 payload 带 sourceDocId
(function (root) {
  var BASE = '/api/character-library';

  function ok(r) {
    if (!r.ok) return Promise.reject(new Error('HTTP ' + r.status));
    return r.json();
  }
  function hdr(extra) {
    var h = { 'X-API-Key': 'dev-key-001' };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  // list(docId, scope)
  //   scope: 'doc'（本文档+通用，默认带 docId 时）/ 'all' / 'unassigned'
  function list(docId, scope) {
    var qs = [];
    if (docId) qs.push('docId=' + encodeURIComponent(docId));
    if (scope) qs.push('scope=' + encodeURIComponent(scope));
    var url = BASE + '/list' + (qs.length ? '?' + qs.join('&') : '');
    return fetch(url, { headers: hdr() }).then(ok);
  }

  function getById(id) {
    return fetch(BASE + '/get/' + encodeURIComponent(id), { headers: hdr() }).then(ok);
  }

  function findInText(text) {
    return fetch(BASE + '/find-in-text', {
      method: 'POST',
      headers: hdr({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text: text || '' })
    }).then(ok);
  }

  // create(payload) — payload 可含 sourceDocId / sourceDocName（调用方从当前文档取）
  function create(payload) {
    return fetch(BASE + '/create', {
      method: 'POST',
      headers: hdr({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    }).then(ok);
  }

  function update(id, patch) {
    return fetch(BASE + '/update/' + encodeURIComponent(id), {
      method: 'POST',
      headers: hdr({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch || {})
    }).then(ok);
  }

  function remove(id) {
    return fetch(BASE + '/delete/' + encodeURIComponent(id), {
      method: 'POST',
      headers: hdr({ 'Content-Type': 'application/json' })
    }).then(ok);
  }

  // P200: 批量绑定文档（ids 省略 → 全部未绑定的；docId 空串 = 设为通用）
  function assignDoc(ids, docId, docName) {
    return fetch(BASE + '/assign-doc', {
      method: 'POST',
      headers: hdr({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ids: ids || [], docId: docId || '', docName: docName || '' })
    }).then(ok);
  }

  // P200: 设为/取消「通用」（跨文档复用）
  function setShared(ids, shared) {
    return fetch(BASE + '/set-shared', {
      method: 'POST',
      headers: hdr({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ids: ids || [], shared: shared === true })
    }).then(ok);
  }

  // 取参考图列表（按 ID 数组，返回 string[] dataUrl/URL）
  function collectReferenceImages(chars) {
    var out = [];
    if (!Array.isArray(chars)) return out;
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      if (c && c.referenceImage && String(c.referenceImage).trim()) {
        out.push(c.referenceImage);
      }
    }
    return out;
  }

  root.acmsCharacterLib = {
    list: list,
    getById: getById,
    findInText: findInText,
    create: create,
    update: update,
    remove: remove,
    assignDoc: assignDoc,
    setShared: setShared,
    collectReferenceImages: collectReferenceImages
  };
})(window);
