import { createApp } from './app.ts'
import { readConfig } from './config.ts'

const config = readConfig(process.env)
const server = createApp(config).listen(config.port, config.host, () => {
  console.log(`Brailled AI server on http://${config.host}:${config.port}`)
  if (!config.apiKey || !config.model) {
    console.log('OPENROUTER_API_KEY and OPENROUTER_MODEL are not both set, so requests will be refused.')
  }
})
server.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
