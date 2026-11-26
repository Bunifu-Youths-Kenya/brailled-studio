# Brailled AI server

Asks an AI model, through [OpenRouter](https://openrouter.ai/), for a suggestion on behalf of the Brailled editor.
The API key stays here and never reaches the browser. The server changes nothing in anyone's project: the editor
checks each reply and only describes it.

## Run it

Needs Node 24 or newer.

```sh
cd packages/brailled-ai-server
npm install
cp .env.example .env     # then set OPENROUTER_API_KEY and OPENROUTER_MODEL
npm start
```

`.env` is ignored by git. Then tell the editor where the server is, in
`packages/scratch-gui/static/brailled-config.json`:

```json
{
    "voice": true,
    "ai": true,
    "aiEndpoint": "http://localhost:8787/api/assistant"
}
```

The AI helper is on only when `ai` is `true` and `aiEndpoint` is usable: an `https` address, one on the editor's
own server starting with `/`, or `http` on this computer.

`npm test`, `npm run typecheck` and `npm run lint` check the server. The tests use a stand-in for OpenRouter.

## The endpoint

`POST /api/assistant` with a JSON body. Only these fields are accepted, so no pictures or page content can be
passed on:

| Field | Content |
| - | - |
| `transcript` | What the student said or typed, at most 500 characters |
| `language` | The editor's language |
| `context` | The editor's context snapshot: view, focus, sprite, place in the outline, device and running state |
| `program` | The selected sprite's program, one line per block, with references such as `b2` |
| `data` | Names of variables, lists and messages |
| `blocks` | The kinds of block that may be used, with their values |
| `actions` | The editor actions that may be proposed |
| `previous` | Optional: the model's question that `transcript` answers |

The server adds the edit-command schema (`../brailled-accessibility/src/commands/schema.json`, so keep that file
beside it when deploying) and its instructions.

The answer is `{"reply": ...}` with the model's JSON object, a proposal, question or explanation. The editor
checks the whole of it. Errors are `{"error": ...}`:

| Status | `error` | When |
| - | - | - |
| 400, 415 | `invalid_request` | The body is not what is described above |
| 403 | `origin_not_allowed` | A web page that is not in `ALLOWED_ORIGINS` |
| 413 | `too_large` | Over `MAX_REQUEST_BYTES` |
| 429 | `too_many_requests` | A limit is reached; `Retry-After` says how long to wait |
| 502 | `invalid_output`, `upstream_error` | The model's reply is unusable, or OpenRouter failed |
| 503 | `not_configured` | No key or model is set |
| 504 | `upstream_timeout` | The model took too long |

## It accepts connections from this computer only

It listens on `127.0.0.1`, and no setting changes that. Editors on this computer reach it at
`http://localhost:8787`.

## Before letting other computers use it

That needs a proxy on the same computer that passes requests to it.

- **There is no sign-in.** The origin check stops other web pages, not other programs. Anyone who can reach the
  proxy can spend your credit, within the limits. Make the proxy require sign-in, and set a spending limit on
  the OpenRouter key.
- **Limits are kept in memory**, for one server process, and start again when it restarts.
- Serve the proxy over `https`, set `ALLOWED_ORIGINS` to the editor's address, and set `TRUSTED_PROXIES` to the
  number of proxies.

## Privacy

The server logs only whether a request succeeded and how long it took. By default it asks OpenRouter to use only
providers that do not collect data and have zero data retention. What is sent is described in
[PRIVACY-NOTES.md](../../PRIVACY-NOTES.md).
