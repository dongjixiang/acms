// 事件总线 — 模块间解耦通信 (JSON 版)
const { collection } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

class EventBus {
  constructor() {
    this._handlers = new Map();
    this._wsClients = new Set();
  }

  on(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(handler);
  }

  addWsClient(ws) { this._wsClients.add(ws); }
  removeWsClient(ws) { this._wsClients.delete(ws); }

  async emit(type, { projectId = '', actor = {}, target = {}, payload = {} } = {}) {
    const event = {
      id: uuidv4(),
      project_id: projectId,
      type,
      actor_id: actor.id || '',
      actor_type: actor.type || 'system',
      actor_name: actor.name || 'system',
      target_type: target.type || '',
      target_id: target.id || '',
      payload: JSON.stringify(payload),
      result: 'allowed',
      deny_reason: '',
      timestamp: Date.now(),
    };

    try { collection('events').insert(event); }
    catch (e) { console.error('[EventBus] Persist error:', e.message); }

    for (const handler of this._handlers.get(type) || []) {
      try { await handler(event); }
      catch (e) { console.error(`[EventBus] Handler error for ${type}:`, e.message); }
    }

    const wsMsg = JSON.stringify({ type, payload: { ...payload, eventId: event.id, timestamp: event.timestamp } });
    for (const ws of this._wsClients) {
      try { if (ws.readyState === 1) ws.send(wsMsg); } catch (e) { /* ignore */ }
    }

    return event;
  }

  query({ type, projectId, actorId, limit = 50 } = {}) {
    let events = collection('events').all();
    if (type) events = events.filter(e => e.type === type);
    if (projectId) events = events.filter(e => e.project_id === projectId);
    if (actorId) events = events.filter(e => e.actor_id === actorId);
    events.sort((a, b) => b.timestamp - a.timestamp);
    return events.slice(0, limit);
  }
}

const eventBus = new EventBus();
module.exports = eventBus;
