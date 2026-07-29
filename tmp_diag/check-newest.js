
const Imap = require('imap');
const imap = new Imap({user:'sweden@263.net',password:'2EC94E92f4AC7C51',host:'imap.263.net',port:993,tls:true,tlsOptions:{rejectUnauthorized:false}});
imap.once('ready', () => {
  imap.openBox('INBOX', true, () => {
    imap.search(['ALL'], (e, uids) => {
      const uid = uids[uids.length - 1];
      console.log('uid=' + uid);
      const f = imap.fetch([uid], {bodies: '1'});
      f.on('message', msg => {
        msg.on('body', (stream, info) => {
          const chunks = [];
          stream.on('data', c => chunks.push(c));
          stream.on('end', () => {
            const buf = Buffer.concat(chunks);
            // part 1 含 header 和 body — 只看 body 段（HEADER 后）
            const text = buf.toString('utf8');
            // 解 base64
            const m = text.match(/Content-Transfer-Encoding: base64\s*\r?\n([\s\S]+?)\r?\n--/);
            if (m) {
              const decoded = Buffer.from(m[1].replace(/\s/g, ''), 'base64').toString('utf8');
              console.log('decoded body:', JSON.stringify(decoded));
            } else {
              console.log('no base64 match, sample:', text.slice(0, 500));
            }
          });
        });
      });
      f.on('end', () => imap.end());
    });
  });
});
imap.once('error', e => console.log('ERR:', e.message));
imap.connect();
