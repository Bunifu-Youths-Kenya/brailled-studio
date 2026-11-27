// The online editor's AI server. All it does is in `packages/brailled-ai-server/src/online`, which is tested there;
// this joins it to Supabase and the project's secrets.
import { createClient } from 'npm:@supabase/supabase-js@2.119.2'
import { readConfig } from '../../../packages/brailled-ai-server/src/config.ts'
import type { Knowledge } from '../../../packages/brailled-ai-server/src/knowledge.ts'
import { accountsFrom, secretKeyFrom } from '../../../packages/brailled-ai-server/src/online/accounts.ts'
import { createHandler } from '../../../packages/brailled-ai-server/src/online/handler.ts'
import blocks from '../../../packages/brailled-accessibility/src/catalog/blocks.json' with { type: 'json' }
import concepts from '../../../packages/brailled-accessibility/src/catalog/concepts.json' with { type: 'json' }
import schema from '../../../packages/brailled-accessibility/src/commands/schema.json' with { type: 'json' }
import sprites from '../../../packages/scratch-gui/src/lib/libraries/sprites.json' with { type: 'json' }

declare const Deno: {
  env: { toObject(): Record<string, string> }
  serve(handler: (request: Request) => Promise<Response>): unknown
}

// The pages that may call this, unless the ALLOWED_ORIGINS secret says otherwise.
const SITES = 'https://brailledu.bunifuyouths.org,http://localhost:8601'

const env = Deno.env.toObject()
const knowledge: Knowledge = { blocks, concepts, sprites: sprites.map(({ name, tags }) => ({ name, tags })) }
const client = createClient(env.SUPABASE_URL, secretKeyFrom(env), {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(
  createHandler({
    config: readConfig({ ...env, ALLOWED_ORIGINS: env.ALLOWED_ORIGINS ?? SITES }),
    knowledge,
    commandSchema: JSON.stringify(schema),
    accounts: accountsFrom(client),
  }),
)
