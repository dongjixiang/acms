// 知识库扫描引擎
// 插件式扫描管道：FileTypeDetector → ScannerPipeline → AIKnowledgeSynthesizer

const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const knowledgeService = require('./knowledge-service');
const { collection } = require('../db/connection');
const { callLLM } = require('./llm-adapter');

const { execSync } = require('child_process');

// ════════════════════════════════════════════
//  1. 文件类型识别器
// ════════════════════════════════════════════

const FILE_TYPES = {
  // 文档
  'document/markdown': { exts: ['.md', '.markdown'], priority: 1 },
  'document/text':     { exts: ['.txt', '.rst', '.version', '.settings'],      priority: 2 },
  'document/pdf':      { exts: ['.pdf'],               priority: 1 },
  // 代码
  'code/javascript':   { exts: ['.js', '.mjs'],       priority: 1 },
  'code/typescript':   { exts: ['.ts'],                priority: 1 },
  'code/jsx':          { exts: ['.jsx', '.tsx'],       priority: 1 },
  'code/vue':          { exts: ['.vue'],               priority: 1 },
  'code/python':       { exts: ['.py'],                priority: 1 },
  'code/java':         { exts: ['.java'],              priority: 2 },
  'code/css':          { exts: ['.css', '.scss', '.less'], priority: 2 },
  'code/html':         { exts: ['.html', '.htm'],      priority: 2 },
  'code/xml':          { exts: ['.xml'],                priority: 2 },
  'code/sql':          { exts: ['.sql'],               priority: 1 },
  // 配置
  'config/json':       { exts: ['.json'],              priority: 1 },
  'config/yaml':       { exts: ['.yaml', '.yml'],      priority: 1 },
  'config/toml':       { exts: ['.toml'],              priority: 2 },
  'config/env':        { exts: ['.env', '.env.example'], priority: 2 },
  // 图片
  'image/png':         { exts: ['.png'],               priority: 1 },
  'image/jpeg':        { exts: ['.jpg', '.jpeg'],      priority: 1 },
  'image/svg':         { exts: ['.svg'],               priority: 1 },
  'image/webp':        { exts: ['.webp'],              priority: 2 },
  'image/gif':         { exts: ['.gif'],               priority: 2 },
  // 架构/数据
  'schema/prisma':     { exts: ['.prisma'],            priority: 1 },
  // 音频
  'audio/mp3':         { exts: ['.mp3'],                priority: 1 },
  'audio/wav':         { exts: ['.wav', '.wave'],       priority: 1 },
  'audio/flac':        { exts: ['.flac'],               priority: 1 },
  'audio/ogg':         { exts: ['.ogg'],                priority: 2 },
  'audio/m4a':         { exts: ['.m4a'],                priority: 2 },
  'audio/wma':         { exts: ['.wma'],                priority: 2 },
  // 视频
  'video/mp4':         { exts: ['.mp4'],                priority: 1 },
  'video/avi':         { exts: ['.avi'],                priority: 2 },
  'video/mkv':         { exts: ['.mkv'],                priority: 2 },
  'video/mov':         { exts: ['.mov'],                priority: 2 },
  'video/webm':        { exts: ['.webm'],               priority: 2 },
  'video/flv':         { exts: ['.flv'],                priority: 2 },
  // 压缩包（特殊处理）
  'archive/zip':       { exts: ['.zip'],               priority: 0 },
  'archive/rp':        { exts: ['.rp'],                priority: 0 },
  'archive/fig':       { exts: ['.fig'],               priority: 0 },
  'archive/targz':     { exts: ['.tar.gz', '.tgz'],    priority: 0 },
};

function detectFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();

  // 处理双扩展名
  if (basename.endsWith('.tar.gz') || basename.endsWith('.tgz')) {
    return { type: 'archive/targz', subtype: 'targz', ext: '.tar.gz' };
  }

  for (const [type, info] of Object.entries(FILE_TYPES)) {
    if (info.exts.includes(ext)) {
      return { type, subtype: ext.replace('.', ''), ext };
    }
  }

  return { type: 'unknown', subtype: ext.replace('.', '') || 'none', ext };
}

// ════════════════════════════════════════════
//  2. 压缩包提取器
// ════════════════════════════════════════════

function extractArchive(archivePath, extractDir) {
  const ext = path.extname(archivePath).toLowerCase();
  const basename = path.basename(archivePath).toLowerCase();

  // .rp (Axure), .fig (Figma) 都是 zip 格式
  if (ext === '.zip' || ext === '.rp' || ext === '.fig') {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(extractDir, true);
    return extractDir;
  }

  if (basename.endsWith('.tar.gz') || basename.endsWith('.tgz')) {
    // 需要子进程调用 tar
    const { execSync } = require('child_process');
    execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, { stdio: 'pipe' });
    return extractDir;
  }

  throw new Error(`不支持的压缩格式: ${ext}`);
}

// 递归扫描解压目录
function listExtractedFiles(extractDir, baseDir) {
  const results = [];
  if (!fs.existsSync(extractDir)) return results;

  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(extractDir, entry.name);
    const relPath = path.join(baseDir || '', entry.name);
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      // 检查是否包含另一个压缩包（嵌套）
      const nestedZip = fs.readdirSync(fullPath).find(f => f.endsWith('.zip') || f.endsWith('.tar.gz') || f.endsWith('.tgz'));
      if (nestedZip) {
        const nestedPath = path.join(fullPath, nestedZip);
        const nestedExtractDir = path.join(extractDir, '_nested_' + nestedZip.replace(/\./g, '_'));
        try {
          extractArchive(nestedPath, nestedExtractDir);
          results.push(...listExtractedFiles(nestedExtractDir, path.join(relPath, nestedZip.replace(/\.(zip|tar\.gz|tgz)$/, ''))));
        } catch (e) {
          // 嵌套解压失败，跳过
        }
      }
      results.push(...listExtractedFiles(fullPath, relPath));
    } else {
      results.push({ fullPath, relPath, size: entry.isFile() ? fs.statSync(fullPath).size : 0 });
    }
  }
  return results;
}

// ════════════════════════════════════════════
//  3. 扫描器注册表
// ════════════════════════════════════════════

// 每个扫描器实现：{ type, match(fileType), scan(filePath, content) -> findings[] }

const scanners = [];

// ── 3a. 文档扫描器 ──

