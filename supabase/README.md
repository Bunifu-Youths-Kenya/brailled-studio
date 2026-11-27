# Brailled online

The online editor's accounts, daily limits and AI server, on Supabase. The server on a computer of your own
(`packages/brailled-ai-server`) does not use any of this.

| Part | Where |
| - | - |
| Accounts, limits and usage | `migrations/` |
| The AI server | `functions/ai/`, which runs `packages/brailled-ai-server/src/online` |
| Database tests, in a throwaway Postgres | `tests/run.sh` |
| Checks of the hosted project | `tests/hosted.mjs`, which explains itself |

## Deploy

Secrets are set in the project, never kept here: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENAI_API_KEY`, and
optionally `ALLOWED_ORIGINS` (the website and `http://localhost:8601` unless set). The server's other settings in
`packages/brailled-ai-server/README.md` apply too, except its limits, which the database keeps instead.

```sh
npx supabase db push --remote=<project ref>      # without --remote it changes a database on this computer
npx supabase functions deploy ai --use-api --project-ref <project ref>
```

## Looking after it

In the dashboard's table editor:

- `profiles`: set `role` to `admin` for no limit, `blocked` to stop someone, or a person's own limits.
- `app_settings`: the usual limits, the ceiling for everyone together, and `ai_enabled`, which stops all AI at once.
- `usage_daily` and `ai_calls`: what has been used. Days are UTC. Nothing said, typed or built is kept.

The cost recorded for a live voice session is nothing: its sound goes from the browser to OpenAI. Set a spending
limit there.
