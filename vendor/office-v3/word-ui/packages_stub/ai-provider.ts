// ACMS stub: @genoffice/ai-provider — 仅类型（AI 由小吉接管）
export type AiProviderId = string
export type AiProviderMeta = { id: string; name: string }
export interface AiSettings { provider?: string; apiKey?: string; model?: string }
export interface AiChatRequest { messages: Array<{ role: string; content: string }> }
export interface AiChatResponse { content: string }
export interface AiStreamChunk { delta?: string; done?: boolean; error?: string }
export interface AiStreamRequest { messages: Array<{ role: string; content: string }> }
export type GenSparkAccountStatus = { loggedIn: boolean }
export interface AiProviderConfig { provider: AiProviderId; apiKey: string; model: string }
export const AI_PROVIDERS: AiProviderMeta[] = []
