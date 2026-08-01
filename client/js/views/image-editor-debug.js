// ACMS image-editor 一次性诊断助手
// 用法（30 秒）：
//   1. URL 加参数打开 image-editor： http://your-acms/?aiDebug=1
//      （在 ACMS 客户端里打开图片编辑器窗口也行，会自动读 URL 参数）
//   2. 菜单 → 打开图片 → 选一张图
//   3. F12 打开 DevTools Console
//   4. 粘贴这一行回车：
//        fetch('/client/js/views/image-editor-debug.js').then(r=>r.text()).then(eval)
//   5. console 会输出 REPORT JSON，贴给 hermes 即可定位问题
//
// 多多如不需要诊断，删这个文件 + 删 image-editor.js 里的 aiDebug 钩子 5 行即可。
// aiDebug 钩子默认关闭，prod 不感知。

(function(){
  var ie = window.imageEditorAPI && window.imageEditorAPI.__ie;
  if (!ie) {
    console.warn('[DIAG] imageEditorAPI.__ie 不存在 — 请先在 image-editor 里「菜单→打开图片」加载一张图');
    return;
  }
  var img = ie._graphics.canvasImage;
  var c = ie._graphics.getCanvas();
  if (!img) { console.warn('[DIAG] canvasImage 还没准备好'); return; }

  var ox = img.originX === 'center' ? (img.left||0) - img.width*(img.scaleX||1)/2 : (img.left||0);
  var oy = img.originY === 'center' ? (img.top||0) - img.height*(img.scaleY||1)/2 : (img.top||0);
  var bw = Math.round(Math.abs(img.width*(img.scaleX||1)));
  var bh = Math.round(Math.abs(img.height*(img.scaleY||1)));
  var srcX = Math.max(0, Math.round(ox));
  var srcY = Math.max(0, Math.round(oy));
  var maxW = c.getWidth() - srcX, maxH = c.getHeight() - srcY;
  bw = Math.min(bw, maxW); bh = Math.min(bh, maxH);

  // 模拟 cropCanvasToImage 抠出 PNG 并分析像素分布
  var tmp = document.createElement('canvas');
  tmp.width = bw; tmp.height = bh;
  tmp.getContext('2d').drawImage(c.getElement(), srcX, srcY, bw, bh, 0, 0, bw, bh);
  var croppedDataUrl = tmp.toDataURL('image/png');

  var im = new Image();
  im.onload = function(){
    var id = tmp.getContext('2d').getImageData(0,0,bw,bh).data;
    var sumR=0,sumG=0,sumB=0,sumA=0, dark=0, darkEdge=0;
    for (var i=0;i<id.length;i+=4){
      var r=id[i],g=id[i+1],b=id[i+2],a=id[i+3];
      sumR+=r;sumG+=g;sumB+=b;sumA+=a;
      if (r<10&&g<10&&b<10) dark++;
      var x = (i/4)%bw, y = Math.floor((i/4)/bw);
      if ((x<5||x>bw-5||y<5||y>bh-5) && r<30&&g<30&&b<30) darkEdge++;
    }
    var n = bw*bh;
    var report = {
      A_canvasImage_state: {
        buffer_WH: c.getWidth() + 'x' + c.getHeight(),
        viewportTransform: c.viewportTransform.slice(),
        img_natural_WH: img.width + 'x' + img.height,
        img_scaleX_scaleY: img.scaleX + ',' + img.scaleY,
        img_originX_originY: img.originX + ',' + img.originY,
        img_left_top: img.left + ',' + img.top,
        img_angle: img.angle,
        img_flipX_flipY: img.flipX + ',' + img.flipY
      },
      B_crop_bbox_computed: { ox: ox, oy: oy, srcX: srcX, srcY: srcY, bw: bw, bh: bh },
      C_crop_output_PNG: {
        size_bytes: croppedDataUrl.length,
        width: bw, height: bh,
        avg_RGB: [Math.round(sumR/n), Math.round(sumG/n), Math.round(sumB/n)],
        alpha_avg: Math.round(sumA/n),
        dark_pixel_percent: (dark/n*100).toFixed(2) + '%',
        edge_dark_percent: (darkEdge/n*100).toFixed(2) + '%'
      }
    };
    console.log('===== AI-DIAG REPORT =====');
    console.log(JSON.stringify(report, null, 2));
    console.log('把上面整段 JSON 复制贴给 hermes 即可定位问题');
    console.log('===== END REPORT =====');
  };
  im.src = croppedDataUrl;
})();
