
require('./server/db/connection');
const router = require('./server/routes/agents');
console.log('Router keys:', Object.keys(router));
console.log('Router stack:', JSON.stringify(router.stack?.map(s => s.route?.path || s.regexp?.toString()).slice(0,10), null, 2));
