/*
 * The AI server for the online editor, as one function from a web request to a response. It asks the models as the
 * server on this computer does (`app.ts`), with one difference in who may: only a signed-in person, within the
 * allowance their account has for the day. Nothing anyone said, typed or built is recorded or logged.
 */
import { runAgent, type Answer } from '../agent.ts'
import { base64Length } from '../audio.ts'
import type { Config } from '../config.ts'
import { speechCost } from '../cost.ts'
import type { Knowledge } from '../knowledge.ts'
import { changeAsked, liveTools, mintLiveKey, runLiveTool } from '../live.ts'
import type { Failure } from '../openrouter.ts'
import { readRequest, readVoiceTurn, type AssistantRequest } from '../request.ts'
import { readSpeechRequest, synthesise } from '../speech.ts'

// Some of a day's allowance.
export interface Quota {
  requests?: number
  liveSessions?: number
  characters?: number
}

// Why none is given.
export type Refusal = 'ai_off' | 'blocked' | 'too_many_requests' | 'daily_limit'

export type Kind = 'assistant' | 'voice-turn' | 'speak' | 'live-session' | 'live-tool'

export interface Accounts {
  // The id of the signed-in person a token belongs to, or null.
  userOf(token: string): Promise<string | null>
  // Take from today's allowance, all of what is asked or none of it. Nothing asked only checks that they may.
  take(user: string, quota: Quota): Promise<'ok' | Refusal>
  giveBack(user: string, quota: Quota): Promise<void>
  record(
    user: string,
    call: { kind: Kind; model: string; outcome: string; costUsd: number; milliseconds: number },
  ): Promise<void>
}

export interface Options {
  config: Config
  knowledge: Knowledge
  // The editor's edit-command schema, as text.
  commandSchema: string
  accounts: Accounts
  fetcher?: typeof fetch
  now?: () => number
  log?: (line: string) => void
}

const STATUS: Record<Refusal, number> = { ai_off: 503, blocked: 403, too_many_requests: 429, daily_limit: 429 }
// What the live model is told to say where a change cannot be worked out for a person.
const SAY_INSTEAD: Record<Refusal, string> = {
  ai_off: 'Changes cannot be worked out here now. Tell the student.',
  blocked: 'Changes cannot be worked out for this account. Tell the student.',
  too_many_requests: 'Too many requests at once. Tell the student to wait a minute.',
  daily_limit: "The day's limit is reached. Tell the student to try again tomorrow.",
}
const ROUTES = ['assistant', 'voice-turn', 'speak', 'live-session', 'live-tool'] as const
type Route = (typeof ROUTES)[number]

// The AI service failed, so nothing was had for the allowance. A reply that cannot be used was still paid for.
const FAILED: Failure[] = ['upstream_error', 'upstream_timeout', 'no_endpoint']

const costOf = (answer: Answer) => answer.usage.reduce((all, used) => all + (used.cost ?? 0), 0)

// The body, or null where it is longer than allowed. Reading stops there.
const readText = async (request: Request, most: number): Promise<string | null> => {
  const reader = (request.body as ReadableStream<Uint8Array> | null)?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()
    bytes += value.byteLength
    if (bytes > most) {
      await reader.cancel()
      return null
    }
    text += decoder.decode(value, { stream: true })
  }
}

