// Replace template page UI - write directly to file

file_path = r"C:\Users\swede\acms\client\js\views\email-inbox.js"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the template section
old_start = "  // 子页面 3：自动回复模板 — 参考原型 line 215-247（双列：模板输入 + 确认卡片 + 执行链路）"
old_end = "  // 子页面 4：执行日志"

if old_start in content and old_end in content:
    # Find positions
    start_idx = content.find(old_start)
    end_idx = content.find(old_end)
    
    if start_idx != -1 and end_idx != -1:
        # Create new template management UI
        new_code = """  // 子页面 3：自动回复模板管理 — v0.99（独立维护模板，规则引用模板 ID）
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
      '    💡 <strong>Usage:</strong> Templates are reusable reply content. Rules reference templates via dropdown, not hard-coded reply text.',
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
        return \'<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;" title="ID: \' + escHtml(t.id) + \'">\\n\'
          + \'  <div style="font-weight:600;font-size:12px;color:var(--text);margin-bottom:4px;">\' + escHtml(t.name) + \'</div>\\n\'
          + \'  <div style="font-size:11px;color:var(--text2);line-height:1.4;margin-bottom:8px;max-height:60px;overflow:hidden;">\' + escHtml((t.description || t.content).slice(0, 80)) + \'</div>\\n\'
          + \'  <div style="display:flex;gap:6px;">\\n\'
          + \'    <button data-action="template-edit" data-tpl-id="\' + escHtml(t.id) + \'" style="padding:3px 10px;border-radius:4px;background:var(--bg3);color:var(--text2);font-size:10px;border:1px solid var(--border);cursor:pointer;">Edit</button>\\n\'
          + \'    <button data-action="template-delete" data-tpl-id="\' + escHtml(t.id) + \'" style="padding:3px 10px;border-radius:4px;background:var(--red);color:#fff;font-size:10px;border:none;cursor:pointer;">Delete</button>\\n\'
          + \'  </div>\\n\'
          + \'</div>\';
      }).join(\'\');
    }).catch(function (err) {
      container.innerHTML = \'<div style="font-size:11px;color:var(--red);text-align:center;padding:20px;">Failed: \' + escHtml(err.message) + \'</div>\';
    });
  };

'''
        
        # Replace the old code
        new_content = content[:start_idx] + new_code + content[end_idx:]
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("✅ Replaced template page with template management UI")
    else:
        print(f"⚠️ Could not find boundaries: start={start_idx}, end={end_idx}")
else:
    print("⚠️ Could not find markers")
