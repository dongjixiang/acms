// ─────────── PPTX 解析函数 ───────────
function parsePptxToSchema(buf) {
  var AdmZip = require('adm-zip');
  var zip = new AdmZip(buf);
  
  // 1. 提取所有图片
  var imageMap = {};
  var imageFiles = zip.getEntries().filter(function(e) {
    return e.entryName.match(/^ppt\/media\//) && e.entryName.match(/\.(png|jpg|jpeg|gif|bmp)$/i);
  });
  
  imageFiles.forEach(function(img) {
    var imgBuf = img.getData();
    var ext = img.entryName.replace(/.*\./, '').toLowerCase();
    var mimeType = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' }[ext] || 'image/png';
    imageMap[img.entryName] = 'data:' + mimeType + ';base64,' + imgBuf.toString('base64');
  });
  
  // 2. 读取 presentation.xml
  var presXml = zip.readAsText('ppt/presentation.xml');
  var presObj = xmlParser.parse(presXml);
  
  // 3. 提取 slide IDs（用引号访问带冒号的属性）
  var slideIds = [];
  var pres = presObj['p:presentation'];
  if (pres && pres['p:sldIdLst']) {
    var sldIdList = pres['p:sldIdLst'];
    var ids = sldIdList['p:sldId'];
    if (!Array.isArray(ids)) ids = [ids];
    ids.forEach(function(sid) {
      if (sid['@_r:id']) {
        slideIds.push(sid['@_r:id']);
      }
    });
  }
  
  // 4. 读取 rels
  var relsXml = zip.readAsText('ppt/_rels/presentation.xml.rels') || '';
  var relsObj = xmlParser.parse(relsXml);
  var relMap = {};
  
  var relsRoot = relsObj['Relationships'];
  if (relsRoot && relsRoot['Relationship']) {
    var rels = relsRoot['Relationship'];
    if (!Array.isArray(rels)) rels = [rels];
    rels.forEach(function(r) {
      if (r['@_Id'] && r['@_Target']) {
        relMap[r['@_Id']] = r['@_Target'];
      }
    });
  }
  
  // 5. 解析每页幻灯片
  var pptSlides = [];
  
  slideIds.forEach(function(rid) {
    var slideFile = relMap[rid];
    if (!slideFile) return;
    
    var slideXml = zip.readAsText('ppt/' + slideFile);
    if (!slideXml) return;
    
    var slideObj = xmlParser.parse(slideXml);
    
    var titleText = '';
    var bodyText = '';
    var layout = 'content';
    
    // 提取所有 p:sp 形状
    var shapes = [];
    var sld = slideObj['p:sld'];
    if (sld && sld['p:cSld'] && sld['p:cSld']['p:spTree']) {
      var spTree = sld['p:cSld']['p:spTree'];
      shapes = spTree['p:sp'] || [];
      if (!Array.isArray(shapes)) shapes = [shapes];
    }
    
    shapes.forEach(function(sp) {
      var nvSpPr = sp['p:nvSpPr'];
      if (!nvSpPr) return;
      
      var cNvPr = nvSpPr['p:cNvPr'];
      if (!cNvPr) return;
      
      var name = cNvPr['@_name'] || '';
      var nvPr = nvSpPr['p:nvPr'];
      var phType = '';
      if (nvPr && nvPr['p:ph']) {
        phType = nvPr['p:ph']['@_type'] || '';
      }
      
      // 提取文本
      var texts = extractTextFromShape(sp);
      var innerText = texts.join(' ');
      
      if (phType === 'title' || name.indexOf('标题') >= 0 || name.indexOf('Title') >= 0) {
        titleText = innerText;
        layout = 'cover';
      } else if (phType === 'body' || name.indexOf('正文') >= 0 || name.indexOf('Content') >= 0) {
        bodyText = innerText;
        layout = 'content';
      } else if (!phType && !name && innerText) {
        if (bodyText) bodyText += '\n' + innerText;
        else bodyText = innerText;
      }
    });
    
    // 提取图片
    var imgRefs = extractImages(slideFile, zip, imageMap);
    
    if (titleText || bodyText) {
      pptSlides.push({
        title: escHtml(titleText || '标题'),
        content: escHtml(bodyText || ''),
        layout: layout,
        images: imgRefs
      });
    }
  });
  
  if (pptSlides.length > 0) {
    return 'SCHEMA:' + JSON.stringify({ slides: pptSlides });
  } else {
    return '(PPTX 文本提取失败，请手动创建)';
  }
}

// 从形状中提取所有文本
function extractTextFromShape(sp) {
  var texts = [];
  var txBody = sp['p:txBody'];
  if (!txBody) return texts;
  
  var paragraphs = txBody['a:p'] || [];
  if (!Array.isArray(paragraphs)) paragraphs = [paragraphs];
  
  paragraphs.forEach(function(p) {
    var runs = p['a:r'] || [];
    if (!Array.isArray(runs)) runs = [runs];
    runs.forEach(function(r) {
      var t = r['a:t'];
      if (t) {
        texts.push(t);
      }
    });
  });
  
  return texts;
}

// 从 slide rels 中提取图片
function extractImages(slideFile, zip, imageMap) {
  var imgRefs = [];
  var relsPath = 'ppt/slides/_rels/' + slideFile + '.rels';
  var relsXml = zip.readAsText(relsPath) || '';
  
  if (!relsXml) return imgRefs;
  
  var relsObj = xmlParser.parse(relsXml);
  var rels = [];
  
  var relsRoot = relsObj['Relationships'];
  if (relsRoot && relsRoot['Relationship']) {
    rels = relsRoot['Relationship'];
    if (!Array.isArray(rels)) rels = [rels];
  }
  
  rels.forEach(function(r) {
    var id = r['@_Id'];
    var target = r['@_Target'];
    var type = r['@_Type'] || '';
    
    // 检查是否是图片关系（type 包含 'image'）
    if (type.indexOf('image') >= 0 && target) {
      var imgName = path.basename(target);
      var imgEntry = 'ppt/media/' + imgName;
      if (imageMap[imgEntry]) {
        imgRefs.push({
          rid: id,
          src: imageMap[imgEntry]
        });
      }
    }
  });
  
  return imgRefs;
}
