// Asks a model through OpenRouter for its next message in a conversation with tools.
import type { Config } from './config.ts'

const URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_REPLY_TOKENS = 4000

// `no_endpoint`: nobody serving the model can do what was asked under the privacy settings.
export type Failure = 'upstream_error' | 'upstream_timeout' | 'invalid_output' | 'no_endpoint'

// What the service says a call used and cost.
export interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  cost?: number
  prompt_tokens_details?: { audio_tokens?: number }
}

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

export type Completion = { message: Message; usage?: Usage } | { failure: Failure; detail: string }

interface Response_ {
  choices?: { finish_reason?: string; error?: { code?: number }; message?: Message }[]
  usage?: Usage
}

export const complete = async (
  config: Config,
  messages: Message[],
  tools: unknown[],
  timeoutMs: number,
  fetcher: typeof fetch,
  model = config.model,
): Promise<Completion> => {
  const body = {
    model,
    messages,
    tools,
    tool_choice: 'auto',
    max_tokens: MAX_REPLY_TOKENS,
    provider: {
      // Only providers that honour every parameter, tools among them. So send no parameter that is not needed: some
      // providers that keep no data accept no `temperature`, and asking for one would leave none.
      require_parameters: true,
      data_collection: config.denyDataCollection ? 'deny' : 'allow',
      ...(config.zeroDataRetention ? { zdr: true } : {}),
      // Among those, the preferred ones first: the student is waiting.
      ...(config.providerSort ? { sort: config.providerSort } : {}),
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
    if (response.status === 404) return { failure: 'no_endpoint', detail: 'status 404' }
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
  return { message: choice.message, usage: answer.usage }
}
