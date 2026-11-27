// How the online function reads accounts from Supabase, with the client stood in for.
import { describe, expect, it, vi } from 'vitest'
import { accountsFrom, secretKeyFrom, type Client } from '../src/online/accounts.ts'

const clientWith = ({
  claims = null,
  data = null,
  error = null,
}: { claims?: Record<string, unknown> | null; data?: unknown; error?: { message: string } | null } = {}) => {
  const getClaims = vi.fn((_token: string) => Promise.resolve({ data: claims ? { claims } : null, error: claims ? null : { message: 'bad' } }))
  const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => Promise.resolve({ data, error }))
  const client: Client = { auth: { getClaims }, rpc }
  return { client, getClaims, rpc }
}

const person = { sub: 'user-1', role: 'authenticated' }

describe('who a token belongs to', () => {
  it('is the signed-in person', async () => {
    await expect(accountsFrom(clientWith({ claims: person }).client).userOf('t')).resolves.toBe('user-1')
  })

  it.each([
    ['a token that does not check out', null],
    ['the public key\'s own token', { role: 'anon' }],
    ['someone signed in without an account', { ...person, is_anonymous: true }],
    ['a token with no one in it', { role: 'authenticated' }],
  ])('is nobody for %s', async (_, claims) => {
    await expect(accountsFrom(clientWith({ claims }).client).userOf('t')).resolves.toBeNull()
  })

  it('is nobody where checking breaks', async () => {
    const { client, getClaims } = clientWith({ claims: person })
    getClaims.mockRejectedValue(new Error('malformed'))
    await expect(accountsFrom(client).userOf('t')).resolves.toBeNull()
  })
})

describe('the allowance', () => {
  it('is taken and given back by the database', async () => {
    const { client, rpc } = clientWith({ data: 'ok' })
    const accounts = accountsFrom(client)
    await expect(accounts.take('user-1', { requests: 1 })).resolves.toBe('ok')
    expect(rpc).toHaveBeenLastCalledWith('take_quota', { p_user: 'user-1', p_requests: 1, p_live_sessions: 0, p_characters: 0 })
    await accounts.giveBack('user-1', { characters: 12 })
    expect(rpc).toHaveBeenLastCalledWith('return_quota', { p_user: 'user-1', p_requests: 0, p_live_sessions: 0, p_characters: 12 })
    await accounts.record('user-1', { kind: 'speak', model: 'm', outcome: 'replied', costUsd: 0.5, milliseconds: 9.6 })
    expect(rpc).toHaveBeenLastCalledWith('record_call', { p_user: 'user-1', p_kind: 'speak', p_model: 'm', p_outcome: 'replied', p_cost_usd: 0.5, p_milliseconds: 10 })
  })

  it.each([
    ['the database refuses', { error: { message: 'no' } }],
    ['the answer is not one it knows', { data: 'sure' }],
    ['there is no answer', { data: null }],
  ])('is never taken to be given where %s', async (_, reply) => {
    await expect(accountsFrom(clientWith(reply).client).take('user-1', { requests: 1 })).rejects.toThrow()
  })
})

describe('the secret key', () => {
  it('is the newer kind where there is one, or else the older', () => {
    expect(secretKeyFrom({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_a"}', SUPABASE_SERVICE_ROLE_KEY: 'old' })).toBe('sb_secret_a')
    expect(secretKeyFrom({ SUPABASE_SERVICE_ROLE_KEY: 'old' })).toBe('old')
    expect(secretKeyFrom({ SUPABASE_SECRET_KEYS: 'not json', SUPABASE_SERVICE_ROLE_KEY: 'old' })).toBe('old')
    expect(() => secretKeyFrom({})).toThrow()
  })
})
