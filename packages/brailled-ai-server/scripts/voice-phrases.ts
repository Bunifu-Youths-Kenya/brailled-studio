// Usage: npm run voice:phrases. Calls the speech service for each sentence without sound, which costs credit.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readConfig } from '../src/config.ts'
import { makePhrases } from '../src/phrases.ts'

const editor = new URL('../../brailled-accessibility/', import.meta.url)
const gui = new URL('../../scratch-gui/static/', import.meta.url)
const read = <T>(url: URL) => JSON.parse(readFileSync(url, 'utf8')) as T

const config = readConfig(process.env)
if (!config.apiKey) throw new Error('OPENROUTER_API_KEY is not set')
const { voice: settings } = read<{ voice?: { ttsVoice?: string; ttsModel?: string } }>(new URL('brailled-config.json', gui))
const naming = (await import(new URL('src/speech/phrases.js', editor).href)) as {
  PHRASE_VERSION: number
  phraseKey: (text: string, voice: string, model: string, version: number) => string
}
const result = await makePhrases(
  {
    sentences: read<{ sentences: string[] }>(new URL('src/speech/fixed-phrases.json', editor)).sentences,
    voice: settings?.ttsVoice ?? 'Kore',
    model: settings?.ttsModel ?? 'google/gemini-3.8-flash-lite-tts',
    version: naming.PHRASE_VERSION,
    keyOf: naming.phraseKey,
  },
  { config, fetcher: fetch, folder: fileURLToPath(new URL('brailled-voice/', gui)), log: console.log },
)
console.log(`${result.made} made, ${result.kept} already there, ${result.removed} removed`)
