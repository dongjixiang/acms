// ACMS social-publisher — rich-content.js
// ==========================================
// v0.118 PR 6: 富文本数据结构（Word → 内容运营平台 → 各平台）
//
// 数据结构（rich_content 数组）：
//   [
//     { type: 'text', subtype: 'heading'|'paragraph'|'list_item', level?: 1-6,
//       text: '...', runs: [{text, bold?, italic?, underline?, color?, sizeHalfPoints?, href?}],
//       align?: 'left'|'center'|'right' },
//     { type: 'image', src: 'data:image/...', mime: 'image/png', width?: 320, height?: 200, alt?: '...' }
//   ]
//
// 双向转换：
//   richToHtml(blocks) → '<h1>标题</h1><p>正文</p><img src="data:..."/>...'
//   htmlToRich(html) → blocks（用于 LLM 改写后回填）
//
// 占位符（content-rewriter 用）：
//   toPlaceholders(blocks) → 把 image 块替换为 {{IMG_1}} 文本占位符 + 单独 images 数组
//   fromPlaceholders(text, images) → 占位符替换回 <img> 标签
//
// "use strict";

const PLACEHOLDER_REGEX = /\{\{IMG_(\d+)\}\}/g;

// ── HTML 转义 ──
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── 单个 run 转 inline HTML ──
function runToHtml(run) {
  var html = escHtml(run.text || '');
  if (!html) return '';
  // 嵌套顺序：code > bold > italic > underline > strike（按 W3C 推荐嵌套层级）
  if (run.code) html = '<code>' + html + '</code>';
  if (run.bold) html = '<strong>' + html + '</strong>';
  if (run.italic) html = '<em>' + html + '</em>';
  if (run.underline) html = '<u>' + html + '</u>';
  if (run.strike) html = '<s>' + html + '</s>';
  if (run.color) html = '<span style="color:' + escHtml(run.color) + '">' + html + '</span>';
  if (run.sizeHalfPoints) html = '<span style="font-size:' + (run.sizeHalfPoints / 2) + 'pt">' + html + '</span>';
  if (run.font) html = '<span style="font-family:\'' + escHtml(run.font) + '\'">' + html + '</span>';
  if (run.href) html = '<a href="' + escHtml(run.href) + '">' + html + '</a>';
  return html;
}

// ── 单个 block 转 HTML ──
function blockToHtml(block) {
  if (!block) return '';
  if (block.type === 'image') {
    var src = escHtml(block.src || '');
    if (!src) return '';
    var attrs = 'src="' + src + '"';
    if (block.alt) attrs += ' alt="' + escHtml(block.alt) + '"';
    if (block.width) attrs += ' width="' + Math.round(block.width) + '"';
    if (block.height) attrs += ' height="' + Math.round(block.height) + '"';
    return '<img ' + attrs + ' style="max-width:100%;height:auto"/>';
  }
  if (block.type === 'text') {
    var inner = '';
    if (block.runs && block.runs.length) {
      inner = block.runs.map(runToHtml).join('');
    } else {
      inner = escHtml(block.text || '');
    }
    var styleParts = [];
    if (block.align) styleParts.push('text-align:' + escHtml(block.align));
    var style = styleParts.length ? ' style="' + styleParts.join(';') + '"' : '';
    if (block.subtype === 'heading') {
      var lvl = Math.max(1, Math.min(6, block.level || 1));
      return '<h' + lvl + style + '>' + inner + '</h' + lvl + '>';
    }
    if (block.subtype === 'list_item') {
      return '<li' + style + '>' + inner + '</li>';
    }
    return '<p' + style + '>' + inner + '</p>';
  }
  return '';
}

// ── rich_content 数组 → HTML 字符串 ──
//   用于 provider publish 时直接 innerHTML 插入（头条 ProseMirror 等富文本编辑器）
function richToHtml(blocks, opts) {
  opts = opts || {};
  var raw = (blocks || []).map(blockToHtml).join('');
  // 如果有 list_item 块，尝试自动 wrap 成 <ul>（连续 list_item 视为同一列表）
  if (raw.indexOf('<li') !== -1) {
    raw = wrapListItems(raw);
  }
  return raw;
}

