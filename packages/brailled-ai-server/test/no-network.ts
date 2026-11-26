// No test may reach a real AI. Only requests to servers that the tests start on this computer go through.
const real = globalThis.fetch

globalThis.fetch = (input, init) => {
  const { hostname } = new URL(input instanceof Request ? input.url : input)
  if (!['localhost', '127.0.0.1'].includes(hostname) && !/^(10|172|192)\./.test(hostname)) {
    throw new Error(`A test tried to reach ${hostname}`)
  }
  return real(input, init)
}
