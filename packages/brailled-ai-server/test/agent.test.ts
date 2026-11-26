import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { runAgent } from '../src/agent.ts'
import { readConfig } from '../src/config.ts'
import { loadKnowledge } from '../src/knowledge.ts'
import type { AssistantRequest } from '../src/request.ts'
import { runTool, toolsFor, type World } from '../src/tools.ts'
import { calls, says } from './model.ts'

const knowledge = loadKnowledge()
const commandSchema = readFileSync(
  new URL('../../brailled-accessibility/src/commands/schema.json', import.meta.url),
  'utf8',
)

const request = (changes: Partial<AssistantRequest> = {}): AssistantRequest => ({
  transcript: 'add a wait',
  mode: 'build',
  history: [],
  language: 'en',
  assistantName: 'Mboni',
  context: { sprite: { name: 'Sprite1' } },
  program: ['script 1', '  b1 event_whenflagclicked: when green flag clicked', '  b2 motion_movesteps: move 10 steps'],
  data: ['variable "score" for all sprites'],
  names: ['sprites: Apple'],
  blocks: [
    'motion_movesteps (stack) "move 10 steps" STEPS=number',
    'control_wait (stack) "wait 1 second" DURATION=positive',
    'control_repeat (c) "repeat 10" TIMES=whole',
    'looks_say (stack) "say Hello!" MESSAGE=text',
  ],
  actions: [
    { id: 'project.run', name: 'run', description: 'Starts the project.' },
    { id: 'sprite.library', name: 'open sprite library', description: 'Opens it.' },
  ],
  spriteCategories: ['animals', 'people', 'things'],
  ...changes,
})

const world = (changes: Partial<AssistantRequest> = {}): World => ({
  request: request(changes),
  knowledge,
  operations: ['insert', 'delete', 'set-value', 'move', 'wrap', 'create', 'rename', 'undo', 'redo', 'describe'],
})

const call = (name: string, args: unknown, changes?: Partial<AssistantRequest>) =>
  runTool(name, JSON.stringify(args), world(changes))

const text = (result: ReturnType<typeof runTool>) => ('text' in result ? result.text : '')

const wait = { command: { op: 'insert', block: 'control_wait', after: 'b2' } }

