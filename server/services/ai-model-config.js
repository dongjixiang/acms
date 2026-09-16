'use strict';
/**
 * v0.22.73: AI 生成模型统一配置（图像 / 视频）
 *
 * 背景（多多 2026-09-13）：「视频和图像模型的名字都是写死的么？要做成可配置的」
 *   —— 之前 'agnes-image-2.5-flash' 散落在 4 个文件 6 处、视频默认名散落 3 处，
 *      换模型要改代码 + 重启，且容易漏改（改了 3 处忘了第 4 处 → 行为不一致）。
 *
 * 解析优先级（与 getAgnesApiKey 一致）：DB system_configs > config.json > 环境变量 > 内置默认
 *
 * 配置键（存在 DB system_configs 表，管理后台「AI 模型」区块可改）：
 *   agnes_image_model          图像模型（角色图/场景图/首帧图/文生图，默认 agnes-image-2.5-flash）
 *   agnes_video_model          视频模型·首尾帧链路（有首帧图时用，默认 agnes-video-2.5-flash）
 *   agnes_video_model_legacy   视频模型·老链路（无首帧图时的多图关键帧，默认 agnes-video-v2.0）
 *     注意：两条链路的**参数形态完全不同**（2.0 用 num_frames/frame_rate，2.5 用 seconds/size/aspect_ratio
 *     + first_frame/last_frame），由模型名判定分支 —— 所以两个键必须分开配，不能共用一个。
 *   agnes_api_base_url         Agnes API 域名（视频/图像/模型清单共用，默认 https://api.agnes-ai.cn）
 *     历史：v0.XX 域名从 apihub.agnes-ai.com 切到 api.agnes-ai.cn（对齐 LLM 模型 + 新 key）。
 *     2026-09-15 多多拍板挪到 system_configs：避免 22:48 那种「服务端对 cn 域名 hang 死」时
 *     切到其他节点/自建代理得改代码+重启。改完立即生效（每次请求重新读）。
 */

const DEFAULTS = {
  agnes_image_model: 'agnes-image-2.5-flash',
  agnes_video_model: 'agnes-video-2.5-flash',
  agnes_video_model_legacy: 'agnes-video-v2.0',
  // v0.XX.73: Agnes API 域名（视频/图像/模型清单共用），旧值 https://api.agnes-ai.cn
  agnes_api_base_url: 'https://api.agnes-ai.cn',
};

// 环境变量名（容器/部署场景用）
const ENV_KEYS = {
  agnes_image_model: 'AGNES_IMAGE_MODEL',
  agnes_video_model: 'AGNES_VIDEO_MODEL',
  agnes_video_model_legacy: 'AGNES_VIDEO_MODEL_LEGACY',
  agnes_api_base_url: 'AGNES_API_BASE_URL',
};

function dbGet(key) {
  try {
    const { collection } = require('../db/connection');
    const cfg = collection('system_configs').findOne(c => c.key === key);
    if (cfg && typeof cfg.value === 'string' && cfg.value.trim()) return cfg.value.trim();
  } catch (e) { /* DB 未就绪时静默走兜底 */ }
  return '';
}

function fileGet(key) {
  try {
    const config = require('../config');
    const v = config && config[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  } catch (e) { /* ignore */ }
  return '';
}

function envGet(key) {
  const name = ENV_KEYS[key];
  const v = name ? process.env[name] : '';
  return (typeof v === 'string' && v.trim()) ? v.trim() : '';
}

/** 解析单个配置项 */
function get(key) {
  if (!(key in DEFAULTS)) throw new Error('未知模型配置键: ' + key);
  return dbGet(key) || fileGet(key) || envGet(key) || DEFAULTS[key];
}

/** 全部配置（含来源，便于后台展示「当前生效值」） */
function all() {
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    const fromDb = dbGet(key), fromFile = fileGet(key), fromEnv = envGet(key);
    out[key] = {
      value: fromDb || fromFile || fromEnv || DEFAULTS[key],
      default: DEFAULTS[key],
      source: fromDb ? 'db' : fromFile ? 'config.json' : fromEnv ? 'env' : 'default',
      overridden: !!(fromDb || fromFile || fromEnv),
    };
  }
  return out;
}

// 允许的模型名形态（只做前缀白名单，避免写死具体版本 → 官方上新模型不用改代码）
const VALIDATORS = {
  agnes_image_model: /^agnes-image-[A-Za-z0-9.\-]+$/,
  agnes_video_model: /^agnes-video-[A-Za-z0-9.\-]+$/,
  agnes_video_model_legacy: /^agnes-video-[A-Za-z0-9.\-]+$/,
  // v0.XX.73: API 域名只做「必须是 https:// 开头」校验，不写死具体域名（未来切域名/自建代理都能配）
  agnes_api_base_url: /^https:\/\/[A-Za-z0-9.\-:]+(\/.*)?$/,
};

