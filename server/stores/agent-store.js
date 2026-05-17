// 智能体数据存储 (JSON 版)
const { collection } = require('../db/connection');

class AgentStore {
  register({ id, name, type = 'general', roles = [], skills = {}, endpoint = '', authToken = '' }) {
    const now = new Date().toISOString();
    const existing = collection('agents').findOne(a => a.id === id);
    if (existing) {
      collection('agents').update(a => a.id === id, {
        name, type, roles: JSON.stringify(roles), skills: JSON.stringify(skills),
        status: 'online', endpoint, auth_token: authToken, last_seen_at: now
      });
    } else {
      collection('agents').insert({
        id, name, type, roles: JSON.stringify(roles), skills: JSON.stringify(skills),
        status: 'online', max_concurrent_tasks: 3, current_tasks: '[]',
        stats: '{}', domain_roles: '[]', tech_tags: '[]',
        endpoint, auth_token: authToken, registered_at: now, last_seen_at: now
      });
    }
    return this.getById(id);
  }

  getById(id) { return collection('agents').findOne(a => a.id === id) || null; }

  list({ status, type } = {}) {
    let agents = collection('agents').all();
    if (status) agents = agents.filter(a => a.status === status);
    if (type) agents = agents.filter(a => a.type === type);
    return agents.sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at));
  }

  updateStatus(id, status) {
    const now = new Date().toISOString();
    return collection('agents').update(a => a.id === id, { status, last_seen_at: now });
  }

  matchSkills(requiredSkills) {
    const agents = this.list({ status: 'online' });
    const results = [];
    for (const agent of agents) {
      const skills = JSON.parse(agent.skills || '{}');
      let score = 0;
      let matched = 0;
      for (const [skill, required] of Object.entries(requiredSkills || {})) {
        const level = skills[skill] || 0;
        if (level >= required) { score += level - required + 1; matched++; }
        else { score -= (required - level) * 2; }
      }
      if (matched === Object.keys(requiredSkills || {}).length) score += 5;
      if (score > 0) results.push({ agentId: agent.id, name: agent.name, type: agent.type, score: Math.round(score * 10) / 10 });
    }
    return results.sort((a, b) => b.score - a.score);
  }
}

module.exports = new AgentStore();
