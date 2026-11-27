// The server: one endpoint that takes the editor's request and passes back the model's reply.
import { readFileSync } from 'node:fs'
import { Readable, Transform } from 'node:stream'
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express'
import { base64Length } from './audio.ts'
import type { Config } from './config.ts'
import { createCostLog, speechCost, type CostLog, type Entry } from './cost.ts'
import { readCaps, type Caps } from './editor-config.ts'
import { runAgent } from './agent.ts'
import { loadKnowledge } from './knowledge.ts'
import { mintLiveKey, runLiveTool } from './live.ts'
import { createRateLimiter } from './limits.ts'
import { readRequest, readVoiceTurn, type AssistantRequest } from './request.ts'
import { readSpeechRequest, synthesise } from './speech.ts'

// The schema the editor's validator uses, so that the model is told the same rules.
const SCHEMA_FILE = new URL('../../brailled-accessibility/src/commands/schema.json', import.meta.url)

export interface Options {
  fetcher?: typeof fetch
  now?: () => number
  log?: (line: string) => void
  caps?: Caps
  // Without one, what is used is counted until the server stops.
  costs?: CostLog
}

// The voice endpoints' requests a minute from everyone together, as a multiple of what one address may make.
const ADDRESSES_AT_ONCE = 6
// 16 bit, one channel, 24 kHz.
const SOUND_BYTES_A_SECOND = 48_000

