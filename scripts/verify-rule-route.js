// 临时验证：agent-buddy-action 纯规则路由（v0.116）
// 模拟各种用户表达 → 期望 mode + capabilities
require('../server/tools/index.js');
const action = require('../server/services/agent-buddy-action');

const cases = [
  // [message, ctx, expectedMode, expectedCaps(subset), desc]
  ['今天天气怎么样', {}, 'conversation', [], '纯闲聊 → conversation'],
  ['你会唱歌吗', {}, 'conversation', [], '闲聊兜底清掉 music_playback'],
  ['你最喜欢什么颜色', {}, 'conversation', [], '闲聊兜底（你喜欢）'],
  ['放一首周杰伦的晴天', {}, 'single_action', ['music_playback'], '听歌 → music_playback'],
  ['我想听梁静茹的勇气', {}, 'single_action', ['music_playback'], '想听 → music_playback'],
  ['你想听周杰伦的歌吗', {}, 'single_action', ['music_playback'], '你想听 例外不算闲聊'],
  ['帮我画一张猫的图', {}, 'single_action', ['image_generation'], '画图 → image_generation'],
  ['生成一张海报', {}, 'single_action', ['image_generation'], '生成海报 → image_generation'],
  ['帮我找几张美女图片', {}, 'single_action', ['image_search'], '找图 → image_search（不附带 web_search）'],
  ['帮我生成一份周报', {}, 'single_action', ['document_generation'], '周报 → document_generation'],
  ['帮我写个方案', {}, 'single_action', ['document_generation'], '写方案 → document_generation'],
  ['发邮件给老板', {}, 'single_action', ['email_send'], '发邮件 → email_send'],
  ['画张海报然后发邮件', {}, 'conversational_action', ['image_generation', 'email_send', 'email_draft'], '生成+发邮件 → conversational_action'],
  ['帮我查下资料然后发邮件', {}, 'conversational_action', ['email_send'], '查资料+发邮件 → conversational_action'],
  ['帮我抓一下 https://example.com', {}, 'single_action', ['web_fetch'], '含URL → web_fetch'],
  ['帮我修这个bug', {}, 'single_action', ['code_execution'], '修bug → code_execution'],
  ['帮我打开Word', {}, 'single_action', ['office_open'], '打开Word → office_open'],
  ['打开看板', {}, 'single_action', ['view_navigation'], '打开看板 → view_navigation'],
  ['帮我新建一个Word文档', {}, 'single_action', ['office_open'], '新建Word文档 → office_open（移除 document_generation）'],
  ['看新闻', {}, 'single_action', ['web_search'], '看新闻 → web_search'],
  ['帮我创建个项目', {}, 'single_action', ['project_create'], '创建项目 → project_create'],
  ['帮我建个任务', {}, 'single_action', ['create_task'], '创建任务 → create_task'],
  ['把文档改成红色标题', {}, 'single_action', ['office_edit'], '改文档 → office_edit'],
  ['我在哪个项目', {}, 'single_action', ['query_project_context'], '项目上下文 → query_project_context'],
  ['我有什么偏好', {}, 'single_action', ['retrieve_memory'], '记忆查询 → retrieve_memory'],
  ['帮我调研一下油价走势', {}, 'single_action', ['web_research'], '调研 → web_research'],
  ['帮我查一下今天油价', {}, 'conversation', [], '无正则命中 → conversation（Qwen 兜底）'],
  ['帮我写一篇春天的作文', {}, 'conversation', [], '无office视图+作文 → conversation（Qwen 文字回复）'],
  ['帮我写一篇春天的作文', { currentView: 'office-v3-word' }, 'single_action', ['office_edit'], 'office视图+作文 → office_edit'],
  ['帮我生成一个视频', {}, 'single_action', ['video_generation'], '生成视频 → video_generation'],
  ['跳个舞', {}, 'single_action', ['video_generation'], '跳舞 → video_generation'],
  ['你明天有啥打算', {}, 'conversation', [], '闲聊（你有啥）→ conversation'],
  ['小吉你干啥呢', {}, 'conversation', [], '闲聊（小吉你干啥）→ conversation'],
];

let pass = 0, fail = 0;
(async () => {
for (const [msg, ctx, expMode, expCaps, desc] of cases) {
  const route = await action.routeMessage(null, msg, [], ctx);
  const capsOk = expCaps.every(c => route.capabilities.includes(c));
  const ok = route.mode === expMode && capsOk;
  if (ok) { pass++; }
  else {
    fail++;
    console.log(`❌ ${desc}\n    msg="${msg}"\n    expect mode=${expMode} caps=[${expCaps}]\n    actual mode=${route.mode} caps=[${route.capabilities}] conf=${route.confidence} reqConfirm=${route.requires_confirmation}`);
  }
}
console.log(`\n✅ ${pass}/${cases.length} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
