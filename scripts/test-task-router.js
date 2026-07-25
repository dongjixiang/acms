const assert = require('assert');
const router = require('../server/services/task-router');

const dataTask = { id: 'T-MRZ5GUN7', title: '历史事件还是太少了，需要补充更多的历史事件', description: '历史事件还是太少了，需要补充更多的历史事件', type: 'bug' };
const dataRoute = router.classify(dataTask);
assert.equal(dataRoute.mode, 'lightweight');
assert.equal(dataRoute.risk, 'low');

const codeTask = { title: '补充历史事件页面展示逻辑', description: '修改前端页面和 API', type: 'bug' };
assert.equal(router.classify(codeTask).mode, 'full-pipeline');

const riskyTask = { title: '删除历史事件并迁移数据库', description: '清理线上数据', type: 'bug' };
assert.equal(router.classify(riskyTask).mode, 'full-pipeline');

console.log('✅ task-router tests passed (3 cases)');
