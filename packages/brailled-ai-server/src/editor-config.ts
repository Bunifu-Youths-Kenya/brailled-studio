// The daily caps the school sets in the editor's configuration file, which sits beside the server.
import { readFileSync } from 'node:fs'

const FILE = new URL('../../scratch-gui/static/brailled-config.json', import.meta.url)

export interface Caps {
  requests: number
  characters: number
}

export const USUAL_CAPS: Caps = { requests: 300, characters: 50_000 }

const whole = (value: unknown, usual: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : usual

export const capsFrom = (file: unknown): Caps => {
  const voice = (file as { voice?: Record<string, unknown> } | null)?.voice
  return {
    requests: whole(voice?.dailyRequestCap, USUAL_CAPS.requests),
    characters: whole(voice?.dailyCharacterCap, USUAL_CAPS.characters),
  }
}

// Without a readable file the usual caps apply.
export const readCaps = (file: URL = FILE): Caps => {
  try {
    return capsFrom(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return USUAL_CAPS
  }
}
