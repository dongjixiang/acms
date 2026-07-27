
const Imap = require('imap');
const imap = new Imap({
  user: 'sweden@263.net',
  password: '2EC94E92f4AC7C51',
  host: 'imap.263.net',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  connTimeout: 30000,
});
imap.once('ready', () => {
  imap.openBox('INBOX', true, (err) => {
    if (err) { console.log('OPEN ERR:', err.message); imap.end(); return; }
    imap.search(['ALL'], (err, uids) => {
      if (err) { console.log('SEARCH ERR'); imap.end(); return; }
      if (!uids.length) { console.log('no emails'); imap.end(); return; }
      const uid = uids[uids.length - 1];
      console.log('uid:', uid);
      const f = imap.fetch([uid], { struct: true, bodies: 'HEADER.FIELDS (FROM SUBJECT)' });
      f.on('message', (msg) => {
        msg.on('body', (stream, info) => {
          let buf = '';
          stream.on('data', c => buf += c.toString('utf8'));
          stream.on('end', () => console.log('=== HEADER ===\n' + buf));
        });
        msg.on('attributes', (attrs) => {
          console.log('=== STRUCT ===');
          console.log(JSON.stringify(attrs.struct, null, 2));
        });
      });
      f.on('end', () => imap.end());
      f.on('error', (e) => { console.log('FETCH ERR', e); imap.end(); });
    });
  });
});
imap.once('error', (e) => console.log('IMAP ERR:', e.message));
imap.connect();
