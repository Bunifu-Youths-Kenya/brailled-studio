// The online AI function: who may call, what is counted, and what is given back. No database and no real service.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { readConfig } from '../src/config.ts'
import { loadKnowledge } from '../src/knowledge.ts'
import { createHandler, type Accounts, type Quota, type Refusal } from '../src/online/handler.ts'
import { calls, says } from './model.ts'
import { wav } from './wav.ts'

const SITE = 'https://brailledu.bunifuyouths.org'
const TOKEN = 'student-login-token'
const schema = readFileSync(new URL('../../brailled-accessibility/src/commands/schema.json', import.meta.url), 'utf8')

const request = () => ({
  transcript: 'add a move block',
  mode: 'build',
  history: [],
  language: 'en',
  assistantName: 'Mboni',
  context: { view: { tab: 'code', scripts: 'outline' }, sprite: { name: 'Sprite1', isStage: false } },
  program: ['script 1', '  b1 event_whenflagclicked: when green flag clicked'],
  data: [],
  names: ['sprites: Sprite1'],
  blocks: ['motion_movesteps (stack) "move 10 steps" STEPS=number'],
  actions: [{ id: 'project.run', name: 'run', description: 'Starts the project.' }],
  spriteCategories: ['animals'],
})

const proposal = () =>
  calls(['submit_proposal', { summary: 'Add a move block.', steps: [{ command: { op: 'insert', block: 'motion_movesteps', after: 'b1' } }] }])

const accountsFor = ({ answer = 'ok' }: { answer?: 'ok' | Refusal } = {}) => {
  const accounts = {
    userOf: vi.fn((token: string) => Promise.resolve(token === TOKEN ? 'user-1' : null)),
    take: vi.fn((_user: string, _quota: Quota) => Promise.resolve<'ok' | Refusal>(answer)),
    giveBack: vi.fn((_user: string, _quota: Quota) => Promise.resolve()),
    record: vi.fn((..._call: Parameters<Accounts['record']>) => Promise.resolve()),
  }
  return accounts satisfies Accounts
}

