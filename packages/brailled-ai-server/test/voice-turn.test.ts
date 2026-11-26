// One spoken turn, with a stand-in for the model. Nothing here reaches a real service.
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, type Options } from '../src/app.ts'
import { base64Length, readRecording } from '../src/audio.ts'
import { readConfig } from '../src/config.ts'
import { capsFrom, readCaps, USUAL_CAPS } from '../src/editor-config.ts'
import { listen } from '../src/listen.ts'
import { toolsFor } from '../src/tools.ts'
import { calls, says } from './model.ts'
import { wav } from './wav.ts'

const ORIGIN = 'http://localhost:8601'

const project = () => ({
  mode: 'build',
  history: [],
  language: 'en',
  assistantName: 'Mboni',
  context: { sprite: { name: 'SECRET sprite' } },
  program: ['b1 motion_movesteps: move 10 steps'],
  data: [],
  names: ['sprites: SECRET'],
  blocks: ['control_wait (stack) "wait 1 second" DURATION=positive'],
  actions: [{ id: 'project.run', name: 'run', description: 'Starts it.' }],
  spriteCategories: ['animals'],
})

const turn = (changes: Record<string, unknown> = {}) => ({
  audio: wav(),
  pending: false,
  language: 'en',
  model: 'google/gemini-3.5-flash-lite',
  request: project(),
  ...changes,
})

const waiting = () => {
  const { request: _, ...rest } = turn({ pending: true })
  return rest
}

let server: Server | undefined
afterEach(() => server?.close())

interface Sent {
  model: string
  provider: Record<string, unknown>
  messages: { role: string; content: unknown }[]
  tools: { function: { name: string; parameters: { required: string[] } } }[]
}

