# brailled-accessibility

Brailled's own interface code for the editor: accessibility features for blind students, plus the layout pieces
the editor needs around them.

| Source file | What it provides |
| - | - |
| `src/shell.jsx` | Skip links, zone ids and the focus indicator |
| `src/menu-bar-items.jsx` | Product logo, language picker, Save, Help and Examples |
| `src/brand/brailled-logo.svg` | The logo from `packages/logos`, trimmed to the lettering, without its square white background |
| `src/stage-tabs.jsx` | Devices, Sprites and Background tabs under the stage |
| `src/devices-panel.jsx` | Devices panel (interface only; nothing connects yet) |
| `src/scripts-views.jsx` | Blocks / Outline / Python toggle |
| `src/palette-area.jsx` | Search placeholder and the block category landmark |
| `src/actions/` | The action registry, local commands, context snapshot and editor-wide live region |
| `src/voice/` | Voice input by keys, the speech-to-text interface and what happens to what was heard |
| `src/wake/` | The wake word: matching it, the engines that listen for it, and when they may |
| `src/speech/` | Reading replies aloud |
| `src/ai/` | The AI side: what is sent, checking the form of what comes back, questions and explanations |
| `src/proposals/` | The approval gate: queue, validator, risk, state machine, executor, dialog, highlighting |
| `src/library.js` | The sprite library by name and kind |
| `src/catalog/` | Plain descriptions of every editable block, and of programming ideas, for the AI helper's tools |
| `src/memory.js` | The recent conversation with the AI helper, held only while the page is open |
| `src/introduction.js` | The assistant introducing itself |
| `src/names.js` | The assistant's name and what counts as a name |
| `src/settings.js` | The student's choices, kept in the browser |
| `src/config.js` | What whoever runs the editor allows |
| `src/use-kept-state.js` | State that survives the editor rebuilding on a language change |
| `src/outline/` | The Outline view and its editing keys and dialogs |
| `src/commands/` | The editing command format, validator and executor |

Voice editing and the AI layer will go here too. Neither exists yet.

## Outline view

A tree of the selected sprite's program, with scripts ordered as on screen: top to bottom, then left to right.
All changes go through the editing commands below.

| File | Role |
| - | - |
| `tree.js` | Builds the tree from VM block data |
| `sentence.js` | Turns one block, with its reporters, into a sentence |
| `block-definitions.js` | Reads translated label text from scratch-blocks |
| `fallback-labels.js` | English labels for opcodes scratch-blocks does not define |
| `navigation.js` | Keyboard movement, and keeping the user's place across changes |
| `diff.js` | Finds added, removed, moved and changed blocks to announce |
| `colours.js` | Colour names, so that no colour is read as a code |
| `outline-view.jsx`, `outline-item.jsx` | The tree and its live region |
| `editing.js`, `use-editing.js`, `use-moving.js` | What the editing and move keys do |
| `block-picker.jsx`, `value-editor.jsx`, `data-dialogs.jsx`, `dialog.jsx` | The block search, value, and variable dialogs |

| Key | Action |
| - | - |
| Up, Down, Home, End | Move around |
| Right / Left | Expand or enter / collapse or go to the parent |
| Space | Expand or collapse |
| Enter | Edit the block's values; on other items, expand or collapse |
| I / Shift+I | Add a block after / before the current item |
| Delete or Backspace | Delete the block, with what it holds; on a script, the whole script |
| M | Pick up the block to move it; on a script's heading, the whole script |
| M / Shift+M, while moving | Put it after / before the current item; on an empty place, inside it |
| N, while moving | Put it in a new script |
| Escape, or M on the picked block | Cancel the move |
| W / Shift+W | Put the block / the block and those under it inside a loop or condition. On a script's heading, everything under its first block |
| V / Shift+V | Create / rename a variable, list or message |
| D / Shift+D | Describe the program / the current script |
| Control+Z / Control+Y (or Control+Shift+Z) | Undo / redo |
| Alt+Shift+O | Switch between Blocks and Outline |

These keys work only while focus is in the Outline. Move, wrap and variable keys are plain letters, so they do
not collide with browser shortcuts; a screen reader should pass them on in focus mode. If it takes Escape for
itself, cancel a move with M on the picked block.

Known limits:

- Comments, and variable and list values, are not shown.
- Changes are announced in both views while the Code tab is open, and not on the Costumes or Sounds tabs.

## How it is used

`scratch-gui` imports `src/index.js` by relative path and compiles it with its own webpack and Babel
configuration. The package has no build step and is not listed in the root `workspaces`; its peer dependencies
resolve from the root `node_modules`. Jest in `scratch-gui` compiles it using this package's `.babelrc`.

All user-visible strings go through `react-intl`, with ids starting `brailled.`. No translations exist yet.

## Actions

