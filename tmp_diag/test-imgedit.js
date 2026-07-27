// 测：附件 URL 直接给 tui.ImageEditor 能不能加载
const Imap = require('imap');
const http = require('http');

async function getAttUrl() {
  return new Promise((resolve) => {
    const imap = new Imap({user:'sweden@263.net',password:'2EC94E92f4AC7C51',host:'imap.263.net',port:993,tls:true,tlsOptions:{rejectUnauthorized:false}});
    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        imap.search(['ALL'], (e, uids) => {
          const uid = uids[uids.length - 2]; // 倒数第二封（带 jpg 附件的）
          imap.fetch([uid], {bodies: '1', struct: true}).on('message', (msg) => {
            msg.on('attributes', (a) => console.log('uid=' + a.uid));
            msg.on('body', (s, info) => {
              let b = '';
              s.on('data', c => b += c.toString('utf8'));
              s.on('end', () => console.log('PART_ID=' + info.which));
            });
          }).on('end', () => imap.end());
        });
      });
    });
    imap.once('error', e => console.log('ERR', e.message));
    imap.connect();
  });
}
getAttUrl();
