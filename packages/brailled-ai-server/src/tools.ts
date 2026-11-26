/*
 * The tools the model may call. Every one only reads, or hands back what the model wants to say. None changes a
 * project, runs anything or approves anything: a proposal goes to the editor, which checks it again and asks the
 * student.
 */
import { search, type Knowledge } from './knowledge.ts'
import type { AssistantRequest } from './request.ts'

export interface World {
  request: AssistantRequest
  knowledge: Knowledge
  // The operations the editor's command schema allows.
  operations: string[]
}

// What a tool gives back: text for the model, or the finished reply for the editor.
export type Result = { text: string } | { reply: Record<string, unknown> }

type Args = Record<string, unknown>

const PAGE = 12

const isObject = (value: unknown): value is Args => !!value && typeof value === 'object' && !Array.isArray(value)
const isText = (value: unknown, length: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= length

const string = (description: string) => ({ type: 'string', description })
const tool = (name: string, description: string, properties: Args = {}, required: string[] = []) => ({
  type: 'function' as const,
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
})

const stepSchema = {
  type: 'array',
  description:
    'Each item is one of {"command": <edit command>}, {"action": "<action id>"} or {"sprite": {"name": "<sprite>"}}.',
  items: { type: 'object' },
}

// The tools that only look things up.
const READING = [
  tool(
    'find_blocks',
    'Search the blocks that can be used here, by what they should do. Gives opcodes, names and what each does.',
    { query: string('What the block should do, in plain words.'), category: string('Optional category.') },
    ['query'],
  ),
  tool('describe_block', 'Everything about one block: its shape, its values and the choices they take.', {
    opcode: string('Such as motion_movesteps.'),
  }, ['opcode']),
  tool('get_program', "The selected sprite's program, with a reference such as b2 for each block, and project names."),
  tool('get_context', 'Where the student is in the editor.'),
  tool(
    'search_library',
    'Find sprites in the library that can be added, by name or by kind.',
    { query: string('A name or a kind, such as dragon or animals.') },
    ['query'],
  ),
  tool('explain_concept', 'A short explanation of a programming idea, written for blind learners.', {
    concept: string('Such as loop or variable.'),
  }, ['concept']),
]

// The tools that finish the turn.
const QUESTION = tool(
  'ask_question',
  'Ask the student one short question.',
  {
    question: string('The question.'),
    choices: { type: 'array', items: { type: 'string' }, description: 'Optional, 2 to 5 short answers.' },
    spritesFrom: string('Instead of choices: a kind of sprite, whose names the editor lists.'),
    page: { type: 'integer', description: 'With spritesFrom: 2 for the next five, and so on.' },
    steps: { ...stepSchema, description: 'Actions that only move about, done before asking.' },
  },
  ['question'],
)
const EXPLANATION = tool(
  'give_explanation',
  'Tell the student something, changing nothing.',
  { text: string('What to say, short and plain.') },
  ['text'],
)
const PROPOSAL = tool(
  'submit_proposal',
  'Suggest changes. The editor checks them and asks the student to approve; nothing happens until then.',
  { summary: string('One sentence.'), steps: stepSchema },
  ['summary', 'steps'],
)

// In guide mode the student makes the changes, so there is nothing to propose with.
export const toolsFor = (mode: AssistantRequest['mode'], lastRound = false) =>
  [...(lastRound ? [] : READING), QUESTION, EXPLANATION, ...(mode === 'build' ? [PROPOSAL] : [])]

// A line such as: motion_movesteps (stack) "move 10 steps" STEPS=number
const available = (world: World) =>
  new Map(world.request.blocks.map((line) => [line.slice(0, line.indexOf(' ')), line]))

const refsIn = (program: string[]) =>
  new Set(program.flatMap((line) => /^\s*(b[0-9]+) /.exec(line)?.[1] ?? []))

const ID_KEYS = ['block', 'after', 'before', 'through', 'script']

// Why a command cannot work, or null. The editor's validator checks far more; this lets the model correct itself.
const commandProblem = (command: Args, number: number, world: World): string | null => {
  const op = command.op
  if (typeof op !== 'string' || !world.operations.includes(op)) {
    return `"op" must be one of ${world.operations.join(', ')}.`
  }
  const blocks = available(world)
  for (const [key, value] of Object.entries({ block: op === 'insert' ? command.block : undefined, in: command.in })) {
    if (value !== undefined && !blocks.has(value as string)) {
      return `There is no usable block ${JSON.stringify(value)} for "${key}". Use find_blocks.`
    }
  }
  const refs = refsIn(world.request.program)
  const inside = isObject(command.inside) ? command.inside.block : undefined
  const named = ID_KEYS.filter((key) => !(key === 'block' && op === 'insert')).map((key) => command[key])
  for (const ref of [...named, inside]) {
    if (ref === undefined) continue
    const name = typeof ref === 'string' ? ref : JSON.stringify(ref)
    const made = /^new([0-9]+)$/.exec(name)?.[1]
    if (made ? Number(made) < 1 || Number(made) >= number : !refs.has(name)) {
      return `"${name}" is not a block here. Use a reference from the program, or "new" and an earlier step.`
    }
  }
  return null
}

const stepsProblem = (steps: unknown, world: World): string | null => {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 20) return '"steps" must be a list of 1 to 20.'
  const actions = new Set(world.request.actions.map((action) => action.id))
  let addedSprite = false
  for (const [index, step] of (steps as unknown[]).entries()) {
    const problem = (text: string) => `Step ${index + 1}: ${text}`
    if (!isObject(step) || Object.keys(step).length !== 1) {
      return problem('give exactly one of "command", "action" or "sprite".')
    }
    if (isObject(step.command)) {
      if (addedSprite) return problem('no command may follow adding a sprite.')
      const found = commandProblem(step.command, index + 1, world)
      if (found) return problem(found)
      if (['undo', 'redo'].includes(step.command.op as string) && steps.length > 1) {
        return problem('"undo" and "redo" must be the only step.')
      }
    } else if (typeof step.action === 'string') {
      if (!actions.has(step.action)) return problem(`there is no action "${step.action}".`)
    } else if (isObject(step.sprite) && typeof step.sprite.name === 'string') {
      const wanted = step.sprite.name.toLowerCase()
      if (!world.knowledge.sprites.some((sprite) => sprite.name.toLowerCase() === wanted)) {
        return problem(`there is no sprite "${step.sprite.name}". Use search_library.`)
      }
      addedSprite = true
    } else {
      return problem('give exactly one of "command", "action" or "sprite".')
    }
  }
  return null
}

