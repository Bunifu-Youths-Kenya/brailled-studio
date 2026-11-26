/*
 * What the editor may send. Anything else, an unknown field included, is refused, so that pictures, page content
 * and the like cannot be passed on to the model.
 */
import { readRecording, type Recording } from './audio.ts'

export interface Turn {
  who: 'student' | 'assistant' | 'editor'
  text: string
}

export interface AssistantRequest {
  transcript: string
  mode: 'build' | 'guide'
  history: Turn[]
  language: string
  assistantName: string
  context: Record<string, unknown>
  program: string[]
  data: string[]
  names: string[]
  blocks: string[]
  actions: { id: string; name: string; description: string }[]
  spriteCategories: string[]
  previous?: { question: string; choices: string[] }
  revises?: { summary: string; steps: string[] }
  // The student is talking with the assistant hands-free and hears every answer.
  conversing?: true
}

const CONTEXT_KEYS = ['view', 'focus', 'sprite', 'outline', 'moving', 'stageTab', 'device', 'project']
const MAX_CONTEXT_CHARACTERS = 6000

type Check<T> = (value: unknown) => T | null

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const hasOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key))

const text =
  (length: number): Check<string> =>
  (value) =>
    typeof value === 'string' && value.length <= length ? value : null

const list =
  <T>(count: number, item: Check<T>): Check<T[]> =>
  (value) => {
    if (!Array.isArray(value) || value.length > count) return null
    const items = value.map(item)
    return items.includes(null) ? null : (items as T[])
  }

const context: Check<Record<string, unknown>> = (value) =>
  isObject(value) && hasOnly(value, CONTEXT_KEYS) && JSON.stringify(value).length <= MAX_CONTEXT_CHARACTERS
    ? value
    : null

const action: Check<AssistantRequest['actions'][number]> = (value) => {
  if (!isObject(value) || !hasOnly(value, ['id', 'name', 'description'])) return null
  const id = text(60)(value.id)
  const name = text(100)(value.name)
  const description = text(200)(value.description)
  return id && /^[a-z]+\.[A-Za-z]+$/.test(id) && name !== null && description !== null
    ? { id, name, description }
    : null
}

const previous: Check<NonNullable<AssistantRequest['previous']>> = (value) => {
  if (!isObject(value) || !hasOnly(value, ['question', 'choices'])) return null
  const question = text(300)(value.question)
  const choices = list(5, text(120))(value.choices)
  return question !== null && choices !== null ? { question, choices } : null
}

const revises: Check<NonNullable<AssistantRequest['revises']>> = (value) => {
  if (!isObject(value) || !hasOnly(value, ['summary', 'steps'])) return null
  const summary = text(300)(value.summary)
  const steps = list(20, text(300))(value.steps)
  return summary !== null && steps !== null ? { summary, steps } : null
}

const turn: Check<Turn> = (value) => {
  if (!isObject(value) || !hasOnly(value, ['who', 'text'])) return null
  const said = text(300)(value.text)
  const who = value.who
  return said !== null && (who === 'student' || who === 'assistant' || who === 'editor') ? { who, text: said } : null
}

// Letters, with spaces, hyphens or apostrophes between them: a name, not a sentence or an instruction.
const NAME = /^\p{L}(?:[\p{L}\p{M} '’-]{0,28}[\p{L}\p{M}])?$/u

const OPTIONAL = ['previous', 'revises', 'conversing']

const fields: Record<keyof AssistantRequest, Check<unknown>> = {
  transcript: (value) => (typeof value === 'string' && value.trim() ? text(500)(value) : null),
  mode: (value) => (value === 'build' || value === 'guide' ? value : null),
  history: list(12, turn),
  language: text(35),
  assistantName: (value) => (typeof value === 'string' && NAME.test(value) ? value : null),
  context,
  program: list(400, text(300)),
  data: list(200, text(300)),
  names: list(10, text(2000)),
  blocks: list(400, text(400)),
  actions: list(80, action),
  spriteCategories: list(30, text(40)),
  previous,
  revises,
  conversing: (value) => (value === true ? true : null),
}

export interface VoiceTurn {
  audio: Recording
  // Whether something waits for the student's answer. Then only the words are wanted, and nothing of the project
  // is sent.
  pending: boolean
  language: string
  model: string
  request: AssistantRequest | null
  // For the record of costs.
  provider: string
  cacheHits: number
}

// "browser" is the editor's provider where the browser listens and only replies are read here.
const PROVIDERS = ['browser', 'gemini-pair', 'openai-audio']
const MOST_HITS = 10_000

// What the editor may say of itself for the record: its provider, and the sentences it played from its own sound.
export const readUse = (body: Record<string, unknown>): { provider: string; cacheHits: number } | null => {
  const { provider = '', cacheHits = 0 } = body
  const known = provider === '' || (typeof provider === 'string' && PROVIDERS.includes(provider))
  const counted = Number.isInteger(cacheHits) && (cacheHits as number) >= 0 && (cacheHits as number) <= MOST_HITS
  return known && counted ? { provider: provider, cacheHits: cacheHits as number } : null
}

// A recording and, unless something waits for an answer, what would go with typed words.
export const readVoiceTurn = (
  body: unknown,
  { maxAudioSeconds, audioModels }: { maxAudioSeconds: number; audioModels: string[] },
): { turn: VoiceTurn } | { problem: string } => {
  if (!isObject(body)) return { problem: 'body' }
  if (!hasOnly(body, ['audio', 'pending', 'language', 'model', 'request', 'provider', 'cacheHits'])) {
    return { problem: 'unknown field' }
  }
  const use = readUse(body)
  if (!use) return { problem: 'provider' }
  const audio = readRecording(body.audio, maxAudioSeconds)
  if (!audio) return { problem: 'audio' }
  const { pending, model } = body
  if (typeof pending !== 'boolean') return { problem: 'pending' }
  const language = text(35)(body.language)
  if (language === null) return { problem: 'language' }
  if (typeof model !== 'string' || !audioModels.includes(model)) return { problem: 'model' }
  if (pending) {
    return body.request === undefined
      ? { turn: { audio, pending, language, model, request: null, ...use } }
      : { problem: 'request' }
  }
  if (!isObject(body.request) || Object.hasOwn(body.request, 'transcript')) return { problem: 'request' }
  // The words are in the recording.
  const read = readRequest({ ...body.request, transcript: '(spoken)' })
  return 'problem' in read ? read : { turn: { audio, pending, language, model, request: read.request, ...use } }
}

// The request, or the name of the first thing wrong with it.
export const readRequest = (body: unknown): { request: AssistantRequest } | { problem: string } => {
  if (!isObject(body)) return { problem: 'body' }
  const unknown = Object.keys(body).find((key) => !Object.hasOwn(fields, key))
  if (unknown !== undefined) return { problem: 'unknown field' }
  const request: Record<string, unknown> = {}
  for (const [key, check] of Object.entries(fields)) {
    if (OPTIONAL.includes(key) && body[key] === undefined) continue
    const value = check(body[key])
    if (value === null) return { problem: key }
    request[key] = value
  }
  return { request: request as unknown as AssistantRequest }
}
