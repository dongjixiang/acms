const sessId = 'sess-debug-x1';
const c = document.getElementById('chat-stream-msgs-' + sessId);
const out = (() => {
  if (!c) return {error: 'no container'};
  const r = c.getBoundingClientRect();
  let win = c.closest('.acms-window');
  if (!win) win = c.closest('[class*="window"]');
  const winR = win ? win.getBoundingClientRect() : null;
  const winStyle = win ? window.getComputedStyle(win) : null;
  const cStyle = window.getComputedStyle(c);
  const bubble = c.querySelector('.chat-bubble-system');
  const bubbleR = bubble ? bubble.getBoundingClientRect() : null;
  const bubbleStyle = bubble ? window.getComputedStyle(bubble) : null;
  return {
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    containerRect: r ? {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)} : null,
    containerDisplay: cStyle.display,
    containerVisibility: cStyle.visibility,
    containerHeight: cStyle.height,
    containerOverflow: cStyle.overflow,
    windowRect: winR ? {x: Math.round(winR.x), y: Math.round(winR.y), w: Math.round(winR.width), h: Math.round(winR.height)} : null,
    windowDisplay: winStyle?.display,
    windowVisibility: winStyle?.visibility,
    windowOpacity: winStyle?.opacity,
    windowZIndex: winStyle?.zIndex,
    bubbleRect: bubbleR ? {x: Math.round(bubbleR.x), y: Math.round(bubbleR.y), w: Math.round(bubbleR.width), h: Math.round(bubbleR.height)} : null,
    bubbleDisplay: bubbleStyle?.display,
    bubbleHeight: bubbleStyle?.height,
    bubbleVisibility: bubbleStyle?.visibility,
  };
})();
JSON.stringify(out, null, 2);
