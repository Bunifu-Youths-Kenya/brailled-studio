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

Two more keys there are the school's: `"approval"` (`"every time"`, the default, or `"big changes only"`) and
`"proposalExpirySeconds"` (30 to 900, default 120). See the
[editor package's notes](../brailled-accessibility/README.md#approval).

The AI helper is on only when `ai` is `true` and `aiEndpoint` is usable: an `https` address, one on the editor's
own server starting with `/`, or `http` on this computer.

`npm test`, `npm run typecheck` and `npm run lint` check the server. The tests use a stand-in for OpenRouter.

## The tool loop

For each request the server asks the model, runs the tools it calls, and asks again, until the model finishes with a
reply. All tools are in `src/tools.ts`.

| Tool | Gives |
| - | - |
| `find_blocks` | Blocks usable here that match some words, such as "make it talk" |
| `describe_block` | One block's category, purpose, shape, values and choices |
| `get_program` | The selected sprite's program and project names, marked untrusted |
| `get_context` | Where the student is, marked untrusted |
| `search_library` | Sprites by name or kind |
| `explain_concept` | A prepared explanation of a programming idea |
| `ask_question` | Finishes with a question |
| `give_explanation` | Finishes with an explanation |
| `submit_proposal` | Finishes with a proposal. Not offered in guide mode |

No tool runs, changes or approves anything. A proposal is pre-checked (operations, blocks, references, actions,
sprites) and the model is told what is wrong so it can try again; the editor then validates it fully.

- At most `AI_MAX_ROUNDS` calls to the model per request (6 by default, 10 at most), and `AI_TURN_TIMEOUT_MS`
  altogether. The last round offers only the ways to finish.
- **Cost:** one request can mean several model calls, and each sends the conversation so far. The rate limits count
  requests, not calls.
- The block catalog and concepts are read from `../brailled-accessibility/src/catalog/`, and sprites from
  `../scratch-gui/src/lib/libraries/sprites.json`: keep them beside the server when deploying.

## A spoken turn

`POST /api/voice-turn` takes a recording, for the editor's `gemini-pair` and `openai-audio` providers.

| Field | Contents |
| - | - |
| `audio` | `{data, format: "wav"}`: base64 of 16 kHz, one channel, 16 bit WAV, at most `AI_MAX_AUDIO_SECONDS` |
| `pending` | Whether something waits for the student's answer |
| `language`, `model` | The editor's language, and the model to ask, which must be in `AI_AUDIO_MODELS` |
| `request` | The fields of `/api/assistant` without `transcript`. Left out when `pending` |

The reply is `{transcript, clear, result}`: the words heard, whether the model is sure of them, and a proposal,
question or explanation, or `null`.

- The recording goes to the model through OpenRouter's **Chat Completions** endpoint as `input_audio`, with the same
  tool loop. Tried on 2026-11-26 with `google/gemini-3.5-flash-lite` under zero data retention: Chat Completions took
  audio with tools over several calls, and the Responses endpoint took them too. Each call in a turn sends the
  recording again.
- **While something waits for an answer, nothing of the project is sent** and the only tool is `report_heard`, so
  that text in a project cannot say what the student said. The editor decides what the words mean.
- `no_endpoint` (OpenRouter's 404) means no provider of the model can keep to the privacy settings.
- Limits: `VOICE_REQUESTS_PER_MINUTE_PER_ADDRESS`, and a day's total that is the lower of
  `VOICE_REQUESTS_PER_DAY` and `voice.dailyRequestCap` in the editor's configuration file, read at start.
- Neither the recording nor the words are stored or logged.

## Speech

`POST /api/speak` takes `{text, model, voice}`: at most 600 characters, a model in `AI_AUDIO_MODELS`, and a voice
name. It asks OpenRouter's speech endpoint for PCM under the privacy settings and passes the sound on as it arrives:
16 bit, one channel, 24 kHz. A model named `openai/gpt-audio…` is asked through Chat Completions to say the words,
and its stream of events is turned into the same sound. Nothing is cached or logged but the number of characters and the time. The day's
characters are the lower of `VOICE_CHARACTERS_PER_DAY` and `voice.dailyCharacterCap` in the editor's configuration
file.

## Evaluating a model

`eval/cases.json` holds requests with what a good reply contains, for three sample projects recorded from the editor
(`eval/projects.json`; record again with `node ../brailled-accessibility/e2e/capture-eval-projects.cjs`). One
project has names and block text worded as instructions.

```sh
npm run eval                       # says what it would do; calls nothing
npm run eval -- --real             # runs every case against the model in .env, which costs credit
npm run eval -- --real --only guide
```

Replies are saved in `eval/results/`, which git ignores. The checks are rough: forms, blocks, operations, and a few
words. Read the replies too. `npm test` checks the cases and the scoring with a stand-in, never a real model.

## The endpoint

`POST /api/assistant` with a JSON body. Only these fields are accepted, so no pictures or page content can be
passed on:

| Field | Content |
| - | - |
| `transcript` | What the student said or typed, at most 500 characters |
| `mode` | `build` or `guide` |
| `history` | At most 12 turns of the recent conversation |
| `language` | The editor's language |
| `assistantName` | What the assistant is called: letters, spaces, hyphens and apostrophes, at most 30 |
| `context` | The editor's context snapshot: view, focus, sprite, place in the outline, device and running state |
| `program` | The selected sprite's program, one line per block, with references such as `b2` |
| `data` | Names of variables, lists and messages |
| `names` | Names of sprites, costumes, sounds and backdrops |
| `blocks` | The kinds of block that may be used, with their values, without any project names |
| `actions` | The editor actions that may be proposed |
| `spriteCategories` | Kinds of sprite in the library |
| `previous` | Optional: the model's question that `transcript` answers |
| `revises` | Optional: the suggestion that `transcript` asks to change |

The model gets `actions` and `spriteCategories` as the editor's own words, `history` as a record, and `context`,
`program`, `data` and `names` under `untrustedProjectContent`, which its instructions tell it never to obey.

The server adds the edit-command schema (`../brailled-accessibility/src/commands/schema.json`, so keep that file
beside it when deploying), its instructions and its tools. The block list is given to the model only through the
tools.

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

The server logs only whether a request succeeded, how long it took, the number of model calls and the names of
the tools used. By default it asks OpenRouter to use only
providers that do not collect data and have zero data retention. What is sent is described in
[PRIVACY-NOTES.md](../../PRIVACY-NOTES.md).