export const createHandler = ({
  config,
  knowledge,
  commandSchema,
  accounts,
  fetcher = fetch,
  now = Date.now,
  log = console.log,
}: Options) => {
  const operations = (JSON.parse(commandSchema) as { oneOf: { $ref: string }[] }).oneOf.map(
    (option) => option.$ref.split('/').at(-1) ?? '',
  )

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    // Browsers say where a request comes from. Other callers can claim anything, so everyone must sign in.
    if (origin !== null && !config.allowedOrigins.includes(origin)) {
      return Response.json({ error: 'origin_not_allowed' }, { status: 403 })
    }
    const headers: Record<string, string> = { 'Cache-Control': 'no-store', Vary: 'Origin' }
    if (origin !== null) {
      headers['Access-Control-Allow-Origin'] = origin
      headers['Access-Control-Allow-Methods'] = 'POST'
      headers['Access-Control-Allow-Headers'] = 'Authorization, apikey, Content-Type'
    }
    const json = (body: unknown, status = 200, more: Record<string, string> = {}) =>
      Response.json(body, { status, headers: { ...headers, ...more } })
    const error = (name: string, status: number, field?: string) => json({ error: name, ...(field ? { field } : {}) }, status)
    const refuse = (refusal: Refusal) =>
      json({ error: refusal }, STATUS[refusal], refusal === 'too_many_requests' ? { 'Retry-After': '60' } : {})
    const upstream = (failure: Failure) => error(failure, failure === 'upstream_timeout' ? 504 : 502)

    // Records what was used. A record that cannot be written does not take the answer away.
    const record = async (user: string, call: Parameters<Accounts['record']>[1]) => {
      try {
        await accounts.record(user, call)
      } catch {
        log(`${call.kind}: not recorded`)
      }
    }

    const ask = async (user: string, route: Route, body: unknown): Promise<Response> => {
      const started = now()
      const took = () => now() - started

      // Takes the allowance, then does the work, giving it back if the work breaks.
      const within = async (quota: Quota, work: () => Promise<Response>): Promise<Response> => {
        const taken = await accounts.take(user, quota)
        if (taken !== 'ok') return refuse(taken)
        try {
          return await work()
        } catch (thrown) {
          await accounts.giveBack(user, quota).catch(() => {})
          throw thrown
        }
      }
      const giveBack = async (quota: Quota, failure: Failure) => {
        if (FAILED.includes(failure)) await accounts.giveBack(user, quota)
      }
      const answered = async (kind: Kind, model: string, answer: Answer) => {
        const outcome = 'failure' in answer ? answer.failure : 'replied'
        await record(user, { kind, model, outcome, costUsd: costOf(answer), milliseconds: took() })
        log(`${kind}: ${outcome} in ${took()} ms, ${answer.rounds} rounds`)
      }
      const agent = (asked: AssistantRequest, spoken?: Parameters<typeof runAgent>[1]['spoken']) =>
        runAgent(asked, { config, knowledge, commandSchema, fetcher, now, spoken })

      if (route === 'assistant') {
        if (!config.apiKey || !config.model) return error('not_configured', 503)
        const read = readRequest(body)
        if ('problem' in read) return error('invalid_request', 400, read.problem)
        const quota = { requests: 1 }
        return within(quota, async () => {
          const answer = await agent(read.request)
          await answered('assistant', config.model, answer)
          if ('reply' in answer) return json({ reply: answer.reply })
          await giveBack(quota, answer.failure)
          return upstream(answer.failure)
        })
      }

      if (route === 'voice-turn') {
        if (!config.apiKey) return error('not_configured', 503)
        const read = readVoiceTurn(body, config)
        if ('problem' in read) return error('invalid_request', 400, read.problem)
        const { turn } = read
        const words: AssistantRequest = turn.request ?? {
          transcript: '(spoken)',
          mode: 'build',
          history: [],
          language: turn.language,
          context: {},
          program: [],
          data: [],
          names: [],
          blocks: [],
          actions: [],
          assistantName: '',
          spriteCategories: [],
        }
        const quota = { requests: 1 }
        return within(quota, async () => {
          const voice = turn.pending ? ('transcribe' as const) : ('turn' as const)
          const answer = await agent(words, { voice, audio: turn.audio.data, model: turn.model })
          await answered('voice-turn', turn.model, answer)
          if ('reply' in answer && answer.heard) return json({ ...answer.heard, result: answer.reply })
          const failure = 'failure' in answer ? answer.failure : 'invalid_output'
          await giveBack(quota, failure)
          return upstream(failure)
        })
      }

      if (route === 'speak') {
        if (!config.apiKey) return error('not_configured', 503)
        const read = readSpeechRequest(body, config)
        if ('problem' in read) return error('invalid_request', 400, read.problem)
        const { speech } = read
        const quota = { characters: speech.text.length }
        return within(quota, async () => {
          const spoken = await synthesise(config, speech, fetcher)
          // Written when the sound has all gone, or will not.
          let bytes = 0
          const finished = (outcome: string) =>
            record(user, {
              kind: 'speak',
              model: speech.model,
              outcome,
              // 16 bit, one channel, 24 kHz.
              costUsd: outcome === 'replied' ? speechCost(speech.model, speech.text.length, bytes / 48_000) : 0,
              milliseconds: took(),
            })
          if ('failure' in spoken) {
            await finished(spoken.failure)
            await giveBack(quota, spoken.failure)
            log(`speak: ${spoken.failure} after ${took()} ms`)
            return upstream(spoken.failure)
          }
          const reader = (spoken.sound.body as ReadableStream<Uint8Array>).getReader()
          const sound = new ReadableStream<Uint8Array>({
            pull: async (controller) => {
              try {
                const { done, value } = await reader.read()
                if (done) {
                  await finished('replied')
                  controller.close()
                  return
                }
                bytes += value.byteLength
                controller.enqueue(value)
              } catch (thrown) {
                // Cut short, the sound is of no use: the editor is told. What did arrive is still recorded.
                await finished('cut_short')
                controller.error(thrown)
              }
            },
            cancel: async () => {
              await reader.cancel().catch(() => {})
              await finished('cut_short')
            },
          })
          return new Response(sound, { headers: { ...headers, 'Content-Type': 'audio/pcm;rate=24000;channels=1' } })
        })
      }

      if (route === 'live-session') {
        if (!config.openaiApiKey) return error('not_configured', 503)
        const read = readRequest(body)
        if ('problem' in read) return error('invalid_request', 400, read.problem)
        const quota = { liveSessions: 1 }
        return within(quota, async () => {
          const minted = await mintLiveKey(config, read.request, commandSchema, fetcher)
          const outcome = 'failure' in minted ? minted.failure : 'replied'
          // What the session itself costs goes from the browser to OpenAI, and is not known here.
          await record(user, { kind: 'live-session', model: config.liveModel, outcome, costUsd: 0, milliseconds: took() })
          log(`live-session: ${outcome} in ${took()} ms`)
          if (!('failure' in minted)) return json(minted)
          await giveBack(quota, minted.failure)
          return upstream(minted.failure)
        })
      }

      const given = (body ?? {}) as { request?: unknown; name?: unknown; arguments?: unknown }
      const read = readRequest(given.request)
      const { name, arguments: args } = given
      if ('problem' in read || typeof name !== 'string' || name.length > 60 || typeof args !== 'string') {
        return error('invalid_request', 400)
      }
      const offered = liveTools(read.request.mode).some((tool) => tool.name === name)
      if (name !== 'make_change' || !offered) {
        return within({}, () => {
          log(`live-tool: ${name}`)
          return Promise.resolve(json(runLiveTool(name, args, read.request, knowledge, operations)))
        })
      }
      if (!config.apiKey || !config.model) return json({ text: SAY_INSTEAD.ai_off })
      const asked = changeAsked(args)
      if (!asked) return json({ text: 'Give "request".' })
      const quota = { requests: 1 }
      const taken = await accounts.take(user, quota)
      // The live model is answered, so that the student hears why.
      if (taken !== 'ok') return json({ text: SAY_INSTEAD[taken] })
      const answer = await agent({ ...read.request, transcript: asked, conversing: true }).catch(async (thrown) => {
        await accounts.giveBack(user, quota).catch(() => {})
        throw thrown
      })
      await answered('live-tool', config.model, answer)
      if ('reply' in answer) return json({ reply: answer.reply })
      await giveBack(quota, answer.failure)
      return json({ text: 'It could not be worked out. Ask the student to say it another way.' })
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    const name = new URL(request.url).pathname.split('/').at(-1)
    const route = ROUTES.find((known) => known === name)
    if (!route) return error('not_found', 404)
    if (request.method !== 'POST') return error('invalid_request', 405)
    try {
      const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
      const user = token ? await accounts.userOf(token) : null
      if (!user) return error('sign_in_required', 401)
      // Only JSON, which a page on another site cannot send without asking first.
      if (!/^application\/json\b/.test(request.headers.get('content-type') ?? '')) return error('invalid_request', 415)
      // Room for the longest recording and for what goes with it.
      const most = config.maxRequestBytes + (route === 'voice-turn' ? base64Length(config.maxAudioSeconds) : 0)
      const text = await readText(request, most)
      if (text === null) return error('too_large', 413)
      let body: unknown
      try {
        body = JSON.parse(text)
      } catch {
        return error('invalid_request', 400)
      }
      return await ask(user, route, body)
    } catch (thrown) {
      // The name only: the message can quote what was sent.
      log(`${route}: ${thrown instanceof Error ? thrown.name : 'error'}`)
      return error('server_error', 500)
    }
  }
}
