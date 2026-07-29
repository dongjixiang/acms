const Imap = require('imap');
const uid = parseInt(process.argv[2]);
const imap = new Imap({user:'sweden@263.net',password:'2EC94E92f4AC7C51',host:'imap.263.net',port:993,tls:true,tlsOptions:{rejectUnauthorized:false}});
imap.once('ready', () => {
  imap.openBox('INBOX', true, () => {
    const f = imap.fetch([uid], {bodies: 'HEADER.FIELDS (SUBJECT)'});
    f.on('message', m => {
      m.on('body', (s, info) => {
        let b = '';
        s.on('data', c => b += c.toString('utf8'));
        s.on('end', () => console.log('raw:', JSON.stringify(b)));
      });
    });
    f.on('end', () => imap.end());
  });
});
imap.once('error', e => console.log('ERR:', e.message));
imap.connect();
