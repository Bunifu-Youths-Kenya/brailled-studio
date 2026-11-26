// Whether a reply is what a case expects. What the words say is checked only roughly.
export interface Expectation {
  type: string[]
  ops?: string[]
  forbidOps?: string[]
  // Every one of these blocks must be inserted or used to wrap.
  blocks?: string[]
  // At least one of these.
  anyBlocks?: string[]
  // At least one of these too, for requests with two parts.
  moreBlocks?: string[]
  actions?: string[]
  forbidActions?: string[]
  sprite?: string
  spritesFrom?: string
  // At least one of these appears in what is said.
  says?: string[]
}

interface Step {
  command?: { op?: string; block?: string; in?: string; args?: unknown }
  action?: string
  sprite?: { name?: string }
}

// Blocks plugged into values count too, such as a comparison inside a condition.
const nested = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') return []
  const own = typeof (value as { block?: unknown }).block === 'string' ? [(value as { block: string }).block] : []
  return [...own, ...Object.values(value).flatMap(nested)]
}

// What is wrong with a reply, or an empty list.
export const score = (reply: Record<string, unknown>, expect: Expectation): string[] => {
  const problems: string[] = []
  const type = String(reply.type)
  if (!expect.type.includes(type)) problems.push(`is a ${type}, not a ${expect.type.join(' or ')}`)
  const steps = (Array.isArray(reply.steps) ? reply.steps : []) as Step[]
  const ops = steps.flatMap((step) => step.command?.op ?? [])
  const blocks = steps.flatMap(({ command }) =>
    command ? [...(command.op === 'insert' ? [command.block ?? ''] : []), command.in ?? '', ...nested(command.args)] : [],
  )
  const actions = steps.flatMap((step) => step.action ?? [])
  const missing = (what: string, wanted: string[] | undefined, had: string[]) =>
    wanted?.filter((item) => !had.includes(item)).forEach((item) => problems.push(`has no ${what} ${item}`))
  missing('operation', expect.ops, ops)
  missing('block', expect.blocks, blocks)
  missing('action', expect.actions, actions)
  for (const any of [expect.anyBlocks, expect.moreBlocks]) {
    if (any && !any.some((block) => blocks.includes(block))) problems.push(`has none of ${any.join(', ')}`)
  }
  expect.forbidOps?.filter((op) => ops.includes(op)).forEach((op) => problems.push(`must not ${op}`))
  expect.forbidActions?.filter((a) => actions.includes(a)).forEach((a) => problems.push(`must not use ${a}`))
  if (expect.sprite && !steps.some((step) => step.sprite?.name?.toLowerCase() === expect.sprite?.toLowerCase())) {
    problems.push(`does not add ${expect.sprite}`)
  }
  if (expect.spritesFrom && reply.spritesFrom !== expect.spritesFrom) {
    problems.push(`does not list ${expect.spritesFrom}`)
  }
  const said = [reply.text, reply.question]
    .filter((words) => typeof words === 'string')
    .join(' ')
    .toLowerCase()
  if (expect.says && !expect.says.some((words) => said.includes(words.toLowerCase()))) {
    problems.push(`says none of: ${expect.says.join(', ')}`)
  }
  return problems
}