Everything the editor offers is one list, `src/actions/registry.js`. Each action has an id, a spoken name and
description, its shortcuts, an availability check and a handler. The Outline's keys, the global shortcuts and
typed commands, spoken commands and the AI helper all go through it. Local commands call no AI and send nothing
off the device.

| Action ids | Shortcut | Typed command |
| - | - | - |
| `help.whereAmI` | Alt+Shift+W | "where am I" |
| `help.whatCanIDo` | Alt+Shift+H | "what can I do here" |
| `help.commandBox` | Alt+Shift+K | |
| `help.introduce` | | The assistant's name, "who are you", "introduce yourself" |
| `voice.wake`, `voice.stopListening` | F4 | "listen for the wake words", "stop listening" |
| `go.menu`, `go.stage`, `go.devices`, `go.sprites`, `go.background`, `go.palette`, `go.scripts` | | "go to menu", "go to the stage", "go to block palette" and so on |
| `view.toggle` | Alt+Shift+O | "switch view" |
| `view.blocks`, `view.outline` | | "show blocks", "go to outline" |
| `view.python` | | "show Python" (says it is coming soon) |
| `move.next`, `move.previous` | | "next", "previous" |
| `program.describe` | D in the Outline | "read program" |
| `program.describeScript` | Shift+D in the Outline | "read script" |
| `edit.undo`, `edit.redo` | Control+Z, Control+Y in the Outline | "undo", "redo" |
| `edit.insert`, `edit.insertBefore`, `edit.delete`, `edit.values`, `edit.move`, `edit.moveBefore`, `edit.moveNewScript`, `edit.cancelMove`, `edit.wrap`, `edit.wrapFollowing`, `edit.createData`, `edit.renameData` | The Outline keys above | The action's name, such as "add block" |
| `project.run`, `project.stop` | | "run", "stop" |
| `sprite.library` | | "open sprite library" |
| `voice.talk` | Hold the talk key | "talk" |
| `go.voice` | Alt+Shift+Q: the question waiting beside the editor, or "Nothing is waiting" | "go to voice bar" |
| `voice.settings` | | "voice settings" |
| `mode.build`, `mode.guide`, `memory.forget` | | "build mode", "guide me", "forget our conversation" |