export const createApp = (
  config: Config,
  { fetcher = fetch, now = Date.now, log = console.log, caps = readCaps(), costs = createCostLog({ now }) }: Options = {},
) => {
  const commandSchema = JSON.stringify(JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')))
  const knowledge = loadKnowledge()
  const limit = createRateLimiter(config, now)
  const configured = !!(config.apiKey && config.model)

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustedProxies)

  // Browsers say where a request comes from. Other callers can claim anything, so the limits apply to all.
  const origins: RequestHandler = (request, response, next) => {
    const { origin } = request.headers
    if (origin !== undefined) {
      if (!config.allowedOrigins.includes(origin)) {
        response.status(403).json({ error: 'origin_not_allowed' })
        return
      }
      response.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
      })
    }
    if (request.method === 'OPTIONS') {
      response.sendStatus(204)
      return
    }
    next()
  }

  const rate: RequestHandler = (request, response, next) => {
    const wait = limit(request.ip ?? 'unknown')
    if (wait === null) {
      next()
      return
    }
    response.set('Retry-After', String(wait)).status(429).json({ error: 'too_many_requests' })
  }

  // The day's caps, measured by the record of costs.
  const most = {
    requests: Math.min(config.voicePerDay ?? caps.requests, caps.requests),
    characters: Math.min(config.charactersPerDay ?? caps.characters, caps.characters),
  }
  const spent = () => costs.today().costUsd >= config.costPerDayUsd

  // Requests a minute: the day is bounded by the caps.
  const minuteRate = (perAddressPerMinute: number): RequestHandler => {
    const within = createRateLimiter(
      { perAddressPerMinute, perMinute: perAddressPerMinute * ADDRESSES_AT_ONCE, perDay: Number.MAX_SAFE_INTEGER },
      now,
    )
    return (request, response, next) => {
      const wait = within(request.ip ?? 'unknown')
      if (wait === null) {
        next()
        return
      }
      response.set('Retry-After', String(wait)).status(429).json({ error: 'too_many_requests' })
    }
  }
  const voiceRate = minuteRate(config.voicePerAddressPerMinute)
  const speakRate = minuteRate(config.speakPerAddressPerMinute)

  const refuseForToday = (response: Response) => {
    response.status(429).json({ error: 'daily_limit' })
  }

  // What the calls of one turn used. The service reports what each cost.
  const turnEntry = (
    entry: Pick<Entry, 'kind' | 'provider' | 'model' | 'outcome' | 'audioSeconds' | 'cacheHits'>,
    answer: Awaited<ReturnType<typeof runAgent>>,
    total: number,
  ): Entry => {
    const sum = (of: (used: (typeof answer.usage)[number]) => number | undefined) =>
      answer.usage.reduce((all, used) => all + (of(used) ?? 0), 0)
    return {
      ...entry,
      calls: answer.usage.length,
      tokens: {
        prompt: sum((used) => used.prompt_tokens),
        completion: sum((used) => used.completion_tokens),
        audio: sum((used) => used.prompt_tokens_details?.audio_tokens),
      },
      characters: 0,
      ms: { calls: answer.usage.map((used) => used.ms), total },
      costUsd: sum((used) => used.cost),
      estimated: answer.usage.some((used) => used.cost === undefined),
    }
  }

  // One turn of a spoken conversation: the model hears the recording and, unless only the words are wanted, answers.
  const voiceTurn = async (request: Request, response: Response) => {
    if (!request.is('application/json')) {
      response.status(415).json({ error: 'invalid_request' })
      return
    }
    if (!config.apiKey) {
      response.status(503).json({ error: 'not_configured' })
      return
    }
    const read = readVoiceTurn(request.body, config)
    if ('problem' in read) {
      response.status(400).json({ error: 'invalid_request', field: read.problem })
      return
    }
    const { turn } = read
    if (spent() || costs.today().requests >= most.requests) {
      refuseForToday(response)
      return
    }
    costs.take()
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
    const started = now()
    const spoken = { voice: turn.pending ? ('transcribe' as const) : ('turn' as const), audio: turn.audio.data, model: turn.model }
    const answer = await runAgent(words, { config, knowledge, commandSchema, fetcher, now, spoken })
    costs.record(
      turnEntry(
        {
          kind: 'voice-turn',
          provider: turn.provider,
          model: turn.model,
          outcome: 'failure' in answer ? answer.failure : 'replied',
          audioSeconds: turn.audio.seconds,
          cacheHits: turn.cacheHits,
        },
        answer,
        now() - started,
      ),
    )
    const took = `${now() - started} ms, ${answer.rounds} rounds, tools: ${answer.tools.join(' ') || 'none'}`
    if ('reply' in answer && answer.heard) {
      log(`voice-turn: replied in ${took}`)
      response.set('Cache-Control', 'no-store').json({ ...answer.heard, result: answer.reply })
      return
    }
    const failure = 'failure' in answer ? answer : { failure: 'invalid_output' as const, detail: 'nothing heard' }
    log(`voice-turn: ${failure.failure} (${failure.detail}) after ${took}`)
    response.status(failure.failure === 'upstream_timeout' ? 504 : 502).json({ error: failure.failure })
  }

  // Words to speech, passed on as it arrives.
  const speak = async (request: Request, response: Response) => {
    if (!request.is('application/json')) {
      response.status(415).json({ error: 'invalid_request' })
      return
    }
    if (!config.apiKey) {
      response.status(503).json({ error: 'not_configured' })
      return
    }
    const read = readSpeechRequest(request.body, config)
    if ('problem' in read) {
      response.status(400).json({ error: 'invalid_request', field: read.problem })
      return
    }
    const { speech, use } = read
    if (spent() || costs.today().characters + speech.text.length > most.characters) {
      refuseForToday(response)
      return
    }
    costs.take(speech.text.length)
    const started = now()
    // Written when the sound has all gone, or will not.
    const record = (outcome: string, bytes: number, firstSound: number) => {
      const seconds = bytes / SOUND_BYTES_A_SECOND
      costs.record({
        kind: 'speak',
        ...use,
        model: speech.model,
        outcome,
        calls: 1,
        tokens: { prompt: 0, completion: 0, audio: 0 },
        audioSeconds: seconds,
        characters: speech.text.length,
        ms: { firstSound, total: now() - started },
        costUsd: outcome === 'replied' ? speechCost(speech.model, speech.text.length, seconds) : 0,
        estimated: true,
      })
    }
    const spoken = await synthesise(config, speech, fetcher)
    const firstSound = now() - started
    if ('failure' in spoken) {
      record(spoken.failure, 0, firstSound)
      log(`speak: ${spoken.failure} (${spoken.detail}) after ${now() - started} ms`)
      response.status(spoken.failure === 'upstream_timeout' ? 504 : 502).json({ error: spoken.failure })
      return
    }
    log(`speak: ${speech.text.length} characters, sound after ${now() - started} ms`)
    response.set({ 'Content-Type': 'audio/pcm;rate=24000;channels=1', 'Cache-Control': 'no-store' })
    const sound = Readable.fromWeb(spoken.sound.body as Parameters<typeof Readable.fromWeb>[0])
    let bytes = 0
    const counted = new Transform({
      transform: (chunk: Buffer, _encoding, done) => {
        bytes += chunk.length
        done(null, chunk)
      },
      flush: (done) => {
        record('replied', bytes, firstSound)
        done()
      },
    })
    // Cut short, the sound is of no use: close, so that the editor knows. What did arrive is still counted.
    sound.on('error', () => {
      record('cut_short', bytes, firstSound)
      response.destroy()
    })
    sound.pipe(counted).pipe(response)
  }

  const assist = async (request: Request, response: Response) => {
    // Only JSON, which a page on another site cannot send without asking first.
    if (!request.is('application/json')) {
      response.status(415).json({ error: 'invalid_request' })
      return
    }
    if (!configured) {
      response.status(503).json({ error: 'not_configured' })
      return
    }
    const read = readRequest(request.body)
    if ('problem' in read) {
      response.status(400).json({ error: 'invalid_request', field: read.problem })
      return
    }
    if (spent()) {
      refuseForToday(response)
      return
    }
    const started = now()
    const answer = await runAgent(read.request, { config, knowledge, commandSchema, fetcher, now })
    costs.record(
      turnEntry(
        {
          kind: 'assistant',
          provider: '',
          model: config.model,
          outcome: 'failure' in answer ? answer.failure : 'replied',
          audioSeconds: 0,
          cacheHits: 0,
        },
        answer,
        now() - started,
      ),
    )
    // Nothing the student said or wrote is logged: only which tools were used, by name.
    const took = `${now() - started} ms, ${answer.rounds} rounds, tools: ${answer.tools.join(' ') || 'none'}`
    if ('reply' in answer) {
      log(`assistant: replied in ${took}`)
      response.set('Cache-Control', 'no-store').json({ reply: answer.reply })
      return
    }
    log(`assistant: ${answer.failure} (${answer.detail}) after ${took}`)
    response.status(answer.failure === 'upstream_timeout' ? 504 : 502).json({ error: answer.failure })
  }

  app.get('/healthz', (_request, response) => {
    response.json({ ok: true, configured })
  })

  app.use('/api/assistant', origins)
  // Counted before the body is read.
  app.post('/api/assistant', rate, express.json({ limit: config.maxRequestBytes }), (request, response, next) => {
    assist(request, response).catch(next)
  })

  app.use('/api/voice-turn', origins)
  // Room for the longest recording and for what goes with it.
  const voiceBytes = base64Length(config.maxAudioSeconds) + config.maxRequestBytes
  app.post('/api/voice-turn', voiceRate, express.json({ limit: voiceBytes }), (request, response, next) => {
    voiceTurn(request, response).catch(next)
  })

  app.use('/api/speak', origins)
  app.post('/api/speak', speakRate, express.json({ limit: config.maxRequestBytes }), (request, response, next) => {
    speak(request, response).catch(next)
  })

  // OpenAI's live voice: a short-lived key for one session, and the tools the live model calls during it.
  const liveRate = minuteRate(config.voicePerAddressPerMinute)
  const operations = (JSON.parse(commandSchema) as { oneOf: { $ref: string }[] }).oneOf.map(
    (option) => option.$ref.split('/').at(-1) ?? '',
  )
  let liveDay = ''
  let liveSessions = 0
  const liveSession = async (request: Request, response: Response) => {
    if (!request.is('application/json')) {
      response.status(415).json({ error: 'invalid_request' })
      return
    }
    if (!config.openaiApiKey) {
      response.status(503).json({ error: 'not_configured' })
      return
    }
    const read = readRequest(request.body)
    if ('problem' in read) {
      response.status(400).json({ error: 'invalid_request', field: read.problem })
      return
    }
    const day = new Date(now()).toISOString().slice(0, 10)
    if (day !== liveDay) [liveDay, liveSessions] = [day, 0]
    if (liveSessions >= config.liveSessionsPerDay) {
      refuseForToday(response)
      return
    }
    liveSessions += 1
    const started = now()
    const minted = await mintLiveKey(config, read.request, commandSchema, fetcher)
    if ('failure' in minted) {
      log(`live-session: ${minted.failure} (${minted.detail}) after ${now() - started} ms`)
      response.status(minted.failure === 'upstream_timeout' ? 504 : 502).json({ error: minted.failure })
      return
    }
    log(`live-session: ${liveSessions} today, key made in ${now() - started} ms`)
    response.set('Cache-Control', 'no-store').json(minted)
  }
  const liveTool = (request: Request, response: Response) => {
    const body = (request.body ?? {}) as { request?: unknown; name?: unknown; arguments?: unknown }
    const read = readRequest(body.request)
    const { name, arguments: args } = body
    if ('problem' in read || typeof name !== 'string' || name.length > 60 || typeof args !== 'string') {
      response.status(400).json({ error: 'invalid_request' })
      return
    }
    // Nothing the student said is logged: only the tool's name.
    log(`live-tool: ${name}`)
    response.set('Cache-Control', 'no-store').json(runLiveTool(name, args, read.request, knowledge, operations))
  }
  for (const path of ['/api/live-session', '/api/live-tool']) app.use(path, origins)
  app.post('/api/live-session', liveRate, express.json({ limit: config.maxRequestBytes }), (request, response, next) => {
    liveSession(request, response).catch(next)
  })
  app.post('/api/live-tool', rate, express.json({ limit: config.maxRequestBytes }), (request, response) => {
    if (!request.is('application/json')) {
      response.status(415).json({ error: 'invalid_request' })
      return
    }
    liveTool(request, response)
  })

  // Bodies that are too large or are not JSON.
  const errors: ErrorRequestHandler = (error: { status?: number; name?: string }, _request, response, _next) => {
    const status = error.status ?? 500
    if (status === 500) log(`server: ${error.name ?? 'error'}`)
    response.status(status).json({ error: status === 413 ? 'too_large' : 'invalid_request' })
  }
  app.use(errors)

  return app
}
