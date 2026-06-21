// 公共 JSON 提取工具（多层容错 — 处理 LLM 输出不稳定问题）
//
// 触发场景（memory 已记录）：
//   - MiniMax jsonMode=true 可能返回 Anthropic 格式带 thinking 块
//   - LLM 输出可能被 maxTokens 截断（缺最右 }）
//   - LLM 输出可能带 markdown 代码块包裹
//   - LLM 输出可能含不可见控制字符（零宽字符 / 控制符）
//   - 字符串内有 { } 但不是 JSON 真正的边界（嵌套干扰）
//
// 解法：5 层容错（与 ai-clarify-service.js 的 extractJSON 一致，提取为公共工具）
//   1. 直接 parse
//   2. 清洗（剥 markdown + 零宽 + 控制字符）→ parse
//   3. 从最右 } 往前回溯（处理截断）+ parse
//   4. 大括号深度匹配（处理嵌套干扰）+ parse
//   5. 返回 null（让调用方走 fallback / 重试）
//
// 用法：
//   const { extractJSON } = require('./json-extractor');
//   const jsonStr = extractJSON(llmContent);
//   if (jsonStr) { const parsed = JSON.parse(jsonStr); ... }

/**
 * 多层容错提取 JSON 字符串
 * @param {string} content - LLM 原始输出
 * @returns {string|null} 合法 JSON 字符串，失败返回 null
 */
function extractJSON(content) {
  if (!content) return null;

  // 1. 直接解析（整个字符串就是合法 JSON）
  try { JSON.parse(content); return content; } catch {}

  // 2. 清洗：剥离 markdown 代码块标记、零宽字符、不可见控制符
  let cleaned = String(content)
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')                  // 零宽字符
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')      // 控制字符（保留 \n\r\t）
    .trim();

  // 3. 清洗后直接解析
  try { JSON.parse(cleaned); return cleaned; } catch {}

  // 4. 找最后一个完整的 JSON 对象（处理"叙述前缀 + JSON 后缀"或"输出被截断"模式）
  //    从最右 } 往前回溯找 { 边界，每次尝试 parse
  let idx = cleaned.length;
  while ((idx = cleaned.lastIndexOf('}', idx - 1)) >= 0) {
    const candidate = cleaned.substring(0, idx + 1);
    const openBrace = candidate.indexOf('{');
    if (openBrace >= 0) {
      const jsonStr = candidate.substring(openBrace);
      try { JSON.parse(jsonStr); return jsonStr; } catch {}
    }
  }

  // 5. 大括号深度匹配（处理嵌套 { 干扰 + 截断）
  //    从最左 { 开始数深度，找到 depth==0 的位置截取
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace >= 0) {
    const jsonStr = cleaned.substring(firstBrace);
    let depth = 0, inStr = false, escape = false;
    for (let i = 0; i < jsonStr.length; i++) {
      const ch = jsonStr[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = jsonStr.substring(0, i + 1);
          try { JSON.parse(candidate); return candidate; } catch { break; }
        }
      }
    }
  }

  // 6. v0.3.3 B+++ 补丁（2026-06-13）：截断 prefix salvage（tradeoff 类）
  //   LLM 输出 maxTokens 边界时，常见模式是「N 个完整对象 + 半个对象」：
  //     {"dimensions":[{...完整...},{...完整...},{...完整...},{...半个...
  //   现象：外层 ] 和根 } 都没闭合，5 层都救不回
  //   救法：找到"dimensions":[ 后，从那开始数 [ { ] } 深度，每个 depth==1 (闭合顶层对象) 时
  //        记录 lastObjEnd。然后构造 {"dimensions":[前N个对象]} 试 parse
  const arrMatch = cleaned.match(/"dimensions"\s*:\s*\[/);
  if (arrMatch) {
    const arrayStart = arrMatch.index + arrMatch[0].length;  // "[" 之后位置
    let depth = 1, inStr = false, esc = false, lastObjEnd = -1;
    for (let i = arrayStart; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {  // 数组闭合 → 整个 LLM 输出完整
          // content 实际合法，5 层应该已经救了；这里兜底
          lastObjEnd = i;
          break;
        }
      } else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 1) {
          // 闭合一个顶层对象，跳过 , 和空白
          let j = i + 1;
          while (j < cleaned.length && /[\s,]/.test(cleaned[j])) j++;
          lastObjEnd = j;
        }
      }
    }
    if (lastObjEnd > arrayStart) {
      // 拼合法 JSON 试 parse
      const arrContent = cleaned.substring(arrayStart, lastObjEnd);
      const wrapped = `{"dimensions":${arrContent}}`;
      try {
        const parsed = JSON.parse(wrapped);
        if (parsed.dimensions && Array.isArray(parsed.dimensions) && parsed.dimensions.length > 0) {
          console.log(`[extractJSON] prefix salvage 救回 ${parsed.dimensions.length} 个对象（LLM 输出被截断）`);
          return wrapped;
        }
      } catch (e) {
        // wrapped 还非法 → 试补 [ ] （如果 arrContent 没有 [ 的话）
        const wrapped2 = `{"dimensions":[${arrContent}]}`;
        try {
          const parsed2 = JSON.parse(wrapped2);
          if (parsed2.dimensions && Array.isArray(parsed2.dimensions) && parsed2.dimensions.length > 0) {
            console.log(`[extractJSON] prefix salvage (with array wrap) 救回 ${parsed2.dimensions.length} 个对象`);
            return wrapped2;
          }
        } catch (e2) {
          console.warn(`[extractJSON] prefix salvage 仍非法: ${e.message} / ${e2.message}`);
        }
      }
    }
  }

  return null;
}

