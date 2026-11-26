// The evaluation cases and their scoring, with a stand-in for the model.
import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { loadCases, requestFor, runCases } from '../eval/cases.ts'
import { score } from '../eval/score.ts'
import { readConfig } from '../src/config.ts'
import { loadKnowledge } from '../src/knowledge.ts'
import { calls } from './model.ts'

const cases = loadCases()
const { blocks, sprites } = loadKnowledge()

describe('the cases', () => {
  it('have ids of their own and cover both modes', () => {
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length)
    expect(cases.length).toBeGreaterThanOrEqual(20)
    expect(cases.filter((entry) => entry.mode === 'guide').length).toBeGreaterThanOrEqual(3)
    expect(cases.some((entry) => entry.project === 'injection')).toBe(true)
  })

  it.each(cases.map((entry) => [entry.id, entry] as const))('%s is a request the server accepts', (_, entry) => {
    expect(requestFor(entry)).toMatchObject({ transcript: entry.request, mode: entry.mode })
  })

  it('expect only blocks, sprites and forms that exist', () => {
    const known = new Set(blocks.map((block) => block.opcode))
    for (const { id, mode, expect: wanted } of cases) {
      for (const block of [...(wanted.blocks ?? []), ...(wanted.anyBlocks ?? []), ...(wanted.moreBlocks ?? [])]) {
        expect([id, block, known.has(block)]).toEqual([id, block, true])
      }
      if (wanted.sprite) expect(sprites.map((sprite) => sprite.name)).toContain(wanted.sprite)
      for (const type of wanted.type) expect(['proposal', 'question', 'explanation']).toContain(type)
      if (mode === 'guide') expect(wanted.type).not.toContain('proposal')
    }
  })
})

describe('scoring', () => {
  const reply = {
    type: 'proposal',
    steps: [
      { command: { op: 'insert', block: 'control_if', args: { CONDITION: { block: 'sensing_mousedown' } } } },
      { command: { op: 'wrap', block: 'b2', in: 'control_forever' } },
      { action: 'project.run' },
      { sprite: { name: 'Dragon' } },
    ],
  }

  it('finds inserted, wrapping and nested blocks, actions and sprites', () => {
    expect(
      score(reply, {
        type: ['proposal'],
        ops: ['insert', 'wrap'],
        blocks: ['control_if', 'sensing_mousedown', 'control_forever'],
        actions: ['project.run'],
        sprite: 'dragon',
      }),
    ).toEqual([])
  })

  it('says everything that is wrong', () => {
    expect(
      score(reply, {
        type: ['question'],
        ops: ['delete'],
        forbidOps: ['wrap'],
        blocks: ['control_wait'],
        anyBlocks: ['looks_say'],
        forbidActions: ['project.run'],
        sprite: 'Cat',
        spritesFrom: 'animals',
        says: ['hello'],
      }),
    ).toHaveLength(9)
  })
})

describe('running the cases', () => {
  const config = readConfig({ OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'stand-in' })

  it('passes a case when the reply is what it expects, and not otherwise', async () => {
    const good = cases.filter((entry) => entry.id === 'wait-after-move')
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        calls([
          'submit_proposal',
          { summary: 'Wait.', steps: [{ command: { op: 'insert', block: 'control_wait', after: 'b2' } }] },
        ]),
      ),
    )
    const lines: string[] = []
    expect((await runCases(good, config, fetcher, (line) => lines.push(line)))[0].problems).toEqual([])
    expect(lines[0]).toMatch(/^PASS wait-after-move/)

    const wrong = vi.fn<typeof fetch>(() => Promise.resolve(calls(['give_explanation', { text: 'No.' }])))
    expect((await runCases(good, config, wrong, () => {}))[0].problems[0]).toMatch(/not a proposal/)
  })

  it('calls no model unless told to with --real', () => {
    const output = execFileSync(process.execPath, ['eval/run.ts'], {
      cwd: new URL('..', import.meta.url),
      env: { OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'would/call' },
      encoding: 'utf8',
    })
    expect(output).toMatch(new RegExp(`^${cases.length} cases would be sent to would/call`))
  })
})