- **Typed commands** go in the command box, and spoken ones come from voice input. Both are matched against
  fixed English phrases and the action names in the user's language, ignoring a greeting such as "hey" or
  "okay" at the start and "please" at either end. Anything else goes to the
  [AI helper](#ai-helper); without one the command box refuses it with a hint.
- **Answers** are spoken through one live region that stays available on every tab.
- **Next and previous** move through the outline when it is shown, and otherwise through the controls of the
  current part of the editor.
- **Undo and redo** apply to edits made through editing commands, not to changes dragged in the Blocks view.
- An action that cannot be used says why when asked for by command; its key is left alone.

### Context snapshot

`getApp(vm).snapshot()` returns plain data: the editor tab and view, the focused part of the editor and control
(from ARIA names), the selected sprite, the place in the outline, any block being moved, the stage tab, the device
and its Upload or Live mode, whether the project is running, and the actions available. `snapshotToText` turns
it into eight or nine short lines for a model to read. In development builds the app is `window.brailledApp`,
with `snapshotText()`.

It holds sprite names and block text, which students write. Treat it as their data. The AI helper sends it, as
[PRIVACY-NOTES.md](../../PRIVACY-NOTES.md#ai-helper) describes.

## Voice input

Voice is keys and speech, with nothing on screen to look at: a blind student presses a key and talks. The only
thing drawn is a small red dot in the menu bar's far corner while the microphone is open, for a teacher or anyone
else in the room. Voice is optional: everything it does can be done from the keyboard or by typing the command.

| To talk | What happens |
| - | - |
| Hold the **talk key**, F2 unless changed | The microphone is open while the key is down |
| Tap the talk key | Listens for one phrase |
| Say or type "talk" | The same as a tap |
| Escape | Stops listening and does nothing |

**The talk key** is chosen in Voice settings:

| Talk key | For |
| - | - |
| F2 (default) | Keyboards where F2 works on its own |
| Alt+Shift+V | Laptops where F2 needs Fn. Letting go of any of the three keys stops listening |

No use of either was found in the editor, the block library or the paint editor, and browsers and screen readers
are not expected to take them on their own. Neither has been tried with NVDA, JAWS, VoiceOver or Orca.

**Room for the editor.** Nothing for voice takes room: the editor reaches the bottom of the window. In a window
740 pixels high or less the large stage is drawn at 70% so that the sprites stay on screen.

**When the microphone is open.** Only after one of the actions above, unless the student has turned on the
[wake word](#wake-word). For one request it closes after at
most 15 seconds, or 5, 10, 30 or 60 as chosen in Voice settings; there is no unlimited choice, and the browser's
service may stop sooner after silence. It also closes when the window loses focus or the page is hidden. A high
tone marks it opening and a low tone closing, and the red dot shows while it is open. Nothing is announced or
read while it is open, so that neither the screen reader nor the editor is heard as speech.

**What happens to the words.**

1. If the speech service is less than 70% sure, or gives no measure, the editor asks "Should I go ahead?", beside
   the editor in voice-first mode or in a dialog otherwise. Hold the talk key and say "yes" or "no", or use its
   buttons (Alt+Shift+Q reaches them). Nothing is done until the answer is yes.
2. A local command (the typed commands above) runs where focus was.
3. Anything else goes to the [AI helper](#ai-helper), if one is set up; if not, the answer says so. A yes or no
   with nothing waiting is not sent anywhere. While a suggestion waits, what is said answers it.

Replies are spoken by the screen reader through the live region, and read aloud where that is on, without
repeating what was heard.

**Reading aloud.** For students without a screen reader, the editor can read its replies and the question about
doubtful words with a voice built into the device. It is off until chosen. On a first visit the editor asks "Do
you use a screen reader?": "No" turns reading aloud on, "Yes" leaves it off, and Escape leaves it off and asks
again next time. It can be changed in Voice settings. Escape also stops what is being read.

- It reads what the editor announces. It does not read menus, buttons or the contents of other windows, so it
  does not replace a screen reader.
- Browsers do not let a page speak before the student has done something, so the first question is not read
  aloud.
- Only on-device voices are used. Where there is none, which can be the case on Linux, the editor says that it
  cannot read aloud.

**Privacy.** The Web Speech API is the browser's service, and Chrome sends the audio to Google's servers. The
editor says so once, the first time the microphone opens on a page, and Voice settings show it at all times. See [PRIVACY-NOTES.md](../../PRIVACY-NOTES.md), including what a school should
do before students use voice.

**Reset for new student**, in Voice settings, forgets the talk key, listening time, reading aloud and the screen
reader answer, and asks the first question again.

**Turning voice off.** `static/brailled-config.json` with `"voice": false`, or a missing or unreadable file,
turns off the microphone and reading aloud; the talk key says so and everything else works. See
[PRIVACY-NOTES.md](../../PRIVACY-NOTES.md#turning-voice-off).

**Browsers.** Speech recognition is in Chrome, Edge and Safari, and not in Firefox, where the talk key says to
type commands instead. A blocked or missing microphone, silence, no network and an unsupported language each have
their own message. Commands are understood in English phrases and in the action names of the editor's language.

### Wake word

Demo mode: say "Hey Mboni" instead of pressing the talk key. It is **off** until the configuration allows it and
the student turns it on, with **F4** or Voice settings. The talk key keeps
working either way. Chrome sends everything heard while it listens to
Google; read [PRIVACY-NOTES.md](../../PRIVACY-NOTES.md#wake-word-demo-mode) first.

```json
{
    "voice": true,
    "wakeWord": {
        "enabled": true,
        "engine": "demo",
        "greetings": ["hey", "hi", "okay", "ok"],
        "variants": ["Boni", "Bonnie", "Moni", "Mbony", "Mboni", "Mbonyi"]
    }
}
```

- **Matching** (`src/wake/match.js`): a greeting, then the assistant's name or a variant, at the start of a phrase.
  Capitals, accents and punctuation are ignored, and "M boni" counts. How close a word must be is set by the list
  alone. If you change `assistantName`, change `variants` too.
- **One request.** "Hey Mboni, run" is taken as one breath. After "Hey Mboni" alone it listens for one request, or
  introduces itself if it has not yet. Then it waits for the wake words again.
- **Safety.** Anyone nearby can say the words. They never answer a suggestion, or the "Should I go ahead?"
  question. A command that changes the project, runs it or forgets the conversation asks first, and only the talk
  key, a button or the keyboard can say yes. "Stop" works at once.
- **Pauses** while the page is hidden, while the editor reads aloud and while a request is taken. It cannot tell
  when a screen reader is speaking.
- **Engines** (`src/wake/engine.js` describes the interface): `"demo"` restarts the browser's continuous
  recognition each time the browser ends it, waiting longer after quick failures and giving up after six.
  `"on-device"` is a stub that says it cannot be used.

### Voice settings

`"voice": true` is voice with the browser's own speech recognition. An object chooses more; it turns voice on only
with `"enabled": true`.

| Key | Values | Default |
| - | - | - |
| `provider` | `"browser"`, `"gemini-pair"`, `"openai-audio"` | `"browser"` |
| `listenModel` | The model that hears and answers, as OpenRouter names it | `google/gemini-3.5-flash-lite` |
| `ttsModel`, `ttsVoice` | The model and voice that read replies | `hexgrad/kokoro-82m`, `af_heart` |
| `compareModel`, `compareVoice` | The model and voice of `openai-audio` | `openai/gpt-audio-mini`, `alloy` |
| `readReplies` | `"online"`: the online voice reads replies even when the browser listens | `"device"` |
| `speed` | 0.5 to 2, applied when audio is played | 1 |
| `maxRecordSeconds` | 5 to 60 | 30 |
| `silenceSeconds` | 1 to 4: how long a pause ends a recording | 2 |
| `doneWord` | Whether saying "done" ends a recording | `false` |
| `dailyRequestCap`, `dailyCharacterCap` | Voice requests, and characters read, a day | 300, 50000 |

No key or other secret belongs in this file: it is served to every browser.

### Recording

For a provider that listens to the sound itself, `src/voice/recorder.js` records the microphone only while a request
is being taken, turns it into WAV (16 kHz, one channel, 16 bit) and hands it over. Nothing is stored.

| It stops | |
| - | - |
| After `silenceSeconds` of quiet, once someone has spoken | Tap and wake word. Room noise is allowed for. Not while the talk key is held |
| When the talk key is let go, or pressed again after a tap | A short tap of the key starts a recording that ends by itself |
| At `maxRecordSeconds` | Always |
| After 8 seconds in which nobody spoke | Nothing is sent. Not while the key is held |
| When the student says "done" | Only with `"doneWord": true`, which runs the browser's speech recognition beside the recording, so the sound also goes to its service (Chrome: Google). Without it, a pause ends the recording |

A tone marks the start and the end. Silence is judged from loudness alone and has not been tried in a real
classroom.

### Spoken turns

With `"provider": "gemini-pair"` (and the AI helper on), what is recorded goes to the server's
[`/api/voice-turn`](../brailled-ai-server/README.md#a-spoken-turn), where one model hears it and answers with the
same tools. It comes back as the words heard, whether the model is sure, and a reply. The editor then decides what
the words are, as for any speech:

1. A local command runs. Anything that changes the project, runs it or forgets the conversation **asks first**: the
   words were written down by a model that had also read the project, whose text could try to put words in the
   student's mouth.
2. Otherwise the reply is checked and used as for a typed request; a proposal waits for approval.
3. Doubtful words ask "Should I go ahead?"; none at all asks to hear them again.

**While something waits for an answer**, only the recording is sent, with nothing of the project, and only the words
come back. They are matched here against yes, no and "change it", in English and in `voice.answers` (Swahili unless
changed: `ndiyo`, `ndio`, `naam`, `endelea`, `fanya hivyo`; `hapana`, `la`, `usifanye`, `acha`; `badilisha`,
`badili`). "Sawa", like "okay", approves nothing. An answer is ignored if the question changed or expired since the
recording began, and a recording overtaken by a newer one is dropped. The wake words never approve.

A request said in the same breath as "Hey Mboni" was already heard by the browser to catch the wake words, and is
sent as typed words; after "Hey Mboni" alone the request is recorded.

**Falling back.** If no provider can keep to the privacy settings, the server cannot be reached or a limit is
reached, the editor says so and uses the browser's speech recognition until the page is reloaded.

### The comparison provider

`"provider": "openai-audio"` is for comparing, and is off. The same recording, tools, replies and rules apply, with
`compareModel` hearing and answering, and then saying each sentence of the reply (a second use of the model: a model
that calls tools does not give its sound in the same call). No sound ships for it. On 2026-11-26 OpenRouter listed
**no zero-data-retention provider** for `openai/gpt-audio-mini`, so with that setting on, the default, the editor says
so and falls back to the browser. It has not been tried against the real service.

### Speaking

Reading aloud works as before, and only when it is on. With an online provider, `src/speech/online-speaker.js` reads
**the assistant's replies and suggestions** a sentence at a time, asking for the next while one plays, at
`voice.speed` without changing the pitch. Read-backs of edits and commands stay with the device's voice unless the
student chooses otherwise in Voice settings, and anything holding the student's name always does. Escape, the talk
key and a new recording stop it. It cannot be interrupted by voice alone: the wake words are not listened for while
the editor reads.

**No voice.** Where reading aloud is on and cannot read everything, Voice settings say so. **Chrome on Linux**
offers no voice unless started with its speech dispatcher, with every Chrome window closed first:

```sh
google-chrome --enable-speech-dispatcher
```

It also needs `speech-dispatcher` and a synthesiser such as `speech-dispatcher-espeak-ng` installed.

**Shipped sound.** The assistant's fixed sentences are listed in `src/speech/fixed-phrases.json` and their sound is
in `scratch-gui/static/brailled-voice/`, named by a hash of the words, voice, model and version. It plays offline.
After changing what the assistant says, or the voice:

```sh
UPDATE_PHRASES=1 npx jest test/phrases                       # list the sentences again
npm run voice:phrases --prefix ../brailled-ai-server         # make the missing sound: calls the service, costs credit
```

The usual name (Mboni) and talk key (F2) are in the shipped sentences. With others, those sentences are asked for
like any reply, or read by the device where they are not replies. If speech fails, the device's voice takes over for
the rest of the visit and says so.

### Conversation

```json
{
    "voice": {"enabled": true, "readReplies": "online", "ttsModel": "hexgrad/kokoro-82m", "ttsVoice": "af_heart"},
    "wakeWord": {"enabled": true},
    "conversation": {"enabled": true, "voiceApproval": true, "idleSeconds": 20},
    "ai": true,
    "aiEndpoint": "http://localhost:8787/api/assistant"
}
```

Say "Hey Mboni" once, then talk. She greets you (or introduces herself the first time), and every phrase is for her
until "goodbye", "thank you" or `idleSeconds` without talk (5 to 60). The browser does the listening; the voice
bar shows "Talking with Mboni". She does not listen while she thinks.

- **Taking turns.** She goes on listening while she speaks, so the student can talk over her: her reading stops and
  what they said is taken. Words that are her own coming back through the microphone, read aloud or by a screen
  reader, are never taken for the student's: heard while she reads, or while a quick screen reader would still be
  saying them, words that are mostly hers are dropped. That keeps her "Say add all" from approving anything. When
  her reading ends, a soft tone says it is the student's turn.
- **Brief answers.** The request says it is a conversation, and the model is told to answer in one or two spoken
  sentences, one question at a time, naming blocks by their words and where they sit.

- **A plan.** "I am making a square, help me" gets a suggestion, read as steps, ending "Say add all, guide me, or
  no."
- **"Add all"** approves it, only where `voiceApproval` is `true` and every step adds something (blocks, a variable
  or list, a sprite) that "undo" takes back. A bare "yes" approves nothing. Otherwise the talk key, a button or the
  keyboard is needed.
- **"Guide me"** (also a button, or said with the talk key) changes nothing: it says each step, watches the project,
  says "Well done" and goes on. "Repeat", "next step" and "stop guiding" work meanwhile. No AI is asked between
  steps.
- **Answered at once, without the AI:** editor commands, "where am I" and "what does this platform do".
- Phrases heard with under 60% certainty are dropped. A command that changes the project asks first, and cannot be
  answered by voice.
- `readReplies: "online"` reads replies, and in a conversation everything, with `voice.ttsModel` and `ttsVoice`.
  "Okay, let me look.", the greeting, the goodbye and the lines about adding and guiding ship as recordings, so
  they play at once.

### Changing the speech service

`src/voice/provider.js` describes the interface: `isSupported()` and
`listen({language, onReady, onHear, onEnd})`, which returns `{stop(), cancel()}`. Return your provider from
`createSpeechProvider`, or pass `createProvider` to `VoiceBar`. Changing the service changes where students'
speech goes: follow the checklist in [PRIVACY-NOTES.md](../../PRIVACY-NOTES.md).

## Mboni: name and introduction

The assistant is called Mboni. `"assistantName"` in `static/brailled-config.json` changes it: up to 30 letters,
with spaces, hyphens or apostrophes between them; anything else means Mboni. The name is used in
the notice, the dialogs, and by the AI helper. What is said does not label replies with it. Saying or typing it before a command is understood
("Mboni, where am I?"); on its own it asks who the helper is. Calling it without pressing anything needs the
[wake word](#wake-word).

**Introduction.** The first time in a browser session that the talk key is pressed, the assistant
introduces itself instead of listening, and the next press listens. It never speaks before the student does
something. It is announced to screen readers, and read aloud only if reading aloud is on.
For example:

> Hello Amina. I am Mboni, your coding helper. I can tell you where you are, find blocks, build with you, guide
> you, explain ideas, and fix mistakes. Nothing changes unless you say yes. Hold F2 to talk to me.

- What it offers is worked out from the action registry and `src/catalog/tools.json`, the AI's tools; a server
  test keeps that list true. Without the AI helper it offers only what the editor does itself. It says "I ask you
  before big changes" where the school allows small ones without asking.
- It is at most 48 words, under 20 seconds read at an ordinary rate. The time was not measured with real voices.
- **Skip:** press the talk key again, which also starts listening, or press Escape. A screen reader is silenced
  with its own key.
- **How much:** Voice settings offers full (the default), short or off. Asking for it ("who are you") always
  answers, at the chosen length, or in full when off.
- **The student's name** is optional, typed in Voice settings, kept in the browser, and never sent anywhere.
- Where voice is off or unsupported nothing introduces it unasked: type its name in the command box.
- "Reset for new student" forgets the name and the choice, and the next call introduces it again.

## AI helper

Optional, and off by default. It needs the [Brailled AI server](../brailled-ai-server/README.md), and in
`static/brailled-config.json` both `"ai": true` and its address as `aiEndpoint`: an `https` address, a path
starting with `/`, or `http` on this computer. `ai` is separate from `voice`. While the helper is on, notices say
that what is typed or said to it is sent to an online service.

Anything said, or typed in the command box, that is not a local command is sent with the mode, the recent
conversation, the context snapshot, the selected sprite's program, the usable blocks and the actions it may
propose. The reply is one of:

| Reply | What happens |
| - | - |
| Proposal | It goes to the approval gate |
| Question | Shown with any numbered choices. Type, choose or say an answer, or its number. It may first open something, such as the sprite library, and may list sprites of one kind from the library |
| Explanation | Shown |

### Tools, modes and memory

The [server](../brailled-ai-server/README.md#the-tool-loop) lets the model look things up before it answers: blocks
by what they do, one block's values, the program, where the student is, sprites in the library and programming
ideas. Every tool only reads.

| Mode | The helper | Switch by saying or typing |
| - | - | - |
| Build (default) | Suggests changes for the student to approve | "switch to build mode" or "build mode" |
| Guide | Gives one step at a time for the student to make. It has no way to propose, the editor refuses a proposal, and the gate refuses changes | "guide me", "teach me" or "guide mode" |

The mode is shown beside Voice settings. `"assistantMode": "guide"` in `brailled-config.json` makes guide the
starting mode; a student's choice lasts while the page is open.

**Memory.** The last 12 turns, each at most 300 characters, go with every request: what the student said, what the
helper answered, and what the editor did about each suggestion (approved and what changed, rejected, changed,
expired). The helper cannot record that the editor did something. Say "forget our conversation" to clear it.
"Reset for new student" and reloading the page clear it too. It is never stored.

**After an explanation**, a command closes it and is carried out, and anything else carries the conversation on.

### The AI can only propose

`src/ai/` is the AI side. It is given only the *ports* in `src/proposals/ai-ports.js`: ways to read the editor,
to speak, and to `submit` steps to the proposal queue. It gets no editing engine, no actions to perform, no virtual
machine, and nothing that approves. The queue takes a copy of what is submitted. `test/boundary.test.js` fails if
`src/ai/` imports or calls anything else. Only the student's own input reaches the gate's `approve`.

### Approval

`src/proposals/` is the gate, the executor and the proposal dialog. A proposal goes

    idle -> proposed -> approved -> executing -> done      or ends rejected, revised or expired

Each step has a risk that the editor works out; nothing the AI says changes it.

| Risk | Steps | Asked about |
| - | - | - |
| Safe | Moving about and reading: help, "go to", views, next and previous, reading the program, stop, opening the sprite library | Never |
| Edit | Insert, change a value, move, wrap, create, rename, delete one block, add a sprite | By default. Not where the school's configuration says "big changes only" |
| Edit that "undo" cannot take back | Running the project, undo, redo | Always |
| Big, "hard to undo" | Deleting a whole script or more than one block, running with a device attached or in Upload mode, more than three changes at once, and anything not listed (so any future delete-sprite, overwrite, upload or robot action) | Always, with a warning |

**The school's options** are in `static/brailled-config.json`. Students have no setting for the first two.

| Key | Values | Default |
| - | - | - |
| `approval` | `"every time"`: every change is approved. `"big changes only"`: changes marked "Edit" above that "undo" can take back are made without asking | `"every time"`, also for any other value |
| `proposalExpirySeconds` | 30 to 900. Numbers outside that become the nearest limit | 120, also for anything that is not a number |
| `voice` | `true`, `false`, or the [voice settings](#voice-settings) | Off |
| `conversation` | `enabled`, `voiceApproval`, `idleSeconds`: [talking on](#conversation) after the wake words | Off |
| `wakeWord` | `enabled`, `engine` (`"demo"` or `"on-device"`), `greetings`, `variants` | Off |
| `assistantName` | What the assistant is called: up to 30 letters | `"Mboni"`, also for anything that is not a name |
| `assistantMode` | The mode the AI helper starts in: `"build"` or `"guide"`. A student can switch while the page is open | `"build"`, also for any other value |

With either approval level, every change is announced with how to take it back. Where changes are made without
asking, one that arrives while another window is open is asked about after all, so that it cannot go unheard. Undo is
kept for each sprite: it takes back changes to the sprite that is selected.

**Actions to come.** Deleting a sprite, uploading to a device and running a robot do not exist yet. **When they are
added they must always require approval**, at either level. The gate treats anything it does not know as hard to
undo; do not add them to `SAFE_ACTIONS` or `EDITS` in `src/proposals/risk.js`, and extend the test there that names
them.

**Asking.** The proposal is shown in large type, each step described by the editor itself, with the AI's one
sentence labelled "The AI says". A screen reader reads it from the dialog; with reading aloud on, the editor reads
it.

**Voice first.** Where voice is on, the student setting "Say questions instead of opening windows" (on by default)
shows suggestions, the AI helper's replies and "Should I go ahead?" in a panel beside the editor instead of a
dialog. Focus stays where the student is. The words go through the live region, so a screen reader says them, and
are read aloud where that is on. Alt+Shift+Q moves to the panel, Escape in it answers no, and focus goes back.
Suggestions that are hard to undo always open the dialog.

| To | Say or type | Or |
| - | - | - |
| Approve | "yes", "go ahead" | Enter on "Yes", which has focus unless the change is hard to undo |
| Reject | "no", "cancel" | Escape, or "No" |
| Change it | "change it: three seconds" | The "Or say what to change" box |
| Approve one step at a time | "step by step" | "One step at a time" |
| Approve all that remain | "yes to all" | "Yes, do all the rest" |

Nothing else approves. A press in the first 0.7 seconds is ignored. For a change that is hard to undo "No" has
focus, so Enter alone rejects it.

**It is cancelled** if, before approval, any program or name in the project, the selected sprite, the tab, the view
or the place in the outline changes (running the project changes none of these), and **expires** after the school's
time without an answer, two minutes unless set otherwise (each step has the whole time). It is validated again at
approval and between steps.

**Afterwards** the editor says what was done and how to undo it, and outlines the changed blocks in yellow for
15 seconds, on the canvas and in the Outline. Edits approved together are one undo. An added sprite is removed by
undo, unless blocks have since been put in it; that undo cannot be redone.

**Checking.** The whole reply must have exactly one of the three forms (`src/ai/reply.js`). Every command goes
through the editing engine's validator (`editor.preview`): each step is planned on the result of the steps before
it, on a copy of the program. Steps use the references `b1`, `b2` from the program that was sent, or `new1` for the
block that step 1 makes; other ids are refused. Actions must be ones that were offered, and sprites must be in the
library. No command may follow adding a sprite. If anything fails, the student hears "I couldn't work that out,
please try again" and nothing is shown or changed. The reason is written to the browser console.

**Actions it may propose** are those usable at the time, except edits made by hand at the focused block, which
would escape the validator, and opening the command box, listening and voice settings.

**Untrusted content.** Names of sprites, costumes, sounds, backdrops, variables, lists and messages, and block
text, are written by whoever made the project. They are sent apart from the editor's own lists, and the model is
told they are data and never instructions. That instruction can fail. What protects the project is that the model
can only propose.

**While something is open** the talk key still works. "stop" stops the project. "close" or "cancel" closes a
question or explanation. Other words answer a question.

### The two worked examples

| "add a sprite" | |
| - | - |
| The AI asks which kind, opening the library | Opening it needs no approval |
| The student picks Animals, People or Things | |
| The AI asks again; the editor lists five sprites of that kind | "more" lists the next five |
| The student names one, such as Dragon | The AI proposes "Add the Dragon sprite and select it" |
| The student approves | The sprite is added and selected, and the library closes |

"add a wait of 2 seconds after the move block" proposes one inserted block, described as "Add wait 2 seconds, after
move 10 steps".

These flows depend on the model following its instructions. Tests supply the model's replies.

## Colours

`src/theme.css` holds every colour Brailled uses, as `--brailled-*` properties on the page, so that dialogs have
them too. `useColorMode` (called in `gui.jsx`) puts the editor's colour mode on the page, and the colours follow it:

| Colour mode | Panels | Menu bar | Student's place |
| - | - | - | - |
| Original | Dark purple text on white | White on deep purple, yellow accents | Yellow on deep purple |
| High Contrast (also chosen by the computer's "more contrast" setting) | Black on white | White on black, yellow accents | Yellow on black |
| Dark (ready for when Scratch turns it on) | Light text on dark purple | White on deep purple | Dark on yellow |

Every text colour is at least 7:1 against what it sits on (WCAG AAA) and every border and focus ring at least 3:1.
`test/theme.test.js` checks this for each mode, so a new colour must be added to all three and pass it. The menu
bar, the Blocks/Outline switch and the stage tabs use the same deep purple. The rest of Scratch's own interface
keeps its colours.

## Accessible names

`npm run audit:names` (with the dev server running) checks 34 screens, menus and dialogs against Chrome's
accessibility tree and fails on any new control without a name.

Not fixed, because they are inside third-party libraries:

| Element | Where | Why |
| - | - | - |
| `data-radix-focus-guard` spans | Right click menus | Invisible focus guards of the menu library |
| `data-react-modal-body-trap` div | Libraries and dialogs | Invisible focus guard of the dialog library |
| `blocklyWidgetDiv` | Editing a value on a block | The block library's container; the text box inside it is named |
| Block shapes (`blocklyPath`) | The Blocks view | The block library gives drawn blocks no names. The Outline is the accessible way to read them |

Typing on a block in the Blocks view gives a box named only "Block value": the library does not say which value
it is. The audit does not cover every extension's dialogs, the sound editor with every tool, or screens that need
hardware.

## Editing commands

`getEditor(vm)` returns the engine that the keyboard interface uses, and that voice and AI input should use.
In development builds it is also `window.brailled`.

```js
const editor = getEditor(vm);
editor.run({op: 'insert', block: 'motion_movesteps', after: blockId, args: {STEPS: 10}});
// {ok: true, changed: true, message: 'Added: move 10 steps, after wait 2 seconds', focusId: '...'}
```

| Operation | Properties |
| - | - |
| `insert` | `block`; one of `after`, `before`, `inside: {block, branch}`, or none for a new script; `args` |
| `delete` | `block`; `withFollowing` to delete the blocks under it too |
| `set-value` | `block`, `name`, `value`: text, a number, `{block, args}`, or `null` to empty the slot |
| `move` | `block`; one of `after`, `before`, `inside`, `newScript: true`; `withFollowing` |
| `wrap` | `block`, `in` (a loop or condition); `through` for a run of blocks; `args` |
| `create` | `kind`: `variable`, `list` or `message`; `name`; `scope`: `all` (the default) or `sprite` |
| `rename` | `kind`; `name`; `to` |
| `undo`, `redo` | none |
| `describe` | `script` (any block id in it) to describe one script |

The format is defined by [`src/commands/schema.json`](src/commands/schema.json).
[`SUPPORTED-BLOCKS.md`](SUPPORTED-BLOCKS.md) lists the opcodes and value names.

- `run(command)` returns the result and passes it to `subscribe` listeners; the Outline announces `message`.
- `run([...])` applies several editing commands as one step, all or none.
- `validate(command)` checks without changing anything and gives the reason for a refusal.
- `listBlocks(kind)`, `valuesOf(blockId)` and `listData()` say what can be created and edited.
- `create`, `rename`, `undo`, `redo` and `describe` run on their own, not in a batch.
- Commands act on the selected sprite or stage. Each has its own undo history, separate from the workspace's
  Control+Z. Undo is refused if the blocks it would change have been altered some other way.
- Every change redraws the workspace, which clears the workspace's own undo history.

| File | Role |
| - | - |
| `schema.json`, `schema-check.js` | The command format and its check |
| `data.js` | Creating and renaming variables, lists and messages |
| `catalog.js` | Known blocks: shapes, values and defaults |
| `planner.js`, `values.js` | Applies a command to a copy of the program |
| `program.js` | Structure queries and rules |
| `apply.js` | Writes the change through the VM's block methods, and reverses it |
| `context.js` | Sprites, sounds, variables and messages of the project |
| `readback.js`, `messages.js` | Spoken results, refusals and program summaries |
| `editor.js` | The engine and undo history |

### Variables, lists and messages

- Names are compared ignoring case. A variable or list for all sprites cannot take a name that any sprite
  already uses for its own. Messages are always for all sprites.
- Scratch discards a message that no block uses whenever it redraws the workspace. The engine remembers new
  messages and offers them until the page is reloaded; they are saved with the project once a block uses one.
- Renaming updates every block that uses the name. Undo and redo of earlier edits use the new name.
- Undoing a `create` removes the item, and is refused while any block uses it. There is no delete command.
- Cloud variables cannot be created or renamed.

### Extension blocks

Blocks from extensions, such as micro:bit or a future ESP32 board, can be supported later **without changing the
command format**: a command already names a block by opcode and its values by name.

```js
{op: 'insert', block: 'microbit_displayText', after: blockId, args: {TEXT: 'Hi'}}
```

Today the engine knows only the shapes of loaded extension blocks, so it can move, wrap and delete them. To
create them and change their values:

1. **Describe them.** Build catalog entries from the loaded extension's metadata, which the VM holds in
   `vm.runtime._blockInfo` (from each extension's `getInfo()`), and look them up wherever `CATALOG` is used.
   - `blockType`: `command` is an instruction (`isTerminal` ends a script), `reporter` a value, `Boolean` a
     condition, `hat` and `event` start scripts, and `conditional` and `loop` hold `branchCount` stacks named
     `SUBSTACK`, `SUBSTACK2` and so on. The format accepts any of these branch names, and any such block in `in`.
   - Argument types: `number`, `string`, `angle`, `color` and `Boolean` match existing kinds of slot. `matrix`
     and `note` need two new value checks; both are still strings or numbers in a command.
   - A menu that accepts reporters is a slot holding a shadow block, `<extension>_menu_<menu>`, with a field
     named after the menu. Any other menu is a drop-down field named after the argument.
2. **Load the extension.** Commands for an extension that is not loaded are refused as unknown. A person can add
   it with the Extension button. Loading it from a command (`vm.extensionManager.loadExtensionURL`) is
   asynchronous, so a caller would load it first and then run the command.
3. **New hardware** such as ESP32 is not part of the VM. It needs a VM extension with `getInfo()` and block
   implementations; once loaded it is described like any other.

## Test and lint

From this directory, after `npm ci` at the repository root:

```sh
npm test
npm run lint
```

The browser tests drive the editor in Google Chrome. Start the dev server with `npm start` at the repository
root, then run `npm run test:e2e` here. Set `CHROME_PATH` if Chrome is not at `/usr/bin/google-chrome`.
