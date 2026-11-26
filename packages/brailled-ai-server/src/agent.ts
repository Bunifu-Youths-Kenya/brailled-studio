/*
 * The tool loop: ask the model, run the tools it calls, and ask again, until it finishes the turn with a
 * proposal, a question or an explanation, or runs out of rounds or time.
 */
import type { Config } from './config.ts'
import type { Knowledge } from './knowledge.ts'
import { complete, type Failure, type Message, type Usage } from './openrouter.ts'
import { buildMessages, buildSpokenMessages, buildTranscribeMessages } from './prompt.ts'
import type { AssistantRequest } from './request.ts'
import { isTool, runTool, toolsFor, type Heard, type Voice, type World } from './tools.ts'

type Outcome = { reply: Record<string, unknown> | null; heard?: Heard } | { failure: Failure; detail: string }

export type Answer = Outcome & {
  rounds: number
  tools: string[]
  // What each call to the model used, and how long it took.
  usage: (Usage & { ms: number })[]
}

// A request that is a recording: what to do with it, and the model that hears it.
export interface Spoken {
  voice: Voice
  audio: string
  model: string
}

// Calls beyond this in one round are refused, so that one reply cannot ask for endless work.
const CALLS_PER_ROUND = 5
const NUDGE = 'Finish by calling give_explanation, ask_question or submit_proposal if it is offered.'

export interface Dependencies {
  config: Config
  knowledge: Knowledge
  commandSchema: string
  fetcher: typeof fetch
  now: () => number
  spoken?: Spoken
}

export const runAgent = async (request: AssistantRequest, dependencies: Dependencies): Promise<Answer> => {
  const { config, knowledge, commandSchema, fetcher, now, spoken } = dependencies
  const operations = (JSON.parse(commandSchema) as { oneOf: { $ref: string }[] }).oneOf.map(
    (option) => option.$ref.split('/').at(-1) ?? '',
  )
  const world: World = { request, knowledge, operations, voice: spoken?.voice }
  const opening = (): Message[] => {
    if (!spoken) return buildMessages(request, commandSchema)
    return spoken.voice === 'transcribe'
      ? buildTranscribeMessages(request.language, spoken.audio)
      : buildSpokenMessages(request, commandSchema, spoken.audio)
  }
  const messages = opening()
  const deadline = now() + config.turnTimeoutMs
  const used: string[] = []
  const usage: Answer['usage'] = []
  let nudged = false

  for (let round = 1; round <= config.maxRounds; round++) {
    const done = (result: Outcome): Answer => ({ ...result, rounds: round, tools: used, usage })
    const left = deadline - now()
    if (left <= 0) return done({ failure: 'upstream_timeout', detail: 'out of time' })

    const asked = now()
    const answer = await complete(
      config,
      messages,
      toolsFor(request.mode, round === config.maxRounds, spoken?.voice),
      Math.min(left, config.upstreamTimeoutMs),
      fetcher,
      spoken?.model,
    )
    if ('failure' in answer) return done(answer)
    const { message } = answer
    usage.push({ ...answer.usage, ms: now() - asked })
    // Sent back exactly as received: some models need what came with their tool calls.
    messages.push(message)

    const calls = message.tool_calls ?? []
    if (calls.length === 0) {
      if (nudged) return done({ failure: 'invalid_output', detail: 'no tool call' })
      nudged = true
      messages.push({ role: 'user', content: spoken?.voice === 'transcribe' ? 'Call report_heard.' : NUDGE })
      continue
    }
    for (const [index, call] of calls.entries()) {
      const name = call.function?.name ?? ''
      used.push(isTool(name) ? name : 'unknown')
      const result =
        index < CALLS_PER_ROUND
          ? runTool(name, call.function?.arguments ?? '', world)
          : { text: 'Not run: too many tools at once.' }
      if ('reply' in result) return done(result)
      // A turn finishes with the first reply accepted; every other call gets its answer.
      messages.push({ role: 'tool', tool_call_id: call.id, content: result.text })
    }
  }
  return {
    failure: 'invalid_output',
    detail: 'no reply within the rounds allowed',
    rounds: config.maxRounds,
    tools: used,
    usage,
  }
}
