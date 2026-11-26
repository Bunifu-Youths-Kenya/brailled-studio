// Settings from environment variables. See `.env.example`.
export interface Config {
  apiKey: string
  model: string
  denyDataCollection: boolean
  zeroDataRetention: boolean
  host: string
  port: number
  allowedOrigins: string[]
  trustedProxies: number
  perAddressPerMinute: number
  perMinute: number
  perDay: number
  maxRequestBytes: number
  upstreamTimeoutMs: number
}

type Env = Record<string, string | undefined>

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
const text = (env: Env, name: string, fallback = ''): string => {
  const given = env[name]?.trim() ?? ''
  return given === '' ? fallback : given
}

export const readConfig = (env: Env): Config => ({
  apiKey: text(env, 'OPENROUTER_API_KEY'),
  model: text(env, 'OPENROUTER_MODEL'),
  denyDataCollection: unlessFalse(env, 'OPENROUTER_DENY_DATA_COLLECTION'),
  zeroDataRetention: unlessFalse(env, 'OPENROUTER_ZERO_DATA_RETENTION'),
  host: text(env, 'HOST', 'localhost'),
  port: count(env, 'PORT', 8787, 0),
  allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:8601')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustedProxies: count(env, 'TRUSTED_PROXIES', 0, 0),
  perAddressPerMinute: count(env, 'REQUESTS_PER_MINUTE_PER_ADDRESS', 30),
  perMinute: count(env, 'REQUESTS_PER_MINUTE', 120),
  perDay: count(env, 'REQUESTS_PER_DAY', 2000),
  maxRequestBytes: count(env, 'MAX_REQUEST_BYTES', 128 * 1024),
  upstreamTimeoutMs: count(env, 'UPSTREAM_TIMEOUT_MS', 30000),
})
