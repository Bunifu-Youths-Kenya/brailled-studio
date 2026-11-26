/*
 * Runs the cases against the real model in `.env`, which costs credit. It is not part of the tests.
 *
 *   npm run eval                      says what it would do
 *   npm run eval -- --real            runs every case
 *   npm run eval -- --real --only guide
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { readConfig } from '../src/config.ts'
import { runCases, loadCases } from './cases.ts'

const option = process.argv.indexOf('--only')
const only = option < 0 ? '' : process.argv.slice(option + 1).join('')
const cases = loadCases().filter((entry) => entry.id.includes(only))
const config = readConfig(process.env)

if (!process.argv.includes('--real')) {
  console.log(`${cases.length} cases would be sent to ${config.model || '(no model set)'}.`)
  console.log(`Each can take up to ${config.maxRounds} model calls, which cost credit. Add "-- --real" to run them.`)
} else if (!config.apiKey || !config.model) {
  console.error('OPENROUTER_API_KEY and OPENROUTER_MODEL must be set in .env.')
  process.exitCode = 1
} else {
  const results = await runCases(cases, config, fetch, (line) => console.log(line))
  const passed = results.filter((result) => result.problems.length === 0).length
  console.log(`\n${passed}/${results.length} passed with ${config.model}`)
  const folder = new URL('results/', import.meta.url)
  mkdirSync(folder, { recursive: true })
  const file = new URL(`${config.model.replace(/[^A-Za-z0-9.-]+/g, '_')}.json`, folder)
  writeFileSync(file, JSON.stringify({ model: config.model, passed, results }, null, 2))
  console.log(`Replies saved to ${file.pathname}`)
  if (passed < results.length) process.exitCode = 1
}

