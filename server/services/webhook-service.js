// Webhook 服务 — 事件驱动的外部通知
// 监听 ACMS eventBus，将事件推送到注册的 webhook URL

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { collection } = require('../db/connection');

class WebhookService {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this._started = false;
  }

  /** 启动监听 */
  start() {
    if (this._started) return;
    this._started = true;

    // 监听所有 ACMS 事件
    const events = [
      'task.created', 'task.claimed', 'task.submitted',
      'task.completed', 'task.review_rejected',
      'requirement.decomposed', 'requirement.approved',
      'requirement.review_submitted', 'requirement.changed',
      'agent.registered',
    ];

    for (const event of events) {
      this.eventBus.on(event, (payload) => this._dispatch(event, payload));
    }

    console.log('[Webhook] Service started, listening on', events.length, 'events');
  }

  /** 分发事件到匹配的 webhook */
  async _dispatch(eventType, payload) {
    try {
      const subs = this.listSubscriptions({ event: eventType });
      if (subs.length === 0) return;

      const { projectId, target } = payload;
      const body = JSON.stringify({
        event: eventType,
        timestamp: new Date().toISOString(),
        projectId,
        target,
        payload,
      });

      for (const sub of subs) {
        if (!sub.active) continue;
        this._post(sub.url, body, sub.secret, eventType).catch(e => {
          console.error(`[Webhook] Failed to deliver ${eventType} → ${sub.url}: ${e.message}`);
        });
      }
    } catch (e) {
      console.error('[Webhook] Dispatch error:', e.message);
    }
  }

  /** POST 到 webhook URL */
  _post(url, body, secret, eventType) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const mod = parsed.protocol === 'https:' ? https : http;

      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-ACMS-Event': 'true',
        // v0.17g：Hermes webhook 适配器按 GitHub 兼容读 X-GitHub-Event header
        //   之前只 body 里放 'event' 字段 → Hermes 找不到 event_type 也不知道 header → 全被标 'unknown' ignore
        //   现在两个 header 都发：兼容 Hermes + 兼容 GitHub-style webhook 接收方
        ...(eventType ? { 'X-GitHub-Event': eventType, 'X-Event-Type': eventType } : {}),
      };

      if (secret) {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(body);
        headers['X-Hub-Signature-256'] = 'sha256=' + hmac.digest('hex');
      }

      const req = mod.request(url, {
        method: 'POST',
        headers,
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body: data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  }

  // ========== CRUD ==========

  /** 创建订阅 */
  create({ name, url, events = [], secret = '', description = '', active = true }) {
    if (!name || !url) return { error: 'MISSING_FIELDS' };
    if (events.length === 0) return { error: 'MISSING_EVENTS' };

    // 自动生成 secret（如果没提供）
    const finalSecret = secret || crypto.randomBytes(16).toString('hex');

    const sub = {
      id: `wh-${Date.now().toString(36)}`,
      name, url, events, secret: finalSecret, description,
      active, created_at: new Date().toISOString(),
      last_triggered: '',
      error_count: 0,
    };

    collection('webhooks').insert(sub);
    console.log(`[Webhook] Created: ${name} → ${url} [${events.join(',')}]`);
    return sub;
  }

  /** 列出订阅 */
  listSubscriptions({ event, active } = {}) {
    let subs = collection('webhooks').all();
    if (event) subs = subs.filter(s => s.events.includes(event));
    if (active !== undefined) subs = subs.filter(s => s.active === active);
    return subs;
  }

  /** 获取单个订阅 */
  getById(id) {
    return collection('webhooks').findOne(s => s.id === id) || null;
  }

  /** 更新订阅 */
  update(id, updates) {
    const sub = this.getById(id);
    if (!sub) return { error: 'NOT_FOUND' };
    collection('webhooks').update(s => s.id === id, {
      ...updates,
      updated_at: new Date().toISOString(),
    });
    return this.getById(id);
  }

  /** 删除订阅 */
  delete(id) {
    const sub = this.getById(id);
    if (!sub) return { error: 'NOT_FOUND' };
    collection('webhooks').remove(s => s.id === id);
    console.log(`[Webhook] Deleted: ${sub.name}`);
    return { deleted: true };
  }

  /** 测试推送 */
  async test(id) {
    const sub = this.getById(id);
    if (!sub) return { error: 'NOT_FOUND' };

    const testPayload = JSON.stringify({
      event: 'test',
      timestamp: new Date().toISOString(),
      message: 'Webhook test from ACMS',
      subscription: sub.name,
    });

    try {
      await this._post(sub.url, testPayload, sub.secret);
      return { success: true, url: sub.url };
    } catch (e) {
      return { error: 'TEST_FAILED', message: e.message };
    }
  }
}

module.exports = WebhookService;
