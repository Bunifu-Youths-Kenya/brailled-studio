// Making the sound that ships with the editor, with a stand-in for the service.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { readConfig } from '../src/config.ts'
import { makePhrases, toKeptWav } from '../src/phrases.ts'

const phrases = (sentences: string[]) => ({
  sentences,
  voice: 'Kore',
  model: 'google/gemini-3.8-flash-lite-tts',
  version: 1,
  keyOf: (text: string) => text.replace(/\W/g, '').toLowerCase(),
})

// A tenth of a second of sound at the service's rate.
const sound = () => new Response(new Uint8Array(4800))

describe('the kept sound', () => {
  it('is 16 kHz WAV, two thirds as many samples', () => {
    const pcm = Buffer.alloc(12)
    ;[0, 300, 600, 900, 1200, 1500].forEach((value, i) => pcm.writeInt16LE(value, i * 2))
    const wav = toKeptWav(pcm)
    expect(wav.toString('latin1', 0, 4)).toBe('RIFF')
    expect(wav.readUInt32LE(24)).toBe(16000)
    expect([0, 1, 2, 3].map((i) => wav.readInt16LE(44 + i * 2))).toEqual([0, 450, 900, 1350])
  })

  it('is made once, listed, and removed when no sentence needs it', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'phrases-'))
    writeFileSync(join(folder, 'old.wav'), 'old')
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(sound()))
    const options = { config: readConfig({ OPENROUTER_API_KEY: 'k' }), fetcher, folder, log: () => {} }
    expect(await makePhrases(phrases(['Done.', 'Hello.']), options)).toEqual({ made: 2, kept: 0, removed: 1 })
    expect(readdirSync(folder).sort()).toEqual(['done.wav', 'hello.wav', 'manifest.json'])
    expect(await makePhrases(phrases(['Done.']), options)).toEqual({ made: 0, kept: 1, removed: 1 })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'))).toMatchObject({
      voice: 'Kore',
      phrases: [{ key: 'done', file: 'done.wav', text: 'Done.' }],
    })
  })

  it('stops, saying which sentence, when the service fails', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'phrases-'))
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('', { status: 404 })))
    const options = { config: readConfig({ OPENROUTER_API_KEY: 'k' }), fetcher, folder, log: () => {} }
    await expect(makePhrases(phrases(['Done.']), options)).rejects.toThrow('"Done.": no_endpoint')
  })
})
