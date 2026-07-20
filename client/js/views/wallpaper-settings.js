// ACMS 壁纸设置窗口 v0.56 — 独立 IIFE 窗口视图
// 依赖: ACMSWin, ACMSWallpaper
// 提供: window.openWallpaperDialog()
// 使用: ACMSWin.open('wallpaper', { w: 480, h: 400, title: '壁纸设置' })
(function() {
  'use strict';

  var currentWindow = null;   // 当前绑定的窗口对象
  var fileInput = null;       // 隐藏的上传 input

  // ── 工具 ──
  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── 创建隐藏的 file input ──
  function ensureFileInput() {
    if (fileInput) return;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', function(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var dataUrl = ev.target.result;
        if (window.ACMSWallpaper) {
          ACMSWallpaper.set(dataUrl, ACMSWallpaper.getStyle()).catch(function(err) {
            console.warn('[WallpaperSettings] 壁纸设置失败:', err.message);
            if (typeof toast === 'function') toast('壁纸设置失败', 'error');
          });
        }
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    });
  }

  // ── 渲染窗口内容 ──
  function render(w) {
    if (w.dead) return;
    currentWindow = w;

    var currentWp = window.ACMSWallpaper ? ACMSWallpaper.get() : null;
    var currentStyle = (currentWp && currentWp.style) || 'cover';
    var previewUrl = currentWp ? currentWp.url : null;

    var html = '';
    html += '<div style="padding:16px;display:flex;flex-direction:column;height:100%;box-sizing:border-box">';

    // 预览区域
    html += '<div class="wallpaper-preview-container" id="wp-preview">';
    if (previewUrl) {
      html += '<div style="width:100%;height:100%;background-image:url(' + previewUrl + ');background-size:cover;background-position:center;border-radius:8px"></div>';
    } else {
      html += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:13px">暂无壁纸</div>';
    }
    html += '</div>';

    // 来源按钮
    html += '<div style="font-size:12px;color:var(--text2);margin-bottom:6px">来源：</div>';
    html += '<div style="display:flex;gap:8px;margin-bottom:12px">';
    html += '<button class="wallpaper-style-btn" id="wp-btn-upload">📁 上传图片</button>';
    html += '<button class="wallpaper-style-btn" id="wp-btn-browse">📂 文件浏览器</button>';
    html += '</div>';

    // 缩放方式
    html += '<div style="font-size:12px;color:var(--text2);margin-bottom:6px">缩放方式：</div>';
    html += '<div style="display:flex;gap:6px;margin-bottom:12px">';
    var styles = [
      { id: 'cover',   label: '填充铺满' },
      { id: 'contain', label: '适应'     },
      { id: 'fill',    label: '拉伸'     },
    ];
    styles.forEach(function(s) {
      var activeClass = s.id === currentStyle ? ' active' : '';
      html += '<button class="wallpaper-style-btn' + activeClass + '" data-style="' + s.id + '">' + escHtml(s.label) + '</button>';
    });
    html += '</div>';

    // 预设壁纸
    html += '<div style="font-size:12px;color:var(--text2);margin-bottom:6px">预设壁纸：</div>';
    html += '<div class="wallpaper-preset-grid" id="wp-preset-grid">';
    var presets = [];
    if (window.ACMSWallpaper && typeof ACMSWallpaper.getPresets === 'function') {
      presets = ACMSWallpaper.getPresets();
    }
    if (presets.length === 0) {
      html += '<div style="font-size:11px;color:var(--text2);padding:4px 0">暂无预设</div>';
    } else {
      presets.forEach(function(p) {
        var isActive = currentWp && currentWp.url === p.data ? ' active' : '';
        html += '<div class="wallpaper-preset-item' + isActive + '" data-preset-id="' + escHtml(p.id) + '" style="background-image:url(' + p.data + ')" title="' + escHtml(p.label) + '"></div>';
      });
    }
    html += '</div>';

    html += '<div style="flex:1"></div>';

    // 底部按钮
    html += '<div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--border);padding-top:12px;margin-top:8px">';
    html += '<button class="wallpaper-style-btn" id="wp-btn-reset" style="color:var(--accent2)">🗑 清除壁纸</button>';
    html += '<button class="wallpaper-style-btn" id="wp-btn-close">关闭</button>';
    html += '</div>';

    html += '</div>';
    w.$c.innerHTML = html;
    w.$c.style.display = 'flex';
    w.$c.style.flexDirection = 'column';

    // ── 绑定事件 ──
    bindEvents(w);
  }

  // ── 更新预览 ──
  function updatePreview() {
    var container = document.getElementById('wp-preview');
    if (!container) return;
    var currentWp = window.ACMSWallpaper ? ACMSWallpaper.get() : null;
    if (currentWp && currentWp.url) {
      container.innerHTML = '<div style="width:100%;height:100%;background-image:url(' + currentWp.url + ');background-size:cover;background-position:center;border-radius:8px"></div>';
    } else {
      container.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:13px">暂无壁纸</div>';
    }
  }

  // ── 更新预设项高亮 ──
  function updatePresetActive() {
    var items = document.querySelectorAll('.wallpaper-preset-item');
    if (!items.length) return;
    var currentWp = window.ACMSWallpaper ? ACMSWallpaper.get() : null;
    items.forEach(function(item) {
      item.classList.toggle('active', currentWp && item.dataset.presetId && currentWp.url && item.style.backgroundImage.indexOf(currentWp.url) !== -1);
    });
  }

  // ── 更新样式按钮高亮 ──
  function updateStyleBtns() {
    var btns = document.querySelectorAll('.wallpaper-style-btn[data-style]');
    if (!btns.length) return;
    var currentStyle = (window.ACMSWallpaper && ACMSWallpaper.getStyle()) || 'cover';
    btns.forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.style === currentStyle);
    });
  }

  // ── 绑定窗口内事件 ──
  function bindEvents(w) {
    if (w.dead) return;
    var root = w.$c;

    // 上传图片
    var uploadBtn = root.querySelector('#wp-btn-upload');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        ensureFileInput();
        if (fileInput) fileInput.click();
      });
    }

    // 文件浏览器
    var browseBtn = root.querySelector('#wp-btn-browse');
    if (browseBtn) {
      browseBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.ACMSWin) {
          if (!ACMSWin.isActive()) ACMSWin.enable();
          // 打开文件浏览器，传回调让选择图片后自动设为壁纸
          ACMSWin.open('file-manager', {
            w: 720,
            h: 500,
            title: '选择壁纸图片',
            onPickImage: function(imgUrl) {
              if (window.ACMSWallpaper) {
                ACMSWallpaper.set(imgUrl, ACMSWallpaper.getStyle()).catch(function(err) {
                  console.warn('[WallpaperSettings] 壁纸设置失败:', err.message);
                  if (typeof toast === 'function') toast('壁纸设置失败', 'error');
                });
              }
            }
          });
        }
      });
    }

    // 缩放方式按钮
    root.querySelectorAll('.wallpaper-style-btn[data-style]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var style = btn.dataset.style;
        if (window.ACMSWallpaper) {
          ACMSWallpaper.setStyle(style);
        }
        // 更新按钮高亮
        root.querySelectorAll('.wallpaper-style-btn[data-style]').forEach(function(b) {
          b.classList.toggle('active', b.dataset.style === style);
        });
      });
    });

    // 预设壁纸点击
    root.querySelectorAll('.wallpaper-preset-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        // 从 backgroundImage 提取 URL
        var bg = item.style.backgroundImage;
        if (!bg) return;
        // background-image: url(...) 格式
        var match = bg.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (!match) return;
        var url = match[1];
        if (window.ACMSWallpaper) {
          ACMSWallpaper.set(url, ACMSWallpaper.getStyle()).catch(function(err) {
            console.warn('[WallpaperSettings] 预设壁纸设置失败:', err.message);
          });
        }
        // 更新所有预设项高亮
        root.querySelectorAll('.wallpaper-preset-item').forEach(function(p) {
          p.classList.remove('active');
        });
        item.classList.add('active');
      });
    });

    // 清除壁纸
    var resetBtn = root.querySelector('#wp-btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.ACMSWallpaper) {
          ACMSWallpaper.reset();
        }
        updatePreview();
        updatePresetActive();
      });
    }

    // 关闭
    var closeBtn = root.querySelector('#wp-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.ACMSWin && typeof ACMSWin.close === 'function') {
          ACMSWin.close(w);
        }
      });
    }
  }

  // ── 全局函数：打开壁纸设置对话框 ──
  window.openWallpaperDialog = function() {
    if (window.ACMSWin) {
      if (!ACMSWin.isActive()) ACMSWin.enable();
      ACMSWin.open('wallpaper', { w: 480, h: 420, title: '壁纸设置' });
    }
  };

  // ── 注册 viewLoader ──
  if (window.ACMSWin) {
    ACMSWin.registerViewLoader('wallpaper', function(w) {
      render(w);

      // 监听壁纸变化以更新预览（w.dead 检查保证不操作已关闭窗口）
      if (window.ACMSWallpaper && typeof ACMSWallpaper.onChange === 'function') {
        ACMSWallpaper.onChange(function(data) {
          if (w.dead) return;
          updatePreview();
          updatePresetActive();
          updateStyleBtns();
        });
      }
    });
  }

  // ── 兼容: 如果 desktop-context-menu.js 的 fallback 先执行但 wallpaper-settings.js 后加载，
  //     确保 openWallpaperDialog 已经可用。
  //     如果已有旧版本（如 desktop-context-menu 内的局部函数），我们的全局声明会覆盖它。
  //     这确保了 taskbar.js 和 desktop-context-menu.js 引用的 openWallpaperDialog 指向正确的实现。

})();