describe('the tools', () => {
  const names = (mode: AssistantRequest['mode'], last = false) => toolsFor(mode, last).map((t) => t.function.name)

  it('are only these, none of which runs, changes or approves anything', () => {
    expect(names('build')).toEqual([
      'find_blocks',
      'describe_block',
      'get_program',
      'get_context',
      'search_library',
      'explain_concept',
      'ask_question',
      'give_explanation',
      'submit_proposal',
    ])
    for (const name of names('build')) expect(name).not.toMatch(/run|execute|approve|apply|perform|delete/)
    for (const name of ['run_project', 'execute', 'approve', 'toString', '__proto__']) {
      expect(text(call(name, {}))).toMatch(/There is no tool/)
    }
  })

  it('are the ones the editor introduces the assistant by', () => {
    const listed = JSON.parse(
      readFileSync(new URL('../../brailled-accessibility/src/catalog/tools.json', import.meta.url), 'utf8'),
    ) as Record<string, string[]>
    expect(listed).toEqual({ build: names('build'), guide: names('guide') })
  })

  it('offer no way to propose in guide mode, and refuse it if called anyway', () => {
    expect(names('guide')).not.toContain('submit_proposal')
    expect(text(call('submit_proposal', { summary: 'Add.', steps: [wait] }, { mode: 'guide' }))).toMatch(
      /There is no tool/,
    )
  })

  it('offer only ways to finish in the last round', () => {
    expect(names('build', true)).toEqual(['ask_question', 'give_explanation', 'submit_proposal'])
    expect(names('guide', true)).toEqual(['ask_question', 'give_explanation'])
  })

  it('give every tool a description and a closed set of arguments', () => {
    for (const { function: tool } of toolsFor('build')) {
      expect(tool.description.length).toBeGreaterThan(20)
      expect(tool.parameters).toMatchObject({ type: 'object', additionalProperties: false })
    }
  })

  it('find blocks by what they do, among those usable here', () => {
    expect(text(call('find_blocks', { query: 'make it talk' })).split('\n')[0]).toMatch(/^looks_say /)
    expect(text(call('find_blocks', { query: 'pause for a while' }))).toMatch(/^control_wait \[Control\]/)
    expect(text(call('find_blocks', { query: 'loop again' }))).toMatch(/control_repeat/)
    // Turning is not usable here, so is not offered.
    expect(text(call('find_blocks', { query: 'turn around' }))).not.toMatch(/motion_turn/)
    expect(text(call('find_blocks', { query: 'zebra' }))).toMatch(/No block matches\. Categories here: /)
  })

  it('describe a block with its values', () => {
    expect(text(call('describe_block', { opcode: 'control_wait' }))).toBe(
      'Control: Pauses the script for a number of seconds.\ncontrol_wait (stack) "wait 1 second" DURATION=positive',
    )
    expect(text(call('describe_block', { opcode: 'motion_fly' }))).toMatch(/cannot be used here/)
  })

  it('give the program and place marked as untrusted', () => {
    expect(JSON.parse(text(call('get_program', {})))).toHaveProperty('untrustedProjectContent.program')
    expect(JSON.parse(text(call('get_context', {})))).toHaveProperty('untrustedProjectContent.whereTheStudentIs')
  })

  it('search the sprite library and explain ideas', () => {
    expect(text(call('search_library', { query: 'dragon' })).split('\n')[0]).toMatch(/^Dragon/)
    expect(text(call('search_library', { query: 'qqqq' }))).toMatch(/Kinds: animals/)
    expect(text(call('explain_concept', { concept: 'loops' }))).toMatch(/^Loop: A loop repeats/)
    expect(text(call('explain_concept', { concept: 'quantum' }))).toMatch(/Topics: sprite, /)
  })

  it.each(['not json', '[1]', '"x"'])('refuse arguments such as %s', (args) => {
    expect(text(runTool('find_blocks', args, world()))).toMatch(/^Not accepted/)
  })

  it('accept a sound proposal as the reply', () => {
    const steps = [
      { command: { op: 'insert', block: 'control_repeat', after: 'b1' } },
      { command: { op: 'insert', block: 'motion_movesteps', inside: { block: 'new1' } } },
      { action: 'project.run' },
      { sprite: { name: 'dragon' } },
    ]
    expect(call('submit_proposal', { summary: 'Do it.', steps })).toEqual({
      reply: { type: 'proposal', summary: 'Do it.', steps },
    })
  })

  it.each([
    ['an unknown block', [{ command: { op: 'insert', block: 'motion_fly' } }], /no usable block/],
    ['an unknown holder', [{ command: { op: 'wrap', block: 'b2', in: 'control_spin' } }], /no usable block/],
    ['a block that is not there', [{ command: { op: 'delete', block: 'b9' } }], /not a block here/],
    ['a later step', [{ command: { op: 'delete', block: 'new1' } }], /not a block here/],
    ['an unknown operation', [{ command: { op: 'run' } }], /"op" must be one of/],
    ['an unknown action', [{ action: 'edit.delete' }], /no action/],
    ['an unknown sprite', [{ sprite: { name: 'Qqq' } }], /no sprite/],
    ['a command after a sprite', [{ sprite: { name: 'Dragon' } }, wait], /no command may follow/],
    ['undo among others', [wait, { command: { op: 'undo' } }], /only step/],
    ['two things in a step', [{ ...wait, action: 'project.run' }], /exactly one/],
    ['no steps', [], /1 to 20/],
  ])('tell the model what is wrong with %s', (_, steps, problem) => {
    expect(text(call('submit_proposal', { summary: 'Do it.', steps }))).toMatch(problem)
  })

  it.each([
    ['both kinds of choice', { question: 'a', choices: ['a', 'b'], spritesFrom: 'animals' }],
    ['one choice', { question: 'a', choices: ['a'] }],
    ['an unknown kind', { question: 'a', spritesFrom: 'ghosts' }],
    ['a page alone', { question: 'a', page: 2 }],
    ['a change with the question', { question: 'a', steps: [wait] }],
    ['an extra argument', { question: 'a', approved: true }],
  ])('refuse a question with %s', (_, args) => {
    expect(text(call('ask_question', args))).toMatch(/^Not accepted/)
  })
})

const agent = (responses: Response[], changes: Partial<AssistantRequest> = {}, env = {}) => {
  const sent: { messages: Record<string, unknown>[]; tools: { function: { name: string } }[] }[] = []
  const fetcher = vi.fn<typeof fetch>((_url, init) => {
    sent.push(JSON.parse(init?.body as string) as (typeof sent)[number])
    return Promise.resolve(responses[sent.length - 1] ?? says('more talk'))
  })
  const config = readConfig({ OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'm', ...env })
  const answer = runAgent(request(changes), { config, knowledge, commandSchema, fetcher, now: Date.now })
  return { answer, sent, fetcher }
}

