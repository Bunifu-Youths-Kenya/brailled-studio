// The server: one endpoint that takes the editor's request and passes back the model's reply.
import { readFileSync } from 'node:fs'
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express'
import { base64Length } from './audio.ts'
import type { Config } from './config.ts'
import { readCaps, type Caps } from './editor-config.ts'
import { runAgent } from './agent.ts'
import { loadKnowledge } from './knowledge.ts'
import { createRateLimiter } from './limits.ts'
import { readRequest, readVoiceTurn, type AssistantRequest } from './request.ts'

// The schema the editor's validator uses, so that the model is told the same rules.
const SCHEMA_FILE = new URL('../../brailled-accessibility/src/commands/schema.json', import.meta.url)

export interface Options {
  fetcher?: typeof fetch
  now?: () => number
  log?: (line: string) => void
  caps?: Caps
}

// The voice endpoints' requests a minute from everyone together, as a multiple of what one address may make.
const ADDRESSES_AT_ONCE = 6

export const createApp = (
  config: Config,
  { fetcher = fetch, now = Date.now, log = console.log, caps = readCaps() }: Options = {},
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

  const voiceLimit = createRateLimiter(
    {
      perAddressPerMinute: config.voicePerAddressPerMinute,
      perMinute: config.voicePerAddressPerMinute * ADDRESSES_AT_ONCE,
      perDay: Math.min(config.voicePerDay ?? caps.requests, caps.requests),
    },
    now,
  )
  const voiceRate: RequestHandler = (request, response, next) => {
    const wait = voiceLimit(request.ip ?? 'unknown')
    if (wait === null) {
      next()
      return
    }
    response.set('Retry-After', String(wait)).status(429).json({ error: 'too_many_requests' })
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
    const started = now()
    const answer = await runAgent(read.request, { config, knowledge, commandSchema, fetcher, now })
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

  // Bodies that are too large or are not JSON.
  const errors: ErrorRequestHandler = (error: { status?: number; name?: string }, _request, response, _next) => {
    const status = error.status ?? 500
    if (status === 500) log(`server: ${error.name ?? 'error'}`)
    response.status(status).json({ error: status === 413 ? 'too_large' : 'invalid_request' })
  }
  app.use(errors)

  return app
}
