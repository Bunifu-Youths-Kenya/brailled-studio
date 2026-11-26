/*
 * A record of what the AI calls used and cost, with the day's totals that the caps are measured against. It holds
 * counts, names of models and times: never anything said, written or heard.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Entry {
  kind: 'assistant' | 'voice-turn' | 'speak'
  // The editor's voice provider, where it says.
  provider: string
  model: string
  // `replied`, or why not.
  outcome: string
  // Calls made to the model.
  calls: number
  tokens: { prompt: number; completion: number; audio: number }
  audioSeconds: number
  characters: number
  // Sentences the editor played from its own sound since it last said.
  cacheHits: number
  // How long each stage took.
  ms: { calls?: number[]; firstSound?: number; total: number }
  costUsd: number
  // Whether any of the cost was worked out here rather than reported by the service.
  estimated: boolean
}

export interface Totals {
  requests: number
  characters: number
  costUsd: number
}

export type Logged = Entry & { time: string; day: Totals }

// Prices in US dollars a million tokens, as OpenRouter listed them on 2026-11-26, and sound's tokens a second.
const PRICES: Record<string, { input: number; output: number; audioTokensASecond: number }> = {
  'google/gemini-3.8-flash-lite-tts': { input: 0.5, output: 6, audioTokensASecond: 25 },
  'openai/gpt-audio-mini': { input: 0.6, output: 2.4, audioTokensASecond: 50 },
}
// For a model not listed, the dearer of each.
const UNLISTED = { input: 0.6, output: 6, audioTokensASecond: 50 }

// What reading some words aloud costs, for the speech service reports nothing.
export const speechCost = (model: string, characters: number, seconds: number) => {
  const price = PRICES[model] ?? UNLISTED
  // About four characters make a token.
  return ((characters / 4) * price.input + seconds * price.audioTokensASecond * price.output) / 1e6
}

// The date where the server is.
export const dayOf = (time: number) => {
  const date = new Date(time)
  const two = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}

export const readEntries = (file: string): Logged[] => {
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }
  return text.split('\n').flatMap((line) => {
    try {
      return line ? [JSON.parse(line) as Logged] : []
    } catch {
      // A line cut short, as when the machine stopped while writing it.
      return []
    }
  })
}

// Without a file the record lasts until the server stops.
export const createCostLog = ({ file = null, now = Date.now }: { file?: string | null; now?: () => number } = {}) => {
  const nothing = (): Totals => ({ requests: 0, characters: 0, costUsd: 0 })
  let day = dayOf(now())
  let totals = nothing()
  for (const entry of file ? readEntries(file) : []) {
    if (dayOf(Date.parse(entry.time)) !== day) continue
    // Each line has the totals as they then were, and the last of the day has them all.
    totals = entry.day
  }
  const today = () => {
    const current = dayOf(now())
    if (current !== day) {
      day = current
      totals = nothing()
    }
    return totals
  }
  return {
    today: (): Totals => ({ ...today() }),
    // Count a request and its characters as soon as it is taken, so that requests at once cannot pass a cap.
    take: (characters = 0) => {
      today().requests += 1
      totals.characters += characters
    },
    record: (entry: Entry): Logged => {
      today().costUsd += entry.costUsd
      const logged = { time: new Date(now()).toISOString(), ...entry, day: { ...totals } }
      if (file) {
        mkdirSync(dirname(file), { recursive: true })
        appendFileSync(file, `${JSON.stringify(logged)}\n`)
      }
      return logged
    },
  }
}

export type CostLog = ReturnType<typeof createCostLog>

// A summary of the record, a line a day and kind.
export const summarise = (entries: Logged[]) => {
  const rows = new Map<string, { count: number; failed: number; entry: Entry; ms: number }>()
  for (const logged of entries) {
    const key = `${dayOf(Date.parse(logged.time))} ${logged.kind} ${logged.model}`
    const row = rows.get(key)
    const failed = logged.outcome === 'replied' ? 0 : 1
    if (!row) {
      rows.set(key, { count: 1, failed, entry: structuredClone(logged), ms: logged.ms.total })
      continue
    }
    row.count += 1
    row.failed += failed
    row.ms += logged.ms.total
    const sum = row.entry
    sum.tokens.prompt += logged.tokens.prompt
    sum.tokens.completion += logged.tokens.completion
    sum.audioSeconds += logged.audioSeconds
    sum.characters += logged.characters
    sum.cacheHits += logged.cacheHits
    sum.calls += logged.calls
    sum.costUsd += logged.costUsd
  }
  const lines = [...rows].sort(([a], [b]) => a.localeCompare(b)).map(
    ([key, { count, failed, entry, ms }]) =>
      `${key}: ${count} requests (${failed} failed), ${entry.calls} calls, ` +
      `${entry.tokens.prompt} + ${entry.tokens.completion} tokens, ${entry.audioSeconds.toFixed(1)} s of sound, ` +
      `${entry.characters} characters, ${entry.cacheHits} cache hits, ${Math.round(ms / count)} ms on average, ` +
      `$${entry.costUsd.toFixed(4)}`,
  )
  const days = new Map<string, number>()
  for (const logged of entries) {
    const day = dayOf(Date.parse(logged.time))
    days.set(day, (days.get(day) ?? 0) + logged.costUsd)
  }
  const totals = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, cost]) => `${day} total: $${cost.toFixed(4)}`)
  return lines.length
    ? [...lines, ...totals, 'Costs are estimates. OpenRouter\'s own activity page is the record of what was charged.']
    : ['Nothing has been recorded.']
}
