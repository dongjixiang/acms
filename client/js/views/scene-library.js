// P199/P200: 场景档案库客户端 API 封装
(function (root) {
  var BASE = '/api/scene-library';
  function ok(r) { if (!r.ok) return Promise.reject(new Error('HTTP ' + r.status)); return r.json(); }
  function hdr(extra) {
    var h = { 'X-API-Key': 'dev-key-001' };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  // list(docId, scope) — scope: 'doc' / 'all' / 'unassigned'
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

  root.acmsSceneLib = {
    list: list, getById: getById, findInText: findInText,
    create: create, update: update, remove: remove, assignDoc: assignDoc, setShared: setShared
  };
})(window);
