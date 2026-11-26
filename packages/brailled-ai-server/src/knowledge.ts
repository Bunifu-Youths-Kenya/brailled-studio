// What the tools can look up: the block catalog and concepts, shared with the editor, and the sprite library.
import { readFileSync } from 'node:fs'

export interface Block {
  opcode: string
  category: string
  name: string
  does: string
  words: string[]
}

export interface Concept {
  id: string
  name: string
  explanation: string
  words: string[]
}

export interface Sprite {
  name: string
  tags: string[]
}

export interface Knowledge {
  blocks: Block[]
  concepts: Concept[]
  sprites: Sprite[]
}

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T

export const loadKnowledge = (): Knowledge => ({
  blocks: read<Block[]>('../../brailled-accessibility/src/catalog/blocks.json'),
  concepts: read<Concept[]>('../../brailled-accessibility/src/catalog/concepts.json'),
  // The library the editor offers.
  sprites: read<Sprite[]>('../../scratch-gui/src/lib/libraries/sprites.json').map(({ name, tags }) => ({ name, tags })),
})

// Words that say nothing about what is wanted.
const COMMON = new Set(
  'a an the to of in on my me i it is and or with how do make block blocks sprite that this for be can'.split(' '),
)

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !COMMON.has(word))
    // "walking", "walks" and "walk" are one word here.
    .map((word) => word.replace(/(ing|es|s)$/, '') || word)

// The entries that match some words, best first. A word in an entry's name counts most, then its other words, then
// its description.
export const search = <T>(
  entries: T[],
  query: string,
  fields: (entry: T) => { name: string; words: string[]; text: string },
  limit: number,
): T[] => {
  const wanted = wordsOf(query)
  return entries
    .map((entry) => {
      const { name, words, text } = fields(entry)
      const [inName, inWords, inText] = [wordsOf(name), words.flatMap(wordsOf), wordsOf(text)]
      const score = wanted.reduce(
        (total, word) =>
          total + (inName.includes(word) ? 5 : 0) + (inWords.includes(word) ? 3 : 0) + (inText.includes(word) ? 1 : 0),
        0,
      )
      return { entry, score }
    })
    .filter((found) => found.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((found) => found.entry)
}
