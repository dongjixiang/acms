// Fix template page UI
const fs = require('fs');
const path = 'client/js/views/email-inbox.js';

let content = fs.readFileSync(path, 'utf-8');

// Find the old template section and replace it
const startMarker = '  // 子页面 3：自动回复模板 — 参考原型 line 215-247（双列：模板输入 + 确认卡片 + 执行链路）';
const endMarker = '  // 子页面 4：执行日志';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.log('Could not find markers. start:', startIndex, 'end:', endIndex);
  process.exit(1);
}

const newSection = `  // 子页面 3：自动回复模板管理 — v0.99（独立维护模板，规则引用模板 ID）
  EmailApp.prototype.renderRulesSubTemplate = function () {
    var self = this;
    return [
      '<section>',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
      '    <h3 style="font-size:13px;font-weight:700;color:var(--text);margin:0;"><span style="width:3px;height:16px;border-radius:2px;background:var(--accent1);display:inline-block;margin-right:6px;"></span>✉️ 自动回复模板库</h3>',
      '    <button data-action="template-add" style="padding:6px 14px;border-radius:6px;background:var(--accent1);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;" title="新建回复模板">+++ 新建模板</button>',
      '  </div>',
      '  <div data-role="template-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;" title="自动回复模板列表（每个规则可引用一个模板）">',
      '    <div style="font-size:11px;color:var(--text3);text-align:center;padding:20px;background:var(--bg);border:1px solid var(--border);border-radius:8px;grid-column:1/-1;">Loading...</div>',
      '  </div>',
      '  <div style="margin-top:12px;padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--text2);line-height:1.5;" title="模板使用说明：规则配置时从下拉菜单选择模板，不直接在规则中编写回复内容">',
      '    💡 <strong>Usage:</strong> Templates are reusable reply content. Rules reference templates via dropdown.',
      '  </div>',
      '</section>',
    ].join(\'\');
    // Load templates after render
    setTimeout(function () { self.loadTemplates(); }, 50);
  };

  // v0.99: Load template list
  EmailApp.prototype.loadTemplates = function () {
    var self = this;
    var container = this.root.querySelector(\'[data-role="template-list"]\');
    if (!container) return;
    apiFetch(\'GET\', \'/api/email-templates\').then(function (data) {
      var templates = (data && data.templates) || [];
      if (!templates.length) {
        container.innerHTML = \'<div style="font-size:11px;color:var(--text3);text-align:center;padding:20px;background:var(--bg);border:1px solid var(--border);border-radius:8px;grid-column:1/-1;">No templates yet. Click "New Template" to add one.</div>\';
        return;
      }
      container.innerHTML = templates.map(function (t) {
        return \'<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;" title="ID: \' + escHtml(t.id) + \'">\';
      }).join(\'\');
    }).catch(function (err) {
      container.innerHTML = \'<div style="font-size:11px;color:var(--red);text-align:center;padding:20px;">Failed: \' + escHtml(err.message) + \'</div>\';
    });
  };

`;

const newContent = content.substring(0, startIndex) + newSection + content.substring(endIndex);
fs.writeFileSync(path, newContent, 'utf-8');
console.log('✅ Template page UI updated');
