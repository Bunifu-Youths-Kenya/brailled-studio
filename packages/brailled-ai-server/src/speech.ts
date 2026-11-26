/*
 * Turns words into speech through OpenRouter. The words are read and passed on; neither they nor the sound is kept.
 */
import type { Config } from './config.ts'
import type { Failure } from './openrouter.ts'

const URL = 'https://openrouter.ai/api/v1/audio/speech'
// The longest piece read at once. The editor sends a sentence at a time.
export const MOST_CHARACTERS = 600
const VOICE = /^[A-Za-z0-9_-]{1,40}$/

export interface SpeechRequest {
  text: string
  model: string
  voice: string
}

// The request, or the name of the first thing wrong with it.
export const readSpeechRequest = (
  body: unknown,
  { audioModels }: { audioModels: string[] },
): { speech: SpeechRequest } | { problem: string } => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { problem: 'body' }
  const { text, model, voice, ...rest } = body as Record<string, unknown>
  if (Object.keys(rest).length > 0) return { problem: 'unknown field' }
  if (typeof text !== 'string' || !text.trim() || text.length > MOST_CHARACTERS) return { problem: 'text' }
  if (typeof model !== 'string' || !audioModels.includes(model)) return { problem: 'model' }
  if (typeof voice !== 'string' || !VOICE.test(voice)) return { problem: 'voice' }
  return { speech: { text, model, voice } }
}

export type Spoken = { sound: Response } | { failure: Failure; detail: string }

// The sound as it arrives: 16 bit PCM, one channel, 24 kHz.
export const synthesise = async (config: Config, speech: SpeechRequest, fetcher: typeof fetch): Promise<Spoken> => {
  try {
    const sound = await fetcher(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: speech.model,
        input: speech.text,
        voice: speech.voice,
        response_format: 'pcm',
        provider: {
          data_collection: config.denyDataCollection ? 'deny' : 'allow',
          ...(config.zeroDataRetention ? { zdr: true } : {}),
        },
      }),
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    })
    if (sound.status === 404) return { failure: 'no_endpoint', detail: 'status 404' }
    // Error text is not kept: it can quote what was sent.
    if (!sound.ok || !sound.body) return { failure: 'upstream_error', detail: `status ${sound.status}` }
    return { sound }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return timedOut
      ? { failure: 'upstream_timeout', detail: 'timed out' }
      : { failure: 'upstream_error', detail: error instanceof Error ? error.name : 'request failed' }
  }
}
