// The cases, the projects they are about, and running them.
import { readFileSync } from 'node:fs'
import { runAgent } from '../src/agent.ts'
import type { Config } from '../src/config.ts'
import { loadKnowledge } from '../src/knowledge.ts'
import { readRequest, type AssistantRequest } from '../src/request.ts'
import { score, type Expectation } from './score.ts'

export interface Case {
  id: string
  project: string
  mode: 'build' | 'guide'
  request: string
  expect: Expectation
  previous?: AssistantRequest['previous']
  history?: AssistantRequest['history']
}

export interface Result {
  id: string
  problems: string[]
  reply?: Record<string, unknown>
  rounds: number
  tools: string[]
}

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T

export const loadCases = () => read<Case[]>('cases.json')

// What the editor sends about each project, captured from the editor (see `e2e/capture-eval-projects.cjs`).
export const requestFor = (entry: Case): AssistantRequest => {
  const projects = read<Record<string, object>>('projects.json')
  const read_ = readRequest({
    ...projects[entry.project],
    transcript: entry.request,
    mode: entry.mode,
    history: entry.history ?? [],
    ...(entry.previous ? { previous: entry.previous } : {}),
  })
  if ('problem' in read_) throw new Error(`case ${entry.id}: the request is wrong at ${read_.problem}`)
  return read_.request
}

export const runCases = async (cases: Case[], config: Config, fetcher: typeof fetch, log: (line: string) => void) => {
  const commandSchema = readFileSync(
    new URL('../../brailled-accessibility/src/commands/schema.json', import.meta.url),
    'utf8',
  )
  const knowledge = loadKnowledge()
  const results: Result[] = []
  // One at a time, so as not to meet a provider's rate limit.
  for (const entry of cases) {
    const started = Date.now()
    const answer = await runAgent(requestFor(entry), {
      config,
      knowledge,
      commandSchema,
      fetcher,
      now: Date.now,
    })
    const problems =
      'reply' in answer ? score(answer.reply, entry.expect) : [`no reply: ${answer.failure} (${answer.detail})`]
    results.push({
      id: entry.id,
      problems,
      reply: 'reply' in answer ? answer.reply : undefined,
      rounds: answer.rounds,
      tools: answer.tools,
    })
    log(
      `${problems.length ? 'FAIL' : 'PASS'} ${entry.id} (${answer.rounds} rounds, ${Date.now() - started} ms)` +
        (problems.length ? `: ${problems.join('; ')}` : ''),
    )
  }
  return results
}
