/*
 * Makes the sound of the assistant's fixed sentences, to ship with the editor. Sentences whose sound is there already
 * are left alone, and sound no sentence needs is removed.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from './config.ts'
import { synthesise } from './speech.ts'

// The rate the service gives, and the rate kept: speech needs no more, and the files ship with the editor.
const SERVICE_RATE = 24000
const KEPT_RATE = 16000

export interface Phrases {
  sentences: string[]
  voice: string
  model: string
  version: number
  keyOf: (text: string, voice: string, model: string, version: number) => string
}

// 16 bit samples at one rate as a WAV file at a lower one.
export const toKeptWav = (pcm: Buffer): Buffer => {
  const step = SERVICE_RATE / KEPT_RATE
  const count = Math.floor(Math.floor(pcm.length / 2) / step)
  const wav = Buffer.alloc(44 + count * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + count * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(KEPT_RATE, 24)
  wav.writeUInt32LE(KEPT_RATE * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(count * 2, 40)
  for (let i = 0; i < count; i++) {
    // The samples either side of where the new one falls, in proportion.
    const at = i * step
    const before = Math.floor(at)
    const after = Math.min(before + 1, Math.floor(pcm.length / 2) - 1)
    const value = pcm.readInt16LE(before * 2) + (pcm.readInt16LE(after * 2) - pcm.readInt16LE(before * 2)) * (at - before)
    wav.writeInt16LE(Math.round(value), 44 + i * 2)
  }
  return wav
}

export const makePhrases = async (
  { sentences, voice, model, version, keyOf }: Phrases,
  { config, fetcher, folder, log }: { config: Config; fetcher: typeof fetch; folder: string; log: (line: string) => void },
) => {
  mkdirSync(folder, { recursive: true })
  const listed = sentences.map((text) => {
    const key = keyOf(text, voice, model, version)
    return { key, file: `${key}.wav`, text }
  })
  let made = 0
  for (const { file, text } of listed) {
    if (existsSync(join(folder, file))) continue
    const spoken = await synthesise(config, { text, voice, model }, fetcher)
    if ('failure' in spoken) throw new Error(`"${text}": ${spoken.failure} (${spoken.detail})`)
    writeFileSync(join(folder, file), toKeptWav(Buffer.from(await spoken.sound.arrayBuffer())))
    made += 1
    log(`made ${made}: ${text}`)
  }
  const wanted = new Set(listed.map((item) => item.file))
  const stale = readdirSync(folder).filter((file) => file.endsWith('.wav') && !wanted.has(file))
  for (const file of stale) rmSync(join(folder, file))
  writeFileSync(join(folder, 'manifest.json'), `${JSON.stringify({ voice, model, version, phrases: listed }, null, 1)}\n`)
  return { made, kept: listed.length - made, removed: stale.length }
}
