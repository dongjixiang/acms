// ACMS Web 端独立输入法 (v0.1 - MVP)
// 用途：解决 F11 全屏下 OS 输入法切换快捷键被拦截的问题
// 路径：client/js/core/ime-core.js
//
// 核心设计：
//   - 全局单例 IMECore，挂到 window.ACMSIME
//   - 极简拼音索引：声母+韵母首字母匹配（不区分声调，覆盖常用词）
//   - 给所有 input/textarea/contenteditable 提供拼音输入
//   - F8 切换中/英模式（全局，ACMS 全屏里可用）
//   - 浮窗显示状态指示器（右上角）+ 候选词面板（跟随光标）
//
// 用法（外部直接用）：
//   window.ACMSIME.toggle();            // 切中/英
//   window.ACMSIME.setMode('en');       // 设英文
//   window.ACMSIME.isEnabled();         // 当前模式
//
// 设计原则：
//   - 不破坏现有：纯增量，不改任何现有 JS
//   - 与 OS 输入法共存：只在用户按 F8 进入 web 输入法模式时拦截
//   - contenteditable 支持：v1.0 范围内（覆盖 chat 流、邮件正文）

(function () {
  'use strict';

  // ==========================================================================
  // 拼音词库（极简 MVP - 声母首字母匹配 + 韵母模糊）
  // 索引规则：键 = 拼音首字母串（小写），值 = 候选词数组（按优先级排序）
  // ==========================================================================
  const PINYIN_DICT = {
    // === 单字（高频 60） ===
    'w': ['我', '问', '为', '位', '外', '完', '望', '往', '微', '未'],
    'n': ['你', '那', '呢', '内', '能', '年', '难', '拿', '哪', '南'],
    't': ['他', '她', '它', '天', '太', '听', '同', '提', '体', '通'],
    's': ['是', '说', '三', '十', '上', '时', '事', '谁', '水', '色'],
    'h': ['好', '和', '很', '后', '回', '话', '还', '海', '花', '黑'],
    'd': ['的', '到', '大', '多', '对', '当', '点', '地', '道', '得'],
    'b': ['不', '把', '吧', '比', '别', '本', '白', '百', '帮', '半'],
    'l': ['了', '来', '里', '老', '路', '两', '力', '拉', '六', '零'],
    'z': ['在', '中', '之', '这', '只', '自', '做', '走', '最', '字'],
    'y': ['一', '有', '也', '要', '用', '呀', '样', '又', '以', '远'],
    'x': ['下', '想', '小', '新', '学', '行', '先', '些', '西', '心'],
    'j': ['就', '家', '几', '见', '进', '今', '觉', '叫', '接', '级'],
    'q': ['去', '前', '请', '钱', '情', '亲', '千', '七', '求', '全'],
    'k': ['看', '可', '开', '口', '空', '快', '况', '苦', '客', '科'],
    'm': ['吗', '没', '么', '面', '名', '明', '妈', '马', '门', '美'],
    'f': ['发', '分', '非', '风', '方', '放', '飞', '反', '父', '夫'],
    'g': ['过', '给', '高', '个', '跟', '关', '国', '光', '更', '共'],
    'r': ['人', '日', '让', '如', '然', '热', '认', '入', '若', '弱'],
    'p': ['片', '破', '旁', '跑', '平', '怕', '票', '评', '普', '朋'],
    'c': ['从', '次', '才', '长', '出', '春', '吃', '车', '城', '差'],

    // === 双字词（高频 80） ===
    'nh': ['你好', '年后', '内含', '女孩', '暖和', '难懂'],
    'ninhao': ['你好', '你号', '你豪', '你耗'],
    'zs': ['知识', '展示', '战胜', '真实', '罩衫', '招商'],
    'xq': ['星期', '心情', '小区', '校区', '先前', '暑期', '相亲'],
    'ht': ['合同', '话题', '后天', '回头', '海滩', '绘画'],
    'zh': ['中国', '账号', '智慧', '智慧', '浙江', '中华', '综合'],
    'zhong': ['中国', '重要', '中间', '终于', '中央', '中文', '衷心'],
    'sh': ['上海', '什么', '生活', '时间', '手机', '书', '双手', '数字', '审核', '生成'],
    'she': ['设备', '涉及', '社交', '摄取', '射程', '舌头', '奢侈', '舌头'],
    'sj': ['时间', '实践', '手机', '升级', '世界', '数据', '事件', '设计', '司机', '睡觉'],
    'sjfd': ['手机端', '手动', '手动'],
    'py': ['拼音', '朋友', '培育', '评论', '瓢泼'],
    'pz': ['配置', '品质', '凭证', '拍摄', '炮制'],
    'yh': ['银行', '以后', '用户', '优化', '优秀', '烟花', '遗憾'],
    'yh1': ['一号', '一跃'],
    'yh2': ['与会', '育儿'],
    'dl': ['登录', '登录', '代理', '大连', '登录'],
    'yh3': ['一会儿', '优惠'],
    'mm': ['密码', '妈妈', '妹妹', '慢慢', '买卖', '眉毛', '每秒'],
    'zc': ['注册', '注册', '资产', '自创', '字词'],
    'tc': ['退出', '套餐', '体彩', '天才', '通车', '统筹'],
    'bj': ['编辑', '背景', '比较', '笔记', '标记', '毕竟', '布局'],
    'sc': ['删除', '收藏', '时长', '生成', '生存', '市场', '瞬间'],
    'xz': ['下载', '现在', '薪资', '选择', '鞋子', '形状', '旋转'],
    'bc': ['保存', '保持', '补偿', '编程', '编程', '拔出', '编程'],
    'qx': ['取消', '权限', '期限', '情绪', '汽车', '器材'],
    'qr': ['确认', '嵌入', '前往', '情趣', '权人', '权荣'],
    'qd': ['确定', '清单', '签到', '强度', '强盗', '桥墩'],
    'gb': ['关闭', '公布', '告别', '干部', '国标', '广播'],
    'ck': ['查看', '仓库', '参考', '出口', '刺客', '车窗'],
    'lb': ['列表', '类别', '礼拜', '楼层', '老板', '雷达', '猎豹'],
    'ml': ['目录', '美丽', '明朗', '马力', '冒领', '毛利'],
    'wj': ['文件', '问卷', '五金', '无极', '吴京'],
    'tp': ['图片', '投票', '天平', '头皮', '套牌', '胎盘'],
    'sp': ['视频', '商品', '审批', '水平', '时评', '实拍'],
    'ms': ['描述', '没事', '秘书', '美食', '茂盛', '秒杀'],
    'bt': ['标题', '拜托', '白糖', '白条', '白塔', '百态'],
    'nr': ['内容', '那儿', '男女', '纳入', '难忍', '能忍'],
    'jq': ['坚强', '机器', '进去', '景区', '举起', '建群'],
    'cg': ['成功', '采购', '成果', '唱歌', '苍狗', '仓管'],
    'yf': ['衣服', '研发', '预防', '语法', '银发', '有福'],
    'cy': ['成员', '测验', '残余', '草原', '春雨', '苍蝇', '初一'],

    // === 句子和短语（高频 40） ===
    'wh': ['我会', '维护', '挽回', '无悔', '玩忽'],
    'whtk': ['我会尽快', '维护天空'],
    'wk': ['完了', '无可奉告', '维康'],
    'wx': ['微信', '五星', '文学', '外形', '维修', '危险', '微笑'],
    'weixin': ['微信', '维新'],
    'qq': ['腾讯', '请求', '请求', '缺钱', '缺勤', '穷人'],
    'bd': ['百度', '报道', '不当', '必定', '博大', '拨打'],
    'wx1': ['我想', '无限', '微笑', '维新', '微信', '卫星', '外星'],
    'acms': ['ACMS', '智能体协同管理系统', '爱车人士', '爱财迷神', '爱草迷神'],
    'xm': ['项目', '姓名', '熊猫', '寻觅', '醒目', '辛梅'],
    'cp': ['产品', '车牌', '草坪', '测评', '词频'],
    'yw': ['业务', '原文', '英文', '药物', '夜晚', '雅虎'],
    'kh': ['客户', '开火', '开荒', '恳后', '孔辉'],
    'yj': ['意见', '已经', '研究', '眼睛', '硬件', '邮寄'],
    'sj1': ['实际', '事件', '升级', '手机', '时间', '世界', '设计', '司机', '睡觉'],
    'rq': ['日期', '热情', '人气', '认清', '人气'],
    'dz': ['地址', '动作', '弟子', '大众', '胆子', '打桩', '调整'],
    'yx': ['邮箱', '游戏', '营销', '影响', '有些', '运行', '允许', '优秀'],
    'dj': ['点击', '大家', '登记', '电机', '短句', '倒计时'],
    'bk': ['博客', '百科', '包括', '不可', '步宽', '悲苦'],
    'cn': ['菜单', '目前', '承诺', '才能', '残年'],
    'cn1': ['中国', '中年', '中能', '中年'],
    'hk': ['好看', '客户', '回款', '会计', '环节', '划款', '汇款'],
    'dd': ['多多', '到达', '到底', '懂得', '点滴', '电灯'],
    'hy': ['好友', '会议', '欢迎', '行业', '合约', '海洋'],
    'td': ['团队', '天地', '通道', '特地', '田地'],
    'xm1': ['姓名', '项目', '选煤', '熊梅'],
    'km': ['客户', '开门', '科目', '科密'],
    'kp': ['卡片', '空调', '科普', '卡片', '看破', '空瓶'],
    'tg': ['推广', '通关', '天宫', '体改', '体感'],
  };

  // 拼音到汉字的完整映射（用作 fallback）
  const SIMPLE_MAP = {
    'wo': '我', 'ni': '你', 'ta': '他', 'de': '的', 'le': '了',
    'shi': '是', 'zai': '在', 'you': '有', 'he': '和', 'ye': '也',
    'jiu': '就', 'bu': '不', 'ren': '人', 'dou': '都', 'yi': '一',
    'ge': '个', 'shang': '上', 'hen': '很', 'dao': '到', 'shuo': '说',
    'yao': '要', 'qu': '去', 'hui': '会', 'zhe': '这', 'na': '那',
    'li': '里', 'kan': '看', 'hao': '好', 'ziji': '自己', 'xian': '现在',
    'tian': '天', 'di': '地', 'shijie': '世界', 'guo': '过',
  };

  // ==========================================================================
  // 常量
  // ==========================================================================
  const STORAGE_KEY = 'acms_ime_mode';
  const TOGGLE_KEY = 'F8';

  // ==========================================================================
  // 拼音匹配算法
  // ==========================================================================
  function lookup(pinyin) {
    if (!pinyin) return [];
    const key = pinyin.toLowerCase().trim();

    // 1. 精确匹配
    if (PINYIN_DICT[key]) return PINYIN_DICT[key].slice(0, 9);

    // 2. 前缀匹配（输入 "n" 也要能匹配 "nh", "ni" 等）
    const prefixMatches = [];
    for (const dictKey in PINYIN_DICT) {
      if (dictKey.startsWith(key)) {
        prefixMatches.push(...PINYIN_DICT[dictKey]);
      }
    }
    if (prefixMatches.length > 0) {
      // 去重 + 截前 9 个
      return [...new Set(prefixMatches)].slice(0, 9);
    }

    // 3. 完全拼音映射
    if (SIMPLE_MAP[key]) return [SIMPLE_MAP[key]];

    return [];
  }

  // ==========================================================================
  // DOM 工具
  // ==========================================================================
  function isInputElement(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      // text-like types only
      return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(type);
    }
    if (tag === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function getCaretCoords() {
    const el = state.activeElement;
    if (!el) return { x: 0, y: 0 };

    // contenteditable: 用 selection API
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0).cloneRange();
        const rect = range.getBoundingClientRect();
        if (rect.width || rect.height) return { x: rect.left, y: rect.bottom };
        // 空 range → 退化为元素位置
        const elRect = el.getBoundingClientRect();
        return { x: elRect.left, y: elRect.bottom };
      }
    }

    // input/textarea: 用 mirror div 测量
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const mirror = document.createElement('div');
    mirror.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      font: ${style.font};
      padding: ${style.padding};
      border: ${style.border};
      box-sizing: ${style.boxSizing};
      width: ${el.clientWidth}px;
      left: -9999px;
      top: 0;
    `;
    const before = el.value.substring(0, el.selectionStart);
    const span = document.createElement('span');
    span.textContent = before;
    mirror.appendChild(span);
    document.body.appendChild(mirror);
    const spanRect = span.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    document.body.removeChild(mirror);

    return {
      x: rect.left + (spanRect.left - mirrorRect.left),
      y: rect.top + (spanRect.top - mirrorRect.top) + parseInt(style.lineHeight) || 20
    };
  }

  // ==========================================================================
  // 上屏逻辑
  // ==========================================================================
  function commit(text) {
    const el = state.activeElement;
    if (!el || !text) return;

    if (el.isContentEditable) {
      commitToEditable(el, text);
    } else {
      commitToInput(el, text);
    }
    // 重置拼音缓冲区
    state.buffer = '';
    state.candidates = [];
    renderPanel();
  }

  function commitToInput(el, text) {
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const before = el.value.substring(0, start);
    const after = el.value.substring(end);
    el.value = before + text + after;
    const newPos = start + text.length;
    el.setSelectionRange(newPos, newPos);
    // 触发 ACMS 现有的 input 监听
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function commitToEditable(el, text) {
    el.focus();
    const sel = window.getSelection();
    if (sel.rangeCount === 0) {
      // 没选区 → 追加到末尾
      el.appendChild(document.createTextNode(text));
    } else {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // 触发 input 事件
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  // ==========================================================================
  // 浮层 DOM
  // ==========================================================================
  let styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement('style');
    style.id = 'acms-ime-style';
    style.textContent = `
.acms-ime-indicator {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 99999;
  background: var(--bg2, #1e1e1e);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text, #e0e0e0);
  cursor: pointer;
  user-select: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s;
}
.acms-ime-indicator:hover {
  border-color: var(--accent1, #0ea89d);
}
.acms-ime-indicator .acms-ime-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
  transition: all 0.15s;
}
.acms-ime-indicator[data-mode="cn"] .acms-ime-dot {
  background: var(--accent1, #0ea89d);
  box-shadow: 0 0 8px var(--accent1, #0ea89d);
  animation: acms-ime-pulse 1.5s ease-in-out infinite;
}
@keyframes acms-ime-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.acms-ime-indicator .acms-ime-label {
  font-weight: 500;
}
.acms-ime-indicator .acms-ime-hint {
  font-size: 11px;
  color: var(--text2, #888);
  border-left: 1px solid var(--border, #333);
  padding-left: 8px;
  margin-left: 4px;
}
.acms-ime-panel {
  position: fixed;
  z-index: 99998;
  background: var(--bg2, #1e1e1e);
  border: 1px solid var(--accent1, #0ea89d);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  display: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  min-width: 280px;
}
.acms-ime-panel.acms-ime-active {
  display: block;
}
.acms-ime-buffer {
  font-size: 13px;
  color: var(--text2, #888);
  padding: 4px 8px;
  border-bottom: 1px solid var(--border, #333);
  margin-bottom: 6px;
  font-family: Consolas, "Courier New", monospace;
}
.acms-ime-buffer span {
  color: var(--accent1, #0ea89d);
  font-weight: 600;
}
.acms-ime-candidates {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.acms-ime-candidate {
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 15px;
  color: var(--text, #e0e0e0);
  cursor: pointer;
  transition: background 0.1s;
  display: flex;
  align-items: center;
  gap: 8px;
}
.acms-ime-candidate:hover {
  background: var(--bg3, #2a2a2a);
}
.acms-ime-candidate.acms-ime-cand-active {
  background: var(--accent1, #0ea89d);
  color: #fff;
}
.acms-ime-candidate-index {
  font-size: 11px;
  color: var(--text2, #888);
  font-family: Consolas, monospace;
  min-width: 14px;
}
.acms-ime-candidate.acms-ime-cand-active .acms-ime-candidate-index {
  color: rgba(255,255,255,0.85);
}
.acms-ime-helper {
  font-size: 10px;
  color: var(--text2, #888);
  padding: 4px 8px;
  margin-top: 4px;
  border-top: 1px solid var(--border, #333);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.acms-ime-helper kbd {
  background: var(--bg3, #2a2a2a);
  border: 1px solid var(--border, #444);
  border-radius: 3px;
  padding: 1px 5px;
  font-family: Consolas, monospace;
  font-size: 10px;
  color: var(--text, #e0e0e0);
}
    `;
    document.head.appendChild(style);
  }

  function createIndicator() {
    const el = document.createElement('div');
    el.className = 'acms-ime-indicator';
    el.dataset.mode = 'en';
    el.innerHTML = `
      <div class="acms-ime-dot"></div>
      <span class="acms-ime-label">EN</span>
      <span class="acms-ime-hint">F8</span>
    `;
    el.title = 'ACMS Web 输入法 - 点击或按 F8 切换中/英';
    document.body.appendChild(el);
    el.addEventListener('click', () => toggle());
    return el;
  }

  function createPanel() {
    const el = document.createElement('div');
    el.className = 'acms-ime-panel';
    el.innerHTML = `
      <div class="acms-ime-buffer"></div>
      <div class="acms-ime-candidates"></div>
      <div class="acms-ime-helper">
        <span><kbd>1-9</kbd> 选词</span>
        <span><kbd>Space</kbd> 首选</span>
        <span><kbd>Enter</kbd> 上屏原串</span>
        <span><kbd>Esc</kbd> 取消</span>
        <span><kbd>←</kbd>←<kbd>→</kbd> 翻页</span>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  // ==========================================================================
  // 渲染
  // ==========================================================================
  const state = {
    mode: localStorage.getItem(STORAGE_KEY) || 'en',  // 'cn' | 'en'
    buffer: '',
    candidates: [],
    selectedIndex: 0,
    activeElement: null,
    indicator: null,
    panel: null,
  };

  function renderIndicator() {
    if (!state.indicator) return;
    state.indicator.dataset.mode = state.mode;
    const label = state.indicator.querySelector('.acms-ime-label');
    label.textContent = state.mode === 'cn' ? '中' : 'EN';
    state.indicator.title = state.mode === 'cn'
      ? 'ACMS Web 输入法 - 中文模式（拼音输入）\n点击或按 F8 切换到英文'
      : 'ACMS Web 输入法 - 英文模式（直输）\n点击或按 F8 切换到中文';
  }

  function renderPanel() {
    if (!state.panel) return;
    if (state.mode === 'en' || !state.buffer) {
      state.panel.classList.remove('acms-ime-active');
      return;
    }

    state.candidates = lookup(state.buffer);
    state.selectedIndex = 0;

    const bufferEl = state.panel.querySelector('.acms-ime-buffer');
    bufferEl.innerHTML = state.buffer.split('').map((c, i) =>
      `<span>${c}</span>`
    ).join('');

    const candEl = state.panel.querySelector('.acms-ime-candidates');
    if (state.candidates.length === 0) {
      candEl.innerHTML = '<div style="padding:12px;color:var(--text2,#888);font-size:13px;">无匹配候选（按 Enter 上屏原拼音）</div>';
    } else {
      candEl.innerHTML = state.candidates.map((c, i) => `
        <div class="acms-ime-candidate ${i === 0 ? 'acms-ime-cand-active' : ''}" data-idx="${i}">
          <span class="acms-ime-candidate-index">${i + 1}</span>
          <span>${c}</span>
        </div>
      `).join('');
      // 绑定点击
      candEl.querySelectorAll('.acms-ime-candidate').forEach(node => {
        node.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const idx = parseInt(node.dataset.idx);
          selectCandidate(idx);
        });
      });
    }

    // 定位
    positionPanel();
    state.panel.classList.add('acms-ime-active');
  }

  function positionPanel() {
    if (!state.activeElement) return;
    const coords = getCaretCoords();
    const panel = state.panel;
    const panelRect = panel.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let x = coords.x;
    let y = coords.y + 4;

    // 边界检测
    if (x + panelRect.width > viewportW - 8) {
      x = viewportW - panelRect.width - 8;
    }
    if (y + panelRect.height > viewportH - 8) {
      // 放到输入框上方
      y = coords.y - panelRect.height - 8;
      if (y < 8) y = 8;
    }
    if (x < 8) x = 8;

    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }

  // ==========================================================================
  // 候选词操作
  // ==========================================================================
  function selectCandidate(idx) {
    const candidate = state.candidates[idx];
    if (!candidate) {
      // 没候选 → 上屏原拼音
      commit(state.buffer);
      return;
    }
    commit(candidate);
  }

  function backspace() {
    if (state.buffer.length > 0) {
      state.buffer = state.buffer.slice(0, -1);
      renderPanel();
    }
  }

  function feedChar(ch) {
    state.buffer += ch.toLowerCase();
    renderPanel();
  }

  function clearBuffer() {
    state.buffer = '';
    state.candidates = [];
    state.selectedIndex = 0;
    renderPanel();
  }

  // ==========================================================================
  // 模式切换
  // ==========================================================================
  function setMode(mode) {
    if (mode !== 'cn' && mode !== 'en') return;
    state.mode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    clearBuffer();
    renderIndicator();
    console.log(`[ACMSIME] 切换到 ${mode === 'cn' ? '中文（拼音）' : '英文（直输）'} 模式`);
  }

  function toggle() {
    setMode(state.mode === 'cn' ? 'en' : 'cn');
  }

  function isEnabled() {
    return state.mode === 'cn';
  }

  // ==========================================================================
  // 全局键盘监听
  // ==========================================================================
  function handleKeydown(e) {
    // F8 全局切换（即使不在输入框里也响应）
    if (e.key === TOGGLE_KEY) {
      e.preventDefault();
      toggle();
      return;
    }

    // 只在中文模式 + 输入框里拦截
    if (state.mode !== 'cn') return;
    if (!isInputElement(e.target)) return;

    const el = e.target;

    // 如果浏览器已经在用 OS 输入法（composition 事件进行中），让 OS 输入法处理
    if (e.isComposing || el.matches?.(':focus-within')) {
      // 继续让默认事件通过
    }

    // 拼音缓冲区有内容时拦截字母/数字
    if (state.buffer.length > 0 && /^[a-zA-Z0-9]$/.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();

      // 1-9 → 选候选词
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key) - 1;
        if (idx < state.candidates.length) {
          selectCandidate(idx);
        } else {
          // 超出范围 → 上屏原拼音
          commit(state.buffer);
          // 如果是字母，作为新拼音字符
          if (/^[a-zA-Z]$/.test(e.key)) feedChar(e.key);
        }
        return;
      }

      // 空格 → 首选
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (state.candidates.length > 0) {
          selectCandidate(0);
        } else {
          commit(state.buffer + ' ');
        }
        return;
      }

      // 字母 → 累积到拼音缓冲
      if (/^[a-zA-Z]$/.test(e.key)) {
        feedChar(e.key);
        return;
      }

      // Backspace → 删除拼音字符
      if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
        return;
      }

      // Esc → 清空
      if (e.key === 'Escape') {
        e.preventDefault();
        clearBuffer();
        return;
      }

      // Enter → 上屏原拼音
      if (e.key === 'Enter') {
        e.preventDefault();
        commit(state.buffer);
        return;
      }
    }

    // 拼音缓冲区为空时，只拦截字母键进入拼音模式
    if (state.buffer.length === 0 && /^[a-z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      feedChar(e.key);
      return;
    }
  }

  // ==========================================================================
  // Focus 跟踪
  // ==========================================================================
  function handleFocusIn(e) {
    if (isInputElement(e.target)) {
      state.activeElement = e.target;
    }
  }

  function handleFocusOut(e) {
    // 延迟清空，避免点击候选词时 focus 已经丢了
    setTimeout(() => {
      if (document.activeElement !== e.target && state.activeElement === e.target) {
        state.activeElement = null;
        clearBuffer();
      }
    }, 150);
  }

  // ==========================================================================
  // 初始化
  // ==========================================================================
  function init() {
    injectStyle();
    state.indicator = createIndicator();
    state.panel = createPanel();

    document.addEventListener('keydown', handleKeydown, true);  // 捕获阶段
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // 滚动时重新定位候选词面板
    document.addEventListener('scroll', () => {
      if (state.panel.classList.contains('acms-ime-active')) {
        positionPanel();
      }
    }, true);

    // 点击空白处清空拼音缓冲
    document.addEventListener('mousedown', (e) => {
      // 点候选词和指示器不触发
      if (e.target.closest('.acms-ime-panel') || e.target.closest('.acms-ime-indicator')) return;
      // 点输入框不触发（focusin 会处理）
      if (isInputElement(e.target)) return;
      clearBuffer();
    });

    renderIndicator();
    console.log('[ACMSIME] v0.1 初始化完成，当前模式:', state.mode, '- 按 F8 切换中英文');
  }

  // DOM ready 后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露全局 API
  window.ACMSIME = {
    toggle,
    setMode,
    isEnabled,
    lookup,
    _state: state,  // 调试用
  };
})();
