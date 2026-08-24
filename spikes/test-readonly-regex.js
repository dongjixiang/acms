// validate isReadOnly regex against actual tool names
const CURRENT = /^(web_search|web_fetch|fetch_url|get_current_time|get_available_models|read|list|search|grep|glob|ls|cat|head|tail|todo_read|agent_read|agent_list|agent_search|agent_git_status|agent_git_log|agent_git_diff|agent_db_query|acms_.*(list|get|read|search|query|status|describe)|mcp__acms__acms_.*(list|get|read|search|query|status|describe))/i;

const tnames = [
  'mcp__acms__acms_describe_image',
  'acms_describe_image',
  'mcp__acms__acms_describe',
  'mcp__acms__acms_web_search',
  'mcp__acms__acms_list_files',
  'web_search',
];

console.log('CURRENT regex isReadOnly test:');
for (const t of tnames) {
  const m = CURRENT.test(t);
  console.log(m ? 'PASS (allow auto)' : 'FAIL (走审批)', '|', t);
}

console.log('');
const FIX = /^(?:web_search|web_fetch|fetch_url|get_current_time|get_available_models|read(?:_file|_dir)?|list|search|grep|glob|ls|cat|head|tail|todo_read|agent_read|agent_list|agent_search|agent_git_status|agent_git_log|agent_git_diff|agent_db_query|(?:acms_|mcp__acms__acms_)(?:list|get|read|search|query|status|describe)(?:_|\b|$))/i;
console.log('FIX regex isReadOnly test:');
for (const t of tnames) {
  const m = FIX.test(t);
  console.log(m ? 'PASS (allow auto)' : 'FAIL (走审批)', '|', t);
}
