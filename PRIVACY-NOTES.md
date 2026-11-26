# Privacy notes for Brailled

What the Brailled additions do with students' information. This describes the code as it is, is not legal advice,
and is not yet a privacy policy.

## Voice input

Voice is optional: everything can be done from the keyboard.

| Question | Answer |
| - | - |
| Who turns speech into text? | The browser's Web Speech API |
| Where does the sound go? | Chrome sends it to Google's servers ([MDN](https://developer.mozilla.org/docs/Web/API/SpeechRecognition)). Other browsers may use their maker's service or the device |
| When is the microphone open? | While the talk key or button is held, or for one phrase after a tap, for at most 60 seconds (15 unless changed). With the [wake word](#wake-word-demo-mode) turned on, all the time that it is listening |
| What does Brailled receive? | The words, and how sure the service is |
| What does Brailled keep or send? | The words stay in memory, on screen until replaced, and are not stored. If the AI helper is on, words that are not commands are sent to it (see below). See [Audio and transcripts](#audio-and-transcripts) |

What Google or another provider keeps, for how long and for what purpose is set by that provider. It has not
been reviewed for Brailled.

## What leaves the device

| When | What is sent | To |
| - | - | - |
| Voice is on and a student talks | The sound of their speech | The browser's speech service (Chrome: Google) |
| [Online voice](#online-voice-gemini-pair-openai-audio) is chosen and a student talks | A recording of their speech | Your AI server, OpenRouter and the model's provider |
| The AI helper is on and a student **types or says** something that is not an editor command, or answers the helper | That text, with the program and the other items listed under [AI helper](#ai-helper) | Your AI server, OpenRouter and the model's provider |

**Typed text leaves the device too**, not only speech. Editor commands, such as "where am I" or "undo", are worked
out in the browser and sent nowhere, apart from the sound of saying them when voice is used.

Voice and the AI helper are separate switches in `static/brailled-config.json`:

```json
{
    "voice": true,
    "assistantName": "Mboni",
    "wakeWord": {"enabled": false},
    "ai": false,
    "aiEndpoint": "",
    "approval": "every time",
    "proposalExpirySeconds": 120
}
```

`ai` is `false` unless set to `true`, and the helper also needs `aiEndpoint`. `approval` and
`proposalExpirySeconds` decide [what the helper's suggestions need](#ai-helper). While it is on, the bar at the
bottom of the editor shows "AI helper is on: text you type or say to it, and your program, are sent to an online
service" (without "or say" where voice is off), and the command box and the helper's questions say the same.

## Online voice (`gemini-pair`, `openai-audio`)

Off unless the school sets `voice.provider` in `brailled-config.json` and the AI helper is on. Then, in place of the
browser's speech recognition, **the editor records the student's voice and sends the recording** to your AI server,
which sends it through OpenRouter to the model that hears it (`google/gemini-3.5-flash-lite` unless changed) and
that model's provider.

| Question | Answer |
| - | - |
| When is it recorded? | Only for a request: after the talk key, the button or the wake words, until a pause, the key is let go or pressed again, or the longest time (30 seconds unless changed). Never continuously |
| What shows it? | A red "Recording" sign, a tone at the start and end, and the notice "When you talk, a recording of your voice goes to OpenRouter and an AI model" |
| What else is sent? | With a request, the same as for [typed words](#ai-helper): the program, names and recent conversation. **While something waits for a yes or no, only the recording** |
| Is a recording sent if nobody spoke? | No |
| Is the audio stored or logged? | No: not by the editor or the server. It is held in memory until sent. What OpenRouter and the provider keep follows their terms and your settings; with zero data retention on, only providers listed as keeping nothing are used. OpenRouter says it screens all requests for child sexual abuse material and may keep what it flags |
| If no such provider is available | The editor says so and uses the browser's speech recognition instead, **which sends speech to the browser's service (Chrome: Google) and is not covered by that setting** |
| Who decides yes or no? | The editor, by matching the words. The model's opinion is ignored |

With `"doneWord": true` the browser's speech recognition also runs while recording, to hear "done", so the sound
goes to its service too. With the wake word on, its demo mode sends the room's sound to that service as described
below.

A recording of a child's voice is personal data, and voices can identify people. Do what is listed under
[Notice and consent](#notice-and-consent), naming OpenRouter and the model's provider.

## Wake word (demo mode)

Calling the assistant by saying "Hey Mboni" is off unless the school allows it (`"wakeWord": {"enabled": true}`)
**and** a student turns it on, with F4 or in Voice settings. It is off again after a reload and after "Reset for new
student", and the choice is not stored.

**While it listens, the sound around the computer goes to the browser's speech service the whole time** (Chrome:
Google), not only what is said to the assistant. That includes other students, teachers and anyone else nearby.

| Question | Answer |
| - | - |
| When does it listen? | While it is on and the editor is on screen. It pauses when the page is hidden, while the editor reads aloud and while a request is being taken |
| What happens to what it hears? | A phrase that does not start with the wake words is dropped by the editor: not shown, kept, logged or sent on by Brailled. What the speech service keeps is up to its provider |
| What shows that it is on? | A red "Listening for Hey Mboni" sign in the voice bar, with a Stop button, and the notice "Demo mode: while this is on, the sound around you goes to your browser's speech service (Chrome: Google)" |
| How is it stopped? | F4, the Stop button, saying or typing "stop listening", or turning it off in Voice settings |
| What can it do? | Take one request. It never approves a suggestion or answers a question the editor asks. A request that changes the project or runs it needs a yes by the talk key or a button |

An engine that listens for the wake words on the device, sending nothing until called, is not built in; the code has
a place for one (`src/wake/device-engine.js`).

**Before using it with students,** do what is listed under [Notice and consent](#notice-and-consent), and also
consider everyone else within earshot, who has agreed to nothing. It is meant for demonstrations.

## Turning voice off

Whoever runs the editor can turn voice off entirely by editing
`static/brailled-config.json` where the editor is served (in this repository,
`packages/scratch-gui/static/brailled-config.json`):

```json
{
    "voice": false
}
```

The change applies the next time the editor is opened; nothing needs rebuilding. `ai` and `aiEndpoint` stay as
they are.

| With voice off | |
| - | - |
| Microphone input | Never opened, by key, button or command |
| Reading aloud, and the screen reader question | Off |
| The voice bar | Says "Voice is turned off for this editor", with no talk key or settings |
| Everything else, including the keyboard, typed commands and screen reader announcements | Works as before |
| The AI helper | Not affected: it has its own switch, `ai` |

Voice is on only if the file can be read and says exactly `true`. If it is missing, unreadable or says anything
else, voice is off and the bar says so. Copy the file with any deployment that should have voice.

**Limits of this switch.**

- It is a setting of the editor, not a security control: someone able to alter what the browser runs could undo
  it. A server can block the microphone for the whole page with the header `Permissions-Policy: microphone=()`.
- It covers Brailled's voice features. The editor's own microphone features, the sound recorder and the
  "loudness" block, and the Text to Speech extension, are not affected. The header above also stops the first
  two.

## Notice and consent

**In the editor.** The voice bar always shows: "Privacy: when you use voice, your browser may send the sound of
your speech to an online service. Chrome sends it to Google." Screen readers read it with the talk button, and
Voice settings repeat it. The browser also asks before first using the microphone. While the wake word is on, the
demo mode notice takes its place.

**Not in the editor.** Brailled does not ask for, record or enforce consent. A school that cannot arrange it can
turn voice off, as above.

**Before students use voice,** whoever offers Brailled to them should:

1. Tell students, and their parents or guardians, that speech is sent to an online service, and which one.
2. Get consent from a parent or guardian for children. Law firm summaries say section 33 of Kenya's
   [Data Protection Act, 2019](https://new.kenyalaw.org/akn/ke/act/2019/24/eng%402022-12-31/source.pdf) requires
   it before a child's personal data is processed. Check the official text and the regulator's
   [guidance on children's data](https://www.odpc.go.ke/wp-content/uploads/2025/11/ODPC-%E2%80%93-Guidance-Note-for-Processing-Childrens-Data.pdf),
   and the law wherever else students are.
3. Offer the keyboard as an equal alternative, with no disadvantage for those who do not use voice.
4. Ask students not to say names or other personal details.

## Changing the speech provider

The provider is one function, `createSpeechProvider` in
`packages/brailled-accessibility/src/voice/provider.js`; the interface is described at the top of that file.
Before swapping it:

- [ ] Where is the sound processed, and in which country? Is on-device recognition possible? (Browsers are adding
      an on-device option, `processLocally`, which was experimental when this was written.)
- [ ] How long are the sound and the text kept, and are they used to train models?
- [ ] Is there an agreement that covers children's data?
- [ ] Does any key or token stay off the student's device?
- [ ] Update the notice (`privacy` in `src/voice/messages.js`), this file and the consent given to families.

## Reading aloud

Only voices the browser reports as on the device (`localService`) are used, so that text, which can include what a
student wrote or their name, is not sent to an online voice.

## Stored in the browser

Under `brailled.settings` in local storage: the talk key, the longest listening time, whether to read aloud, how
much the assistant says when introducing itself, the student's first name if they typed one, and the answer to "Do
you use a screen reader?". The name is personal data, and the answer can suggest that a student has a disability.
They stay in that browser and Brailled does not send them, to the AI helper or anywhere else. The name is only
used to greet the student; a screen reader or the device's voice says it. If a student says or types their name
to the helper as part of a request, that request is sent like any other.

Under `brailled.introduced` in session storage, until the browser session ends: that the assistant has introduced
itself.

On a shared computer, **Reset for new student** in the settings removes them all and asks the question again.
Without it the next person gets the same settings. Reset does not close the project, clear what the voice bar
last showed, or withdraw the browser's microphone permission; reload the page, and change the permission in the
browser if needed. Clearing the site's data also removes the settings.

## AI helper

Off unless whoever runs the editor sets `"ai": true` and `aiEndpoint`, the address of a
[Brailled AI server](packages/brailled-ai-server/README.md), in `static/brailled-config.json`. Otherwise nothing is
sent to an AI.

**What is sent, and when.** Only when a student says or types something that is not one of the editor's own
commands, answers the helper's question, or asks for a suggestion to be changed:

| Sent | Can contain personal information? |
| - | - |
| What the student said or typed (at most 500 characters) | Yes, whatever they say |
| The helper's question being answered, or its suggestion being changed | Possibly |
| The recent conversation: up to 12 turns of what the student said, what the helper answered and what the editor did | Yes: it repeats earlier words and block text |
| Whether the helper is building or guiding | No |
| The selected sprite's program, as text | Yes: text students write in blocks |
| Names of sprites, costumes, sounds, backdrops, variables, lists and messages | Yes, if students put names in them |
| The context snapshot: view, focused control, selected sprite, place in the program, device mode, running state | Possibly, as it quotes block text and names |
| The editor's language, list of blocks and actions, and kinds of sprite in the library | No |

The program and the names go beyond the context snapshot: without them the helper cannot say where a block should
go. The programs of other sprites are not sent.

**Not sent:** sound or recordings, pictures, costume or sound files, screenshots, the page itself, the project
file, the project's title, code comments, any account or user name, the settings, or the answer to the screen
reader question. Brailled adds no identifier for the student. Like any web request, it shows the server and its
proxy the computer's network address, which the server keeps in memory for up to a day to limit requests and does
not log.

**Where it goes.** Editor → your AI server → [OpenRouter](https://openrouter.ai/) → the company running the
chosen model. To answer one request the server may call the model several times, as it looks things up; each call
includes the request and what was looked up. The server keeps and logs nothing students wrote, only whether a
request worked, how long it took, how many calls it made and which tools were used.
By default it asks OpenRouter to use only providers that do not collect data (`data_collection: "deny"`) and
endpoints with zero data retention (`zdr`). Those are OpenRouter's settings and the providers' promises, which
Brailled cannot check. Read the terms of OpenRouter and of the model's provider.

**Control.** The helper can only suggest. The editor checks each suggestion and asks the student before changing
anything. A school can set `"approval": "big changes only"` in the configuration file, so that small changes that
"undo" can take back are made without asking; students cannot choose this. Every change is announced with how to
take it back. A suggestion left unanswered is cancelled after `proposalExpirySeconds`. Deleting a sprite, uploading to
a device and running a robot do not exist yet, and must always require approval when they are added. Names and block
text are marked as untrusted data in what the model is told.

**Notice and consent.** The notices under [What leaves the device](#what-leaves-the-device) are shown whenever the
helper is on. What is in
[Notice and consent](#notice-and-consent) applies to the AI helper too: tell students and families, get consent
for children, and ask students not to include names or personal details. To turn the helper off, set `"ai": false`.

## Audio and transcripts

| | |
| - | - |
| Audio | Brailled does not record, store or upload audio. Its code only starts and stops the browser's speech recognition, which in Chrome **does upload the sound to Google** |
| Transcripts (what was heard) and typed requests | Kept in memory only: shown until replaced, and gone when the page is closed. There is no setting that saves them |
| Suggestions and the helper's replies | In memory only |
| The recent conversation | In memory only: cleared by reloading, "forget our conversation" and "Reset for new student" |
| The project | Saved only when the student saves it, as before |

A browser can keep things of its own, such as the console, where the editor writes why a reply was refused (which
can quote a block). If a setting to save transcripts is ever added, it must be off by default, cleared by "Reset
for new student", and described here.

## The rest of the editor

The editor Brailled is built from loads library pictures and sounds from Scratch's servers, and some of its
extensions, such as Text to Speech and Translate, send what a project gives them to online services. Those have
not been reviewed for Brailled.
