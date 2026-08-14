// ACMS stub: @genoffice/agent-core — AI AgentLoop 由小吉接管，这里只保类型/空实现
// 让 AiPanel 编译通过并渲染空壳（对接小吉动作卡）
export type ToolDisplay = { name: string; description: string }
export const IPC_STREAM_SILENCE_TIMEOUT_MS = 30000
export const createElectronTransport = () => null as any
export const COMPLETED_VIA_TOOLS_TEXT = '[completed via tools]'

export interface AgentImage { url: string; alt?: string }
export interface AgentSkill { name: string; description: string; run: (args: any) => Promise<any> }
export interface AgentTransport { send: (msg: any) => void; onMessage: (cb: (msg: any) => void) => void }
export interface AgentToolCall { name: string; args: Record<string, unknown> }
export interface AgentToolDef { name: string; description: string; parameters: Record<string, unknown> }

export class AgentLoop {
  constructor(_opts: any) {}
  start() { return Promise.resolve() }
  stop() {}
  send(_msg: any) {}
}

export function composeSkills(..._skills: AgentSkill[]): AgentSkill[] { return [] }

export function createIpcTransport(_opts?: any): AgentTransport {
  return { send() {}, onMessage() {} }
}
