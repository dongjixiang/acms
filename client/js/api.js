// ACMS API 客户端
const API_BASE = '/api';
const WS_URL = 'ws://' + location.hostname + ':3301/ws';
const API_KEY = 'dev-key-001';

async function api(method, path, body) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY } };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch(API_BASE + path, opts);
  var data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

// 项目
var Projects = {
  list: function() { return api('GET', '/projects'); },
  get: function(id) { return api('GET', '/projects/' + id); },
  create: function(data) { return api('POST', '/projects', data); }
};

// 需求
var Requirements = {
  list: function(params) {
    var clean = {};
    for (var k in params) { if (params[k] !== undefined) clean[k] = params[k]; }
    var qs = '';
    var parts = [];
    for (var k2 in clean) parts.push(k2 + '=' + encodeURIComponent(clean[k2]));
    if (parts.length) qs = '?' + parts.join('&');
    return api('GET', '/requirements' + qs);
  },
  get: function(id) { return api('GET', '/requirements/' + id); },
  create: function(data) { return api('POST', '/requirements', data); },
  transition: function(id, targetStatus) { return api('POST', '/requirements/' + id + '/transition', { targetStatus: targetStatus }); },
  clarify: function(id, question, agentId) { return api('POST', '/requirements/' + id + '/clarify', { question: question, agentId: agentId }); },
  answer: function(id, questionIndex, answer, role) { return api('POST', '/requirements/' + id + '/answer', { questionIndex: questionIndex, answer: answer, role: role }); },
  updateSrs: function(id, data) { return api('PATCH', '/requirements/' + id + '/srs', data); },
  submitReview: function(id) { return api('POST', '/requirements/' + id + '/submit-review'); },
  approve: function(id) { return api('POST', '/requirements/' + id + '/approve'); },
  reject: function(id, reason) { return api('POST', '/requirements/' + id + '/reject', { reason: reason }); },
  decompose: function(id, tasks) { return api('POST', '/requirements/' + id + '/decompose', { tasks: tasks }); }
};

// 任务
var Tasks = {
  list: function(params) {
    var clean = {};
    for (var k in params) { if (params[k] !== undefined) clean[k] = params[k]; }
    var parts = [];
    for (var k2 in clean) parts.push(k2 + '=' + encodeURIComponent(clean[k2]));
    var qs = parts.length ? '?' + parts.join('&') : '';
    return api('GET', '/tasks' + qs);
  },
  get: function(id) { return api('GET', '/tasks/' + id); },
  create: function(data) { return api('POST', '/tasks', data); },
  board: function(projectId, parentId) {
    var qs = 'board=true&projectId=' + encodeURIComponent(projectId);
    if (parentId) qs += '&parentId=' + encodeURIComponent(parentId);
    return api('GET', '/tasks?' + qs);
  },
  claim: function(id, agentId) { return api('POST', '/tasks/' + id + '/claim', { agentId: agentId }); },
  progress: function(id, pct, note) { return api('POST', '/tasks/' + id + '/progress', { progress: pct, note: note }); },
  submit: function(id, agentId, files, notes) { return api('POST', '/tasks/' + id + '/submit', { agentId: agentId, files: files || [], diff: '', testResult: {}, notes: notes }); },
  review: function(id, verdict, feedback) { return api('POST', '/tasks/' + id + '/review', { verdict: verdict, feedback: feedback, reviewedBy: 'user' }); },
  release: function(id) { return api('POST', '/tasks/' + id + '/release'); }
};

// 智能体
var Agents = {
  list: function() { return api('GET', '/agents'); },
  register: function(data) { return api('POST', '/agents/register', data); }
};