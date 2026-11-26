// The record of what was used and cost, and the caps measured by it. Nothing here reaches a real service.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.ts'
import { readConfig } from '../src/config.ts'
import { createCostLog, readEntries, speechCost, summarise, type CostLog } from '../src/cost.ts'
import { USUAL_CAPS, type Caps } from '../src/editor-config.ts'
import { listen } from '../src/listen.ts'
import { wav } from './wav.ts'

const file = () => join(mkdtempSync(join(tmpdir(), 'cost-')), 'logs', 'cost.jsonl')

const reported = (cost: number) =>
  Response.json({
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          tool_calls: [
            {
              id: 'a',
              type: 'function',
              function: {
                name: 'give_explanation',
                arguments: JSON.stringify({ transcript: 'SECRET words', clear: true, text: 'SECRET reply' }),
              },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20, cost, prompt_tokens_details: { audio_tokens: 32 } },
  })

const turn = (changes = {}) => ({
  audio: wav(2),
  pending: false,
  language: 'en',
  model: 'google/gemini-3.5-flash-lite',
  provider: 'gemini-pair',
  cacheHits: 3,
  request: {
    mode: 'build',
    history: [],
    language: 'en',
    assistantName: 'Mboni',
    context: {},
    program: ['b1 looks_say: say SECRET block'],
    data: [],
    names: [],
    blocks: [],
    actions: [],
    spriteCategories: [],
  },
  ...changes,
})

const words = { text: 'SECRET sentence', model: 'google/gemini-3.8-flash-lite-tts', voice: 'Kore' }

let server: Server | undefined
afterEach(() => server?.close())

const start = async (costs: CostLog, env: Record<string, string> = {}, caps: Caps = USUAL_CAPS) => {
  const fetcher = vi.fn<typeof fetch>((url) =>
    Promise.resolve((url as string).endsWith('speech') ? new Response(new Uint8Array(96000)) : reported(0.002)),
  )
  const config = readConfig({ OPENROUTER_API_KEY: 'secret-key', OPENROUTER_MODEL: 'm', ...env })
  const app = createApp(config, { fetcher, log: () => {}, caps, costs })
  server = await new Promise<Server>((resolve) => listen(app, 0, resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${base}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    return { status: response.status, text }
  }
  return { post, fetcher }
}

describe('the record of costs', () => {
  it('keeps what a spoken turn used and cost, and none of what was said', async () => {
    const path = file()
    const { post } = await start(createCostLog({ file: path }))
    expect((await post('voice-turn', turn())).status).toBe(200)
    const [entry] = readEntries(path)
    expect(entry).toMatchObject({
      kind: 'voice-turn',
      provider: 'gemini-pair',
      model: 'google/gemini-3.5-flash-lite',
      outcome: 'replied',
      calls: 1,
      tokens: { prompt: 100, completion: 20, audio: 32 },
      audioSeconds: 2,
      cacheHits: 3,
      costUsd: 0.002,
      estimated: false,
      day: { requests: 1, characters: 0, costUsd: 0.002 },
    })
    expect(entry.ms.calls).toHaveLength(1)
    expect(readFileSync(path, 'utf8')).not.toMatch(/SECRET|secret-key|UklGR/)
  })

  it('estimates what speech cost, from its characters and sound', async () => {
    const path = file()
    const { post } = await start(createCostLog({ file: path }))
    await post('speak', words)
    await vi.waitFor(() => expect(readEntries(path)).toHaveLength(1))
    const [entry] = readEntries(path)
    expect(entry).toMatchObject({ kind: 'speak', characters: 15, audioSeconds: 2, estimated: true, outcome: 'replied' })
    expect(entry.costUsd).toBeCloseTo(speechCost(words.model, 15, 2), 10)
    // 25 tokens a second at 6 dollars a million, and the words.
    expect(entry.costUsd).toBeCloseTo((2 * 25 * 6 + (15 / 4) * 0.5) / 1e6, 10)
    expect(entry.ms.firstSound).toBeGreaterThanOrEqual(0)
    expect(readFileSync(path, 'utf8')).not.toContain('SECRET')
  })

  it('keeps typed requests too', async () => {
    const path = file()
    const { post } = await start(createCostLog({ file: path }))
    await post('assistant', { ...turn().request, transcript: 'hi' })
    const [entry] = readEntries(path)
    expect(entry).toMatchObject({ kind: 'assistant', model: 'm', estimated: false })
    // Every call of the turn is added up.
    expect(entry.costUsd).toBeCloseTo(entry.calls * 0.002, 10)
  })

  it('carries the day\'s totals through a restart, and starts a new day afresh', () => {
    let time = Date.parse('2026-11-26T10:00:00Z')
    const path = file()
    const entry = {
      kind: 'speak' as const,
      provider: '',
      model: 'a/b',
      outcome: 'replied',
      calls: 1,
      tokens: { prompt: 0, completion: 0, audio: 0 },
      audioSeconds: 1,
      characters: 10,
      cacheHits: 0,
      ms: { total: 5 },
      costUsd: 0.25,
      estimated: true,
    }
    const first = createCostLog({ file: path, now: () => time })
    first.take(10)
    first.record(entry)
    writeFileSync(path, `${readFileSync(path, 'utf8')}{"cut short`)
    const again = createCostLog({ file: path, now: () => time })
    expect(again.today()).toEqual({ requests: 1, characters: 10, costUsd: 0.25 })
    time += 24 * 60 * 60 * 1000
    expect(again.today()).toEqual({ requests: 0, characters: 0, costUsd: 0 })
    expect(createCostLog({ file: path, now: () => time }).today().costUsd).toBe(0)
  })

  it('is summarised by day, saying it is an estimate', () => {
    const path = file()
    const log = createCostLog({ file: path })
    for (let i = 0; i < 2; i++) {
      log.record({
        kind: 'voice-turn',
        provider: '',
        model: 'a/b',
        outcome: i ? 'upstream_error' : 'replied',
        calls: 2,
        tokens: { prompt: 10, completion: 5, audio: 0 },
        audioSeconds: 1.5,
        characters: 0,
        cacheHits: 1,
        ms: { total: 100 },
        costUsd: 0.5,
        estimated: false,
      })
    }
    const lines = summarise(readEntries(path))
    expect(lines[0]).toMatch(
      /voice-turn a\/b: 2 requests \(1 failed\), 4 calls, 20 \+ 10 tokens, 3\.0 s .* 2 cache hits, 100 ms .*\$1\.0000$/,
    )
    expect(lines.at(-2)).toMatch(/total: \$1\.0000$/)
    expect(lines.at(-1)).toMatch(/estimates/)
    expect(summarise([])).toEqual(['Nothing has been recorded.'])
  })
})

describe('the daily caps', () => {
  it('stop everything once the day\'s cost is reached', async () => {
    const { post, fetcher } = await start(createCostLog(), { AI_DAILY_COST_CAP_USD: '0.002' })
    expect((await post('voice-turn', turn())).status).toBe(200)
    for (const [path, body] of [
      ['voice-turn', turn()],
      ['speak', words],
      ['assistant', { ...turn().request, transcript: 'hi' }],
    ] as const) {
      expect(await post(path, body)).toEqual({ status: 429, text: '{"error":"daily_limit"}' })
    }
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('count requests and characters from the record, so a restart does not reset them', async () => {
    const path = file()
    const caps = { requests: 1, characters: 20 }
    const before = await start(createCostLog({ file: path }), {}, caps)
    await before.post('voice-turn', turn())
    await before.post('speak', words)
    await vi.waitFor(() => expect(readEntries(path)).toHaveLength(2))
    server?.close()
    const after = await start(createCostLog({ file: path }), {}, caps)
    expect((await after.post('voice-turn', turn())).status).toBe(429)
    expect((await after.post('speak', words)).status).toBe(429)
    expect(after.fetcher).not.toHaveBeenCalled()
  })

  it('are a dollar a day unless set, and refuse nonsense', () => {
    expect(readConfig({}).costPerDayUsd).toBe(1)
    expect(readConfig({ AI_DAILY_COST_CAP_USD: '0' }).costPerDayUsd).toBe(0)
    expect(() => readConfig({ AI_DAILY_COST_CAP_USD: '-1' })).toThrow('AI_DAILY_COST_CAP_USD')
    expect(readConfig({ AI_COST_LOG: 'off' }).costLog).toBeNull()
    expect(readConfig({}).costLog).toMatch(/logs\/cost\.jsonl$/)
  })

  it('refuse an odd provider or count', async () => {
    const { post } = await start(createCostLog())
    expect((await post('voice-turn', turn({ provider: 'mine' }))).status).toBe(400)
    expect((await post('speak', { ...words, cacheHits: -1 })).status).toBe(400)
  })
})
