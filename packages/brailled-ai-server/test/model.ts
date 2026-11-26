// A stand-in for the model: what it sends back, written by the test.
let next = 0

const message = (content: Record<string, unknown>, finish: string) =>
  Response.json({ choices: [{ finish_reason: finish, message: { role: 'assistant', ...content } }] })

// The model calling tools, each given as its name and arguments.
export const calls = (...made: [string, unknown][]) =>
  message(
    {
      content: null,
      tool_calls: made.map(([name, args]) => ({
        id: `call_${++next}`,
        type: 'function',
        function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
      })),
    },
    'tool_calls',
  )

// The model just talking.
export const says = (content: unknown, finish = 'stop') => message({ content }, finish)
