(async () => {
  const sessId = 'sess-debug-x1';
  const c = document.getElementById('chat-stream-msgs-' + sessId);
  if (!c) return JSON.stringify({error: 'no container'});

  return JSON.stringify({
    children: c.children.length,
    childClasses: Array.from(c.children).map(e => e.className?.slice(0, 100) || '?'),
    childIds: Array.from(c.children).map(e => e.id || '?'),
    firstChildClass: c.firstElementChild?.className,
    firstChildDataMethod: c.firstElementChild?.dataset?.method,
    firstChildDataAssistMethod: c.firstElementChild?.dataset?.assistMethod,
    innerHTML_full: c.innerHTML,
  }, null, 2);
})()
