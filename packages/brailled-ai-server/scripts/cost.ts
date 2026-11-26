// Usage: npm run cost. Prints what the record says was used and cost.
import { readConfig } from '../src/config.ts'
import { readEntries, summarise } from '../src/cost.ts'

const { costLog } = readConfig(process.env)
for (const line of summarise(costLog ? readEntries(costLog) : [])) console.log(line)
