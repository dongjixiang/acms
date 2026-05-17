// 全局状态 — 所有模块共享
window.App = {
  currentProjectId: null,
  currentProject: null,
  ws: null,
  WS_URL: `ws://${location.hostname}:3301/ws`,
  statusLabels: { idea: '💡 想法', clarifying: '❓ 澄清中', review: '👀 待审核', approved: '✅ 已确认', in_execution: '🔄 执行中', done: '🎉 已完成', abandoned: '🗑 已放弃' },
  typeLabels: { coding: '💻', design: '🎨', documentation: '📝', research: '🔍', review: '👁', testing: '🧪', planning: '📐', audio: '🔊', modeling: '🗿' },
};
