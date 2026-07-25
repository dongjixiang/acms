// ACMS 图标选择器 — emoji 网格 + 自定义输入
// 返回 Promise<emoji string | null>
// 使用：const icon = await showIconPicker({ current: '🌐', title: '选择应用图标' });

(function() {
  'use strict';

  // ── 常用 emoji 分类（大幅扩充：~450 个，适合 Windows/桌面应用场景）──
  var CATEGORIES = [
    {
      name: '文件夹 & 存储',
      emojis: ['📁','📂','🗂️','🗄️','🗃️','📀','💾','💿','📀','💽','📦','🗳️','💼','🎒','📥','📤','🗀','🗁','🗋','🖴','🖵','🖶','🖷'],
    },
    {
      name: '文件 & 文档',
      emojis: ['📄','📃','📜','📑','📝','📓','📔','📕','📖','📗','📘','📙','📚','📰','🗞️','📇','📋','🗒️','🗓️','🧾','📟','🖹','🖺','🖻','🖼','🗊','🗐','🖉'],
    },
    {
      name: '应用 & 工具 (常用)',
      emojis: ['💻','🖥️','🖨️','⌨️','🖱️','🖲️','🕹️','📱','📲','🖍️','🖌️','✂️','📎','🖇️','📌','📍','🧷','📐','📏','✏️','🖊️','🖋️','✒️','🖍️'],
    },
    {
      name: '系统 & 设置',
      emojis: ['⚙️','🔧','🛠️','🔩','🧰','🪛','🔨','🪚','🪓','🧲','🔗','⛓️','🧹','🪣','🧽','🪄','🪜','🗜️','⚗️','🧬','⚖️','📡','🔬','🔭'],
    },
    {
      name: '账户 & 安全',
      emojis: ['👤','👥','👪','🛡️','🔐','🔒','🔓','🔑','🗝️','🪪','📛','🎫','🆔','🔏','🔐','🛂','🛃','🛄','🛅','👮','🕵️','💂','🧑‍💼'],
    },
    {
      name: 'AI & 智能',
      emojis: ['🤖','🧠','💡','🔮','⚡','✨','🌟','⭐','💫','🎯','🧪','🔬','🔄','⏳','🧬','🎓','🧑‍🔬','🧑‍💻','🧑‍🏫','🧑‍⚕️','🧑‍🔧','📊','📈','📉'],
    },
    {
      name: '数据 & 分析',
      emojis: ['📊','📈','📉','🗄️','🗃️','🧮','🔢','📋','🔍','🔎','📏','📐','⚖️','🗳️','📀','💿','📇','🧾','📑','📝','📊','📈','📉','🔖'],
    },
    {
      name: '开发 & 编程',
      emojis: ['💻','⌨️','🖥️','🖱️','🗄️','🔌','🖨️','📟','🖲️','🧑‍💻','🖇️','🔗','📋','📐','📏','🔧','🧰','🗂️','📄','🔨','⚙️','🛠️','🧑‍🔧'],
    },
    {
      name: '网络 & 通信',
      emojis: ['🌐','🔗','📡','📶','📧','📨','📩','💬','💭','🗨️','🗩','🗪','🗫','✉️','📤','📥','📲','📞','📠','📟','📪','📫','📬','📭','📮','📯','📰','🗞️','🔔','🔕','📱','🟢','💚','💌','📧'],
    },
    {
      name: '办公软件 (Word/Excel/PPT)',
      emojis: ['🖹','🖺','📄','📃','✏️','🖊️','🖋️','🗒️','🧮','🔢','📊','📈','📉','📋','📽️','🎞️','🖼️','📺','🎬','📹','🎥','🏢','🏣','📇','🗂️','📎','🖇️','📌','📑','🧾','🗊','♻️'],
    },
    {
      name: '图像 & 设计',
      emojis: ['🎨','🖼️','📷','📸','🎬','🎥','📹','📺','📻','📽️','🎞️','🖌️','🖍️','✏️','🖊️','🖋️','✒️','🖺','🖻','📟','🖨️','🖥️','🖍️','🖌️'],
    },
    {
      name: '媒体 & 娱乐',
      emojis: ['🎬','🎥','📺','📻','📡','🎙️','🎚️','🎛️','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎵','🎶','🎮','🕹️','🎲','♟️','🎯','🎳','🎪','🎭','🎨'],
    },
    {
      name: '时间 & 计划',
      emojis: ['📅','📆','🗓️','⏰','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛','⏳','⌛','⏱️','⏲️','🕰️','📋','📝','🗒️','🔔','🔕','⏰'],
    },
    {
      name: '徽标 & 状态',
      emojis: ['✅','❌','⚠️','🚫','🛑','⛔','📛','🔞','☑️','✔️','✖️','➕','➖','➗','✳️','❇️','💯','🔝','🔙','🔚','🔛','🔜','🆕','🆓','🆔','🆗','🆙','🆒','🆕','🆓','🆔'],
    },
    {
      name: '导航 & 位置',
      emojis: ['🗺️','🧭','📍','📌','🚩','🏁','🎌','🏴','🏳️','🏴‍☠️','🗾','🌍','🌎','🌏','🧭','🗺️','🧿','🎯','🔝','🔙','🔚','🔛','🔜','🔄','↩️','↪️'],
    },
    {
      name: '颜色 & 形状',
      emojis: ['🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪','🔘','🔲','🔳','⬛','⬜','🟥','🟧','🟨','🟩','🟦','🟪','🟫','🔺','🔻','🔹','🔸','🔶','🔷','💠','♦️','🔴','🟠'],
    },
    {
      name: '生活 & 办公',
      emojis: ['💼','📅','📆','📇','📋','📌','📍','📎','🖇️','✂️','🔗','📐','📏','🧮','✏️','🖊️','🖋️','✒️','🖍️','🖌️','📮','📯','🔔','🔕','🎯','🏆','🥇','🥈','🥉','🎖️','🏅'],
    },
  ];

  /**
   * 显示图标选择器
   * @param {object} opts — { current, title }
   * @returns {Promise<string|null>}
   */
  window.showIconPicker = function showIconPicker(opts) {
    opts = opts || {};
    var current = opts.current || '📄';
    var title = opts.title || '选择图标';

    return new Promise(function(resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.style.zIndex = '200000';

      var catHtml = '';
      CATEGORIES.forEach(function(cat) {
        catHtml += '<div class="ip-category">';
        catHtml += '<div class="ip-cat-title">' + escHtml(cat.name) + '</div>';
        catHtml += '<div class="ip-grid">';
        cat.emojis.forEach(function(e) {
          var active = (e === current) ? ' ip-active' : '';
          catHtml += '<span class="ip-cell' + active + '" data-emoji="' + escAttr(e) + '">' + e + '</span>';
        });
        catHtml += '</div></div>';
      });

      overlay.innerHTML =
        '<div class="ip-dialog">' +
          '<div class="ip-header">' +
            '<span class="ip-title">' + escHtml(title) + '</span>' +
            '<span class="ip-close" id="ip-close-btn">✕</span>' +
          '</div>' +
          '<div class="ip-preview">' +
            '<span id="ip-preview-emoji" style="font-size:36px">' + current + '</span>' +
            '<span class="ip-preview-label" id="ip-preview-label">当前</span>' +
          '</div>' +
          '<div class="ip-custom-row">' +
            '<input type="text" class="ip-custom-input" id="ip-custom-input" placeholder="输入任意 emoji 或粘贴 URL…" maxlength="200" value="' + escAttr(current) + '" />' +
            '<button class="btn-accept ip-apply-btn" id="ip-apply-btn" style="padding:4px 12px;font-size:13px">应用</button>' +
          '</div>' +
          '<div class="ip-grid-wrap" id="ip-grid-wrap">' +
            catHtml +
          '</div>' +
          '<div class="ip-footer">' +
            '<button class="btn-back" id="ip-cancel-btn">取消</button>' +
            '<button class="btn-accept" id="ip-confirm-btn">确认</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      // DOM refs
      var previewEmoji = overlay.querySelector('#ip-preview-emoji');
      var previewLabel = overlay.querySelector('#ip-preview-label');
      var customInput = overlay.querySelector('#ip-custom-input');
      var cells = overlay.querySelectorAll('.ip-cell');
      var selected = current;

      // ── 内部函数 ──
      function updatePreview(emoji) {
        selected = emoji;
        previewEmoji.textContent = emoji;
        previewLabel.textContent = emoji === current ? '当前' : '预览';
        customInput.value = emoji;
        // 高亮网格
        cells.forEach(function(c) {
          c.classList.toggle('ip-active', c.dataset.emoji === emoji);
        });
      }

      function close(result) {
        overlay.remove();
        resolve(result);
      }

      // ── 事件绑定 ──
      // 网格点击
      cells.forEach(function(c) {
        c.addEventListener('click', function() {
          updatePreview(c.dataset.emoji);
        });
      });

      // 自定义输入
      customInput.addEventListener('input', function() {
        var val = customInput.value.trim();
        if (val) {
          selected = val;
          previewEmoji.textContent = val;
          previewLabel.textContent = val === current ? '当前' : '预览';
          cells.forEach(function(c) {
            c.classList.toggle('ip-active', c.dataset.emoji === val);
          });
        }
      });
      customInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') close(selected);
      });

      // 应用按钮
      overlay.querySelector('#ip-apply-btn').addEventListener('click', function() {
        var val = customInput.value.trim();
        if (val) updatePreview(val);
      });

      // 确认 / 取消
      overlay.querySelector('#ip-confirm-btn').addEventListener('click', function() {
        close(selected);
      });
      overlay.querySelector('#ip-cancel-btn').addEventListener('click', function() {
        close(null);
      });
      overlay.querySelector('#ip-close-btn').addEventListener('click', function() {
        close(null);
      });
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) close(null);
      });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { close(null); document.removeEventListener('keydown', onKey); }
      });
    });
  };

})();
