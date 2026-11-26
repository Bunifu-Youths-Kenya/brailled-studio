// Asks a model through OpenRouter for its next message in a conversation with tools.
import type { Config } from './config.ts'

const URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_REPLY_TOKENS = 4000

export type Failure = 'upstream_error' | 'upstream_timeout' | 'invalid_output'

export interface ToolCall {
  id: string
  type: string
  function?: { name?: string; arguments?: string }
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: unknown
  tool_calls?: ToolCall[]
  tool_call_id?: string
  // Whatever else a model sends, such as its reasoning, goes back to it unchanged.
  [key: string]: unknown
}

export type Completion = { message: Message } | { failure: Failure; detail: string }

interface Response_ {
  choices?: { finish_reason?: string; error?: { code?: number }; message?: Message }[]
}

export const complete = async (
  config: Config,
  messages: Message[],
  tools: unknown[],
  timeoutMs: number,
  fetcher: typeof fetch,
): Promise<Completion> => {
  const body = {
    model: config.model,
    messages,
    tools,
    tool_choice: 'auto',
    temperature: 0.2,
    max_tokens: MAX_REPLY_TOKENS,
    provider: {
      // Only providers that honour every parameter, tools among them.
      require_parameters: true,
      data_collection: config.denyDataCollection ? 'deny' : 'allow',
      ...(config.zeroDataRetention ? { zdr: true } : {}),
    },
  }
  let answer: Response_
  try {
    const response = await fetcher(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    // Error text is not kept: it can quote what was sent.
    if (!response.ok) return { failure: 'upstream_error', detail: `status ${response.status}` }
    answer = (await response.json()) as Response_
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return timedOut
      ? { failure: 'upstream_timeout', detail: 'timed out' }
      : { failure: 'upstream_error', detail: error instanceof Error ? error.name : 'request failed' }
  }
  const choice = answer.choices?.[0]
  if (!choice?.message || choice.error) {
    return { failure: 'upstream_error', detail: `no reply${choice?.error ? `, code ${choice.error.code}` : ''}` }
  }
  if (choice.finish_reason === 'length' || choice.finish_reason === 'content_filter') {
    return { failure: 'invalid_output', detail: `ended with ${choice.finish_reason}` }
  }
  return { message: choice.message }
}