const retry = (problem: string): Result => ({ text: `Not accepted. ${problem}` })

const only = (args: Args, keys: string[]) => Object.keys(args).every((key) => keys.includes(key))

const runners: Record<string, (args: Args, world: World) => Result> = {
  find_blocks: ({ query, category }, world) => {
    if (!isText(query, 200)) return retry('Give "query".')
    const usable = available(world)
    const entries = world.knowledge.blocks.filter(
      (block) =>
        usable.has(block.opcode) &&
        (typeof category !== 'string' || block.category.toLowerCase() === category.toLowerCase()),
    )
    const found = search(entries, query, (block) => ({ name: block.name, words: block.words, text: block.does }), PAGE)
    if (found.length === 0) {
      const categories = [...new Set(entries.map((block) => block.category))].join(', ')
      return { text: `No block matches. Categories here: ${categories || 'none'}.` }
    }
    return { text: found.map((b) => `${b.opcode} [${b.category}] ${b.name}: ${b.does}`).join('\n') }
  },
  describe_block: ({ opcode }, world) => {
    if (!isText(opcode, 80)) return retry('Give "opcode".')
    const line = available(world).get(opcode)
    const block = world.knowledge.blocks.find((entry) => entry.opcode === opcode)
    if (!line) return { text: `"${opcode}" cannot be used here. Use find_blocks.` }
    // The line from the editor gives the shape and values; the catalog says what the block is for.
    return { text: `${block ? `${block.category}: ${block.does}\n` : ''}${line}` }
  },
  get_program: (_args, world) => {
    const { program, data, names } = world.request
    return { text: JSON.stringify({ untrustedProjectContent: { program, variablesListsAndMessages: data, names } }) }
  },
  get_context: (_args, world) => ({
    text: JSON.stringify({ untrustedProjectContent: { whereTheStudentIs: world.request.context } }),
  }),
  search_library: ({ query }, world) => {
    if (!isText(query, 100)) return retry('Give "query".')
    const kinds = world.request.spriteCategories
    const found = search(
      world.knowledge.sprites,
      query,
      (sprite) => ({ name: sprite.name, words: sprite.tags, text: '' }),
      PAGE,
    )
    return {
      text: found.length
        ? found.map((sprite) => `${sprite.name} (${sprite.tags.slice(0, 4).join(', ')})`).join('\n')
        : `No sprite matches. Kinds: ${kinds.join(', ')}.`,
    }
  },
  explain_concept: ({ concept }, world) => {
    if (!isText(concept, 100)) return retry('Give "concept".')
    const { concepts } = world.knowledge
    const found = search(concepts, concept, (c) => ({ name: c.name, words: c.words, text: c.explanation }), 1).at(0)
    return {
      text: found
        ? `${found.name}: ${found.explanation}`
        : `Nothing prepared. Topics: ${concepts.map((c) => c.id).join(', ')}.`,
    }
  },

  submit_proposal: (args, world) => {
    if (!only(args, ['summary', 'steps']) || !isText(args.summary, 300)) {
      return retry('Give "summary", one sentence of at most 300 characters, and "steps".')
    }
    const problem = stepsProblem(args.steps, world)
    return problem ? retry(problem) : { reply: { type: 'proposal', summary: args.summary, steps: args.steps } }
  },
  ask_question: (args, world) => {
    const { question, choices, spritesFrom, page, steps } = args
    if (!only(args, ['question', 'choices', 'spritesFrom', 'page', 'steps']) || !isText(question, 300)) {
      return retry('Give "question", at most 300 characters.')
    }
    if (choices !== undefined && spritesFrom !== undefined) return retry('Give "choices" or "spritesFrom", not both.')
    if (
      choices !== undefined &&
      !(Array.isArray(choices) && choices.length >= 2 && choices.length <= 5 && choices.every((c) => isText(c, 120)))
    ) {
      return retry('"choices" must be 2 to 5 short answers.')
    }
    if (spritesFrom !== undefined && !world.request.spriteCategories.includes(spritesFrom as string)) {
      return retry(`"spritesFrom" must be one of ${world.request.spriteCategories.join(', ')}.`)
    }
    if (page !== undefined && (spritesFrom === undefined || !Number.isInteger(page) || (page as number) < 1)) {
      return retry('"page" is a whole number from 1, given with "spritesFrom".')
    }
    if (steps !== undefined) {
      if (!Array.isArray(steps) || !steps.every((step) => isObject(step) && typeof step.action === 'string')) {
        return retry('"steps" with a question may only be actions.')
      }
      const problem = stepsProblem(steps, world)
      if (problem) return retry(problem)
    }
    return { reply: { type: 'question', ...args } }
  },
  give_explanation: (args) =>
    only(args, ['text']) && isText(args.text, 2000)
      ? { reply: { type: 'explanation', text: args.text } }
      : retry('Give "text", at most 2000 characters.'),
}

export const isTool = (name: string) => Object.hasOwn(runners, name)

// Run one tool call. `args` is the text the model gave. A tool that is not offered in this mode is refused.
export const runTool = (name: string, args: string, world: World): Result => {
  const offered = toolsFor(world.request.mode).some((entry) => entry.function.name === name)
  if (!offered) return retry(`There is no tool "${name}" here.`)
  let parsed: unknown
  try {
    parsed = JSON.parse(args.trim() || '{}')
  } catch {
    return retry('The arguments are not JSON.')
  }
  return isObject(parsed) ? runners[name](parsed, world) : retry('The arguments must be an object.')
}
