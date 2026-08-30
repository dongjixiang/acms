// Add template event handlers and rule config dropdown

const fs = require('fs');
const path = 'client/js/views/email-inbox.js';

let content = fs.readFileSync(path, 'utf-8');

// 1. Add event handlers for template actions
const oldEvents = `        if (action === 'delete-rule') return self.deleteRule(target.getAttribute('data-rule-id'));
        // v0.36: 按 AI 分类筛选邮件`;

const newEvents = `        if (action === 'delete-rule') return self.deleteRule(target.getAttribute('data-rule-id'));
        // v0.99: 模板管理事件
        if (action === 'template-add') return self.showTemplateModal();
        if (action === 'template-edit') return self.showTemplateModal(target.getAttribute('data-tpl-id'));
        if (action === 'template-delete') return self.deleteTemplate(target.getAttribute('data-tpl-id'));
        // v0.36: 按 AI 分类筛选邮件`;

if (content.includes(oldEvents)) {
  content = content.replace(oldEvents, newEvents);
  console.log('✅ Added template event handlers');
} else {
  console.log('⚠️ Could not find event handler location');
}

// 2. Add template CRUD methods after loadTemplates
const loadTemplatesEnd = `    }).catch(function (err) {
      container.innerHTML = '<div style="font-size:11px;color:var(--red);text-align:center;padding:20px;">Failed: ' + escHtml(err.message) + '</div>';
    });
  };`;

const templateMethods = `    }).catch(function (err) {
      container.innerHTML = '<div style="font-size:11px;color:var(--red);text-align:center;padding:20px;">Failed: ' + escHtml(err.message) + '</div>';
    });
  };

  // v0.99: Show template modal (add/edit)
  EmailApp.prototype.showTemplateModal = function (tplId) {
    var self = this;
    var isEdit = !!tplId;
    var tpl = null;
    if (isEdit) {
      // Load existing template
      apiFetch('GET', '/api/email-templates').then(function (data) {
        var templates = (data && data.templates) || [];
        tpl = templates.find(function (t) { return t.id === tplId; });
        self.renderTemplateModal(tpl || null);
      }).catch(function (err) {
        self.renderTemplateModal(null);
      });
    } else {
      this.renderTemplateModal(null);
    }
  };

  EmailApp.prototype.renderTemplateModal = function (tpl) {
    var self = this;
    var title = tpl ? '编辑模板' : '新建模板';
    var html = '<div style="margin-bottom:12px;">'
      + '<label style="display:block;font-size:11px;color:var(--text2);margin-bottom:4px;font-weight:600;">模板名称</label>'
      + '<input id="tpl-name" type="text" placeholder="例如：客户咨询回复" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;" value="' + (tpl ? escHtml(tpl.name) : '') + '"/>'
      + '</div>'
      + '<div style="margin-bottom:12px;">'
      + '<label style="display:block;font-size:11px;color:var(--text2);margin-bottom:4px;font-weight:600;">模板内容</label>'
      + '<textarea id="tpl-content" style="width:100%;min-height:120px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px;color:var(--text);font-size:12px;line-height:1.5;resize:vertical;font-family:inherit;" placeholder="输入自动回复内容...">' + (tpl ? escHtml(tpl.content) : '') + '</textarea>'
      + '</div>'
      + '<div style="font-size:10px;color:var(--text3);line-height:1.4;">💡 提示：模板内容会被用于 auto_reply 规则的回复。每个规则可引用不同模板。</div>';
    
    ACMSModal.show({
      title: title,
      html: html,
      actions: [
        { label: '取消', value: 'cancel', className: 'acms-modal-btn' },
        { label: '保存', value: 'save', className: 'acms-modal-btn acms-modal-btn-primary' },
      ],
    }).then(function (result) {
      if (result !== 'save') return;
      var name = document.getElementById('tpl-name').value.trim();
      var content = document.getElementById('tpl-content').value.trim();
      if (!name || !content) {
        self.setStatus('请填写模板名称和内容', 'warning');
        return;
      }
      var payload = { name: name, content: content, mailbox: self.state.mailbox || 'INBOX' };
      if (tpl) payload.id = tpl.id;
      var method = tpl ? 'PUT' : 'POST';
      var url = tpl ? '/api/email-templates/' + encodeURIComponent(tpl.id) : '/api/email-templates';
      apiFetch(method, url, payload).then(function (data) {
        self.setStatus(tpl ? '模板已更新' : '模板已创建', 'success');
        self.loadTemplates();
      }).catch(function (err) {
        self.setStatus('操作失败：' + err.message, 'error');
      });
    });
  };

  // v0.99: Delete template
  EmailApp.prototype.deleteTemplate = function (tplId) {
    var self = this;
    ACMSModal.show({
      title: '确认删除模板',
      html: '<div style="font-size:13px;color:var(--text);">确认删除此模板？删除后引用此模板的规则将失去回复内容。</div>',
      actions: [
        { label: '取消', value: 'cancel', className: 'acms-modal-btn' },
        { label: '删除', value: 'delete', className: 'acms-modal-btn', style: 'background:var(--red);' },
      ],
    }).then(function (result) {
      if (result !== 'delete') return;
      apiFetch('DELETE', '/api/email-templates/' + encodeURIComponent(tplId)).then(function () {
        self.setStatus('模板已删除', 'success');
        self.loadTemplates();
      }).catch(function (err) {
        self.setStatus('删除失败：' + err.message, 'error');
      });
    });
  };`;

