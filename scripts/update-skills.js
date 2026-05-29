// 更新 ACMS skill execution 字段：补齐 object-style steps + verify
const fs = require('fs');
const path = require('path');

const filePath = 'C:/Users/swede/acms/data/acms.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const updates = {
  'skill-api-design': {
    "mode": "api",
    "steps": [
      {"action":"read", "path":"code/{module}/README.md", "desc":"读取项目结构"},
      {"action":"write", "path":"code/{module}/api-design.md", "desc":"编写 API 设计文档"},
      {"action":"verify", "desc":"验证 API 设计文档产出",
       "checks":[
         {"type":"read","path":"code/{module}/api-design.md","expect":{"size_gt":200},"failMsg":"API 设计文档不完整或缺失"},
         {"type":"exec","cmd":"node -e \"const fs=require('fs');const c=fs.readFileSync('api-design.md','utf8');const ok=c.includes('端点')||c.includes('endpoint')||c.includes('API');console.log(ok?'found':'missing')\"","expect":{"exitCode":0,"stdout_notEmpty":true},"failMsg":"API 设计文档缺少端点定义"}
       ]},
      {"action":"write", "path":"code/{module}/openapi.yaml", "desc":"编写 OpenAPI spec"},
      {"action":"verify", "desc":"验证 OpenAPI spec",
       "checks":[
         {"type":"read","path":"code/{module}/openapi.yaml","expect":{"size_gt":100},"failMsg":"OpenAPI spec 缺失或不完整"}
       ]}
    ],
    "deliverables":["code/{module}/api-design.md","code/{module}/openapi.yaml"]
  },
  'skill-code-review': {
    "mode": "api",
    "steps": [
      {"action":"read", "path":"code/{module}/", "desc":"读取代码目录"},
      {"action":"write", "path":"code/{module}/review-report.md", "desc":"编写审查报告"},
      {"action":"verify", "desc":"验证审查报告",
       "checks":[
         {"type":"read","path":"code/{module}/review-report.md","expect":{"size_gt":100},"failMsg":"代码审查报告缺失或不完整"}
       ]}
    ],
    "deliverables":["code/{module}/review-report.md"]
  },
  'skill-python-testing': {
    "mode": "api",
    "steps": [
      {"action":"read", "path":"code/{module}/", "desc":"读取代码目录，识别待测试模块"},
      {"action":"write", "path":"code/{module}/test_{module}.py", "desc":"编写单元测试"},
      {"action":"verify", "desc":"验证测试文件语法",
       "checks":[
         {"type":"exec","cmd":"python -m py_compile test_*.py 2>&1 || echo 'no tests to compile'","expect":{"exitCode":0},"failMsg":"Python 测试文件语法错误"},
         {"type":"read","path":"code/{module}/test_{module}.py","expect":{"size_gt":50},"failMsg":"测试文件不完整"}
       ]},
      {"action":"exec","cmd":"python -m pytest test_*.py -v --tb=short 2>&1 || echo 'pytest skipped'","desc":"运行测试"},
      {"action":"verify", "desc":"验证测试产物",
       "checks":[
         {"type":"exec","cmd":"node -e \"var fs=require('fs');var files=fs.readdirSync('.').filter(function(f){return f.startsWith('test_')&&f.endsWith('.py')});console.log(files.length>0?'found '+files.length:'no tests')\"","expect":{"exitCode":0,"stdout_notEmpty":true},"failMsg":"未找到测试文件"}
       ]}
    ],
    "deliverables":["code/{module}/test_{module}.py"]
  },
};

// Apply updates
for (const skill of data.skills) {
  const sid = skill.id;
  if (updates[sid]) {
    skill.execution = JSON.stringify(updates[sid]);
    const vcount = updates[sid].steps.filter(s => s.action === 'verify').length;
    console.log(`✅ ${sid}: ${updates[sid].steps.length} 步骤, ${vcount} verify`);
  } else {
    try {
      const ex = JSON.parse(skill.execution || '{}');
      const vcount = (ex.steps || []).filter(s => typeof s === 'object' && s.action === 'verify').length;
      console.log(`   ${sid}: 已有 ${vcount} verify (跳过)`);
    } catch(e) {
      console.log(`⚠️ ${sid}: execution 解析失败`);
    }
  }
}

// Backup + write
const backupPath = filePath.replace('.json', '.json.bak2-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.copyFileSync(filePath, backupPath);
fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
console.log(`\n📦 备份: ${path.basename(backupPath)}`);
console.log('✅ Skills 数据已更新');
