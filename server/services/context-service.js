// 上下文分层注入服务 — 从 Markdown description 提取结构化摘要
// Layer 0: 任务目标 + 前置接口签名 + 产出签名 + 验收命令 (~500字)
// Layer 1: Layer 0 + depends_contract 详情 + 涉及文件列表 (~3500字)
// Layer 2: Layer 0+1 + wiki_context + 父需求 SRS + 参考资料 (~5500字)

/**
 * 从 Markdown description 中提取指定 section
 * @param {string} md - 完整的 Markdown 文本
 * @param {string} sectionName - 章节标题 (如 "任务目标", "前置条件")
 * @returns {string} 章节内容 (不含标题行)
 */
function extractSection(md, sectionName) {
  if (!md) return '';
  const regex = new RegExp(`##\\s+${escapeRegex(sectionName)}([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const match = md.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * 解析列表项 (支持 Markdown 无序列表: - item, * item)
 * @param {string} text - 包含列表的文本
 * @returns {string[]} 清理后的列表项
 */
function parseListItems(text) {
  if (!text) return [];
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^[-*]\s/.test(line))
    .map(line => line.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

/**
 * 从「前置条件」section 提取简化的依赖接口签名
 * 过滤掉无关信息(环境要求等)，只保留接口签名
 * @param {string} md - 完整 Markdown
 * @returns {{ interfaces: string[], files: string[], env: string[] }}
 */
function extractPrerequisites(md) {
  const section = extractSection(md, '前置条件');
  const items = parseListItems(section);
  
  const interfaces = [];
  const files = [];
  const env = [];
  
  for (const item of items) {
    if (/依赖接口|接口契约|接口签名/i.test(item)) {
      // 提取接口签名部分 (":" 后面的内容)
      const sigPart = item.replace(/^[^:：]*[:：]\s*/, '').trim();
      if (sigPart) interfaces.push(sigPart);
    } else if (/依赖文件|只读文件|需要.*文件/i.test(item)) {
      const filePart = item.replace(/^[^:：]*[:：]\s*/, '').trim();
      if (filePart) files.push(...filePart.split(/[,，、]\s*/));
    } else if (/环境|Node|npm|版本|运行时/i.test(item)) {
      env.push(item);
    } else {
      // 无法分类的也放进 interfaces (可能是未标注的接口信息)
      interfaces.push(item);
    }
  }
  
  return { interfaces, files, env };
}

/**
 * 从「接口产出」section 提取产出签名
 * @param {string} md - 完整 Markdown
 * @returns {{ files: string[], signatures: string[] }}
 */
function extractOutputs(md) {
  const section = extractSection(md, '接口产出');
  const items = parseListItems(section);
  
  const files = [];
  const signatures = [];
  
  for (const item of items) {
    if (/产出文件|输出文件|文件路径/i.test(item)) {
      const filePart = item.replace(/^[^:：]*[:：]\s*/, '').trim();
      if (filePart) files.push(...filePart.split(/[,，、]\s*/));
    } else if (/导出|export|函数签名|类签名/i.test(item)) {
      signatures.push(item);
    } else {
      // 未标注的输出信息
      signatures.push(item);
    }
  }
  
  return { files, signatures };
}

/**
 * 从「涉及文件」section 提取文件操作清单
 * @param {string} md - 完整 Markdown
 * @returns {{ create: string[], modify: string[], read: string[] }}
 */
function extractFiles(md) {
  const section = extractSection(md, '涉及文件');
  const items = parseListItems(section);
  
  const files = { create: [], modify: [], read: [] };
  
  for (const item of items) {
    const match = item.match(/^(.+?)\s*[\(（](新建|修改|只读|创建|读取)[\)）]/);
    if (match) {
      const path = match[1].trim();
      const op = match[2];
      if (/新建|创建/.test(op)) files.create.push(path);
      else if (/修改/.test(op)) files.modify.push(path);
      else if (/只读|读取/.test(op)) files.read.push(path);
    } else {
      // 未标注的，也放进 create
      files.create.push(item);
    }
  }
  
  return files;
}

/**
 * 构建 Layer 0 上下文 — 紧凑摘要，目标控制在 500 字以内
 * @param {object} task - 任务对象
 * @param {object[]} dependsContract - 解析后的依赖契约
 */
function buildLayer0(task, dependsContract = []) {
  const desc = task.description || '';
  const goal = extractSection(desc, '任务目标') || task.title || '';
  const prereq = extractPrerequisites(desc);
  const outputs = extractOutputs(desc);
  const acceptance = extractSection(desc, '验收方式') || '';
  
  // 合并 depends_contract 中的接口信息到前置条件
  const contractSignatures = [];
  if (dependsContract && dependsContract.length > 0) {
    for (const dc of dependsContract) {
      if (dc.contract) contractSignatures.push(`${dc.file || ''}: ${dc.contract}`);
    }
  }
  
  return {
    _layer: 0,
    _estimatedChars: 0, // 由调用方计算
    taskId: task.id,
    title: task.title,
    type: task.type,
    priority: task.priority,
    goal: goal.substring(0, 200), // 截断保护
    prerequisites: {
      interfaces: [...prereq.interfaces, ...contractSignatures],
      files: prereq.files,
      env: prereq.env,
    },
    outputs: {
      files: outputs.files,
      signatures: outputs.signatures,
    },
    acceptance: acceptance.substring(0, 300),
    dependsOn: task.depends_on ? JSON.parse(task.depends_on) : [],
  };
}

/**
 * 构建 Layer 1 上下文 — Layer 0 + 依赖契约详情 + 涉及文件
 */
function buildLayer1(task, dependsContract = []) {
  const layer0 = buildLayer0(task, dependsContract);
  const desc = task.description || '';
  const files = extractFiles(desc);
  const implementationHints = extractSection(desc, '实现要点') || '';
  
  return {
    ...layer0,
    _layer: 1,
    dependsContract: dependsContract || [],
    files: {
      create: files.create,
      modify: files.modify,
      read: files.read,
    },
    implementationHints: implementationHints.substring(0, 500),
    workspaceHint: `GET /api/workspace/files/${task.project_id} 查看完整文件列表`,
  };
}

/**
 * 构建 Layer 2 上下文 — Layer 1 + Wiki 资料 + 父需求完整信息
 */
function buildLayer2(task, dependsContract = [], parentRequirement = null) {
  const layer1 = buildLayer1(task, dependsContract);
  const desc = task.description || '';
  const references = extractSection(desc, '参考资料') || '';
  const notes = extractSection(desc, '注意事项') || '';
  
  const result = {
    ...layer1,
    _layer: 2,
    wikiContext: task.wiki_context || '',
    linkedWiki: task.linked_wiki ? JSON.parse(task.linked_wiki) : [],
    references: references,
    notes: notes,
  };
  
  if (parentRequirement) {
    result.parentRequirement = parentRequirement;
  }
  
  return result;
}

/**
 * 构建完整上下文 (兼容旧版, = Layer 2)
 */
function buildFullContext(task, dependsContract = [], parentRequirement = null) {
  return buildLayer2(task, dependsContract, parentRequirement);
}

/**
 * 估算上下文字符数
 */
function estimateChars(context) {
  return JSON.stringify(context).length;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  extractSection,
  parseListItems,
  extractPrerequisites,
  extractOutputs,
  extractFiles,
  buildLayer0,
  buildLayer1,
  buildLayer2,
  buildFullContext,
  estimateChars,
};
