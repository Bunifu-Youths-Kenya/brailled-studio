// Asks a model through OpenRouter and returns the JSON object it replies with.
import type { Config } from './config.ts'

const URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_REPLY_TOKENS = 2000
const REPLY_TYPES = ['proposal', 'question', 'explanation']

export type Failure = 'upstream_error' | 'upstream_timeout' | 'invalid_output'

export type Answer = { reply: Record<string, unknown> } | { failure: Failure; detail: string }

interface Completion {
  choices?: { finish_reason?: string; error?: { code?: number }; message?: { content?: unknown } }[]
}

interface Message {
  role: string
  content: string
}

// The reply as an object of a known type. The editor checks the rest before using it.
const parseReply = (content: unknown): Answer => {
  if (typeof content !== 'string') return { failure: 'invalid_output', detail: 'no text' }
  let reply: unknown
  try {
    reply = JSON.parse(content)
  } catch {
    return { failure: 'invalid_output', detail: 'not JSON' }
  }
  const type = (reply as { type?: unknown } | null)?.type
  if (!reply || typeof reply !== 'object' || Array.isArray(reply) || !REPLY_TYPES.includes(type as string)) {
    return { failure: 'invalid_output', detail: 'unknown form' }
  }
  return { reply: reply as Record<string, unknown> }
}

export const ask = async (config: Config, messages: Message[], fetcher: typeof fetch): Promise<Answer> => {
  const body = {
    model: config.model,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: MAX_REPLY_TOKENS,
    provider: {
      // Only providers that honour every parameter, the JSON format among them.
      require_parameters: true,
      data_collection: config.denyDataCollection ? 'deny' : 'allow',
      ...(config.zeroDataRetention ? { zdr: true } : {}),
    },
  }
  let completion: Completion
  try {
    const response = await fetcher(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    })
    // Error text is not kept: it can quote what was sent.
    if (!response.ok) return { failure: 'upstream_error', detail: `status ${response.status}` }
    completion = (await response.json()) as Completion
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return timedOut
      ? { failure: 'upstream_timeout', detail: 'timed out' }
      : { failure: 'upstream_error', detail: error instanceof Error ? error.name : 'request failed' }
  }
  const choice = completion.choices?.[0]
  if (!choice || choice.error) {
    return { failure: 'upstream_error', detail: `no reply${choice?.error ? `, code ${choice.error.code}` : ''}` }
  }
  if (choice.finish_reason && choice.finish_reason !== 'stop') {
    return { failure: 'invalid_output', detail: `ended with ${choice.finish_reason}` }
  }
  return parseReply(choice.message?.content)
}