if (content.includes(loadTemplatesEnd) && !content.includes('EmailApp.prototype.showTemplateModal')) {
  content = content.replace(loadTemplatesEnd, templateMethods);
  console.log('✅ Added template CRUD methods');
} else {
  console.log('⚠️ Could not find loadTemplates end or methods already exist');
}

// 3. Add template dropdown to rule config
const oldConfigBtns = `      '    <button data-action="rule-parse" style="padding:6px 14px;border-radius:6px;background:var(--accent1);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer;" title="解析自然语言规则（不静默保存，防 P163 silent write）">🔍 解析</button>',
      '    <button data-action="rule-save" style="padding:6px 14px;border-radius:6px;background:var(--green);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer;" title="显式确认保存规则（防 P163 silent write）">✅ 确认并保存规则</button>',`;

const newConfigBtns = `      '    <button data-action="rule-parse" style="padding:6px 14px;border-radius:6px;background:var(--accent1);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer;" title="解析自然语言规则（不静默保存，防 P163 silent write）">🔍 解析</button>',
      '    <button data-action="rule-save" style="padding:6px 14px;border-radius:6px;background:var(--green);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer;" title="显式确认保存规则（防 P163 silent write）">✅ 确认并保存规则</button>',
      '  </div>',
      '  <div style="margin-top:10px;" id="rule-template-selector" class="rule-template-selector">',
      '    <span style="font-size:11px;color:var(--text2);font-weight:600;margin-right:8px;">选择回复模板：</span>',
      '    <select id="rule-template-dropdown" style="padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;min-width:200px;" title="从已有模板中选择，或留空手动输入回复内容">',
      '      <option value="">— 手动输入回复内容 —</option>',
      '    </select>',
      '    <span style="font-size:10px;color:var(--text3);margin-left:8px;">（或前往「✉️ 自动回复模板」页签管理模板）</span>',
      '  </div>',`;

if (content.includes(oldConfigBtns) && !content.includes('rule-template-selector')) {
  content = content.replace(oldConfigBtns, newConfigBtns);
  console.log('✅ Added template dropdown to rule config');
} else {
  console.log('⚠️ Could not find config buttons or dropdown already exists');
}

// 4. Load templates into dropdown after parse
const oldParseComplete = `            self.state.parsedRule = result;
            self.setStatus('✅ 解析完成，可以点击【保存】');`;

const newParseComplete = `            self.state.parsedRule = result;
            self.setStatus('✅ 解析完成，可以点击【保存】');
            // v0.99: 填充模板下拉框
            self.populateTemplateDropdown();`;

if (content.includes(oldParseComplete)) {
  content = content.replace(oldParseComplete, newParseComplete);
  console.log('✅ Added template dropdown population after parse');
} else {
  console.log('⚠️ Could not find parse completion location');
}

// 5. Add populateTemplateDropdown method
const saveRuleStart = `  EmailApp.prototype.saveRule = function () {`;
const populateMethod = `  // v0.99: Populate template dropdown
  EmailApp.prototype.populateTemplateDropdown = function () {
    var self = this;
    var dropdown = this.root.querySelector('#rule-template-dropdown');
    if (!dropdown) return;
    apiFetch('GET', '/api/email-templates').then(function (data) {
      var templates = (data && data.templates) || [];
      var currentValue = dropdown.value;
      dropdown.innerHTML = '<option value="">— 手动输入回复内容 —</option>';
      templates.forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name + ' (' + t.content.slice(0, 30) + '...)';
        dropdown.appendChild(opt);
      });
      // Restore selection if still valid
      if (currentValue && Array.from(dropdown.options).some(function (o) { return o.value === currentValue; })) {
        dropdown.value = currentValue;
      }
    }).catch(function () {
      // Silently fail - dropdown will show empty option
    });
  };

  `;

if (content.includes(saveRuleStart) && !content.includes('populateTemplateDropdown')) {
  content = content.replace(saveRuleStart, populateMethod + saveRuleStart);
  console.log('✅ Added populateTemplateDropdown method');
} else {
  console.log('⚠️ Could not find saveRule start or method already exists');
}

fs.writeFileSync(path, content, 'utf-8');
console.log('Done');
