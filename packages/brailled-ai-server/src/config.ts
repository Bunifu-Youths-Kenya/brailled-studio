// Settings from environment variables. See `.env.example`.
export interface Config {
  apiKey: string
  model: string
  denyDataCollection: boolean
  zeroDataRetention: boolean
  port: number
  allowedOrigins: string[]
  trustedProxies: number
  perAddressPerMinute: number
  perMinute: number
  perDay: number
  maxRequestBytes: number
  upstreamTimeoutMs: number
  // How many times the model may be asked in one turn, and how long the whole turn may take.
  maxRounds: number
  turnTimeoutMs: number
  // The models the editor may ask for to hear and to speak, so that a request cannot choose a dear one.
  audioModels: string[]
  maxAudioSeconds: number
  voicePerAddressPerMinute: number
  // Voice requests a day, if set here. The editor's configuration file may allow fewer.
  voicePerDay: number | null
}

const AUDIO_MODELS = 'google/gemini-3.5-flash-lite,google/gemini-3.8-flash-lite-tts,openai/gpt-audio-mini'

type Env = Record<string, string | undefined>

// Each round is a call that costs money.
const MOST_ROUNDS = 10

const count = (env: Env, name: string, fallback: number, minimum = 1): number => {
  const given = env[name]?.trim()
  if (!given) return fallback
  const value = Number(given)
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be a whole number of at least ${minimum}, not "${given}"`)
  }
  return value
}

// On unless clearly switched off.
const unlessFalse = (env: Env, name: string): boolean => env[name]?.trim().toLowerCase() !== 'false'

// A variable left empty counts as unset.
const text = (env: Env, name: string): string => env[name]?.trim() ?? ''

const list = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const readConfig = (env: Env): Config => ({
  apiKey: text(env, 'OPENROUTER_API_KEY'),
  model: text(env, 'OPENROUTER_MODEL'),
  denyDataCollection: unlessFalse(env, 'OPENROUTER_DENY_DATA_COLLECTION'),
  zeroDataRetention: unlessFalse(env, 'OPENROUTER_ZERO_DATA_RETENTION'),
  port: count(env, 'PORT', 8787, 0),
  allowedOrigins: list(env.ALLOWED_ORIGINS ?? 'http://localhost:8601'),
  trustedProxies: count(env, 'TRUSTED_PROXIES', 0, 0),
  perAddressPerMinute: count(env, 'REQUESTS_PER_MINUTE_PER_ADDRESS', 30),
  perMinute: count(env, 'REQUESTS_PER_MINUTE', 120),
  perDay: count(env, 'REQUESTS_PER_DAY', 2000),
  maxRequestBytes: count(env, 'MAX_REQUEST_BYTES', 128 * 1024),
  upstreamTimeoutMs: count(env, 'UPSTREAM_TIMEOUT_MS', 30000),
  maxRounds: Math.min(count(env, 'AI_MAX_ROUNDS', 6), MOST_ROUNDS),
  turnTimeoutMs: count(env, 'AI_TURN_TIMEOUT_MS', 40000),
  audioModels: list(text(env, 'AI_AUDIO_MODELS') || AUDIO_MODELS),
  maxAudioSeconds: count(env, 'AI_MAX_AUDIO_SECONDS', 60),
  voicePerAddressPerMinute: count(env, 'VOICE_REQUESTS_PER_MINUTE_PER_ADDRESS', 20),
  voicePerDay: text(env, 'VOICE_REQUESTS_PER_DAY') ? count(env, 'VOICE_REQUESTS_PER_DAY', 0, 0) : null,
})
