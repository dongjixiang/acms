// ACMS 文件浏览器 v0.73 — TagSpaces 深度风格
// 标签第一导航 + 多视角 + 右侧面板 + AI
// 布局: 左侧[标签|树] / 中间[文件列表] / 右侧[文件信息]
(function() {
  'use strict';

  var w = null, curPath = '/', hist = [], fwd = [];
  var expDirs = {}, treeCache = {}, curSearch = '';
  var AK = 'dev-key-001'; // 同 api.js
  var ctxEntry = null;
  var _drives = null; // 缓存盘符列表

  // ── 标签系统 ──
  var TG_KEY = 'fb_tg', TF_KEY = 'fb_tf';
  var tagGroups = [], fileTags = {};
  var filterTag = '', sortKey = 'name', sortDir = 1;
  var selPath = '', viewMode = 'list'; // list | grid | gallery
  var leftTab = 'tags'; // 'tags' | 'tree'

  var DEF_TAGS = [
    {title:'优先级',color:'#e74c3c',textcolor:'#fff',children:[
      {title:'urgent',color:'#e74c3c',textcolor:'#fff'},
      {title:'high',color:'#e67e22',textcolor:'#fff'},
      {title:'normal',color:'#3498db',textcolor:'#fff'},
      {title:'low',color:'#95a5a6',textcolor:'#fff'}]},
    {title:'状态',color:'#2ecc71',textcolor:'#fff',children:[
      {title:'done',color:'#27ae60',textcolor:'#fff'},
      {title:'wip',color:'#f1c40f',textcolor:'#333'},
      {title:'todo',color:'#9b59b6',textcolor:'#fff'},
      {title:'review',color:'#1abc9c',textcolor:'#fff'}]},
    {title:'类型',color:'#34495e',textcolor:'#fff',children:[
      {title:'doc',color:'#2c3e50',textcolor:'#fff'},
      {title:'image',color:'#8e44ad',textcolor:'#fff'},
      {title:'code',color:'#2980b9',textcolor:'#fff'},
      {title:'data',color:'#d35400',textcolor:'#fff'}]},
  ];

  function loadTags(){
    try{var r=localStorage.getItem(TG_KEY);tagGroups=r?JSON.parse(r):JSON.parse(JSON.stringify(DEF_TAGS));}catch(e){tagGroups=JSON.parse(JSON.stringify(DEF_TAGS));}
    try{var f=localStorage.getItem(TF_KEY);fileTags=f?JSON.parse(f):{};}catch(e){fileTags={};}
  }
  function svTg(){localStorage.setItem(TG_KEY,JSON.stringify(tagGroups));}
  function svTf(){localStorage.setItem(TF_KEY,JSON.stringify(fileTags));}
  function gT(p){return fileTags[p]||[];}
  function sT(p,a){if(a&&a.length)fileTags[p]=a;else delete fileTags[p];svTf();}
  function aT(p,t){var a=gT(p);if(a.indexOf(t)===-1){a.push(t);sT(p,a);}}
  function rT(p,t){sT(p,gT(p).filter(function(x){return x!==t;}));}
  function allTN(){var n=[];tagGroups.forEach(function(g){(g.children||[]).forEach(function(t){if(n.indexOf(t.title)===-1)n.push(t.title);});});return n;}
  function tD(t){for(var i=0;i<tagGroups.length;i++)for(var j=0;j<(tagGroups[i].children||[]).length;j++)if(tagGroups[i].children[j].title===t)return tagGroups[i].children[j];return{title:t,color:'#95a5a6',textcolor:'#fff'};}
  function smartTags(){
    var n=new Date(),td=n.toDateString(),wkS=new Date(n);wkS.setDate(n.getDate()-n.getDay());wkS=wkS.toDateString();
    return[{title:'📅 今天',id:'_st_t',fn:function(d){return d&&new Date(d).toDateString()===td;}},
           {title:'📅 本周',id:'_st_w',fn:function(d){return d&&new Date(d).toDateString()>=wkS;}},
           {title:'📅 本月',id:'_st_m',fn:function(d){if(!d)return false;var dt=new Date(d);return dt.getMonth()===n.getMonth()&&dt.getFullYear()===n.getFullYear();}}];
  }

  // ── 工具 ──
  function esc(s){return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function jQ(s){return JSON.stringify(s).replace(/'/g,"\\'");}
  function sz(n){if(n==null)return'—';if(n<1024)return n+' B';if(n<1024*1024)return(n/1024).toFixed(1)+' KB';return(n/(1024*1024)).toFixed(1)+' MB';}
  function mt(t){if(!t)return'';try{var d=new Date(t);if(isNaN(d.getTime()))return String(t);return String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}catch(e){return String(t);}}
  function ic(n,t){if(t==='directory')return'📁';var e=n?n.split('.').pop().toLowerCase():'';if(['jpg','jpeg','png','gif','bmp','webp','svg'].indexOf(e)!==-1)return'🖼';if(['mp4','webm','avi','mov','mkv'].indexOf(e)!==-1)return'🎬';if(['mp3','wav','ogg','flac','aac'].indexOf(e)!==-1)return'🎵';if(['pdf'].indexOf(e)!==-1)return'📄';if(['zip','rar','7z','tar','gz'].indexOf(e)!==-1)return'📦';if(['doc','docx'].indexOf(e)!==-1)return'📝';if(['xls','xlsx','csv'].indexOf(e)!==-1)return'📊';if(['js','ts','py','java','cpp','c','h','go','rs'].indexOf(e)!==-1)return'💻';if(['json','xml','yaml','yml','toml','ini','cfg','conf'].indexOf(e)!==-1)return'⚙';if(['html','htm','css','scss','less'].indexOf(e)!==-1)return'🌐';if(['md','txt','log'].indexOf(e)!==-1)return'📃';return'📄';}
  function isImg(n){return n?['jpg','jpeg','png','gif','bmp','webp','svg'].indexOf(n.split('.').pop().toLowerCase())!==-1:false;}
  function jn(a,b){var c=a.replace(/\/+$/,'');return c?c+'/'+b:'/'+b;}
  function pp(p){if(!p||p==='/')return'/';var a=p.replace(/\/+$/,'').split('/');a.pop();return a.length<=1?'/':a.join('/');}
  function sn(p){if(!p||p==='/')return'/';return p.replace(/\/+$/,'').split('/').pop();}
  function iP(){try{var r=localStorage.getItem('acms-user');if(r){var u=JSON.parse(r);if(u.role!=='admin')return'/workspaces';}}catch(e){}return'/';}
  function to(m,t){if(typeof toast==='function')toast(m,t||'success');}
  function rf(){if(w&&!w.dead)render(w);}

  // ── 标签 chip ──
  function tc(t,rm,onClick){
    var d=tD(t);
    var r=rm?'<span class="tc-x" data-t="'+esc(t)+'" onclick="event.stopPropagation();FB_rmT(this)">✕</span>':'';
    var oc=onClick?' onclick="'+onClick+'"':'';
    return '<span class="tc" style="background:'+d.color+';color:'+d.textcolor+'"'+oc+'>'+esc(t)+r+'</span>';
  }

  // ═══ 主渲染 ═══
  function render(_w){
    if(!_w||_w.dead)return;w=_w;
    var h='';
    // ── 工具栏 ──
    h+='<div class="ts-bar">';
    h+=tb('◀','FB_gb()','后退',hist.length>0);
    h+=tb('▶','FB_gf()','前进',fwd.length>0);
    h+=tb('↑','FB_gu()','上级',curPath!=='/');
    h+=tb('↻','FB_rf()','刷新',true);
    h+=tb('📁+','FB_nf()','新建文件夹',true);
    h+=tb('📤','FB_uf()','上传文件',true);
    h+='<div class="ts-bc">'+bc(curPath)+'</div><div class="ts-sp"></div>';
    // 视角切换
    h+='<button class="ts-vb'+(viewMode==='list'?' ts-va':'')+'" onclick="FB_vm(\'list\')" title="列表">☰</button>';
    h+='<button class="ts-vb'+(viewMode==='grid'?' ts-va':'')+'" onclick="FB_vm(\'grid\')" title="网格">⊞</button>';
    h+='<button class="ts-vb'+(viewMode==='gallery'?' ts-va':'')+'" onclick="FB_vm(\'gallery\')" title="画廊">🖼</button>';
    h+='<input class="ts-sr" id="__fb_s" placeholder="🔍 搜索…" value="'+esc(curSearch)+'" oninput="FB_sr(this.value)">';
    h+='</div>';

    // ── 三栏主体 ──
    h+='<div class="ts-bd">';

    // 左侧
    h+='<div class="ts-lt">';
    // 位置 / 盘符
    h+='<div class="ts-lg"><div class="ts-lg-t" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="FB_toggleDrives()">💾 位置 <span id="ts_drives_arr">▼</span></div><div id="ts_drives_list" class="ts-lg-c">';
    h+='<span class="ts-loc-item ts-loc-active" onclick="FB_nv(\'/\')" style="cursor:pointer;padding:3px 6px;border-radius:4px;font-size:12px;background:color-mix(in srgb,var(--accent) 8%,transparent);color:var(--accent)">📁 /</span>';
    if(_drives) _drives.forEach(function(d){
      h+='<span class="ts-loc-item" onclick="FB_nv(\''+esc(d.path)+'\')" style="cursor:pointer;padding:3px 6px;border-radius:4px;font-size:12px">💾 '+esc(d.label)+'</span>';
    });
    h+='</div></div>';
    // 标签/树切换标签
    h+='<div class="ts-lt-tabs"><span class="ts-lt-tab'+(leftTab==='tags'?' ts-lta':'')+'" onclick="FB_lt(\'tags\')">🏷 标签</span><span class="ts-lt-tab'+(leftTab==='tree'?' ts-lta':'')+'" onclick="FB_lt(\'tree\')">📂 目录</span></div>';
    if(leftTab==='tags'){
      // 智能标签
      h+='<div class="ts-lg"><div class="ts-lg-t">🧠 智能标签</div><div class="ts-lg-c" style="padding:2px 10px 6px">';
      smartTags().forEach(function(s){
        var a=filterTag===s.id?' ts-ta':'';
        h+='<span class="tc'+a+'" style="background:color-mix(in srgb, var(--accent) 10%, transparent);color:var(--accent);cursor:pointer" onclick="FB_fl(\''+s.id+'\')">'+esc(s.title)+'</span>';
      });
      h+='</div></div>';
      // 用户标签组
      tagGroups.forEach(function(g){
        h+='<div class="ts-lg"><div class="ts-lg-t">● '+esc(g.title)+'</div><div class="ts-lg-c">';
        (g.children||[]).forEach(function(t){
          var a=filterTag===t.title?' ts-ta':'';
          h+='<span class="tc'+a+'" style="background:'+t.color+';color:'+t.textcolor+';cursor:pointer" onclick="FB_fl(\''+esc(t.title)+'\')">'+esc(t.title)+'</span>';
        });
        h+='</div></div>';
      });
    } else {
      // 目录树
      h+=treeHTML(curPath);
    }
    h+='</div>'; // left

    // 中间文件列表
    h+='<div class="ts-md"><div class="ts-mh">';
    h+='<span class="ts-mn" onclick="FB_st(\'name\')">名称'+sa('name')+'</span>';
    h+='<span class="ts-ms" onclick="FB_st(\'size\')">大小'+sa('size')+'</span>';
    h+='<span class="ts-mdt" onclick="FB_st(\'mtime\')">日期'+sa('mtime')+'</span>';
    h+='</div><div class="ts-ml ts-mv-'+viewMode+'" id="__fb_l" tabindex="0">';
    h+='<div class="ts-ld">⏳ 加载中...</div></div></div>';

    // 右侧面板
    h+='<div class="ts-rt" id="__fb_r">';
    h+=selPath?rPanel(selPath):'<div class="ts-re">选择文件查看详情</div>';
    h+='</div></div>';

    // 状态栏 + 拖拽区
    h+='<div class="ts-st" id="__fb_st"></div><div class="fb-dropzone" id="__fb_dz">📂 拖放文件上传</div>';
    w.$c.innerHTML=h;

    // 键盘
    var le=w.$c.querySelector('#__fb_l');
    if(le){le.onkeydown=function(e){
      if((e.key==='Delete'||e.key==='Backspace')&&selPath){e.preventDefault();FB_dl(selPath,sn(selPath),false);}
      else if(e.key==='F2'&&selPath){e.preventDefault();FB_rn(selPath,sn(selPath),false);}
      else if(e.key==='Enter'&&selPath)navigate(selPath);
    };}
    w.$c.addEventListener('keydown',function(e){
      if(e.ctrlKey&&e.key==='f'){e.preventDefault();var i=w.$c.querySelector('#__fb_s');if(i)i.focus();}
    });
    loadList(w,curPath,curSearch);
  }

  // ── 辅助 ──
  function tb(l,a,t,e){return'<button class="ts-bb"'+(e?'':' disabled')+' onclick="'+a+'" title="'+esc(t)+'">'+l+'</button>';}
  function sa(k){return sortKey===k?'<span class="ts-sa">'+(sortDir===1?'▲':'▼')+'</span>':'';}
  function bc(p){if(!p||p==='/')return'<span class="ts-bp" onclick="FB_nv(\'/\')">/</span>';
    var pt=p.replace(/^\/+/,'').replace(/\/+$/,'').split('/'),h='<span class="ts-bp" onclick="FB_nv(\'/\')">/</span>',a='';
    pt.forEach(function(x){if(!x)return;a+='/'+x;h+='<span class="ts-bs">/</span><span class="ts-bp" onclick="FB_nv(\''+esc(a)+'\')">'+esc(x)+'</span>';});
    return h;
  }

  function treeHTML(a){
    var ex=!!expDirs['/'];
    var h='<ul class="ts-tr"><li class="ts-tl'+(a==='/'?' ts-ta':'')+'"><span class="ts-ta" onclick="event.stopPropagation();FB_tT(\'/\')">'+(ex?'▾':'▸')+'</span><span class="ts-tb" onclick="FB_nv(\'/\')">📁 /</span>';
    if(ex)h+=treeCh('/',a,1);
    h+='</li></ul>';
    return h;
  }
  function treeCh(p,a,d){
    var c=treeCache[p];
    if(!c)return'<span class="ts-tl">⏳</span>';
    var ds=c.filter(function(e){return e.type==='directory';});
    if(ds.length===0)return'<span class="ts-te">(空)</span>';
    var h='<ul class="ts-tr" style="padding-left:'+(d*12)+'px">';
    ds.forEach(function(e){
      var cp=jn(p,e.name),ac=cp===a,ex=!!expDirs[cp],hc=!!treeCache[cp];
      h+='<li class="ts-tl'+(ac?' ts-ta':'')+'"><span class="ts-ta" onclick="event.stopPropagation();FB_tT(\''+esc(cp)+'\')">'+(ex?'▾':'▸')+'</span><span class="ts-tb" onclick="FB_nv(\''+esc(cp)+'\')">📁 '+esc(e.name)+'</span>';
      if(ex)h+=treeCh(cp,a,d+1);
      h+='</li>';
    });
    h+='</ul>';return h;
  }

  // ── 右侧面板 ──
  function rPanel(fp){
    var nm=sn(fp),tg=gT(fp);
    var im=isImg(nm)?'<img src="/api/files?path='+encodeURIComponent(fp)+'&raw=1&api_key='+AK+'" class="ts-rt-im">':'';
    var ex=nm.indexOf('.')>=0?nm.split('.').pop().toUpperCase():'未知';
    var r='<div class="ts-rh">📄 '+esc(nm)+'</div>';
    r+=im;
    r+='<div class="ts-rs"><div class="ts-rr"><span class="ts-rl">类型</span><span>'+ex+'</span></div></div>';
    r+='<div class="ts-rs"><div class="ts-rr"><span class="ts-rl">🏷 标签</span></div><div class="ts-rtg" id="__fb_rt">';
    if(tg.length===0)r+='<span class="ts-rn">无标签</span>';
    else tg.forEach(function(t){r+=tc(t,true);});
    r+='</div>';
    var av=allTN().filter(function(x){return tg.indexOf(x)===-1;});
    if(av.length>0){
      r+='<select class="ts-ras" onchange="FB_aTF(this,\''+esc(fp)+'\')"><option value="">+ 添加标签</option>';
      av.forEach(function(t){r+='<option value="'+esc(t)+'">'+t+'</option>';});
      r+='</select>';
    }
    r+='</div>';
    r+='<div class="ts-rs"><button class="ts-ai" onclick="FB_ai(\''+esc(fp)+'\',\''+esc(nm)+'\')" id="__fb_ai">🤖 AI 生成标签</button></div>';
    r+='<div class="ts-rs" style="display:flex;gap:4px;flex-wrap:wrap">';
    if(isImg(nm)){r+=tb('🖼 预览','FB_pv(\''+esc(fp)+'\',\''+esc(nm)+'\')','预览',true);r+=tb('🖼 壁纸','FB_wp(\''+esc(fp)+'\')','壁纸',true);}
    r+=tb('✏️ 重命名','FB_rn(\''+esc(fp)+'\',\''+esc(nm)+'\',false)','重命名',true);
    r+=tb('🗑️ 删除','FB_dl(\''+esc(fp)+'\',\''+esc(nm)+'\',false)','删除',true);
    r+='</div></div>';
    return r;
  }

  // ── 加载文件列表 ──
  function loadList(_w,path,search){
    var el=_w.$c.querySelector('#__fb_l');if(!el)return;
    el.innerHTML='<div class="ts-ld">⏳ 加载中...</div>';
    var st=_w.$c.querySelector('#__fb_st');if(st)st.textContent='⏳ 加载中...';
    var p=search&&search.trim()?api('GET','/files/search?q='+encodeURIComponent(search)+'&path='+encodeURIComponent(path)):api('GET','/files?path='+encodeURIComponent(path));
    return p.then(function(d){
      if(_w.dead)return;
      if(!d||!d.entries){el.innerHTML='<div class="ts-er">⚠ 数据异常</div>';if(st)st.textContent='错误';return;}
      renderList(el,st,path,d,search);
    }).catch(function(e){
      if(_w.dead)return;
      el.innerHTML='<div class="ts-er">⚠ '+esc(e.message||'错误')+'</div>';if(st)st.textContent='加载失败';
    });
  }

  function renderList(el,st,path,data,search){
    var entries=data.entries||[],parent=data.parentPath;
    // 排序
    entries.sort(function(a,b){
      if(a.type==='directory'&&b.type!=='directory')return-1;
      if(a.type!=='directory'&&b.type==='directory')return 1;
      var c=0;
      if(sortKey==='name')c=(a.name||'').toLowerCase().localeCompare((b.name||'').toLowerCase());
      else if(sortKey==='size')c=(a.size||0)-(b.size||0);
      else if(sortKey==='mtime')c=(a.mtime||'')<(b.mtime||'')?-1:(a.mtime||'')>(b.mtime||'')?1:0;
      else c=(a.name||'').toLowerCase().localeCompare((b.name||'').toLowerCase());
      return c*sortDir;
    });
    // 标签筛选
    if(filterTag){
      var sts=smartTags(),sm=sts.filter(function(s){return s.id===filterTag;});
      if(sm.length>0)entries=entries.filter(function(e){return sm[0].fn(e.mtime);});
      else entries=entries.filter(function(e){if(e.type==='directory')return true;return gT(jn(path,e.name)).indexOf(filterTag)!==-1;});
    }

    var html='';
    if(parent&&path!=='/'&&(!search||!search.trim())){
      html+='<div class="ts-et ts-ed" onclick="FB_nv(\''+esc(parent)+'\')"><span class="ts-ei">🔙</span><span class="ts-en" style="color:var(--text2);font-style:italic">.. 上级</span><span class="ts-es">—</span><span class="ts-edt"></span></div>';
    }
    if(filterTag)html+='<div class="ts-ii">🏷 '+tc(filterTag)+' <a href="#" onclick="FB_fl(\'\');return false" style="font-size:11px;color:var(--text2);margin-left:6px">清除</a></div>';

    if(entries.length===0){
      html+='<div class="ts-emp">📂 '+(filterTag?'无匹配文件':'此目录为空')+'</div>';
    } else if(viewMode==='gallery'){
      html+='<div class="ts-gl">';
      entries.forEach(function(e){
        var fp=jn(path,e.name),isD=e.type==='dir'||e.type==='directory';
        var sel=selPath===fp?' ts-sl':'';
        html+='<div class="ts-gi'+sel+'" onclick="'+(isD?'FB_nv(\''+esc(fp)+'\')':'FB_sl(\''+esc(fp)+'\')')+'" oncontextmenu="event.preventDefault();FB_cx(event,\''+esc(fp)+'\',\''+esc(e.name)+'\','+(isD?'true':'false')+',\''+esc(ic(e.name,e.type))+'\')">';
        if(isD) html+='<div class="ts-gm" style="font-size:48px;display:flex;align-items:center;justify-content:center;background:var(--bg2)">📁</div>';
        else if(isImg(e.name)) html+='<img src="/api/files?path='+encodeURIComponent(fp)+'&raw=1&api_key='+AK+'" class="ts-gm">';
        else html+='<div class="ts-gm" style="font-size:48px;display:flex;align-items:center;justify-content:center;background:var(--bg2)">📄</div>';
        html+='<div class="ts-gn">'+esc(e.name)+'</div></div>';
      });
      html+='</div>';
    } else if(viewMode==='grid'){
      entries.forEach(function(e){
        var fp=jn(path,e.name),isD=e.type==='dir'||e.type==='directory',icn=e.icon||ic(e.name,e.type);
        var sel=selPath===fp?' ts-sl':'';
        html+='<div class="ts-gv'+sel+'" onclick="'+(isD?'FB_nv(\''+esc(fp)+'\')':'FB_sl(\''+esc(fp)+'\')')+'" ondblclick="'+(isImg(e.name)?'FB_pv(\''+esc(fp)+'\',\''+esc(e.name)+'\')':'')+'" oncontextmenu="event.preventDefault();FB_cx(event,\''+esc(fp)+'\',\''+esc(e.name)+'\','+(isD?'true':'false')+',\''+esc(icn)+'\')">';
        html+='<div class="ts-gi2">'+(isD?'📁':(isImg(e.name)?'<img src="/api/files?path='+encodeURIComponent(fp)+'&raw=1&api_key='+AK+'" class="ts-gt">':'📄'))+'</div>';
        html+='<div class="ts-gn2">'+esc(e.name)+'</div>';
        var tg=gT(fp);
        if(tg.length>0)html+='<div class="ts-gtg">'+tg.slice(0,2).map(function(t){return tc(t);}).join('')+(tg.length>2?'<span class="ts-gm2">+'+(tg.length-2)+'</span>':'')+'</div>';
        html+='</div>';
      });
    } else {
      // 列表视图
      entries.forEach(function(e){
        var fp=jn(path,e.name),isD=e.type==='dir'||e.type==='directory',icn=e.icon||ic(e.name,e.type);
        var sel=selPath===fp?' ts-sl':'';
        var clk=isD?'FB_nv(\''+esc(fp)+'\')':'FB_sl(\''+esc(fp)+'\')';
        var dbl=isImg(e.name)?' ondblclick="FB_pv(\''+esc(fp)+'\',\''+esc(e.name)+'\')"':'';
        var ac='<button class="ts-ab" onclick="event.stopPropagation();FB_rn(\''+esc(fp)+'\',\''+esc(e.name)+'\','+(isD?'true':'false')+')" title="重命名">✏️</button>';
        ac+='<button class="ts-ab" onclick="event.stopPropagation();FB_dl(\''+esc(fp)+'\',\''+esc(e.name)+'\','+(isD?'true':'false')+')" title="删除">🗑️</button>';
        html+='<div class="ts-et ts-e'+(isD?'d':'f')+sel+'" onclick="'+clk+'"'+dbl+' oncontextmenu="event.preventDefault();FB_cx(event,\''+esc(fp)+'\',\''+esc(e.name)+'\','+(isD?'true':'false')+',\''+esc(icn)+'\')">';
        html+='<span class="ts-ei">'+icn+'</span><span class="ts-en">'+esc(e.name)+'</span>';
        html+='<span class="ts-es">'+(isD?'—':sz(e.size))+'</span><span class="ts-edt">'+mt(e.mtime)+'</span>';
        html+='<span class="ts-ea">'+ac+'</span></div>';
        // 标签行（TagSpaces 风格：跟在文件名下面）
        if(!isD){var tg=gT(fp);if(tg.length>0)html+='<div class="ts-eg">'+tg.map(function(t){return tc(t,true);}).join('')+'</div>';}
      });
    }
    el.innerHTML=html;
    if(st){
      var dc=entries.filter(function(e){return e.type==='directory';}).length;
      var fc=entries.length-dc;
      st.textContent=(search||filterTag)?(entries.length+' 项'):(dc+' 个目录, '+fc+' 个文件');
    }
    bindDD(el,path);
    el.addEventListener('click',function(e){
      if(e.target===el||e.target.classList.contains('ts-emp')||e.target.classList.contains('ts-ld')){selPath='';rf();}
    });
  }

  // ── 拖拽上传 ──
  function bindDD(c,path){
    var dz=w&&w.$c?w.$c.querySelector('#__fb_dz'):null;if(!dz)return;
    function sh(s){dz.classList.toggle('fb-dropzone-active',s);}
    c._fbh=c._fbh||[];
    c._fbh.forEach(function(h){c.removeEventListener(h.t,h.f);});
    c._fbh=[];
    [function(e){e.preventDefault();e.stopPropagation();sh(true);},
     function(e){e.preventDefault();e.stopPropagation();sh(false);},
     function(e){e.preventDefault();e.stopPropagation();sh(false);var f=e.dataTransfer.files;if(f&&f.length>0)up(f,path);}
    ].forEach(function(fn){
      var t=fn.name==='1'?'dragover':fn.name==='2'?'dragleave':'drop';
      c.addEventListener(t,fn);c._fbh.push({t:t,f:fn});
    });
    document.body.addEventListener('dragover',function(e){e.preventDefault();});
    document.body.addEventListener('drop',function(e){e.preventDefault();});
  }

  // ── 上传 ──
  function up(files,path){
    if(!files||!files.length)return;
    to('上传 '+files.length+' 个文件...','info');
    var ok=0,fail=0;
    function nx(idx){
      if(idx>=files.length){to('上传完成: '+ok+' 成功'+(fail?', '+fail+' 失败':''),fail?'warning':'success');if(ok>0)rf();return;}
      var f=files[idx],r=new FileReader();
      r.onload=function(e){api('POST','/files/upload',{path:path,fileName:f.name,content:e.target.result.split(',')[1]}).then(function(){ok++;nx(idx+1);}).catch(function(){fail++;nx(idx+1);});};
      r.readAsDataURL(f);
    }
    nx(0);
  }

  // ── 预览 ──
  function pv(fp,fn){
    var ov=document.createElement('div');
    ov.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center';
    var pp=document.createElement('div');
    pp.style.cssText='background:var(--window-bg,#1e1e2e);border-radius:12px;padding:20px;max-width:90vw;max-height:90vh;box-shadow:0 8px 40px rgba(0,0,0,0.4);text-align:center';
    var im=document.createElement('img');
    im.src='/api/files?path='+encodeURIComponent(fp)+'&raw=1&api_key='+AK;
    im.style.cssText='max-width:80vw;max-height:70vh;border-radius:8px;object-fit:contain;margin-bottom:12px';
    im.alt=fn||'预览';
    var bt=document.createElement('div');
    bt.style.cssText='font-size:12px;color:var(--text2,#aaa)';
    bt.innerHTML='<span>'+esc(fn)+'</span> &nbsp; <button onclick="this.parentElement.parentElement.parentElement.remove()" style="padding:4px 12px;border:1px solid var(--border,#444);border-radius:4px;background:transparent;color:var(--text,#ccc);cursor:pointer">✕ 关闭</button>';
    pp.appendChild(im);pp.appendChild(bt);ov.appendChild(pp);
    ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
    document.body.appendChild(ov);
  }

  // ── 右键（带子菜单支持） ──
  var _activeSubmenu = null;
  function closeSubmenu() { if (_activeSubmenu) { _activeSubmenu.remove(); _activeSubmenu = null; } }

  function cx(e,fp,fn,isD,icn){
    document.querySelectorAll('.ts-cx').forEach(function(m){m.remove();});
    closeSubmenu();
    var items=[];
    if(isD) items.push({l:'📂 打开',a:function(){navigate(fp);}});
    else {
      items.push({l:'📄 选择',a:function(){FB_sl(fp);}});
      if(isImg(fn)){items.push({l:'🖼 预览',a:function(){pv(fp,fn);}});items.push({l:'🖼 壁纸',a:function(){wp(fp);}});}
      items.push({l:'🖥 系统打开',a:function(){openSys(fp);}});
      // ACMS 应用（全部列出，让用户自由选择）
      var ext=fn.split('.').pop().toLowerCase();
      var allApps=[
        {name:'image-editor',label:'🖼️ 图片编辑器',icon:'🖼️'},
        {name:'code-editor',label:'💻 代码编辑器',icon:'💻'},
        {name:'office-word',label:'📝 Word 编辑器',icon:'📝'},
        {name:'office-xlsx',label:'📊 Excel 编辑器',icon:'📊'},
        {name:'office-pptx',label:'📽️ PPT 编辑器',icon:'📽️'},
        {name:'web-browser',label:'🌐 浏览器',icon:'🌐'},
      ];
      items.push({l:'📂 打开方式 ▶',sub:allApps.map(function(a){
        return {l:'  '+a.label,st:'padding-left:16px;font-size:12px',a:function(){openWithAcms(a.name,fp,fn,ext);}};
      })});
      var assocKey='fb_open_'+ext;
      var saved;
      try{saved=JSON.parse(localStorage.getItem(assocKey)||'[]');}catch(e){saved=[];}
      saved.forEach(function(appName){
        items.push({l:'  '+appName,st:'padding-left:20px;color:var(--accent);font-size:11px',a:function(){openWith(fp,appName,ext);}});
      });
    }
    items.push({l:'✏️ 重命名',a:function(){rn(fp,fn,isD);}});
    items.push({l:'🗑️ 删除',a:function(){dl(fp,fn,isD);}});
    if(!isD){
      // AI 标签子菜单
      var tg=gT(fp);
      var availTags=allTN().filter(function(t){return tg.indexOf(t)===-1;});
      items.push({l:'🧠 AI 标签 ▶',sub:availTags.map(function(t){var d=tD(t);return{l:'  '+t,st:'color:'+d.color+';font-size:12px',a:function(){aT(fp,t);rf();}};}),
        subOnClick: function(subItem) { subItem.a(); }
      });
      if(tg.length>0){
        items.push({l:'🏷 移除标签 ▶',sub:tg.map(function(t){var d=tD(t);return{l:'  '+t+' ✕',st:'color:'+d.color+';font-size:12px;opacity:0.7',a:function(){rT(fp,t);rf();}};}),
          subOnClick: function(subItem) { subItem.a(); }
        });
      }
      items.push({l:'🤖 AI 生成',a:function(){ai(fp,fn);}});
    }

    var m=document.createElement('div');
    m.className='ts-cx';
    m.style.cssText='position:fixed;z-index:100000;min-width:170px;padding:5px 0;background:var(--window-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.2);left:'+e.clientX+'px;top:'+e.clientY+'px';
    items.forEach(function(it){
      if(it.sep){var d=document.createElement('div');d.style.cssText='height:1px;background:var(--border);margin:4px 8px';m.appendChild(d);return;}
      var el=document.createElement('div');
      var baseStyle='display:flex;align-items:center;padding:5px 12px;cursor:pointer;font-size:12px;gap:5px;transition:background 0.08s';
      if(it.st) baseStyle += ';' + it.st;
      if(it.sub) baseStyle += ';position:relative';
      el.style.cssText=baseStyle;
      el.textContent=it.l;
      el.addEventListener('mouseenter',function(){el.style.background='color-mix(in srgb, var(--accent) 10%, transparent)';});
      el.addEventListener('mouseleave',function(){el.style.background='transparent';});
      if(it.a) el.addEventListener('click',function(){rmCx();closeSubmenu();it.a();});
      // 子菜单 hover
      if(it.sub){
        el.addEventListener('mouseenter',function(){
          closeSubmenu();
          var sm=document.createElement('div');
          sm.className='ts-cx ts-sub';
          sm.style.cssText='position:fixed;z-index:100001;min-width:140px;padding:5px 0;background:var(--window-bg,#fff);border:1px solid var(--border,#ddd);border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.2)';
          var rect=el.getBoundingClientRect();
          sm.style.left=(rect.right)+'px';
          sm.style.top=rect.top+'px';
          // 防溢出
          if(rect.right+160>window.innerWidth) sm.style.left=(rect.left-150)+'px';
          if(rect.bottom+it.sub.length*28>window.innerHeight) sm.style.top=Math.max(5,window.innerHeight-it.sub.length*28-10)+'px';
          it.sub.forEach(function(si){
            var sel=document.createElement('div');
            var sb='display:flex;align-items:center;padding:5px 12px;cursor:pointer;font-size:12px;gap:5px;transition:background 0.08s'+(si.st?';'+si.st:'');
            sel.style.cssText=sb;
            sel.textContent=si.l;
            sel.addEventListener('mouseenter',function(){sel.style.background='color-mix(in srgb, var(--accent) 10%, transparent)';});
            sel.addEventListener('mouseleave',function(){sel.style.background='transparent';});
            sel.addEventListener('click',function(e){e.stopPropagation();rmCx();closeSubmenu();si.a();});
            sm.appendChild(sel);
          });
          document.body.appendChild(sm);
          _activeSubmenu=sm;
        });
      }
      m.appendChild(el);
    });
    document.body.appendChild(m);
    function rmCx(){if(m.parentNode)m.parentNode.removeChild(m);document.removeEventListener('click',rmCx);document.removeEventListener('contextmenu',rmCx);closeSubmenu();}
    setTimeout(function(){document.addEventListener('click',rmCx);document.addEventListener('contextmenu',rmCx);},0);
  }

  // ── 系统打开 / 选择应用 / ACMS 应用 ──
  function openSys(fp){
    api('POST','/files/open',{path:fp}).then(function(){to('已用系统默认应用打开','success');}).catch(function(e){to('打开失败: '+(e.message||''),'error');});
  }
  function openWithAcms(appName,fp,fn,ext){
    // 先保存文件信息到全局，PKG loader 会读取
    window._fb_open_file = null;
    if(appName==='image-editor'){
      // 图片：传 URL
      var src='/api/files?path='+encodeURIComponent(fp)+'&raw=1&api_key='+AK;
      window._fb_open_file = {name:fn,src:src};
      ACMSWin.open('image-editor',{w:1000,h:700,title:'🖼️ '+fn});
    } else if(appName==='code-editor'){
      // 代码：下载文本内容；保留原路径 fp 让 code-editor 保存时覆写
      fetch('/api/files?path='+encodeURIComponent(fp)+'&raw=1&api_key='+AK).then(function(r){return r.text();}).then(function(content){
        window._fb_open_file = {name:fn, content:content, filePath:fp};
        ACMSWin.open('code-editor',{w:900,h:600,title:'💻 '+fn});
      }).catch(function(e){console.log('[FB-DEBUG] code read error:', e); to('读取文件失败: '+(e&&e.message||''), 'error');});
    } else if(appName==='office-word'){
      // Word: 下载文件并保存到 office 目录，然后用 fileId 打开
      fetch('/api/files?path='+encodeURIComponent(fp)+'&raw=1&api_key='+AK).then(function(r){console.log('[FB-DEBUG] Files API response:', r.status, r.ok); return r.arrayBuffer();}).then(function(buf){
        // 分块处理大文件，避免栈溢出
        var bytes = new Uint8Array(buf);
        var b64 = '';
        var chunkSize = 8192;
        for (var i = 0; i < bytes.length; i += chunkSize) {
          var chunk = bytes.subarray(i, i + chunkSize);
          b64 += String.fromCharCode.apply(null, chunk);
        }
        b64 = btoa(b64);
        return fetch('/api/office/save', {
          method: 'POST',
          headers: {'Content-Type':'application/json','X-API-Key':'dev-key-001'},
          body: JSON.stringify({type:'docx', name: fn, content: b64}),
        });
      }).then(function(r){return r.json();}).then(function(resp){
        if(resp.ok && resp.fileId) {
          ACMSWin.open('office-word', {w:1000, h:700, title: '📝 '+fn, fileId: resp.fileId, fileName: fn});
        } else {
          to('打开失败: 保存到编辑器目录失败','error');
        }
      }).catch(function(){to('读取文件失败','error');});
    } else if(appName==='office-pptx') {
      console.log('[FB-DEBUG] Opening PPT:', JSON.stringify({appName, fp, fn, ext, AK}));
      // PPT: 下载文件并保存到 office 目录，然后用 fileId 打开
      fetch('/api/files?path='+encodeURIComponent(fp)+'&raw=1&api_key='+AK).then(function(r){
        console.log('[FB-DEBUG] Files API response:', r.status, r.ok);
        return r.arrayBuffer();
      }).then(function(buf){
        console.log('[FB-DEBUG] Buffer size:', buf.byteLength);
        // 分块处理大文件，避免栈溢出
        var bytes = new Uint8Array(buf);
        var b64 = '';
        var chunkSize = 8192;
        for (var i = 0; i < bytes.length; i += chunkSize) {
          var chunk = bytes.subarray(i, i + chunkSize);
          b64 += String.fromCharCode.apply(null, chunk);
        }
        b64 = btoa(b64);
        return fetch('/api/office/save', {
          method: 'POST',
          headers: {'Content-Type':'application/json','X-API-Key':'dev-key-001'},
          body: JSON.stringify({type:'pptx', name: fn, content: b64}),
        });
      }).then(function(r){return r.json();}).then(function(resp){
        console.log('[FB-DEBUG] Office save response:', resp);
        if(resp.ok && resp.fileId) {
          ACMSWin.open('office-pptx', {w:1000, h:650, title: '📽️ '+fn, fileId: resp.fileId, fileName: fn});
        } else {
          to('打开失败: '+((resp && resp.error) || '未知错误'),'error');
        }
      }).catch(function(e){console.log('[FB-DEBUG] PPT error:', e); to('读取文件失败: '+(e&&e.message||''),'error');});
    } else if(appName==='office-xlsx') {
      // Excel: 类似处理
      fetch('/api/files?path='+encodeURIComponent(fp)+'&raw=1&api_key='+AK).then(function(r){return r.arrayBuffer();}).then(function(buf){
        var b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        return fetch('/api/office/save', {
          method: 'POST',
          headers: {'Content-Type':'application/json','X-API-Key':'dev-key-001'},
          body: JSON.stringify({type:'xlsx', name: fn, content: b64}),
        });
      }).then(function(r){return r.json();}).then(function(resp){
        if(resp.ok && resp.fileId) {
          ACMSWin.open('office-xlsx', {w:1000, h:600, title: '📊 '+fn, fileId: resp.fileId, fileName: fn});
        } else {
          to('打开失败: 保存到编辑器目录失败','error');
        }
      }).catch(function(){to('读取文件失败','error');});
    } else if(appName==='web-browser') {
      // 浏览器：fetch HTML 内容用 srcdoc 渲染（保证正确渲染而非显示源码）
      var fileUrl='/api/files?path='+encodeURIComponent(fp)+'&raw=1&api_key='+AK;
      fetch(fileUrl).then(function(r){return r.text();}).then(function(html){
        ACMSWin.open('web-browser',{w:1100,h:750,title:'🌐 '+fn,srcdoc:html,url:fileUrl});
      }).catch(function(){to('读取文件失败','error');});
    } else {
      ACMSWin.open(appName,{w:900,h:600});
    }
  }
  function openWith(fp,appName,ext){
    api('POST','/files/open',{path:fp,app:appName}).then(function(){to('已用 '+appName+' 打开','success');}).catch(function(e){to('打开失败: '+(e.message||''),'error');});
  }
  function promptOpenWith(fp,fn,ext){
    if(typeof showPrompt==='function'){
      showPrompt({title:'选择应用',message:'输入用于打开 '+fn+' 的应用名称',placeholder:'如: notepad.exe, code, firefox'}).then(function(appName){
        if(!appName||!appName.trim())return;
        appName=appName.trim();
        // 询问是否记住此关联
        if(typeof showConfirm==='function'){
          showConfirm('以后 .'+ext+' 文件都默认用 '+appName+' 打开吗？',{title:'记住选择',confirmText:'记住',type:'info'}).then(function(remember){
            if(remember){
              var key='fb_open_'+ext;
              var list;
              try{list=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){list=[];}
              if(list.indexOf(appName)===-1)list.push(appName);
              localStorage.setItem(key,JSON.stringify(list));
            }
            openWith(fp,appName,ext);
          });
        } else {
          openWith(fp,appName,ext);
        }
      });
    } else {
      var appName=prompt('输入用于打开 '+fn+' 的应用名称:');
      if(appName&&appName.trim())openWith(fp,appName.trim(),ext);
    }
  }

  // ── 操作 ──
  function nf(){
    if(typeof showPrompt==='function'){showPrompt({title:'新建文件夹',placeholder:'名称',defaultValue:'新建文件夹',minLength:1}).then(function(n){if(n)mkd(n);});}
    else{var n=prompt('名称:','新建文件夹');if(n&&n.trim())mkd(n.trim());}
  }
  function mkd(n){api('POST','/files/mkdir',{path:curPath,name:n}).then(function(){to('已创建','success');delete treeCache[curPath];rf();}).catch(function(){to('创建失败','error');});}
  function uf(){var i=document.createElement('input');i.type='file';i.multiple=true;i.onchange=function(){if(i.files&&i.files.length>0)up(i.files,curPath);};i.click();}
  function rn(fp,on,isD){
    if(typeof showPrompt==='function'){showPrompt({title:'重命名',message:'重命名 "'+on+'"',defaultValue:on,minLength:1}).then(function(n){if(n&&n.trim()&&n.trim()!==on)dorn(fp,n.trim());});}
    else{var n=prompt('重命名 "'+on+'" 为:',on);if(n&&n.trim()&&n.trim()!==on)dorn(fp,n.trim());}
  }
  function dorn(fp,nn){api('POST','/files/rename',{path:fp,newName:nn}).then(function(){to('已重命名','success');delete treeCache[curPath];delete treeCache[pp(fp)];rf();}).catch(function(){to('重命名失败','error');});}
  function dl(fp,fn,isD){
    var msg=isD?'删除目录 "'+fn+'" 及其所有内容？':'删除文件 "'+fn+'"？';
    if(typeof showConfirm==='function'){showConfirm(msg,{title:'确认删除',confirmText:'删除'}).then(function(o){if(o)dodl(fp);});}
    else{if(confirm(msg))dodl(fp);}
  }
  function dodl(fp){api('POST','/files/delete',{path:fp}).then(function(){to('已删除','success');delete treeCache[curPath];delete treeCache[pp(fp)];selPath='';rf();}).catch(function(){to('删除失败','error');});}
  function wp(fp){if(window.ACMSWallpaper)ACMSWallpaper.set('/api/files?path='+encodeURIComponent(fp)+'&raw=1','cover').catch(function(){to('壁纸失败','error');});}

  // ── 导航 ──
  function navigate(p){if(!w||w.dead||p===curPath)return;hist.push(curPath);fwd=[];curPath=p;curSearch='';selPath='';expTree(p);rf();}
  function gb(){if(hist.length===0)return;fwd.push(curPath);curPath=hist.pop();curSearch='';selPath='';expTree(curPath);rf();}
  function gf(){if(fwd.length===0)return;hist.push(curPath);curPath=fwd.pop();curSearch='';selPath='';expTree(curPath);rf();}
  function gu(){if(curPath==='/')return;navigate(pp(curPath));}
  function rfs(){delete treeCache[curPath];selPath='';rf();}
  function expTree(p){
    if(!p||p==='/')return lTC('/');
    expDirs['/']=true;
    var pts=p.replace(/^\/+/,'').replace(/\/+$/,'').split('/'),a='';
    pts.forEach(function(x){if(!x)return;a=a?a+'/'+x:'/'+x;expDirs[a]=true;});
    return lCh(p);
  }
  function lCh(p){
    if(!p||p==='/')return treeCache['/']?Promise.resolve():lTC('/');
    var pts=p.replace(/^\/+/,'').replace(/\/+$/,'').split('/'),ch=['/'],a='';
    pts.forEach(function(x){if(!x)return;a=a?a+'/'+x:'/'+x;ch.push(a);});
    function nx(i){if(i>=ch.length)return Promise.resolve();var p2=ch[i];return treeCache[p2]?nx(i+1):lTC(p2).then(function(){return nx(i+1);});}
    return nx(0);
  }
  function lTC(p){return api('GET','/files?path='+encodeURIComponent(p)).then(function(d){if(d&&d.entries)treeCache[p]=d.entries;}).catch(function(){treeCache[p]=[];});}
  function tT(p){expDirs[p]=!expDirs[p];if(expDirs[p]&&!treeCache[p])lTC(p).then(function(){rf();});rf();}
  function sr(v){curSearch=v.trim();selPath='';loadList(w,curPath,curSearch);}
  function st(k){if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=1;}rf();}
  function sl(p){selPath=(selPath===p)?'':p;rf();}
  function fl(t){filterTag=(filterTag===t)?'':t;rf();}
  function vm(m){viewMode=m;rf();}
  function lT(t){leftTab=t;rf();}

  // ── AI 标签 ──
  function ai(fp,fn){
    var btn=w&&w.$c?w.$c.querySelector('#__fb_ai'):null;
    if(btn)btn.disabled=true;
    to('🤖 AI 分析 '+fn+'...','info');
    api('POST','/api/chat/detect-and-respond',{reqId:'_fb_ai',text:'为文件 "'+fn+'" 生成 3-5 个中文标签（词或短语），只返回逗号分隔的列表。路径: '+fp})
    .then(function(d){
      var r=d&&(d.aiReply||d.content||d.message||d.text||'');
      if(!r){to('AI 无响应','warning');return;}
      var tags=r.split(/[,，、\n]/).map(function(s){return s.trim().replace(/^["'「『\s]+|["'」』\s]+$/g,'');}).filter(function(s){return s.length>0&&s.length<20;});
      if(tags.length===0){to('AI 未生成有效标签','warning');return;}
      tags.forEach(function(t){
        var f=false;
        tagGroups.forEach(function(g){(g.children||[]).forEach(function(c){if(c.title===t)f=true;});});
        if(!f&&tagGroups.length>0){tagGroups[0].children.push({title:t,color:'#95a5a6',textcolor:'#fff'});svTg();}
        aT(fp,t);
      });
      to('✅ 已添加 '+tags.length+' 个标签','success');
      rf();
    }).catch(function(e){to('AI 标签失败: '+(e.message||'错误'),'error');}).then(function(){if(btn)btn.disabled=false;});
  }

  // ── 标签操作 ──
  function aTF(sel,fp){if(!sel.value)return;aT(fp,sel.value);sel.value='';rf();}
  function rmT(el){var t=el.getAttribute('data-t');if(!t)return;var fp=selPath;if(fp){rT(fp,t);rf();}}

  // ═══ 全局 ═══
  window.FB_nv=navigate;window.FB_gb=gb;window.FB_gf=gf;window.FB_gu=gu;window.FB_rf=rfs;
  window.FB_nf=nf;window.FB_uf=uf;window.FB_pv=pv;window.FB_tT=tT;
  window.FB_sr=sr;window.FB_rn=rn;window.FB_dl=dl;window.FB_wp=wp;
  window.FB_cx=cx;window.FB_sl=sl;window.FB_fl=fl;window.FB_st=st;
  window.FB_vm=vm;window.FB_lt=lT;
  window.FB_ai=ai;window.FB_aTF=aTF;window.FB_rmT=rmT;
  window.FB_loadDir=function(p){if(w&&!w.dead)navigate(p);};
  window.FB_toggleDrives=function(){
    var list=document.getElementById('ts_drives_list');
    var arr=document.getElementById('ts_drives_arr');
    if(!list||!arr)return;
    var h=list.style.display==='none';
    list.style.display=h?'':'none';
    arr.textContent=h?'▼':'▶';
  };

  // ═══ 注册 ═══
  if(window.ACMSWin){
    var ld=function(_w){
      w=_w;hist=[];fwd=[];curSearch='';expDirs={};treeCache={};ctxEntry=null;selPath='';filterTag='';viewMode='list';leftTab='tags';
      loadTags();curPath=iP();
      // 加载盘符
      api('GET','/files/drives').then(function(d){if(d&&d.drives){_drives=d.drives;if(w&&!w.dead)render(w);}}).catch(function(){});
      expTree(curPath).then(function(){render(w);}).catch(function(){render(w);});
    };
    if(window.ACMS&&ACMS.registerPackage){
      // v0.66: 暴露 fileBrowserAPI（agentTools handler 复用）
      window.fileBrowserAPI = {
        searchFiles: async function(path, query, maxResults) {
          var url = '/files/search?q=' + encodeURIComponent(query) +
                    '&path=' + encodeURIComponent(path) +
                    '&limit=' + encodeURIComponent(maxResults || 20);
          var data = await api('GET', url);
          if (data && data.error) {
            return { ok: false, error: data.error, message: data.message, files: [] };
          }
          var files = (data && data.files) || (data && data.results) || (Array.isArray(data) ? data : []);
          return { ok: true, files: files, count: files.length };
        },
      };

      ACMS.registerPackage('file-manager',{
        title:'文件浏览器',icon:'📂',category:'工具',defaultSize:{w:1280,h:800},loader:ld,
        // v0.66: App-as-Tool 声明 — 让小吉/chat 流能直接调 file-browser 能力
        agentTools: [
          {
            name: 'file_search',
            description: 'USE WHEN: 用户想"找文件""搜文件""列出目录下含 X 的文件"。在指定目录下搜索文件名包含关键词的文件，返回文件名、路径、大小。注意：仅搜文件名，不搜文件内容。',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string', description: '搜索根目录绝对路径（Windows 如 C:/Users/多/Documents，Linux 如 /home/user/Documents）' },
                query: { type: 'string', description: '文件名关键词（支持中文，如 README、需求、季度汇报）' },
                maxResults: { type: 'number', description: '最大返回数（默认 20，建议不超过 100）' },
              },
              required: ['path', 'query'],
            },
            handler: async function(args) {
              if (!args || !args.path || !args.query) {
                return { ok: false, error: 'INVALID_ARGS', message: '需要 path 和 query' };
              }
              return await window.fileBrowserAPI.searchFiles(args.path, args.query, args.maxResults);
            },
          },
        ],
      });
    } else {
      ACMSWin.registerViewLoader('file-manager',ld);
    }
  }
})();
