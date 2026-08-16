
const express = require('express');
const app = express();

// 正确的方式：router 里的路径不含 /agents 前缀
const router = express.Router();
router.get('/:id', (req, res) => {
  res.json({ ok: true, id: req.params.id });
});
router.get('/tools', (req, res) => {
  res.json({ ok: true, tools: ['a', 'b'] });
});

app.use('/api/agents', router);

const server = app.listen(3398, () => {
  const http = require('http');
  const req = http.get('http://127.0.0.1:3398/api/agents/agent-word-expert', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log('GET /api/agents/:id:', res.statusCode, data);
      server.close();
      
      const req2 = http.get('http://127.0.0.1:3398/api/agents/tools', (res2) => {
        let data2 = '';
        res2.on('data', c => data2 += c);
        res2.on('end', () => {
          console.log('GET /api/agents/tools:', res2.statusCode, data2);
          process.exit(0);
        });
      });
    });
  });
});