function validate(key, value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return { ok: false, error: '值不能为空' };
  const re = VALIDATORS[key];
  if (re && !re.test(v)) {
    // v0.XX.73: 每个 key 给对应的提示，避免一刀切用模型名格式误导
    const hint = key === 'agnes_api_base_url'
      ? '应形如 https://your-domain.com（必须 https:// 开头）'
      : '应形如 agnes-image-xxx / agnes-video-xxx';
    return { ok: false, error: `${v} 不符合格式（${hint}）` };
  }
  return { ok: true, value: v };
}

/** 写入配置（空值 → 删除该键，回落到默认）。返回 { ok, ... } */
function set(key, value) {
  if (!(key in DEFAULTS)) return { ok: false, error: '未知模型配置键: ' + key };
  const { collection } = require('../db/connection');
  const sysConfigs = collection('system_configs');
  const now = new Date().toISOString();
  const v = String(value == null ? '' : value).trim();

  if (!v || v === DEFAULTS[key]) {
    // 恢复默认：删除覆盖项
    const existing = sysConfigs.findOne(c => c.key === key);
    if (existing) sysConfigs.remove(c => c.key === key);
    return { ok: true, key, value: DEFAULTS[key], source: 'default', message: '已恢复默认' };
  }
  const chk = validate(key, v);
  if (!chk.ok) return chk;

  const existing = sysConfigs.findOne(c => c.key === key);
  if (existing) sysConfigs.update(c => c.key === key, { ...existing, value: v, updated_at: now });
  else sysConfigs.insert({ key, value: v, created_at: now, updated_at: now });
  return { ok: true, key, value: v, source: 'db', message: '已保存' };
}

/** 语义化 getter（调用方用这些，不要再写模型名字面量） */
const imageModel = () => get('agnes_image_model');
const videoModel = () => get('agnes_video_model');          // 首尾帧链路
const legacyVideoModel = () => get('agnes_video_model_legacy'); // 2.0 多图关键帧链路
const baseUrl = () => get('agnes_api_base_url').replace(/\/+$/, ''); // 去掉末尾 /，避免拼路径时变 //
const isVideoModel = (m) => VALIDATORS.agnes_video_model.test(String(m || '').trim());
const is25 = (m) => !/v2\\.0/.test(String(m || ''));   // 参数形态判定

/**
 * 从 Agnes 官方拉可用模型清单（管理后台下拉用）
 *   GET ${baseUrl()}/v1/models ；失败 → 回落已知清单（不阻塞配置页）
 *   缓存 10 分钟，避免每次打开后台都打接口
 */
let _cache = { at: 0, list: null };
const KNOWN_FALLBACK = [
  { id: 'agnes-image-2.5-flash', kind: 'image' },
  { id: 'agnes-image-2.1-flash', kind: 'image' },
  { id: 'agnes-video-2.5-flash', kind: 'video' },
  { id: 'agnes-video-2.5', kind: 'video' },
  { id: 'agnes-video-v2.0', kind: 'video' },
];

/** Agnes API Key（与 tools/agnes-video.js 同一优先级：config.json > env > DB） */
function agnesApiKey() {
  try {
    const config = require('../config');
    if (config && config.agnesApiKey) return config.agnesApiKey;
  } catch (e) { /* ignore */ }
  if (process.env.AGNES_API_KEY) return process.env.AGNES_API_KEY;
  return dbGet('agnes_api_key');
}

async function listAvailable(opts = {}) {
  const ttl = opts.fresh ? 0 : 10 * 60 * 1000;
  if (_cache.list && (Date.now() - _cache.at) < ttl) return { ok: true, source: 'cache', models: _cache.list };
  try {
    const { http1Fetch } = require('../tools/http1-fetch');
    const apiKey = agnesApiKey();
    if (!apiKey) return { ok: true, source: 'fallback(no-key)', models: KNOWN_FALLBACK };
    const resp = await http1Fetch(`${baseUrl()}/v1/models`, {
      method: 'GET', headers: { Authorization: 'Bearer ' + apiKey }, timeout: 15000,
    });
    if (!resp.ok || resp.status < 200 || resp.status >= 300) {
      return { ok: true, source: 'fallback(http ' + (resp.status || resp.error) + ')', models: KNOWN_FALLBACK };
    }
    const data = JSON.parse(resp.body);
    const raw = Array.isArray(data && data.data) ? data.data : (Array.isArray(data) ? data : []);
    const models = raw.map(m => String((m && (m.id || m.name)) || '').trim()).filter(Boolean)
      .map(id => ({ id, kind: /image/.test(id) ? 'image' : /video/.test(id) ? 'video' : 'other' }));
    if (!models.length) return { ok: true, source: 'fallback(empty)', models: KNOWN_FALLBACK };
    _cache = { at: Date.now(), list: models };
    return { ok: true, source: 'agnes', models };
  } catch (e) {
    return { ok: true, source: 'fallback(' + (e.message || 'error') + ')', models: KNOWN_FALLBACK };
  }
}

module.exports = {
  DEFAULTS, get, set, all, validate,
  imageModel, videoModel, legacyVideoModel, baseUrl, isVideoModel, is25,
  listAvailable,
};
