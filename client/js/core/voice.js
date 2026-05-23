// 语音录入工具 — Web Speech API
// 支持 Chrome / Edge，中文识别

let _voiceRec = null;
let _voiceInput = null;
let _voiceBtn = null;

function startVoiceInput(inputEl, btnEl) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toast('浏览器不支持语音识别，请使用 Chrome 或 Edge', 'error');
    return;
  }

  // 已处于录音状态 → 点击停止
  if (_voiceRec) {
    _voiceRec.stop();
    return;
  }

  _voiceInput = inputEl;
  _voiceBtn = btnEl;

  _voiceRec = new SR();
  _voiceRec.lang = 'zh-CN';
  _voiceRec.interimResults = true;
  _voiceRec.continuous = false;

  _voiceRec.onstart = () => {
    if (_voiceBtn) _voiceBtn.classList.add('listening');
    toast('🎤 正在聆听...', 'success');
  };

  _voiceRec.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    if (_voiceInput) { _voiceInput.value = text; _voiceInput.dispatchEvent(new Event('input')); }
  };

  _voiceRec.onerror = (e) => {
    toast('语音识别失败: ' + e.error, 'error');
    _cleanup();
  };

  _voiceRec.onend = () => _cleanup();

  _voiceRec.start();
}

function _cleanup() {
  if (_voiceBtn) _voiceBtn.classList.remove('listening');
  _voiceRec = null;
  _voiceInput = null;
  _voiceBtn = null;
}
