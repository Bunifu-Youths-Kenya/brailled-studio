/*
 * What the editor may send. Anything else, an unknown field included, is refused, so that pictures, page content
 * and the like cannot be passed on to the model.
 */
export interface AssistantRequest {
  transcript: string
  language: string
  context: Record<string, unknown>
  program: string[]
  data: string[]
  names: string[]
  blocks: string[]
  actions: { id: string; name: string; description: string }[]
  spriteCategories: string[]
  previous?: { question: string; choices: string[] }
  revises?: { summary: string; steps: string[] }
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

const OPTIONAL = ['previous', 'revises']

const fields: Record<keyof AssistantRequest, Check<unknown>> = {
  transcript: (value) => (typeof value === 'string' && value.trim() ? text(500)(value) : null),
  language: text(35),
  context,
  program: list(400, text(300)),
  data: list(200, text(300)),
  names: list(10, text(2000)),
  blocks: list(400, text(400)),
  actions: list(80, action),
  spriteCategories: list(30, text(40)),
  previous,
  revises,
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
