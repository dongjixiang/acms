
const Imap = require('imap');
const imap = new Imap({
  user: 'sweden@263.net',
  password: '2EC94E92f4AC7C51',
  host: 'imap.263.net',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
});
imap.once('ready', () => {
  imap.openBox('INBOX', true, (err) => {
    imap.search(['ALL'], (err, uids) => {
      const uid = uids[uids.length - 1];
      const f = imap.fetch([uid], { bodies: 'HEADER.FIELDS (FROM SUBJECT)', struct: false });
      f.on('message', (msg) => {
        msg.on('body', (stream, info) => {
          const chunks = [];
          stream.on('data', c => chunks.push(c));
          stream.on('end', () => {
            const buf = Buffer.concat(chunks);
            console.log('=== RAW BYTES (hex, first 200) ===');
            console.log(buf.slice(0, 200).toString('hex'));
            console.log('=== RAW STRING (utf8) ===');
            console.log(buf.toString('utf8'));
            console.log('=== RAW STRING (latin1) ===');
            console.log(buf.toString('latin1'));
            console.log('=== parseHeader ===');
            const parsed = Imap.parseHeader(buf.toString('utf8'));
            console.log(JSON.stringify(parsed, null, 2));
            console.log('=== parseHeader (latin1) ===');
            const parsed2 = Imap.parseHeader(buf.toString('latin1'));
            console.log(JSON.stringify(parsed2, null, 2));
          });
        });
      });
      f.on('end', () => imap.end());
    });
  });
});
imap.once('error', (e) => console.log('ERR:', e.message));
imap.connect();
