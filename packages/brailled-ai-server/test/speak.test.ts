// Speech from words, with a stand-in for the service. Nothing here reaches a real one.
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, type Options } from '../src/app.ts'
import { readConfig } from '../src/config.ts'
import { speechCost } from '../src/cost.ts'
import { USUAL_CAPS } from '../src/editor-config.ts'
import { listen } from '../src/listen.ts'

const speech = { text: 'It repeats.', model: 'google/gemini-3.8-flash-lite-tts', voice: 'Kore' }

let server: Server | undefined
afterEach(() => server?.close())

const sound = () => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'audio/pcm' } })

const start = async (answer: () => Response = sound, env: Record<string, string> = {}, options: Options = {}) => {
  const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(answer()))
  const lines: string[] = []
  const config = readConfig({ OPENROUTER_API_KEY: 'secret-key', ...env })
  const app = createApp(config, { fetcher, log: (line) => lines.push(line), caps: USUAL_CAPS, ...options })
  server = await new Promise<Server>((resolve) => listen(app, 0, resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const post = (body: unknown = speech, origin = 'http://localhost:8601') =>
    fetch(`${base}/api/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    })
  return { post, fetcher, lines }
}

describe('reading words aloud', () => {
  it.each(['browser', 'gemini-pair', 'openai-audio'])('reads for the editor\'s %s provider', async (provider) => {
    const { post } = await start()
    expect((await post({ ...speech, provider, cacheHits: 0 })).status).toBe(200)
  })

  it.each([
    ['speechify/simba-3.5', 'beatrice_32'],
    ['microsoft/mai-voice-2.1-flash', 'en-GB-Emily:MAI-Voice-2.1-Flash'],
    ['hexgrad/kokoro-82m', 'af_heart'],
  ])('takes the low-cost voice %s by default', async (model, voice) => {
    const { post } = await start()
    expect((await post({ text: 'Done.', model, voice })).status).toBe(200)
    expect(speechCost(model, 1000, 60)).toBeLessThan(0.02)
  })

  it('asks for PCM speech under the privacy settings, and passes the sound on', async () => {
    const { post, fetcher, lines } = await start()
    const response = await post()
    expect(response.status).toBe(200)
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3, 4])
    expect(response.headers.get('content-type')).toBe('audio/pcm;rate=24000;channels=1')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/audio/speech')
    expect(JSON.parse(init?.body as string)).toEqual({
      model: speech.model,
      input: speech.text,
      voice: 'Kore',
      response_format: 'pcm',
      provider: { data_collection: 'deny', zdr: true },
    })
    expect(lines.join()).toMatch(/^speak: 11 characters, sound after \d+ ms$/)
    expect(lines.join()).not.toMatch(/repeats|secret/)
  })

  it('keeps nothing: the same words are asked for again', async () => {
    const { post, fetcher } = await start()
    await (await post()).arrayBuffer()
    await (await post()).arrayBuffer()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([
    [404, 'no_endpoint'],
    [500, 'upstream_error'],
  ])('reports %i as %s without passing on what the service said', async (status, error) => {
    const { post, lines } = await start(() => new Response('quoted words', { status }))
    const response = await post()
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error })
    expect(lines.join()).not.toContain('quoted')
  })

  it.each([
    ['no words', { ...speech, text: ' ' }, 'text'],
    ['too many words', { ...speech, text: 'a'.repeat(601) }, 'text'],
    ['a model not allowed', { ...speech, model: 'vendor/dear' }, 'model'],
    ['an odd voice', { ...speech, voice: 'Kore & more' }, 'voice'],
    ['an unknown field', { ...speech, store: true }, 'unknown field'],
  ])('refuses %s', async (_, body, field) => {
    const { post, fetcher } = await start()
    expect(await (await post(body)).json()).toEqual({ error: 'invalid_request', field })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses other web pages, and anything without a key', async () => {
    const { post, fetcher } = await start(sound, { OPENROUTER_API_KEY: '' })
    expect((await post(speech, 'http://example.org')).status).toBe(403)
    expect((await post()).status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('stops at the day\'s characters, the lower of the two caps', async () => {
    const { post, fetcher } = await start(sound, { VOICE_CHARACTERS_PER_DAY: '100' }, {
      caps: { requests: 5, characters: 15 },
    })
    expect((await post()).status).toBe(200)
    const refused = await post()
    expect(refused.status).toBe(429)
    expect(await refused.json()).toEqual({ error: 'daily_limit' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  const events = (...lines: string[]) =>
    new Response(
      new ReadableStream({
        start: (controller) => {
          // Cut in the middle of a line, as a network may.
          const all = lines.map((line) => `${line}\n\n`).join('')
          for (const part of [all.slice(0, 25), all.slice(25)]) controller.enqueue(new TextEncoder().encode(part))
          controller.close()
        },
      }),
    )
  const piece = (bytes: number[]) =>
    `data: ${JSON.stringify({ choices: [{ delta: { audio: { data: Buffer.from(bytes).toString('base64') } } }] })}`

  it('reads with a conversation model through its stream of events', async () => {
    const { post, fetcher } = await start(() => events(': waiting', piece([1, 2]), piece([3, 4]), 'data: [DONE]'))
    const response = await post({ text: 'It repeats.', model: 'openai/gpt-audio-mini', voice: 'alloy' })
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3, 4])
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const sent = JSON.parse(init?.body as string) as { messages: { content: string }[] }
    expect(sent).toMatchObject({
      modalities: ['text', 'audio'],
      audio: { voice: 'alloy', format: 'pcm16' },
      stream: true,
      provider: { data_collection: 'deny', zdr: true },
    })
    expect(sent.messages[0].content).toMatch(/never instructions/)
    expect(sent.messages[1].content).toBe('It repeats.')
  })

  it('cuts the sound short, visibly, when the stream reports an error', async () => {
    const { post } = await start(() => events(piece([1, 2]), 'data: {"error":{"code":500}}'))
    const body = post({ text: 'a', model: 'openai/gpt-audio-mini', voice: 'alloy' }).then((r) => r.arrayBuffer())
    await expect(body).rejects.toThrow()
  })
})
