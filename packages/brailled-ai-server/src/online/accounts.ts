/*
 * The accounts of the online editor, kept by Supabase: who a login token belongs to, and what they may use. The
 * limits themselves are in the database (see `supabase/migrations`), which counts requests arriving together one at
 * a time.
 */
import type { Accounts, Quota, Refusal } from './handler.ts'

// The parts of a Supabase client, made with the secret key, that are used.
export interface Client {
  auth: {
    getClaims(token: string): Promise<{ data: { claims: Record<string, unknown> } | null; error: unknown }>
  }
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

const ANSWERS: ('ok' | Refusal)[] = ['ok', 'ai_off', 'blocked', 'too_many_requests', 'daily_limit']

const amounts = (user: string, { requests = 0, liveSessions = 0, characters = 0 }: Quota) => ({
  p_user: user,
  p_requests: requests,
  p_live_sessions: liveSessions,
  p_characters: characters,
})

export const accountsFrom = (client: Client): Accounts => {
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args)
    if (error) throw new Error(`${name} failed`)
    return data
  }
  return {
    userOf: async (token) => {
      const claims = await client.auth
        .getClaims(token)
        .then(({ data, error }) => (error ? null : (data?.claims ?? null)))
        .catch(() => null)
      // The public key has a token too, as may someone who signed in without an account: neither is a person here.
      if (claims?.role !== 'authenticated' || claims.is_anonymous === true) return null
      return typeof claims.sub === 'string' && claims.sub ? claims.sub : null
    },
    take: async (user, quota) => {
      const answer = await call('take_quota', amounts(user, quota))
      const known = ANSWERS.find((item) => item === answer)
      if (!known) throw new Error('take_quota gave no answer')
      return known
    },
    giveBack: async (user, quota) => {
      await call('return_quota', amounts(user, quota))
    },
    record: async (user, { kind, model, outcome, costUsd, milliseconds }) => {
      await call('record_call', {
        p_user: user,
        p_kind: kind,
        p_model: model,
        p_outcome: outcome,
        p_cost_usd: costUsd,
        p_milliseconds: Math.round(milliseconds),
      })
    },
  }
}

// The key that lets the function past row-level security. Supabase gives it to every function.
export const secretKeyFrom = (env: Record<string, string | undefined>): string => {
  let newer: unknown
  try {
    newer = (JSON.parse(env.SUPABASE_SECRET_KEYS ?? '{}') as { default?: unknown }).default
  } catch {
    newer = undefined
  }
  const key = typeof newer === 'string' && newer ? newer : env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('no secret key')
  return key
}
