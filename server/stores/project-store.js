// 项目数据存储 (JSON 版)
const { collection } = require('../db/connection');
const path = require('path');

class ProjectStore {
  create({ name, slug, description = '', wikiVaultPath = '', wikiDocsPath = 'docs/' }) {
    const id = `proj_${slug || name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const now = new Date().toISOString();
    // 默认 Wiki 路径：项目工作区下的 wiki/ 目录
    const resolvedSlug = slug || name;
    const defaultWikiPath = path.join(__dirname, '..', '..', 'workspaces', resolvedSlug, 'wiki');
    const project = { id, name, slug: resolvedSlug, description, status: 'active', visibility: 'team',
      tech_stack: '{}', wiki_vault_path: wikiVaultPath || defaultWikiPath, wiki_docs_path: wikiDocsPath,
      stats: '{}', created_at: now, updated_at: now };
    collection('projects').insert(project);

    // 自动初始化项目工作区
    try {
      const workspace = require('../services/workspace-service');
      workspace.init(slug || name);
    } catch (e) { /* 非关键，静默失败 */ }

    return project;
  }

  getById(id) { return collection('projects').findOne(p => p.id === id); }
  list() { return collection('projects').all(); }

  update(id, updates) {
    const now = new Date().toISOString();
    return collection('projects').update(p => p.id === id, { ...updates, updated_at: now });
  }

  addMember(projectId, { memberId, memberType, memberRole = 'member' }) {
    const existing = collection('project_members').findOne(m => m.project_id === projectId && m.member_id === memberId);
    if (existing) {
      collection('project_members').update(m => m.project_id === projectId && m.member_id === memberId, { member_role: memberRole });
    } else {
      collection('project_members').insert({ project_id: projectId, member_id: memberId, member_type: memberType, member_role: memberRole, joined_at: new Date().toISOString() });
    }
  }

  getMembers(projectId) { return collection('project_members').find(m => m.project_id === projectId); }

  addEnvironment(projectId, { name, url, type = 'local' }) {
    const env = { id: Date.now(), project_id: projectId, name, url, type, status: 'active' };
    collection('project_environments').insert(env);
    return env.id;
  }

  getEnvironments(projectId) { return collection('project_environments').find(e => e.project_id === projectId); }

  addRepo(projectId, { name, url, type = 'github', defaultBranch = 'main' }) {
    const repo = { id: Date.now(), project_id: projectId, name, url, type, default_branch: defaultBranch, credential_ref: '' };
    collection('project_repos').insert(repo);
    return repo.id;
  }

  getRepos(projectId) { return collection('project_repos').find(r => r.project_id === projectId); }

  setConfig(projectId, { key, value, category = 'general', description = '' }) {
    const existing = collection('project_configs').findOne(c => c.project_id === projectId && c.key === key);
    const now = new Date().toISOString();
    if (existing) {
      collection('project_configs').update(c => c.project_id === projectId && c.key === key, { value, category, description, updated_at: now });
    } else {
      collection('project_configs').insert({ id: Date.now(), project_id: projectId, key, value, category, description, sensitive: 0, updated_by: '', updated_at: now });
    }
  }

  getConfig(projectId, key) { return collection('project_configs').findOne(c => c.project_id === projectId && c.key === key) || null; }
  getAllConfigs(projectId) { return collection('project_configs').find(c => c.project_id === projectId); }
}

module.exports = new ProjectStore();