const start = ({
  upstream = () => Promise.resolve(proposal()),
  accounts = accountsFor(),
  env = {},
}: { upstream?: () => Promise<Response>; accounts?: ReturnType<typeof accountsFor>; env?: Record<string, string> } = {}) => {
  const fetcher = vi.fn((_url: string | URL | Request, _options?: RequestInit) => upstream())
  const lines: string[] = []
  const handler = createHandler({
    config: readConfig({
      OPENROUTER_API_KEY: 'sk-router',
      OPENROUTER_MODEL: 'stand-in',
      OPENAI_API_KEY: 'sk-openai',
      ALLOWED_ORIGINS: SITE,
      ...env,
    }),
    knowledge: loadKnowledge(),
    commandSchema: schema,
    accounts,
    fetcher,
    log: (line) => lines.push(line),
  })
  const post = (path: string, body: unknown = request(), headers: Record<string, string> = {}) =>
    handler(
      new Request(`https://project.supabase.co/ai${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: SITE, Authorization: `Bearer ${TOKEN}`, ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    )
  return { accounts, fetcher, handler, lines, post }
}

const error = async (response: Response) => ((await response.json()) as { error: string }).error

describe('who may call', () => {
  it('lets the website ask first, and no other page', async () => {
    const { handler, post, accounts, fetcher } = start()
    const preflight = await handler(new Request('https://p.supabase.co/ai/assistant', { method: 'OPTIONS', headers: { Origin: SITE } }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(SITE)
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/Authorization/)
    const other = await post('/assistant', request(), { Origin: 'https://elsewhere.example' })
    expect(other.status).toBe(403)
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
    expect(accounts.userOf).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    ['no token', ''],
    ['a token that is not a person\'s', 'Bearer made-up'],
    ['something that is not a token', 'Basic abc'],
  ])('refuses %s, counting and sending nothing', async (_, authorization) => {
    const { post, accounts, fetcher } = start()
    for (const path of ['/assistant', '/voice-turn', '/speak', '/live-session', '/live-tool']) {
      const response = await post(path, request(), { Authorization: authorization })
      expect(response.status).toBe(401)
      expect(response.headers.get('access-control-allow-origin')).toBe(SITE)
      expect(await error(response)).toBe('sign_in_required')
    }
    expect(accounts.take).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    ['ai_off', 503],
    ['blocked', 403],
    ['too_many_requests', 429],
    ['daily_limit', 429],
  ] as const)('answers "%s" with %i, without asking the model', async (answer, status) => {
    const { post, fetcher, accounts } = start({ accounts: accountsFor({ answer }) })
    const response = await post('/assistant')
    expect(response.status).toBe(status)
    expect(await error(response)).toBe(answer)
    expect(fetcher).not.toHaveBeenCalled()
    expect(accounts.giveBack).not.toHaveBeenCalled()
  })

  it('asks the model nothing where the accounts cannot be reached', async () => {
    const accounts = accountsFor()
    accounts.take.mockRejectedValue(new Error('database down'))
    const { post, fetcher, lines } = start({ accounts })
    const response = await post('/assistant')
    expect(response.status).toBe(500)
    expect(fetcher).not.toHaveBeenCalled()
    expect(lines.join()).not.toContain('database down')
  })

  it('counts nothing for a request that is not one', async () => {
    const { post, accounts } = start({ env: { MAX_REQUEST_BYTES: '2000' } })
    expect((await post('/nowhere')).status).toBe(404)
    expect((await post('/assistant', request(), { 'Content-Type': 'text/plain' })).status).toBe(415)
    expect((await post('/assistant', '{')).status).toBe(400)
    expect((await post('/assistant', { ...request(), extra: 1 })).status).toBe(400)
    expect((await post('/assistant', { ...request(), transcript: 'x'.repeat(3000) })).status).toBe(413)
    expect((await post('/voice-turn', {})).status).toBe(400)
    expect((await post('/speak', { text: '' })).status).toBe(400)
    expect(accounts.take).not.toHaveBeenCalled()
  })

  it('says where no key is set, counting nothing', async () => {
    const { post, accounts } = start({ env: { OPENROUTER_API_KEY: '', OPENAI_API_KEY: '' } })
    for (const path of ['/assistant', '/voice-turn', '/speak', '/live-session']) {
      expect(await error(await post(path))).toBe('not_configured')
    }
    expect(accounts.take).not.toHaveBeenCalled()
  })
})

describe('what is counted', () => {
  it('takes one request, answers, and records its cost without the words', async () => {
    const upstream = async () => {
      const body = (await proposal().json()) as Record<string, unknown>
      return Response.json({ ...body, usage: { cost: 0.002 } })
    }
    const { post, accounts, fetcher, lines } = start({ upstream })
    const response = await post('/assistant')
    expect(response.status).toBe(200)
    expect(((await response.json()) as { reply: { type: string } }).reply.type).toBe('proposal')
    expect(accounts.take).toHaveBeenCalledExactlyOnceWith('user-1', { requests: 1 })
    expect(accounts.record).toHaveBeenCalledWith('user-1', expect.objectContaining({ kind: 'assistant', model: 'stand-in', outcome: 'replied', costUsd: 0.002 }))
    expect(JSON.stringify([accounts.record.mock.calls, lines])).not.toContain('move block')
    // The student's login goes to nobody else.
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(TOKEN)
  })

  it('gives the request back where the AI service fails', async () => {
    const { post, accounts } = start({ upstream: () => Promise.resolve(new Response('', { status: 500 })) })
    expect((await post('/assistant')).status).toBe(502)
    expect(accounts.giveBack).toHaveBeenCalledExactlyOnceWith('user-1', { requests: 1 })
  })

  it('keeps it where the model answered but unusably, as that was paid for', async () => {
    const { post, accounts } = start({ upstream: () => Promise.resolve(says('Sure!')) })
    expect((await post('/assistant')).status).toBe(502)
    expect(accounts.giveBack).not.toHaveBeenCalled()
  })

  it('answers even where the cost cannot be recorded', async () => {
    const accounts = accountsFor()
    accounts.record.mockRejectedValue(new Error('no'))
    const { post } = start({ accounts })
    expect((await post('/assistant')).status).toBe(200)
  })

  it('counts a spoken turn as a request', async () => {
    const heard = () => Promise.resolve(calls(['report_heard', { transcript: 'yes', clear: true }]))
    const { post, accounts } = start({ upstream: heard })
    const response = await post('/voice-turn', {
      audio: wav(1),
      pending: true,
      language: 'en',
      model: 'google/gemini-3.5-flash-lite',
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ transcript: 'yes' })
    expect(accounts.take).toHaveBeenCalledExactlyOnceWith('user-1', { requests: 1 })
    expect(accounts.record).toHaveBeenCalledWith('user-1', expect.objectContaining({ kind: 'voice-turn' }))
  })

  const words = { text: 'Hello there.', model: 'hexgrad/kokoro-82m', voice: 'af_heart' }

  it('counts the characters read aloud, passes the sound on, and records it once it has gone', async () => {
    const { post, accounts } = start({ upstream: () => Promise.resolve(new Response(new Uint8Array(4800))) })
    const response = await post('/speak', words)
    expect(response.headers.get('content-type')).toBe('audio/pcm;rate=24000;channels=1')
    expect((await response.arrayBuffer()).byteLength).toBe(4800)
    expect(accounts.take).toHaveBeenCalledExactlyOnceWith('user-1', { characters: 12 })
    expect(accounts.record).toHaveBeenCalledWith('user-1', expect.objectContaining({ kind: 'speak', outcome: 'replied' }))
  })

  it('gives the characters back where there is no sound', async () => {
    const { post, accounts } = start({ upstream: () => Promise.resolve(new Response('', { status: 500 })) })
    expect((await post('/speak', words)).status).toBe(502)
    expect(accounts.giveBack).toHaveBeenCalledExactlyOnceWith('user-1', { characters: 12 })
  })

  const key = () => Promise.resolve(Response.json({ value: 'ek_short', expires_at: 1 }))

  it('counts a live session, and gives it back where no key is made', async () => {
    const made = start({ upstream: key })
    const response = await made.post('/live-session')
    expect(await response.json()).toMatchObject({ secret: 'ek_short' })
    expect(made.accounts.take).toHaveBeenCalledExactlyOnceWith('user-1', { liveSessions: 1 })
    const failed = start({ upstream: () => Promise.resolve(new Response('', { status: 500 })) })
    expect((await failed.post('/live-session')).status).toBe(502)
    expect(failed.accounts.giveBack).toHaveBeenCalledExactlyOnceWith('user-1', { liveSessions: 1 })
  })

  const tool = (name: string, args = '{"request":"add a move block"}') => ({ request: request(), name, arguments: args })

  it('counts a change worked out during live voice, and not a look-up', async () => {
    const { post, accounts, fetcher } = start()
    const looked = await post('/live-tool', tool('find_blocks', '{"query":"move"}'))
    expect(((await looked.json()) as { text: string }).text).toContain('motion_movesteps')
    expect(accounts.take).toHaveBeenLastCalledWith('user-1', {})
    expect(fetcher).not.toHaveBeenCalled()
    const changed = await post('/live-tool', tool('make_change'))
    expect(await changed.json()).toMatchObject({ reply: { type: 'proposal' } })
    expect(accounts.take).toHaveBeenLastCalledWith('user-1', { requests: 1 })
    expect(accounts.record).toHaveBeenCalledWith('user-1', expect.objectContaining({ kind: 'live-tool' }))
  })

  it('tells the live voice what to say where the day is used up', async () => {
    const { post, fetcher } = start({ accounts: accountsFor({ answer: 'daily_limit' }) })
    const response = await post('/live-tool', tool('make_change'))
    expect(response.status).toBe(200)
    expect(((await response.json()) as { text: string }).text).toMatch(/limit is reached/)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses a blocked person even a look-up', async () => {
    const { post } = start({ accounts: accountsFor({ answer: 'blocked' }) })
    expect((await post('/live-tool', tool('find_blocks', '{"query":"move"}'))).status).toBe(403)
  })
})
