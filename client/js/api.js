// ACMS API 客户端
const API_BASE = '/api';
const WS_URL = `ws://${location.hostname}:3301/ws`;
const API_KEY = 'dev-key-001';

async function api(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

// 项目
const Projects = {
  list: () => api('GET', '/projects'),
  get: (id) => api('GET', `/projects/${id}`),
  create: (data) => api('POST', '/projects', data),
};

// 需求
const Requirements = {
  list: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api('GET', `/requirements${qs ? '?' + qs : ''}`); },
  get: (id) => api('GET', `/requirements/${id}`),
  create: (data) => api('POST', '/requirements', data),
  transition: (id, targetStatus) => api('POST', `/requirements/${id}/transition`, { targetStatus }),
  clarify: (id, question, agentId) => api('POST', `/requirements/${id}/clarify`, { question, agentId }),
  answer: (id, questionIndex, answer, role) => api('POST', `/requirements/${id}/answer`, { questionIndex, answer, role }),
  updateSrs: (id, data) => api('PATCH', `/requirements/${id}/srs`, data),
  submitReview: (id) => api('POST', `/requirements/${id}/submit-review`),
  approve: (id) => api('POST', `/requirements/${id}/approve`),
  reject: (id, reason) => api('POST', `/requirements/${id}/reject`, { reason }),
  decompose: (id, tasks) => api('POST', `/requirements/${id}/decompose`, { tasks }),
};

// 任务
const Tasks = {
  list: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api('GET', `/tasks${qs ? '?' + qs : ''}`); },
  get: (id) => api('GET', `/tasks/${id}`),
  create: (data) => api('POST', '/tasks', data),
  board: (projectId, parentId) => { const qs = new URLSearchParams({ board: 'true', projectId, ...(parentId ? { parentId } : {}) }).toString(); return api('GET', `/tasks?${qs}`); },
  claim: (id, agentId) => api('POST', `/tasks/${id}/claim`, { agentId }),
  progress: (id, progress, note) => api('POST', `/tasks/${id}/progress`, { progress, note }),
  submit: (id, agentId, files, notes) => api('POST', `/tasks/${id}/submit`, { agentId, files: files || [], diff: '', testResult: {}, notes }),
  review: (id, verdict, feedback) => api('POST', `/tasks/${id}/review`, { verdict, feedback, reviewedBy: 'user' }),
  release: (id) => api('POST', `/tasks/${id}/release`),
};

// 智能体
const Agents = {
  list: () => api('GET', '/agents'),
  register: (data) => api('POST', '/agents/register', data),
};