scanners.push({
  name: 'scanner-document',
  match(fileType) { return fileType.startsWith('document/'); },
  scan(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8').slice(0, 10000); // 取前 10K
    const lines = content.split('\n');
    const title = lines[0]?.replace(/^#+\s*/, '').replace(/^---\s*$/, '').trim() || path.basename(filePath);
    const wordCount = content.split(/\s+/).length;
    const headings = content.match(/^#{1,4}\s+.+$/gm) || [];

    return {
      findings: [
        {
          kind: 'document',
          title,
          summary: title,
          lineCount: lines.length,
          wordCount,
          headingCount: headings.length,
          headings: headings.slice(0, 10).map(h => h.trim()),
        },
      ],
      summary: `📄 ${title} — ${lines.length} 行, ${wordCount} 词`,
    };
  },
});

// ── 3b. 代码结构扫描器 ──

scanners.push({
  name: 'scanner-code-structure',
  match(fileType) { return ['code/javascript', 'code/typescript', 'code/jsx', 'code/vue', 'code/python'].includes(fileType); },
  scan(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const findings = [];
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    // 检测导出/定义的组件、函数、类
    const exportRegex = /(?:export\s+(?:default\s+)?)?(?:function|class|const|let|var)\s+(\w+)/g;
    let m;
    while ((m = exportRegex.exec(content)) !== null) {
      findings.push({ kind: 'export', name: m[1], file: filename, line: content.substring(0, m.index).split('\n').length });
    }

    // 检测 Vue SFC 组件名
    if (ext === '.vue') {
      const nameMatch = content.match(/name:\s*['"](\w+)['"]/);
      if (nameMatch) {
        findings.push({ kind: 'component', name: nameMatch[1], file: filename, framework: 'Vue' });
      }
      // 检测 props
      const propsMatch = content.match(/props:\s*\{([^}]+)\}/);
      if (propsMatch) {
        const props = propsMatch[1].split(',').map(p => p.trim().split(':')[0].trim()).filter(Boolean);
        findings.push({ kind: 'props', name: filename.replace('.vue', ''), props, file: filename });
      }
    }

    // 检测 import/require 依赖
    const importMatches = content.matchAll(/(?:import\s+.+?\s+from\s+['"]|require\s*\(\s*['"])([^'"]+)['"]/g);
    const imports = [];
    for (const im of importMatches) {
      imports.push(im[1]);
    }
    if (imports.length > 0) {
      findings.push({ kind: 'dependencies', name: filename, imports: [...new Set(imports)], count: imports.length, file: filename });
    }

    // 检测 Python 类/函数
    if (ext === '.py') {
      const pyClassRegex = /^(?:async\s+)?(?:class|def)\s+(\w+)/gm;
      while ((m = pyClassRegex.exec(content)) !== null) {
        findings.push({ kind: 'python-def', name: m[1], file: filename, line: content.substring(0, m.index).split('\n').length });
      }
    }

    return {
      findings,
      summary: `🔧 ${filename} — 发现 ${findings.length} 个结构定义`,
    };
  },
});

// ── 3c. API 路由扫描器 ──

scanners.push({
  name: 'scanner-api-routes',
  match(fileType) { return ['code/javascript', 'code/typescript'].includes(fileType); },
  scan(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const findings = [];
    const filename = path.basename(filePath);

    // Express 路由模式: router.get/post/put/delete('/path', ...)
    const routeRegex = /(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = routeRegex.exec(content)) !== null) {
      findings.push({
        kind: 'api-route',
        method: m[1].toUpperCase(),
        path: m[2],
        file: filename,
        line: content.substring(0, m.index).split('\n').length,
      });
    }

    return {
      findings,
      summary: `🌐 ${filename} — 发现 ${findings.length} 个路由`,
    };
  },
});

// ── 3d. 数据模型扫描器 ──

scanners.push({
  name: 'scanner-data-model',
  match(fileType) { return ['code/sql', 'schema/prisma'].includes(fileType); },
  scan(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const findings = [];
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.sql') {
      // 检测 CREATE TABLE
      const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?\w+`?\.)?`?(\w+)`?\s*\(([\s\S]*?)\);/gi;
      let m;
      while ((m = tableRegex.exec(content)) !== null) {
        const fields = m[2].split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('--') && !l.startsWith('/*') && !l.startsWith('PRIMARY') && !l.startsWith('INDEX') && !l.startsWith('KEY') && !l.startsWith('CONSTRAINT') && !l.startsWith(')'))
          .map(l => l.split(/\s+/)[0])
          .filter(Boolean);
        findings.push({ kind: 'table', name: m[1], fields: [...new Set(fields)], file: filename });
      }
    }

    if (ext === '.prisma') {
      const modelRegex = /model\s+(\w+)\s+\{([^}]+)\}/g;
      let m;
      while ((m = modelRegex.exec(content)) !== null) {
        const fields = m[2].split('\n')
          .map(l => l.trim().split(/\s+/)[0])
          .filter(l => l && !l.startsWith('//') && l !== '');
        findings.push({ kind: 'model', name: m[1], fields, file: filename });
      }
    }

    return {
      findings,
      summary: `🗄️ ${filename} — 发现 ${findings.length} 个数据模型`,
    };
  },
});

// ── 3e. 配置文件扫描器 ──

scanners.push({
  name: 'scanner-config',
  match(fileType) { return fileType.startsWith('config/'); },
  scan(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8').slice(0, 5000);
    const filename = path.basename(filePath);
    const findings = [];
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.json') {
      try {
        const parsed = JSON.parse(content);
        const keys = Object.keys(parsed).slice(0, 20);
        findings.push({ kind: 'config', name: filename, keys, format: 'json' });
      } catch (e) {
        findings.push({ kind: 'config', name: filename, note: 'JSON 解析失败', format: 'json' });
      }
    } else {
      // yaml/env: 提取 key=value 行
      const lines = content.split('\n').filter(l => l.includes('=') || l.includes(':'));
      const pairs = lines.slice(0, 10).map(l => l.split(/[=:]/)[0].trim()).filter(Boolean);
      findings.push({ kind: 'config', name: filename, keys: pairs, format: ext.replace('.', '') });
    }

    return {
      findings,
      summary: `⚙️ ${filename} — ${findings.length > 0 ? findings[0].keys?.length + ' 个配置项' : '解析完成'}`,
    };
  },
});

// ── 3f. 图片扫描器（升级版）──

scanners.push({
  name: 'scanner-image',
  match(fileType) { return fileType.startsWith('image/'); },
  scan(filePath) {
    const filename = path.basename(filePath);
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const findings = [{
      kind: 'image',
      name: filename,
      nameNoExt: filename.replace(/\.[^.]+$/, ''),
      size: stat.size,
      format: ext.replace('.', ''),
      filePath,  // 保留路径供后续 AI 分析
      aiDescription: null,  // 由 AI 填充
      aiTags: [],
    }];

    return {
      findings,
      summary: `🖼️ ${filename} (${(stat.size / 1024).toFixed(1)}KB)`,
    };
  },
});

// ── 3g. HTML 结构扫描器 ──

scanners.push({
  name: 'scanner-html',
  match(fileType) { return fileType === 'code/html'; },
  scan(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);
    const findings = [];

    // 提取标题
    const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : filename;

    // 提取 meta description
    const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    const description = descMatch ? descMatch[1] : '';

    // 提取所有 link/script src
    const links = [];
    const linkRegex = /<(?:link|script)\s[^>]*?(?:href|src)\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = linkRegex.exec(content)) !== null) {
      links.push(m[1]);
    }

    // 提取页面中的可见文本量
    const bodyContent = (content.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [,''])[1];
    const textOnly = bodyContent.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const textLength = textOnly.length;

    findings.push({
      kind: 'html-page',
      name: filename,
      title,
      description,
      links: [...new Set(links)],
      textLength,
      hasBody: !!bodyContent.trim(),
    });

    return {
      findings,
      summary: `🌐 ${title} — ${links.length} 个资源, ${textLength} 字正文`,
    };
  },
});

// ── 3h. XML 结构扫描器 ──

scanners.push({
  name: 'scanner-xml',
  match(fileType) { return fileType === 'code/xml'; },
  scan(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8').slice(0, 5000);
    const filename = path.basename(filePath);
    const findings = [];

    // 提取根元素
    const rootMatch = content.match(/<(\w+)(?:\s[^>]*)?>/);
    const rootElement = rootMatch ? rootMatch[1] : 'unknown';

    // 提取所有顶层元素
    const topElements = [];
    const elemRegex = /<(\w+)(?:\s[^>]*)?>/g;
    let m;
    const seen = new Set();
    while ((m = elemRegex.exec(content)) !== null) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        topElements.push(m[1]);
      }
    }

    // 检测是否为特定格式
    let format = 'generic';
    if (content.includes('<xsl:stylesheet') || content.includes('<?xml-stylesheet')) format = 'xslt';
    else if (content.includes('<svg')) format = 'svg';
    else if (content.includes('<rss') || content.includes('<feed')) format = 'rss';

    findings.push({
      kind: 'xml-doc',
      name: filename,
      rootElement,
      elements: topElements.slice(0, 20),
      format,
      elementCount: seen.size,
    });

    return {
      findings,
      summary: `📄 ${filename} — ${format === 'generic' ? '' : format + ' '}根元素 <${rootElement}>, ${seen.size} 个元素类型`,
    };
  },
});

// ── 3i. Axure/Figma 原型文件分析器 ──

scanners.push({
  name: 'scanner-prototype',
  match(fileType) { return ['archive/rp', 'archive/fig'].includes(fileType); },
  scan(filePath) {
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);
    const tool = ext === '.rp' ? 'Axure RP' : 'Figma';
    const findings = [];

    // 检查文件内是否有关键结构
    const extractedDir = null; // 运行时不实际解压，scanFile 会单独处理
    findings.push({
      kind: 'prototype-project',
      name: filename.replace(/\.[^.]+$/, ''),
      tool,
      size: stat.size,
      pages: '(解压后分析)',
    });

    return {
      findings,
      summary: `📐 ${tool} 原型: ${filename} (${(stat.size / 1024).toFixed(1)}KB)`,
    };
  },
});

// ── 3j. 音视频文件扫描器（ffprobe元数据）──

scanners.push({
  name: 'scanner-media',
  match(fileType) { return fileType.startsWith('audio/') || fileType.startsWith('video/'); },
  scan(filePath) {
    const filename = path.basename(filePath);
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const isVideo = ext.match(/\.(mp4|avi|mkv|mov|webm|flv)$/i);
    const kind = isVideo ? 'video-file' : 'audio-file';
    const findings = [];
    let metadata = {};

    // 用 ffprobe 提取元数据
    try {
      const output = execSync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      if (output) {
        const parsed = JSON.parse(output);
        const format = parsed.format || {};
        const streams = parsed.streams || [];

        // 通用格式信息
        metadata.format = format.format_name || ext.replace('.', '');
        metadata.duration = format.duration ? parseFloat(format.duration).toFixed(1) + 's' : 'unknown';
        metadata.bitrate = format.bit_rate ? (parseInt(format.bit_rate) / 1000).toFixed(0) + 'kbps' : 'unknown';
        metadata.size = stat.size;

        // 视频流信息
        const videoStream = streams.find(s => s.codec_type === 'video');
        if (videoStream) {
          metadata.width = videoStream.width || '?';
          metadata.height = videoStream.height || '?';
          metadata.codec = videoStream.codec_name || '?';
          metadata.fps = videoStream.r_frame_rate || '?';
          // 简化 fps
          if (metadata.fps && metadata.fps.includes('/')) {
            const parts = metadata.fps.split('/');
            metadata.fps = (parseInt(parts[0]) / parseInt(parts[1])).toFixed(1) + 'fps';
          }
        }

        // 音频流信息
        const audioStream = streams.find(s => s.codec_type === 'audio');
        if (audioStream) {
          metadata.audioCodec = audioStream.codec_name || '?';
          metadata.sampleRate = audioStream.sample_rate ? (parseInt(audioStream.sample_rate) / 1000).toFixed(0) + 'kHz' : '?';
          metadata.channels = audioStream.channels || '?';
        }
      }
    } catch (e) {
      // ffprobe 失败不影响主流程
      metadata.error = e.message.slice(0, 100);
    }

    findings.push({
      kind,
      name: filename,
      nameNoExt: filename.replace(/\.[^.]+$/, ''),
      size: stat.size,
      format: ext.replace('.', ''),
      metadata,
      isVideo: !!isVideo,
      thumbnailPath: null, // 由外部填充
    });

    const durationStr = metadata.duration !== 'unknown' ? ` (${metadata.duration})` : '';
    const dims = metadata.width ? ` ${metadata.width}x${metadata.height}` : '';
    return {
      findings,
      summary: `${isVideo ? '🎬' : '🎵'} ${filename}${durationStr}${dims}`,
    };
  },
});

// ════════════════════════════════════════════
//  4. AI 文件内容分析（含智能路由）
// ════════════════════════════════════════════

// 通用：调用 LLM 分析文件内容
async function analyzeFileWithLLM(promptText, imagePath, maxTokens = 1500) {
  try {
    const modelStore = require('../stores/model-store');
    const allModels = modelStore.list();
    const model = allModels.find(m => m.status === 'active') || allModels[0];
    if (!model) return null;

    if (imagePath && fs.existsSync(imagePath)) {
      // 视觉分析（图片）
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Data = imageBuffer.toString('base64');
      const ext = path.extname(imagePath).toLowerCase();
      const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
      const mimeType = mimeMap[ext] || 'image/png';
      const api = model.api || 'openai-chat';

      if (api === 'anthropic-messages') {
        const messages = [{ role: 'user', content: [{ type: 'text', text: promptText }, { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } }] }];
        const result = await callLLM(model.id, messages, { temperature: 0.3, maxTokens });
        return result.content;
      } else {
        const messages = [{ role: 'user', content: [{ type: 'text', text: promptText }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }] }];
        const result = await callLLM(model.id, messages, { temperature: 0.3, maxTokens });
        return result.content;
      }
    } else {
      // 纯文本分析
      const result = await callLLM(model.id, [{ role: 'user', content: promptText }], { temperature: 0.3, maxTokens });
      return result.content;
    }
  } catch (e) {
    console.log(`[Scanner] AI analysis failed: ${e.message}`);
    return null;
  }
}

// 提取 JSON 工具
function extractJSONStrict(text) {
  if (!text) return null;
  let clean = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').replace(/^\*+|\*+$/g, '').trim();
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first !== -1 && last > first) clean = clean.slice(first, last + 1);
  try { return JSON.parse(clean); } catch { return null; }
}

// ── 根据 AI 分析生成有意义的文件名 ──

function generateMeaningfulName(name, finding) {
  // 1. 如果是图片且有 AI 描述
  if (finding.kind === 'image') {
    // 数据提取模式：用 dataType
    if (finding.isDataExtraction && finding.aiDataType) {
      const base = cleanFileName(finding.aiDataType);
      if (base) return base;
    }
    // 有 AI 描述：用描述的前半部分
    if (finding.aiDescription) {
      const base = cleanFileName(finding.aiDescription);
      if (base) return base;
    }
    // 有用途描述
    if (finding.aiPurpose) {
      const base = cleanFileName(finding.aiPurpose);
      if (base) return base;
    }
  }

  // 2. 代码文件：用 AI 总结
  if (finding.aiSummary) {
    const base = cleanFileName(finding.aiSummary);
    if (base) return base;
  }

  // 3. 文档：用 AI 主题
  if (finding.aiSummary) {
    const base = cleanFileName(finding.aiSummary);
    if (base) return base;
  }

  // 4. 回退：用原始文件名（去扩展名）
  return name.replace(/\.[^.]+$/, '').replace(/^\d{4}-\d{2}-\d{2}_/, '');
}

function cleanFileName(text) {
  if (!text) return '';
  // 取前 20 个中文字符或英文字符
  let cleaned = text
    .replace(/[^\w\u4e00-\u9fff-]/g, '')  // 只保留中文、英文、数字、连字符
    .replace(/_+/g, '_')
    .slice(0, 24);
  // 去掉首尾的非字母数字
  cleaned = cleaned.replace(/^[\d_]+/, '').replace(/[\d_]+$/, '');
  return cleaned || '';
}

// ── 图片 AI 分析 + 智能路由（含数据提取模式）──

async function analyzeImageWithAI(imageFinding, projectId, wikiVaultPath, purpose) {
  const { filePath, name } = imageFinding;
  if (!filePath || !fs.existsSync(filePath)) return;

  const purposeHint = purpose ? `\n用户上传目的: ${purpose}` : '';

  // 检测是否进入数据提取模式
  const dataExtractionKeywords = ['收集', '提取', '属性', '数据', '列表', '参数', '数值', '指数',
    '武将', '角色', '人物', '统计', '表格', '对比', 'collect', 'extract', 'stats', 'attributes'];
  const isDataExtraction = purpose && dataExtractionKeywords.some(kw => purpose.includes(kw));

  let promptText, maxTokens;

  if (isDataExtraction) {
    // 数据提取模式：从图片中提取结构化实体数据
    maxTokens = 4000;
    promptText = `仔细分析这张图片（文件名: ${name}）${purposeHint}。
请提取图片中所有可见的实体及其属性数据，输出 JSON：

{
  "description": "一句话概括图片内容（10-20字）",
  "dataType": "提取的数据类型（如：武将属性、商品列表、用户信息等）",
  "items": [
    {
      "name": "实体名称/姓名",
      "attributes": { "属性名1": "值", "属性名2": "值" }
    }
  ],
  "summary": "数据汇总说明，如共有几项、关键发现等"
}

注意：
- 每个实体一行，属性字段从图片中提取
- 不要遗漏任何可见的实体
- 数值型和文本型都要提取
- 如果图片中有表格，按行提取`;
  } else {
    // 通用描述模式
    maxTokens = 1500;
    promptText = `分析这张图片（文件名: ${name}）${purposeHint}，输出 JSON：
{
  "description": "10-20字概括",
  "detail": "50-100字详细描述（元素、风格、色调、用途）",
  "tags": ["标签1", "标签2"],
  "style": "图片风格（写实/卡通/像素/UI截图/照片/图标/其他）",
  "purpose": "推测用途（角色头像/UI界面/图标/截图/架构图/背景图/其他）"
}`;
  }

  const content = await analyzeFileWithLLM(promptText, filePath, maxTokens);
  if (!content) return;

  const parsed = extractJSONStrict(content);
  if (parsed) {
    imageFinding.aiDescription = parsed.description || '';
    imageFinding.aiDetail = parsed.detail || '';
    imageFinding.aiTags = parsed.tags || [];
    imageFinding.aiStyle = parsed.style || '';
    imageFinding.aiPurpose = parsed.purpose || '';
    // 数据提取模式特有字段
    imageFinding.aiDataType = parsed.dataType || '';
    imageFinding.aiItems = parsed.items || [];
    imageFinding.aiDataSummary = parsed.summary || '';
    imageFinding.isDataExtraction = isDataExtraction;
  } else {
    imageFinding.aiDescription = content.replace(/^["']|["']$/g, '').slice(0, 200);
  }

  // === 智能路由：匹配现有知识库，决定更新哪个页面 ===
  if (!parsed && !imageFinding.aiDescription) return;

  const queryText = [
    imageFinding.aiDescription || '',
    imageFinding.aiDetail || '',
    ...(imageFinding.aiTags || []),
    name.replace(/\.[^.]+$/, ''),
  ].filter(Boolean).join(' ');

  try {
    const knowledgeMatcher = require('./knowledge-matcher');
    const matches = knowledgeMatcher.matchRequirement(projectId, wikiVaultPath, queryText, '');

    // 如果找到高相关度匹配，更新那个页面
    const highMatch = matches.find(m => m.relevance === 'high');
    const mediumMatch = matches.find(m => m.relevance === 'medium');

    if (highMatch) {
      // 高匹配：更新已有页面
      imageFinding.targetPage = highMatch.pagePath;
      imageFinding.targetReason = `high_match: ${highMatch.title}`;
      imageFinding.matchScore = highMatch.score;
      console.log(`[Scanner] Image "${name}" → routed to ${highMatch.pagePath} (${highMatch.relevance})`);
    } else if (mediumMatch && imageFinding.aiPurpose && !isGenericImage(imageFinding)) {
      // 中匹配 + 不是通用图片 → 更新该页面
      imageFinding.targetPage = mediumMatch.pagePath;
      imageFinding.targetReason = `medium_match: ${mediumMatch.title}`;
      imageFinding.matchScore = mediumMatch.score;
      console.log(`[Scanner] Image "${name}" → routed to ${mediumMatch.pagePath} (${mediumMatch.relevance})`);
    }
    // 没有匹配 → 创建新 entity 页面（原有逻辑）
  } catch (e) {
    // 匹配失败不影响主流程
  }
}

// 判断是否通用型图片（不需要独立页面）
function isGenericImage(finding) {
  const genericPurposes = ['图标', 'icon', '背景图', 'background', '装饰', 'decoration'];
  const purpose = (finding.aiPurpose || '').toLowerCase();
  for (const gp of genericPurposes) {
    if (purpose.includes(gp)) return true;
  }
  return false;
}

async function analyzeAllImages(findings, projectId, wikiVaultPath, purpose) {
  const imageFindings = findings.filter(f => f.kind === 'image' && f.filePath);
  for (const img of imageFindings) {
    await analyzeImageWithAI(img, projectId, wikiVaultPath, purpose);
  }
}

// ── 代码文件 AI 语义分析 ──

async function analyzeCodeWithAI(codeFinding, projectId, wikiVaultPath, purpose) {
  const { filePath, name, sourceFile } = codeFinding;
  const displayPath = sourceFile || name || path.basename(filePath || '');
  if (!filePath || !fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf-8').slice(0, 3000);
  const ext = path.extname(filePath).toLowerCase();

  const langNames = { '.js': 'JavaScript', '.ts': 'TypeScript', '.vue': 'Vue', '.py': 'Python', '.java': 'Java', '.jsx': 'React JSX', '.tsx': 'React TSX' };
  const lang = langNames[ext] || '代码';
  const purposeHint = purpose ? `\n上传目的（请重点关注）: ${purpose}` : '';

  const promptText = `分析以下${lang}文件（${displayPath}）的功能。${purposeHint}输出 JSON：
{
  "summary": "一句话概括这个模块的功能（15-30字）",
  "responsibility": "这个模块的核心职责是什么",
  "keyFunctions": ["关键函数或导出1", "关键函数或导出2"]
}

代码内容：
\`\`\`${ext.slice(1)}
${content}
\`\`\``;

  const result = await analyzeFileWithLLM(promptText);
  if (!result) return;

  const parsed = extractJSONStrict(result);
  if (parsed) {
    codeFinding.aiSummary = parsed.summary || '';
    codeFinding.aiResponsibility = parsed.responsibility || '';
    codeFinding.aiKeyFunctions = parsed.keyFunctions || [];
  }
}

// ── 文档 AI 语义摘要 ──

async function analyzeDocWithAI(docFinding, projectId, wikiVaultPath, purpose) {
  const { filePath, name, sourceFile } = docFinding;
  const displayPath = sourceFile || name || path.basename(filePath || '');
  if (!filePath || !fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf-8').slice(0, 3000);
  const purposeHint = purpose ? `\n上传目的（请重点关注）: ${purpose}` : '';

  const promptText = `分析以下文档（${displayPath}）内容。${purposeHint}输出 JSON：
{
  "summary": "15-25字概括文档主题",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "relevantModules": ["可能相关的模块名"]
}

文档内容：
${content.slice(0, 2000)}`;

  const result = await analyzeFileWithLLM(promptText);
  if (!result) return;

  const parsed = extractJSONStrict(result);
  if (parsed) {
    docFinding.aiSummary = parsed.summary || '';
    docFinding.aiKeyPoints = parsed.keyPoints || [];
  }
}

// ── 统一 AI 富化入口 ──

async function enrichAllFindingsWithAI(findings, projectId, wikiVaultPath, purpose) {
  // 1. 图片：AI 视觉分析 + 智能路由
  await analyzeAllImages(findings, projectId, wikiVaultPath, purpose);

  // 2. 代码文件：AI 语义分析（传目的）
  const codeFindings = findings.filter(f =>
    ['component', 'export', 'python-def', 'api-route'].includes(f.kind) && f.filePath
  );
  for (const cf of codeFindings) {
    await analyzeCodeWithAI(cf, projectId, wikiVaultPath, purpose);
  }

  // 3. 文档：AI 语义摘要（传目的）
  const docFindings = findings.filter(f => f.kind === 'document' && f.filePath);
  for (const df of docFindings) {
    await analyzeDocWithAI(df, projectId, wikiVaultPath, purpose);
  }

  // 4. HTML/XML：AI 语义分析（传目的）
  const markupFindings = findings.filter(f =>
    ['html-page', 'xml-doc'].includes(f.kind) && f.filePath
  );
  for (const mf of markupFindings) {
    await analyzeDocWithAI(mf, projectId, wikiVaultPath, purpose);
  }

  // 5. 音视频：AI 语义分析 + 视频缩略图视觉分析
  const mediaFindings = findings.filter(f =>
    ['audio-file', 'video-file'].includes(f.kind) && f.filePath
  );
  for (const mf of mediaFindings) {
    await analyzeDocWithAI(mf, projectId, wikiVaultPath, purpose);
    // 视频：提取关键帧做视觉分析
    if (mf.kind === 'video-file' && mf.filePath && fs.existsSync(mf.filePath)) {
      try {
        const thumbDir = path.join(
          knowledgeService.getKnowledgePath(projectId, wikiVaultPath),
          'raw', 'extracted', '.thumbs'
        );
        fs.mkdirSync(thumbDir, { recursive: true });
        const thumbPath = path.join(thumbDir, path.basename(mf.filePath) + '.jpg');
        if (!fs.existsSync(thumbPath)) {
          execSync(
            `ffmpeg -i "${mf.filePath}" -vframes 1 -q:v 2 "${thumbPath}" -y`,
            { stdio: 'pipe', timeout: 15000 }
          );
        }
        if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
          // 用 AI 视觉分析缩略图
          const visionPrompt = `分析这段视频的截图内容。输出 JSON：
{
  "description": "10-20字概括画面内容",
  "detail": "画面中的元素、场景、人物、动作等",
  "tags": ["标签1", "标签2"],
  "style": "画面风格",
  "sceneType": "场景类型（游戏/UI/实拍/动画/其他）"
}`;
          const visionResult = await analyzeFileWithLLM(visionPrompt, thumbPath, 1500);
          if (visionResult) {
            const parsed = extractJSONStrict(visionResult);
            if (parsed) {
              mf.videoThumbnail = {
                description: parsed.description || '',
                detail: parsed.detail || '',
                tags: parsed.tags || [],
                style: parsed.style || '',
                sceneType: parsed.sceneType || '',
              };
            }
          }
        }
      } catch (e) {
        // 缩略图提取失败不影响主流程
      }
    }
  }
}

// ════════════════════════════════════════════
//  4. 扫描管道编排
// ════════════════════════════════════════════

function runScannerPipeline(filePath) {
  const fileType = detectFileType(filePath);
  const results = [];

  // 找到匹配的扫描器
  const matched = scanners.filter(s => s.match(fileType.type));
  if (matched.length === 0) {
    return { fileType, findings: [], summary: `⏭️ ${path.basename(filePath)} — 无可用的扫描器 (${fileType.type})` };
  }

  for (const scanner of matched) {
    try {
      const result = scanner.scan(filePath);
      results.push(result);
    } catch (e) {
      results.push({ findings: [], summary: `❌ ${scanner.name}: ${e.message}` });
    }
  }

  // 合并所有 findings
  const allFindings = results.flatMap(r => r.findings);
  const allSummaries = results.map(r => r.summary).filter(Boolean);

  return {
    fileType,
    findings: allFindings,
    summaries: allSummaries,
    summary: allSummaries.join(' | '),
  };
}

// ════════════════════════════════════════════
//  5. AI 知识合成引擎
// ════════════════════════════════════════════

function synthesizeKnowledge(projectId, wikiVaultPath, scanResults, sourceFile) {
  const findings = scanResults.findings || [];
  if (findings.length === 0) return { created: 0, updated: 0, skipped: true, reason: '无发现' };

  let created = 0;
  let updated = 0;

  // 按类型分组 findings
  const grouped = {};
  for (const f of findings) {
    const group = f.kind || 'unknown';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(f);
  }

  // 处理每个分组的发现
  for (const [kind, items] of Object.entries(grouped)) {
    if (kind === 'dependencies' || kind === 'config') continue; // 这些信息做摘要，不单独成页

    // 决定目标页面路径
    let pagePath;
    let pageTitle;
    let pageType;

    switch (kind) {
      case 'api-route':
        pagePath = 'architecture/api-routes.md';
        pageTitle = 'API 路由清单';
        pageType = 'architecture';
        break;
      case 'table':
      case 'model':
        pagePath = 'architecture/data-model.md';
        pageTitle = '数据模型';
        pageType = 'architecture';
        break;
      case 'component':
      case 'export':
      case 'python-def':
        // 每个文件一个 entity 页面
        const firstItem = items[0];
        pagePath = `entities/${firstItem.name || firstItem.file?.replace(/\.\w+$/, '')}.md`;
        pageTitle = firstItem.name || firstItem.file;
        pageType = 'entity';
        break;
      case 'document':
        pagePath = 'concepts/document-summary.md';
        pageTitle = '文档摘要';
        pageType = 'concept';
        break;
      case 'html-page':
        pagePath = 'architecture/pages.md';
        pageTitle = '页面清单';
        pageType = 'architecture';
        break;
      case 'xml-doc':
        pagePath = 'architecture/data-model.md';
        pageTitle = '数据模型 (XML)';
        pageType = 'architecture';
        break;
      case 'prototype-project':
        pagePath = 'architecture/prototypes.md';
        pageTitle = '原型设计';
        pageType = 'architecture';
        break;
      case 'audio-file':
        pagePath = 'media/audio.md';
        pageTitle = '音频资源';
        pageType = 'entity';
        break;
      case 'video-file':
        pagePath = 'media/video.md';
        pageTitle = '视频资源';
        pageType = 'entity';
        break;
      case 'image':
        // 智能路由：如果 AI 分析出了 targetPage，更新目标页面
        const img = items[0];
        if (img.targetPage) {
          pagePath = img.targetPage;
          pageTitle = img.targetPage.replace('.md', '').split('/').pop();
          pageType = 'entity';
        } else {
          // 使用 AI 生成的有意义文件名
          const meaningfulName = generateMeaningfulName(img.nameNoExt || img.name, img);
          pagePath = `entities/${meaningfulName}.md`;
          pageTitle = meaningfulName;
          pageType = 'entity';
        }
        break;
      case 'props':
        // 已包含在 component 页面中，不需要单独页面
        continue;
      default:
        pagePath = `entities/${kind}.md`;
        pageTitle = kind;
        pageType = 'entity';
    }

    // 读取已有页面或创建新的
    let existingContent = knowledgeService.readPage(projectId, wikiVaultPath, pagePath);
    const now = new Date().toISOString().split('T')[0];

    if (existingContent) {
      // 更新已有页面
      let updateNote;
      if (kind === 'image') {
        // 图片更新：包含 AI 分析结果
        const item = items[0];
        updateNote = `\n\n---\n\n### 🖼️ 图片更新于 ${now}\n\n来源: \`${sourceFile}\`\n\n`;
        if (item.aiDescription) {
          updateNote += `**${item.aiDescription}**\n\n`;
          updateNote += `${item.aiDetail || ''}\n\n`;
          updateNote += `| 文件名 | 格式 | 大小 | 风格 | 用途 |\n`;
          updateNote += `|------|------|------|------|------|\n`;
          updateNote += `| \`${item.name}\` | ${item.format} | ${(item.size / 1024).toFixed(1)}KB | ${item.aiStyle || '?'} | ${item.aiPurpose || '?'} |\n`;
          if (item.aiTags && item.aiTags.length > 0) {
            updateNote += `\n标签: ${item.aiTags.map(t => `\`${t}\``).join(', ')}\n`;
          }
          // 数据提取模式：追加表格
          if (item.isDataExtraction && item.aiItems && item.aiItems.length > 0) {
            updateNote += `\n#### 📊 提取数据: ${item.aiDataType || '实体列表'}\n\n`;
            if (item.aiDataSummary) updateNote += `${item.aiDataSummary}\n\n`;
            const allAttrs = [...new Set(item.aiItems.flatMap(i => Object.keys(i.attributes || {})))];
            if (allAttrs.length > 0) {
              updateNote += `| 名称 | ${allAttrs.join(' | ')} |\n`;
              updateNote += `|------|${allAttrs.map(() => '------').join('|')}|\n`;
              for (const row of item.aiItems) {
                const vals = allAttrs.map(a => row.attributes?.[a] || '-');
                updateNote += `| ${row.name} | ${vals.join(' | ')} |\n`;
              }
            } else {
              for (const row of item.aiItems) {
                const attrs = Object.entries(row.attributes || {});
                updateNote += `- **${row.name}**: ${attrs.map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
              }
            }
          }
        } else {
          updateNote += `新增图片: \`${item.name}\` (${(item.size / 1024).toFixed(1)}KB)\n`;
        }
      } else {
        updateNote = `\n\n---\n\n### 更新于 ${now}\n\n来源: \`${sourceFile}\`\n\n`;
        const itemsList = items.map(i => `- \`${i.name || i.path || JSON.stringify(i)}\``).join('\n');
        updateNote += itemsList;
      }
      knowledgeService.writePage(projectId, wikiVaultPath, pagePath, existingContent + updateNote);
      updated++;
    } else {
      // 创建新页面
      let body = '';
      if (kind === 'api-route') {
        body = items.map(i => `| ${i.method} | \`${i.path}\` | ${i.file}:${i.line} |`).join('\n');
        body = `| 方法 | 路径 | 位置 |\n|------|------|------|\n${body}`;
      } else if (kind === 'table' || kind === 'model') {
        body = items.map(i => `### ${i.name}\n\n字段: ${i.fields.join(', ')}`).join('\n\n');
      } else if (kind === 'component' || kind === 'export' || kind === 'python-def') {
        const item = items[0];
        body = `定义位置: \`${item.file}\`${item.line ? `:${item.line}` : ''}`;
        if (item.props) {
          body += `\n\n属性: ${item.props.join(', ')}`;
        }
        if (item.aiSummary) {
          body += `\n\n### AI 语义分析\n\n**${item.aiSummary}**\n\n职责: ${item.aiResponsibility || '未分析'}`;
          if (item.aiKeyFunctions && item.aiKeyFunctions.length > 0) {
            body += `\n\n关键函数: ${item.aiKeyFunctions.map(f => `\`${f}\``).join(', ')}`;
          }
        }
      } else if (kind === 'document') {
        const item = items[0];
        body = `源文件: \`${item.name}\`\n\n行数: ${item.lineCount}\n\n标题: ${item.title}`;
        if (item.headings && item.headings.length > 0) {
          body += `\n\n## 章节结构\n\n${item.headings.map(h => `- ${h}`).join('\n')}`;
        }
        if (item.aiSummary) {
          body += `\n\n### AI 摘要\n\n**${item.aiSummary}**`;
          if (item.aiKeyPoints && item.aiKeyPoints.length > 0) {
            body += `\n\n要点:\n${item.aiKeyPoints.map(p => `- ${p}`).join('\n')}`;
          }
        }
      } else if (kind === 'html-page') {
        const item = items[0];
        body = `| 属性 | 值 |\n|------|-----|\n`;
        body += `| 页面标题 | ${item.title} |\n`;
        body += `| 文件名 | \`${item.name}\` |\n`;
        if (item.description) body += `| 描述 | ${item.description} |\n`;
        body += `| 正文长度 | ${item.textLength} 字 |\n`;
        if (item.links && item.links.length > 0) {
          body += `\n### 引用的资源\n\n${item.links.map(l => `- \`${l}\``).join('\n')}\n`;
        }
        if (item.aiSummary) {
          body += `\n### AI 分析\n\n**${item.aiSummary}**\n`;
          if (item.aiKeyPoints) body += `${item.aiKeyPoints.map(p => `- ${p}`).join('\n')}\n`;
        }
      } else if (kind === 'xml-doc') {
        const item = items[0];
        body = `| 属性 | 值 |\n|------|-----|\n`;
        body += `| 文件名 | \`${item.name}\` |\n`;
        body += `| 根元素 | <${item.rootElement}> |\n`;
        body += `| 格式 | ${item.format} |\n`;
        body += `| 元素类型数 | ${item.elementCount} |\n`;
        if (item.elements && item.elements.length > 0) {
          body += `\n### 元素结构\n\n${item.elements.map(e => `- \`<${e}>\``).join('\n')}\n`;
        }
        if (item.aiSummary) {
          body += `\n### AI 分析\n\n**${item.aiSummary}**\n`;
        }
      } else if (kind === 'prototype-project') {
        const item = items[0];
        body = `| 属性 | 值 |\n|------|-----|\n`;
        body += `| 工具 | ${item.tool} |\n`;
        body += `| 文件 | \`${item.name}\` |\n`;
        if (item.size) body += `| 大小 | ${(item.size / 1024).toFixed(1)}KB |\n`;
        if (item.pages) body += `| 页面数 | ${item.pages} |\n`;
        if (item.designDocuments) body += `| 设计文档组件 | ${item.designDocuments} |\n`;
        if (item.styleSheets) body += `| 样式组件 | ${item.styleSheets} |\n`;
        if (item.masters) body += `| 母版页 | ${item.masters} |\n`;
        if (item.totalComponents) body += `| 组件总数 | ${item.totalComponents} |\n`;
        body += `\n> 此文件是 ${item.tool} 原型项目（压缩包格式）。系统已自动解压并分析了内部的\n> 文件结构，识别到 ${item.pages || '?'} 个页面和 ${item.totalComponents || '?'} 个组件。\n`;
        if (!item.pages && !item.totalComponents) {
          body += `>\n> ⚠️ 由于 Axure RP 使用专有二进制格式（.rppkg），系统无法解析页面内的具体\n> 内容。如需更详细的分析，请发布为 HTML 原型后再上传。\n`;
        }
      } else if (kind === 'audio-file' || kind === 'video-file') {
        const item = items[0];
        const m = item.metadata || {};
        const icon = kind === 'video-file' ? '🎬' : '🎵';
        body = `| 属性 | 值 |\n|------|-----|\n`;
        body += `| 文件名 | \`${item.name}\` |\n`;
        body += `| 格式 | ${m.format || item.format} |\n`;
        body += `| 大小 | ${(item.size / 1024).toFixed(1)}KB |\n`;
        if (m.duration && m.duration !== 'unknown') body += `| 时长 | ${m.duration} |\n`;
        if (m.bitrate && m.bitrate !== 'unknown') body += `| 码率 | ${m.bitrate} |\n`;
        if (kind === 'video-file') {
          if (m.width) body += `| 分辨率 | ${m.width}x${m.height} |\n`;
          if (m.codec) body += `| 编码 | ${m.codec} |\n`;
          if (m.fps && m.fps !== '?') body += `| 帧率 | ${m.fps} |\n`;
        } else {
          if (m.audioCodec && m.audioCodec !== '?') body += `| 音频编码 | ${m.audioCodec} |\n`;
          if (m.sampleRate && m.sampleRate !== '?') body += `| 采样率 | ${m.sampleRate} |\n`;
          if (m.channels) body += `| 声道 | ${m.channels} |\n`;
        }
        if (item.aiSummary) {
          body += `\n### AI 分析\n\n${item.aiSummary}\n`;
          if (item.aiKeyPoints) body += `${item.aiKeyPoints.map(p => `- ${p}`).join('\n')}\n`;
        }
        // 视频缩略图视觉分析
        if (item.videoThumbnail) {
          const vt = item.videoThumbnail;
          body += `\n### 🎬 视频画面分析\n\n**${vt.description}**\n\n${vt.detail || ''}\n`;
          if (vt.tags && vt.tags.length > 0) {
            body += `\n标签: ${vt.tags.map(t => `\`${t}\``).join(', ')}\n`;
          }
        }
      } else if (kind === 'image') {
        const item = items[0];
        const hasAI = item.aiDescription;
        body = `| 属性 | 值 |\n|------|-----|\n`;
        body += `| 文件名 | \`${item.name}\` |\n`;
        body += `| 格式 | ${item.format} |\n`;
        body += `| 大小 | ${(item.size / 1024).toFixed(1)}KB |\n`;
        if (hasAI) {
          body += `| 风格 | ${item.aiStyle || '未知'} |\n`;
          body += `| 用途 | ${item.aiPurpose || '未知'} |\n`;
          body += `\n## AI 视觉分析\n\n**${item.aiDescription}**\n\n${item.aiDetail || ''}\n\n`;
          if (item.aiTags && item.aiTags.length > 0) {
            body += `标签: ${item.aiTags.map(t => `\`${t}\``).join(', ')}\n`;
          }
          // 数据提取模式：渲染表格
          if (item.isDataExtraction && item.aiItems && item.aiItems.length > 0) {
            body += `\n---\n### 📊 提取数据: ${item.aiDataType || '实体列表'}\n\n`;
            if (item.aiDataSummary) body += `${item.aiDataSummary}\n\n`;
            // 收集所有属性名
            const allAttrs = [...new Set(item.aiItems.flatMap(i => Object.keys(i.attributes || {})))];
            if (allAttrs.length > 0) {
              body += `| 名称 | ${allAttrs.join(' | ')} |\n`;
              body += `|------|${allAttrs.map(() => '------').join('|')}|\n`;
              for (const row of item.aiItems) {
                const vals = allAttrs.map(a => row.attributes?.[a] || '-');
                body += `| ${row.name} | ${vals.join(' | ')} |\n`;
              }
            } else {
              // 无通用属性，逐项列出
              for (const row of item.aiItems) {
                const attrs = Object.entries(row.attributes || {});
                body += `- **${row.name}**: ${attrs.map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
              }
            }
            body += '\n';
          }
        } else {
          body += `\n> ⚠️ 未进行 AI 视觉分析。点击「重新扫描」触发分析。\n`;
        }
      } else {
        body = items.map(i => `- ${i.name || i.file || JSON.stringify(i)}`).join('\n');
      }

      const pageContent = `---
title: ${pageTitle}
type: ${pageType}
created: ${now}
updated: ${now}
tags: [${kind}]
sources:
  - raw/user-uploads/${sourceFile}
confidence: medium
---

# ${pageTitle}

> 由扫描器自动生成，来源: \`${sourceFile}\`

${body}
`;
      knowledgeService.writePage(projectId, wikiVaultPath, pagePath, pageContent);
      created++;
    }
  }

  return { created, updated, skipped: false, grouped: Object.keys(grouped) };
}

// ════════════════════════════════════════════
//  6. 更新 index.md
// ════════════════════════════════════════════

function updateIndexAfterScan(projectId, wikiVaultPath) {
  const tree = knowledgeService.listKnowledgeTree(projectId, wikiVaultPath);
  const pageFiles = tree.filter(t => t.type === 'file' && !['index.md', 'log.md', 'SCHEMA.md'].includes(t.name));

  // 按目录分组
  const sections = {};
  for (const f of pageFiles) {
    const dir = path.dirname(f.path);
    const section = dir === '.' ? '其他' : dir.charAt(0).toUpperCase() + dir.slice(1);
    if (!sections[section]) sections[section] = [];
    sections[section].push(f);
  }

  let indexContent = `# 项目知识索引

> 知识库全量目录
> 更新: ${new Date().toISOString().split('T')[0]}
> 页面总数: ${pageFiles.length}

`;

  for (const [section, files] of Object.entries(sections)) {
    indexContent += `## ${section}\n\n`;
    for (const f of files) {
      const name = f.name.replace('.md', '');
      // 尝试读取标题
      const pageContent = knowledgeService.readPage(projectId, wikiVaultPath, f.path);
      let summary = '';
      if (pageContent) {
        const titleMatch = pageContent.match(/^title:\s*(.+)$/m);
        summary = titleMatch ? titleMatch[1].trim() : name;
      }
      indexContent += `- [[${name}]] — ${summary}\n`;
    }
    indexContent += '\n';
  }

  knowledgeService.writePage(projectId, wikiVaultPath, 'index.md', indexContent);
}

// ════════════════════════════════════════════
//  6b. 原型项目结构分析器
// ════════════════════════════════════════════

function analyzePrototypeStructure(extractDir, originalName) {
  try {
    const dirs = fs.readdirSync(extractDir, { withFileTypes: true });
    const findings = [];

    // 1. 检测 Axure RP 版本
    const versionFile = dirs.find(d => d.isFile() && d.name.endsWith('.version'));
    if (versionFile) {
      const versionContent = fs.readFileSync(path.join(extractDir, versionFile.name), 'utf-8');
      const versionMatch = versionContent.match(/<Version>([^<]+)<\/Version>/);
      const version = versionMatch ? versionMatch[1].trim() : '未知';
      findings.push({
        kind: 'document',
        title: `Axure RP 版本信息`,
        summary: `Axure RP ${version}`,
        lineCount: versionContent.split('\n').length,
        wordCount: versionContent.split(/\s+/).length,
        headingCount: 0,
        headings: [],
      });
    }

    // 2. 统计页面
    const pageFile = dirs.find(d => d.isDirectory() && d.name === 'Page');
    let pageCount = 0;
    if (pageFile) {
      const pageDir = path.join(extractDir, 'Page');
      pageCount = countRppkgFiles(pageDir);
    }

    // 3. 统计设计文档/母版/样式
    const designDocFiles = countRppkgFiles(path.join(extractDir, 'DesignDocument'));
    const styleSheetFiles = countRppkgFiles(path.join(extractDir, 'StyleSheet'));
    const masterCount = countRppkgFiles(path.join(extractDir, 'Master')) || 0;

    const totalWidgets = pageCount + designDocFiles + styleSheetFiles;

    findings.push({
      kind: 'prototype-project',
      name: originalName.replace(/\.rp$/, ''),
      tool: 'Axure RP',
      pages: pageCount,
      designDocuments: designDocFiles,
      styleSheets: styleSheetFiles,
      masters: masterCount,
      totalComponents: totalWidgets,
    });

    return findings;
  } catch (e) {
    console.log(`[Scanner] Prototype structure analysis failed: ${e.message}`);
    return null;
  }
}

function countRppkgFiles(dir) {
  try {
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    const walk = (d) => {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.isFile() && e.name.endsWith('.rppkg')) count++;
      }
    };
    walk(dir);
    return count;
  } catch { return 0; }
}

// ════════════════════════════════════════════
//  7. 完整扫描流程
// ════════════════════════════════════════════

async function scanFile(projectId, wikiVaultPath, fileRecordId) {
  const record = knowledgeService.getFileRecord(fileRecordId);
  if (!record) throw new Error('文件记录不存在');

  // 更新状态为 scanning
  knowledgeService.updateFileStatus(fileRecordId, 'scanning');

  try {
    const uploadPath = path.join(
      knowledgeService.getKnowledgePath(projectId, wikiVaultPath),
      'raw', 'user-uploads', record.filename
    );

    if (!fs.existsSync(uploadPath)) {
      knowledgeService.updateFileStatus(fileRecordId, 'failed', { error: '文件不存在' });
      return { status: 'failed', error: '文件不存在' };
    }

    const fileType = detectFileType(uploadPath);
    const isArchive = fileType.type.startsWith('archive/');

    let allFindings = [];
    let allSummaries = [];
    let extractedFiles = [];

    if (isArchive) {
      // 先对压缩包本身运行扫描器（如 Axure/Figma 项目汇总）
      const archiveResult = runScannerPipeline(uploadPath);
      allFindings.push(...archiveResult.findings.map(f => ({ ...f, sourceFile: record.filename })));
      if (archiveResult.summaries) allSummaries.push(...archiveResult.summaries);

      // 解压压缩包
      const extractDir = path.join(
        knowledgeService.getKnowledgePath(projectId, wikiVaultPath),
        'raw', 'extracted', record.filename.replace(/\.(zip|tar\.gz|tgz|rp|fig)$/, '')
      );
      fs.mkdirSync(extractDir, { recursive: true });

      extractArchive(uploadPath, extractDir);
      extractedFiles = listExtractedFiles(extractDir);

      // 递归扫描每个解压后的文件
      for (const ef of extractedFiles) {
        const result = runScannerPipeline(ef.fullPath);
        allFindings.push(...result.findings.map(f => ({ ...f, sourceFile: ef.relPath })));
        if (result.summaries) allSummaries.push(...result.summaries);
      }

      // 对解压后的项目结构做 AI 分析（Axure RP / Figma 原型）
      if (fileType.type === 'archive/rp' || fileType.type === 'archive/fig') {
        const structuralFindings = analyzePrototypeStructure(extractDir, record.original_name);
        if (structuralFindings) {
          allFindings.push(...structuralFindings.map(f => ({ ...f, sourceFile: record.filename })));
        }
      }

      allSummaries.push(`📦 ${record.original_name}: ${extractedFiles.length} 个文件`);
    } else {
      // 单文件扫描
      const result = runScannerPipeline(uploadPath);
      allFindings = result.findings;
      if (result.summaries) allSummaries = result.summaries;
    }

    // AI 文件内容分析 + 智能路由（在合成之前）
    const uploadPurpose = record.notes || '';
    await enrichAllFindingsWithAI(allFindings, projectId, wikiVaultPath, uploadPurpose);

    // AI 知识合成
    const synthesis = synthesizeKnowledge(projectId, wikiVaultPath, {
      findings: allFindings,
    }, record.filename);

    // 更新 index.md
    updateIndexAfterScan(projectId, wikiVaultPath);

    // 写 log
    const logEntryParts = [
      `scan | ${record.original_name}`,
      synthesis.created ? `创建 ${synthesis.created} 页` : null,
      synthesis.updated ? `更新 ${synthesis.updated} 页` : null,
      extractedFiles.length ? `${extractedFiles.length} 个文件` : null,
    ].filter(Boolean);
    knowledgeService.appendLog(projectId, wikiVaultPath, logEntryParts.join(' — '));

    // 更新记录状态
    const scanReport = {
      findings: allFindings.length,
      summaries: allSummaries,
      synthesis,
      extractedCount: extractedFiles.length,
    };
    knowledgeService.updateFileStatus(fileRecordId, 'scanned', scanReport);

    return { status: 'scanned', findings: allFindings.length, extractedFiles: extractedFiles.length, synthesis };
  } catch (e) {
    knowledgeService.updateFileStatus(fileRecordId, 'failed', { error: e.message });
    return { status: 'failed', error: e.message };
  }
}

module.exports = {
  detectFileType,
  extractArchive,
  runScannerPipeline,
  scanFile,
  synthesizeKnowledge,
  updateIndexAfterScan,
  analyzeAllImages,
  enrichAllFindingsWithAI,
  analyzeFileWithLLM,
};