// 把连续 <li>...</li> 序列 wrap 进 <ul>...</ul>（保留中间其他标签）
function wrapListItems(html) {
  // 简化版：把所有 <li> 序列都包成 <ul>（不分组，因为前端发送时已分段）
  var inList = false;
  var out = '';
  var i = 0;
  while (i < html.length) {
    if (html.substr(i, 4) === '<li>') {
      if (!inList) { out += '<ul>'; inList = true; }
      var close = html.indexOf('</li>', i);
      if (close === -1) { out += html.substr(i); break; }
      out += html.substring(i, close + 5);
      i = close + 5;
    } else {
      if (inList) { out += '</ul>'; inList = false; }
      out += html[i];
      i++;
    }
  }
  if (inList) out += '</ul>';
  return out;
}

// ── HTML 字符串 → rich_content 数组（备用，目前简单实现）──
//   用 cheerio/jsdom 太重，简单正则解析常见标签足够
function htmlToRich(html) {
  if (!html || typeof html !== 'string') return [];
  var blocks = [];
  // 先用 <br>/<p>/<h1-6>/<li>/<img> 分块
  // 极简实现：按 \n 或块级标签 split
  var segs = html.split(/(<\/?(?:p|h[1-6]|li|ul|ol|img)[^>]*>)/i);
  var current = null;
  var inList = false;
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    if (!s) continue;
    var tagMatch = s.match(/^<(p|h([1-6])|li|ul|ol)(\s|>|\s[^>]*>)/i);
    if (s.charAt(0) === '<') {
      if (/^<img\b/i.test(s)) {
        // <img src="..." alt="..." width="..." height="..." />
        var srcMatch = s.match(/src=["']([^"']+)["']/);
        var altMatch = s.match(/alt=["']([^"']*)["']/);
        var wMatch = s.match(/width=["']?(\d+)/);
        var hMatch = s.match(/height=["']?(\d+)/);
        if (srcMatch) {
          blocks.push({
            type: 'image',
            src: srcMatch[1],
            mime: srcMatch[1].startsWith('data:image/') ? srcMatch[1].slice(5, srcMatch[1].indexOf(';')) : 'image/png',
            alt: altMatch ? altMatch[1] : undefined,
            width: wMatch ? parseInt(wMatch[1], 10) : undefined,
            height: hMatch ? parseInt(hMatch[1], 10) : undefined,
          });
        }
      } else if (/^<\/?(ul|ol)\b/i.test(s)) {
        // 列表容器开关标记（忽略，因为 wrapListItems 已经处理）
      } else if (/^<li(\s|>|\s[^>]*>)/i.test(s)) {
        // 进入 li
        if (current && current.type === 'text' && current.subtype !== 'list_item') {
          blocks.push(current);
          current = null;
        }
        if (!current || current.subtype !== 'list_item') {
          current = { type: 'text', subtype: 'list_item', text: '', runs: [] };
        }
      } else if (/^<h([1-6])(\s|>|\s[^>]*>)/i.test(s)) {
        if (current) blocks.push(current);
        var lvl = parseInt(s.match(/<h([1-6])/i)[1], 10);
        current = { type: 'text', subtype: 'heading', level: lvl, text: '', runs: [] };
      } else if (/^<p(\s|>|\s[^>]*>)/i.test(s)) {
        if (current) blocks.push(current);
        current = { type: 'text', subtype: 'paragraph', text: '', runs: [] };
      } else if (/^<\/(p|h[1-6]|li)\b/i.test(s)) {
        if (current) {
          blocks.push(current);
          current = null;
        }
      }
    } else if (current) {
      current.text = (current.text || '') + s;
      current.runs = current.runs || [];
      current.runs.push({ text: s });
    } else {
      // 没有 current block，把游离文本作为 paragraph
      if (s.trim()) {
        blocks.push({ type: 'text', subtype: 'paragraph', text: s, runs: [{ text: s }] });
      }
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// ── 占位符机制（content-rewriter 用）──
//   把 image 块替换为 {{IMG_N}} 文本占位符，单独 images 数组
function toPlaceholders(blocks) {
  var images = [];
  var newBlocks = [];
  (blocks || []).forEach(function (b) {
    if (b && b.type === 'image') {
      var idx = images.length;
      images.push({ src: b.src, mime: b.mime, width: b.width, height: b.height, alt: b.alt });
      // 插入一个 paragraph 块，含占位符
      newBlocks.push({
        type: 'text',
        subtype: 'paragraph',
        text: '{{IMG_' + (idx + 1) + '}}',
        runs: [{ text: '{{IMG_' + (idx + 1) + '}}' }],
        _placeholder_idx: idx,
      });
    } else if (b) {
      newBlocks.push(b);
    }
  });
  return { blocks: newBlocks, images: images };
}

// 把占位符文本替换回 image（content-rewriter 输出后回填）
function fromPlaceholders(blocks, images) {
  var counter = 0;
  return (blocks || []).map(function (b) {
    if (b && b.type === 'text' && typeof b.text === 'string' && PLACEHOLDER_REGEX.test(b.text)) {
      PLACEHOLDER_REGEX.lastIndex = 0;
      // 找出所有占位符
      var placeholders = [];
      var m;
      while ((m = PLACEHOLDER_REGEX.exec(b.text)) !== null) {
        placeholders.push({ idx: parseInt(m[1], 10), match: m[0], start: m.index, end: m.index + m[0].length });
      }
      if (placeholders.length === 1 && placeholders[0].start === 0 && placeholders[0].end === b.text.length) {
        // 整个块是单个占位符 → 直接换成 image 块
        var img = images[placeholders[0].idx - 1];
        if (img) return Object.assign({}, img, { type: 'image' });
      }
      // 文本块内含占位符（少见）→ 保留文本但去掉占位符
      var cleaned = b.text.replace(PLACEHOLDER_REGEX, '');
      PLACEHOLDER_REGEX.lastIndex = 0;
      return Object.assign({}, b, { text: cleaned, runs: (b.runs || []).map(function (r) { return Object.assign({}, r, { text: (r.text || '').replace(PLACEHOLDER_REGEX, '') }); }) });
    }
    return b;
  }).filter(Boolean);
}

// 把占位符文本（content-rewriter 改写后的 content 字段）替换为 <img>
//   用于 provider publish：content 已经是带 {{IMG_N}} 的文本，直接替换
function substitutePlaceholdersInText(text, images) {
  if (!text || typeof text !== 'string' || !images || !images.length) return text || '';
  return text.replace(PLACEHOLDER_REGEX, function (m, n) {
    var idx = parseInt(n, 10) - 1;
    var img = images[idx];
    if (!img || !img.src) return m;
    var attrs = 'src="' + escHtml(img.src) + '"';
    if (img.alt) attrs += ' alt="' + escHtml(img.alt) + '"';
    if (img.width) attrs += ' width="' + Math.round(img.width) + '"';
    if (img.height) attrs += ' height="' + Math.round(img.height) + '"';
    return '<img ' + attrs + ' style="max-width:100%;height:auto"/>';
  });
}

// ── 统计 ──
function stats(blocks) {
  var blocks_n = 0;
  var images_n = 0;
  var chars_n = 0;
  (blocks || []).forEach(function (b) {
    blocks_n++;
    if (b.type === 'image') images_n++;
    else if (b.text) chars_n += b.text.length;
  });
  return { blocks: blocks_n, images: images_n, chars: chars_n };
}

module.exports = {
  escHtml,
  richToHtml,
  htmlToRich,
  toPlaceholders,
  fromPlaceholders,
  substitutePlaceholdersInText,
  stats,
  PLACEHOLDER_REGEX,
};
