const Database = require('better-sqlite3');
const db = new Database('data/acms.db');
const videoE74 = 'video_bGl0ZWxsbTpjdXN0b21fbGxtX3Byb3ZpZGVyOm9wZW5haTttb2RlbF9pZDphZ25lcy12aWRlby12Mi4wO3ZpZGVvX2lkOnZpZGVvX2U3NDE3NmNhYTQ3ZjkyODgwZTI5YmY1ZmExMjFlZWZjNGM5ZWExYzMwNDBkZDk3Nw==';
// 找任意一个 idea REQ，注入测试 video 数据
const rows = db.prepare("SELECT id, doc FROM requirements WHERE doc LIKE '%\"status\":\"idea\"%' LIMIT 1").all();
const req = rows[0];
const d = JSON.parse(req.doc);
d.assist_video = JSON.stringify({
  status: 'done', async_task: true,
  video_id: videoE74, video_url: null, progress: 0,
  started_at: new Date().toISOString(),
});
db.prepare('UPDATE requirements SET doc = ? WHERE id = ?').run(JSON.stringify(d), req.id);
console.log('注入 REQ:', d.id);

// 调 query API
(async () => {
  const r = await fetch('http://localhost:3300/api/requirements/' + d.id + '/assist/video/query', {
    method: 'POST', headers: { 'X-API-Key': 'dev-key-001' }
  });
  const q = await r.json();
  console.log('query 后: status=' + q.status + ', progress=' + q.progress + ', video_url=' + (q.video_url ? q.video_url.slice(0, 60) : 'NULL') + ', error=' + q.error);
})();
