import type { Server } from 'node:http'
import type { Express } from 'express'

// This computer only. To serve other computers, put a proxy that signs people in on this one.
export const HOST = '127.0.0.1'

export const listen = (app: Express, port: number, onListening: (server: Server) => void): Server => {
  const server: Server = app.listen(port, HOST, () => onListening(server))
  return server
}
