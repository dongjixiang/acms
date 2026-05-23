/**
 * 时间格式化工具模块
 * 将当前 UTC 时间格式化为 ISO 8601 秒级字符串，并返回星期几英文全称。
 *
 * 参考: REQ-MPAFLGAW / T-MPBBMQ68
 */

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * 补零到指定位数
 * @param {number} n - 数字
 * @param {number} len - 目标长度 (默认2)
 * @returns {string} 补零后的字符串
 */
function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

/**
 * 获取当前 UTC 时间的 ISO 8601 格式字符串和星期几
 *
 * 格式: YYYY-MM-DDTHH:mm:ssZ
 * 示例: "2026-05-18T14:30:00Z" + "Monday"
 *
 * @returns {{ iso: string, weekday: string }}
 *   iso     — ISO 8601 秒级 UTC 时间字符串
 *   weekday — 英文星期全称 (首字母大写)
 */
function getCurrentUTC() {
  const now = new Date();

  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  const hours = pad(now.getUTCHours());
  const minutes = pad(now.getUTCMinutes());
  const seconds = pad(now.getUTCSeconds());

  const iso = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
  const weekday = WEEKDAY_NAMES[now.getUTCDay()];

  return { iso, weekday };
}

/**
 * 获取格式化的时间字符串（单行输出格式）
 * 格式: "<ISO 8601> <Weekday>"
 *
 * @returns {string} 例如 "2026-05-18T14:30:00Z Monday"
 */
function getFormattedTime() {
  const { iso, weekday } = getCurrentUTC();
  return `${iso} ${weekday}`;
}

module.exports = {
  getCurrentUTC,
  getFormattedTime,
  pad,
  WEEKDAY_NAMES,
};

// 直接运行时的自测
if (require.main === module) {
  const result = getCurrentUTC();
  console.log('ISO 8601:', result.iso);
  console.log('Weekday:', result.weekday);
  console.log('Formatted:', getFormattedTime());

  // 格式校验
  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  console.log('ISO format valid:', isoPattern.test(result.iso));
  console.log('Weekday valid:', WEEKDAY_NAMES.includes(result.weekday));
}
