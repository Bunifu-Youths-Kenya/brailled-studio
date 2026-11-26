import { createApp } from './app.ts'
import { readConfig } from './config.ts'
import { createCostLog } from './cost.ts'
import { HOST, listen } from './listen.ts'

const config = readConfig(process.env)
const costs = createCostLog({ file: config.costLog })
const server = listen(createApp(config, { costs }), config.port, () => {
  console.log(`Brailled AI server on http://${HOST}:${config.port}, for this computer only`)
  if (!config.apiKey || !config.model) {
    console.log('OPENROUTER_API_KEY and OPENROUTER_MODEL are not both set, so requests will be refused.')
  }
})
server.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
