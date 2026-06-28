(function() {
  const c = document.querySelector('[id^="chat-stream-msgs"]');
  if (!c) return JSON.stringify({error: 'no chat stream container'});
  const cards = Array.from(document.querySelectorAll('.music-card-in-chat'));
  const vp = window.innerHeight;
  return JSON.stringify({
    viewportHeight: vp,
    scrollTop: c.scrollTop,
    scrollHeight: c.scrollHeight,
    clientHeight: c.clientHeight,
    cards: cards.map((c2, i) => ({
      i,
      title: c2.querySelector('div')?.innerText?.slice(0, 40),
      top: Math.round(c2.getBoundingClientRect().top),
      bottom: Math.round(c2.getBoundingClientRect().bottom),
      height: Math.round(c2.getBoundingClientRect().height),
      inViewport: c2.getBoundingClientRect().top < vp && c2.getBoundingClientRect().bottom > 0,
    }))
  }, null, 2);
})()