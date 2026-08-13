// 浏览器 stub：pptx-engine 的 node:* 内置模块浏览器兼容替代
// 用途：esbuild alias node:* → 本文件（P130 记录的打包坑：external 会残留 import 语句导致浏览器加载失败）
// 说明：
//   - createHash: 浏览器无同步 sha256（crypto.subtle 异步）；originalHash 仅作存档标识（不参与正确性判断），返回固定值安全
//   - createWriteStream / pipeline: 仅 savePptxToFile（写磁盘）用，浏览器不需要
//   - deflateSync: 仅 media-insert（插入图片）用，P2 文本编辑不触发

export function createHash() {
  return {
    update() { return this; },
    digest() { return '00000000000000000000000000000000'; },
  };
}

// sections.ts 用（生成 section id）；浏览器用 Math.random 近似即可
export function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createWriteStream() {
  throw new Error('[office-v3] node:fs createWriteStream 浏览器不可用');
}

export function pipeline() {
  return Promise.reject(new Error('[office-v3] node:stream pipeline 浏览器不可用'));
}

export function deflateSync() {
  throw new Error('[office-v3] node:zlib deflateSync 浏览器不可用');
}

export default {};