const start = async (responses: Response[], env: Record<string, string> = {}, options: Options = {}) => {
  const sent: Sent[] = []
  const fetcher = vi.fn<typeof fetch>((_url, init) => {
    sent.push(JSON.parse(init?.body as string) as Sent)
    return Promise.resolve(responses[sent.length - 1] ?? says('more talk'))
  })
  const lines: string[] = []
  const config = readConfig({ OPENROUTER_API_KEY: 'secret-key', ...env })
  const app = createApp(config, { fetcher, log: (line) => lines.push(line), caps: USUAL_CAPS, ...options })
  server = await new Promise<Server>((resolve) => listen(app, 0, resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const post = (body: unknown = turn(), headers: Record<string, string> = {}) =>
    fetch(`${base}/api/voice-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
      body: JSON.stringify(body),
    })
  return { post, sent, fetcher, lines }
}

const explain = () =>
  calls(['give_explanation', { transcript: 'what is a loop', clear: true, text: 'It repeats.' }])

describe('a spoken turn', () => {
  it('sends the recording to the model that hears, and passes back the words and the reply', async () => {
    const { post, sent, lines } = await start([explain()])
    const response = await post()
    expect(await response.json()).toEqual({
      transcript: 'what is a loop',
      clear: true,
      result: { type: 'explanation', text: 'It repeats.' },
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(sent[0].model).toBe('google/gemini-3.5-flash-lite')
    expect(sent[0].provider).toEqual({ require_parameters: true, data_collection: 'deny', zdr: true, sort: 'latency' })
    expect(sent[0].messages[1].content).toEqual([
      { type: 'text', text: expect.any(String) as string },
      { type: 'input_audio', input_audio: { data: wav().data, format: 'wav' } },
    ])
    expect(lines.join()).toMatch(/^voice-turn: replied in \d+ ms, 1 rounds, tools: give_explanation$/)
    expect(lines.join()).not.toMatch(/loop|secret|SECRET/)
  })

  it('keeps project text marked as data and out of the instructions', async () => {
    const { post, sent } = await start([explain()])
    await post()
    const [system, user] = sent[0].messages
    expect(system.content).toMatch(/THE REQUEST IS A RECORDING/)
    expect(system.content).toMatch(/UNTRUSTED PROJECT CONTENT/)
    expect(system.content).not.toContain('SECRET')
    const said = JSON.parse((user.content as { text: string }[])[0].text) as Record<string, unknown>
    expect(said).not.toHaveProperty('request')
    expect(JSON.stringify(said.untrustedProjectContent)).toContain('SECRET')
  })

  it('runs the tools, sending the recording with each call', async () => {
    const proposal = { summary: 'Wait.', steps: [{ command: { op: 'insert', block: 'control_wait', after: 'b1' } }] }
    const { post, sent } = await start([
      calls(['find_blocks', { query: 'wait' }]),
      calls(['submit_proposal', { transcript: 'add a wait', clear: true, ...proposal }]),
    ])
    expect(await (await post()).json()).toMatchObject({
      transcript: 'add a wait',
      result: { type: 'proposal', ...proposal },
    })
    expect(JSON.stringify(sent[1].messages)).toContain('input_audio')
  })

  it('may report only the words', async () => {
    const { post } = await start([calls(['report_heard', { transcript: ' run ', clear: false }])])
    expect(await (await post()).json()).toEqual({ transcript: 'run', clear: false, result: null })
  })

  it('refuses a reply that does not say what was heard, and lets the model try again', async () => {
    const { post, sent } = await start([calls(['give_explanation', { text: 'Hello.' }]), explain()])
    expect(await (await post()).json()).toMatchObject({ transcript: 'what is a loop' })
    expect(sent[1].messages.at(-1)?.content).toMatch(/transcript/)
  })

  it.each([
    ['an empty transcript with a reply', calls(['give_explanation', { transcript: ' ', clear: true, text: 'x' }])],
    ['words that are not a tool call', says('{"transcript":"yes"}')],
    ['an unsound proposal', calls(['submit_proposal', { transcript: 'a', clear: true, summary: 's', steps: [] }])],
  ])('says it could not work out %s', async (_, first) => {
    const { post } = await start([first])
    const response = await post()
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'invalid_output' })
  })

  it('says when no provider can keep to the privacy settings', async () => {
    const { post } = await start([new Response('', { status: 404 })])
    const response = await post()
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'no_endpoint' })
  })
})

describe('while something waits for an answer', () => {
  it('asks only for the words, and sends nothing of the project', async () => {
    const { post, sent } = await start([calls(['report_heard', { transcript: 'yes', clear: true }])])
    expect(await (await post(waiting())).json()).toEqual({ transcript: 'yes', clear: true, result: null })
    expect(sent[0].tools.map((tool) => tool.function.name)).toEqual(['report_heard'])
    expect(JSON.stringify(sent[0].messages)).not.toContain('SECRET')
    expect(sent[0].messages[0].content).toMatch(/Do not\s+answer/)
  })

  it('refuses any other tool, whatever the model tries', async () => {
    const approve = calls(['submit_proposal', { transcript: 'yes', clear: true, summary: 's', steps: [] }])
    const { post, sent } = await start([approve, calls(['approve', {}])])
    expect((await post(waiting())).status).toBe(502)
    expect(sent[1].messages.at(-1)?.content).toMatch(/There is no tool/)
  })

  it('refuses a request that carries the project', async () => {
    const { post, fetcher } = await start([])
    expect((await post({ ...turn(), pending: true })).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('the voice tools', () => {
  const names = (voice: 'turn' | 'transcribe', mode: 'build' | 'guide' = 'build') =>
    toolsFor(mode, false, voice).map((tool) => tool.function.name)

  it('add only a way to report the words: none runs, changes or approves anything', () => {
    expect(names('turn')).toEqual([
      ...toolsFor('build').map((tool) => tool.function.name),
      'report_heard',
    ])
    expect(names('turn', 'guide')).not.toContain('submit_proposal')
    expect(names('transcribe')).toEqual(['report_heard'])
    for (const name of names('turn')) expect(name).not.toMatch(/run|execute|approve|apply|perform|delete|answer/)
  })

  it('require what was heard of every way to finish', () => {
    for (const { function: tool } of toolsFor('build', true, 'turn')) {
      expect(tool.parameters.required.slice(0, 2)).toEqual(['transcript', 'clear'])
    }
  })
})

describe('what is taken', () => {
  it.each([
    ['not a WAV file', turn({ audio: { data: Buffer.alloc(100).toString('base64'), format: 'wav' } }), 'audio'],
    ['two channels', turn({ audio: wav(1, (bytes) => bytes.writeUInt16LE(2, 22)) }), 'audio'],
    ['another rate', turn({ audio: wav(1, (bytes) => bytes.writeUInt32LE(48000, 24)) }), 'audio'],
    ['another format', turn({ audio: { ...wav(), format: 'mp3' } }), 'audio'],
    ['no sound', turn({ audio: wav(0) }), 'audio'],
    ['a model not allowed', turn({ model: 'vendor/dear-model' }), 'model'],
    ['an unknown field', turn({ approve: true }), 'unknown field'],
    ['words beside the recording', turn({ request: { ...project(), transcript: 'yes' } }), 'request'],
    ['no project', turn({ request: undefined }), 'request'],
    ['no word on what waits', turn({ pending: 'no' }), 'pending'],
  ])('refuses %s', async (_, body, field) => {
    const { post, fetcher } = await start([])
    const response = await post(body)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_request', field })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses a recording longer than allowed', async () => {
    const { post } = await start([], { AI_MAX_AUDIO_SECONDS: '2' })
    expect((await post(turn({ audio: wav(2.5) }))).status).toBeGreaterThanOrEqual(400)
    expect(readRecording(wav(2.5), 2)).toBeNull()
    expect(readRecording(wav(2), 2)).toMatchObject({ seconds: 2 })
    expect(wav(2).data.length).toBeLessThanOrEqual(base64Length(2))
  })

  it('takes a recording of the longest length', async () => {
    const { post } = await start([explain()])
    expect((await post(turn({ audio: wav(60) }))).status).toBe(200)
  })

  it('refuses other web pages, and anything without a key', async () => {
    const { post, fetcher } = await start([], { OPENROUTER_API_KEY: '' })
    expect((await post(turn(), { Origin: 'http://example.org' })).status).toBe(403)
    expect((await post()).status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('limits voice requests a day to the lower of the two caps', async () => {
    const { post } = await start([explain(), explain()], { VOICE_REQUESTS_PER_DAY: '5' }, {
      caps: { requests: 1, characters: 10 },
    })
    expect((await post()).status).toBe(200)
    expect((await post()).status).toBe(429)
  })

  it('reads the caps from the editor\'s configuration file', () => {
    expect(capsFrom({ voice: { dailyRequestCap: 5, dailyCharacterCap: 7 } })).toEqual({ requests: 5, characters: 7 })
    expect(capsFrom({ voice: true })).toEqual(USUAL_CAPS)
    expect(capsFrom({ voice: { dailyRequestCap: -1 } })).toEqual(USUAL_CAPS)
    expect(readCaps(new URL('./nothing.json', import.meta.url))).toEqual(USUAL_CAPS)
    expect(readCaps()).toEqual(USUAL_CAPS)
  })
})