/**
 * 安全 parse：返回 parsed object 或 null（绝不抛错）
 * @param {string} content
 * @returns {object|null}
 */
// 同步 services/debug-logger.js 的公共 dump（v0.13 抽公共，避免 3 处重复）
// 注：debug-logger.js 不依赖任何 service，可安全 require（0 循环）
const { dump: _debugDump } = require('./debug-logger');

function safeParseJSON(content) {
  const jsonStr = extractJSON(content);
  if (!jsonStr) return null;
  try { return JSON.parse(jsonStr); } catch { return null; }
}

/**
 * v0.3.3 B++ 补丁（2026-06-13）：callLLM + safeParseJSON 一体化重试
 *   多多反馈"5 轮没辅助手段"——根因是 assist service 用简单 callLLM 失败一次就放弃
 *   rewrite-description 已加 retryableParse（§20），5 个 assist service 没加
 *
 * 行为：
 *   - attempt 1：temperature = opts.temperature（默认 0.4）
 *   - attempt 2（失败时）：temperature 调整为 0.3 + maxTokens+300，避开相同截断模式
 *   - 都失败 → 返回 null（让调用方 throw / 走 fallback）
 *
 * 用法：
 *   const { callLLMWithRetry } = require('./json-extractor');
 *   const parsed = await callLLMWithRetry(model, messages, { temperature: 0.4, maxTokens: 1500 });
 *   if (!parsed) throw new Error('LLM 返回无法解析为 JSON');
 *
 * @param {object} model - model-store 的 model 对象（含 id）
 * @param {Array} messages - LLM messages
 * @param {object} opts - { temperature, maxTokens, jsonMode, serviceName }
 * @returns {Promise<object|null>}
 */
async function callLLMWithRetry(model, messages, opts = {}) {
  const { callLLM } = require('./llm-adapter');
  const baseTemp = opts.temperature ?? 0.4;
  const baseMaxTokens = opts.maxTokens ?? 1500;
  const jsonMode = opts.jsonMode !== false;
  const serviceName = opts.serviceName || 'LLM';
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const thisTemp = attempt === 1 ? baseTemp : Math.max(0.1, baseTemp - 0.1);
    const thisMaxTokens = attempt === 1 ? baseMaxTokens : baseMaxTokens + 300;
    let result;
    try {
      result = await callLLM(model.id, messages, {
        temperature: thisTemp,
        maxTokens: thisMaxTokens,
        jsonMode,
      });
    } catch (e) {
      lastError = e.message;
      console.warn(`[${serviceName}] callLLM 异常（attempt ${attempt}/2）: ${e.message}`);
      continue;
    }
    const parsed = safeParseJSON(result.content);
    if (parsed) {
      if (attempt === 2) console.log(`[${serviceName}] 第 2 次重试成功`);
      _debugDump('JSON_PARSE_OK', { serviceName, attempt, parsed });
      return parsed;
    }
    // 失败时 dump 原始内容到 DEBUG 文件 + 警告到 console
    const preview = (result.content || '').slice(0, 200).replace(/\n/g, ' ');
    console.warn(`[${serviceName}] LLM 返回无法解析（attempt ${attempt}/2, temp=${thisTemp}, maxTok=${thisMaxTokens}）原文前200: ${preview}`);
    _debugDump('JSON_PARSE_FAIL', {
      serviceName, attempt, temp: thisTemp, maxTokens: thisMaxTokens,
      contentLen: result.content?.length || 0,
      fullContent: result.content,
      failHint: preview.slice(0, 100),
    });
  }
  // 两次都失败 → 抛出原始错误（如果有）或通用错误
  throw new Error(lastError || `LLM 调用失败（已重试 1 次）`);
}

module.exports = { extractJSON, safeParseJSON, callLLMWithRetry };