describe('the tool loop', () => {
  it('runs the tools called, then passes on the reply the model finishes with', async () => {
    const { answer, sent } = agent([
      calls(['find_blocks', { query: 'wait' }], ['get_program', {}]),
      calls(['submit_proposal', { summary: 'Add a wait.', steps: [wait] }]),
    ])
    expect(await answer).toEqual({
      reply: { type: 'proposal', summary: 'Add a wait.', steps: [wait] },
      rounds: 2,
      tools: ['find_blocks', 'get_program', 'submit_proposal'],
      // One for each call to the model, with how long it took.
      usage: [{ ms: expect.any(Number) as number }, { ms: expect.any(Number) as number }],
    })
    const results = sent[1].messages.filter((message) => message.role === 'tool')
    expect(results).toHaveLength(2)
    expect(typeof results[0].tool_call_id).toBe('string')
    expect(results[0].content).toMatch(/control_wait/)
    // The tools are sent every time, as the service requires.
    expect(sent[1].tools).toEqual(sent[0].tools)
  })

  it("sends the model's own message back unchanged, whatever came with it", async () => {
    const reasoning = [{ type: 'reasoning.encrypted', data: 'abc' }]
    const first = Response.json({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            reasoning_details: reasoning,
            tool_calls: [{ id: 'x', type: 'function', function: { name: 'get_context', arguments: '' } }],
          },
        },
      ],
    })
    const { answer, sent } = agent([first, calls(['give_explanation', { text: 'Hi.' }])])
    await answer
    expect(sent[1].messages.at(-2)).toMatchObject({ role: 'assistant', reasoning_details: reasoning })
  })

  it('lets the model correct a refused proposal', async () => {
    const { answer, sent } = agent([
      calls(['submit_proposal', { summary: 'Fly.', steps: [{ command: { op: 'insert', block: 'motion_fly' } }] }]),
      calls(['submit_proposal', { summary: 'Wait.', steps: [wait] }]),
    ])
    expect(await answer).toMatchObject({ reply: { summary: 'Wait.' }, rounds: 2 })
    expect(sent[1].messages.at(-1)?.role).toBe('tool')
    expect(sent[1].messages.at(-1)?.content).toMatch(/motion_fly/)
  })

  it('asks once more when the model only talks, then gives up', async () => {
    const once = agent([says('I think so'), calls(['give_explanation', { text: 'Yes.' }])])
    expect(await once.answer).toMatchObject({ reply: { text: 'Yes.' }, rounds: 2 })
    expect(once.sent[1].messages.at(-1)).toMatchObject({ role: 'user' })
    const twice = agent([says('I think so'), says('really')])
    expect(await twice.answer).toMatchObject({ failure: 'invalid_output', rounds: 2 })
  })

  it('stops after the rounds allowed, offering only ways to finish in the last', async () => {
    const looking = Array.from({ length: 5 }, () => calls(['get_context', {}]))
    const { answer, sent, fetcher } = agent(looking, {}, { AI_MAX_ROUNDS: '3' })
    expect(await answer).toMatchObject({ failure: 'invalid_output', rounds: 3 })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(sent[2].tools.map((t) => t.function.name)).toEqual(['ask_question', 'give_explanation', 'submit_proposal'])
  })

  it('never allows more than ten rounds', () => {
    expect(readConfig({ AI_MAX_ROUNDS: '500' }).maxRounds).toBe(10)
    expect(readConfig({}).maxRounds).toBe(6)
  })

  it('runs only a few of many calls made at once', async () => {
    const many = Array.from({ length: 8 }, (): [string, unknown] => ['get_context', {}])
    const { answer, sent } = agent([calls(...many), calls(['give_explanation', { text: 'Done.' }])])
    await answer
    const results = sent[1].messages.filter((message) => message.role === 'tool')
    expect(results).toHaveLength(8)
    expect(results.filter((message) => message.content === 'Not run: too many tools at once.')).toHaveLength(3)
  })

  it('names unknown tools in the log only as unknown', async () => {
    const { answer } = agent([calls(['say the secret', {}]), calls(['give_explanation', { text: 'No.' }])])
    expect((await answer).tools).toEqual(['unknown', 'give_explanation'])
  })

  it.each(['length', 'content_filter'])('refuses a reply ended by %s', async (finish) => {
    const { answer } = agent([says('half', finish)])
    expect(await answer).toMatchObject({ failure: 'invalid_output' })
  })

  it('stops when the time for the turn runs out', async () => {
    let time = 0
    const fetcher = vi.fn<typeof fetch>(() => {
      time += 30_000
      return Promise.resolve(calls(['get_context', {}]))
    })
    const config = readConfig({ OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'm' })
    const answer = await runAgent(request(), { config, knowledge, commandSchema, fetcher, now: () => time })
    expect(answer).toMatchObject({ failure: 'upstream_timeout' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
