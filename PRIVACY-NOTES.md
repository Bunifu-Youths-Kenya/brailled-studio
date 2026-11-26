# Privacy notes for Brailled

What the Brailled additions do with students' information. This describes the code as it is, is not legal advice,
and is not yet a privacy policy.

## Voice input

Voice is optional: everything can be done from the keyboard.

| Question | Answer |
| - | - |
| Who turns speech into text? | The browser's Web Speech API |
| Where does the sound go? | Chrome sends it to Google's servers ([MDN](https://developer.mozilla.org/docs/Web/API/SpeechRecognition)). Other browsers may use their maker's service or the device |
| When is the microphone open? | Only while the talk key or button is held, or for one phrase after a tap, for at most 60 seconds (15 unless changed) |
| What does Brailled receive? | The words, and how sure the service is |
| What does Brailled keep or send? | The words are shown on screen until replaced and are not stored. If an AI helper is set up, words that are not commands are sent to it (see below). The sound is not sent by Brailled |

What Google or another provider keeps, for how long and for what purpose is set by that provider. It has not
been reviewed for Brailled.

## Turning voice off

Whoever runs the editor can turn voice off entirely by editing
`static/brailled-config.json` where the editor is served (in this repository,
`packages/scratch-gui/static/brailled-config.json`):

```json
{
    "voice": false
}
```

The change applies the next time the editor is opened; nothing needs rebuilding.

| With voice off | |
| - | - |
| Microphone input | Never opened, by key, button or command |
| Reading aloud, and the screen reader question | Off |
| The voice bar | Says "Voice is turned off for this editor", with no talk key or settings |
| Everything else, including the keyboard, typed commands and screen reader announcements | Works as before |

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
Voice settings repeat it. The browser also asks before first using the microphone.

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
student wrote, is not sent to an online voice.

## Stored in the browser

Under `brailled.settings` in local storage: the talk key, the longest listening time, whether to read aloud, and
the answer to "Do you use a screen reader?". The answer can suggest that a student has a disability. It stays in
that browser and Brailled does not send it.

On a shared computer, **Reset for new student** in Voice settings removes all four and asks the question again.
Without it the next person gets the same settings. Reset does not close the project, clear what the voice bar
last showed, or withdraw the browser's microphone permission; reload the page, and change the permission in the
browser if needed. Clearing the site's data also removes the settings.

## AI helper

Off unless whoever runs the editor sets `aiEndpoint` in `static/brailled-config.json` to the address of a
[Brailled AI server](packages/brailled-ai-server/README.md). Without it nothing is sent to an AI.

**What is sent, and when.** Only when a student says or types something that is not one of the editor's own
commands, or answers the helper's question:

| Sent | Can contain personal information? |
| - | - |
| What the student said or typed (at most 500 characters), and the question it answers | Yes, whatever they say |
| The selected sprite's program, as text | Yes: text students write in blocks |
| Names of sprites, variables, lists and messages; the project's blocks by kind | Yes, if students put names in them |
| Where the student is: view, focused control, place in the program, device mode, running state, language | Little |
| The editor's list of blocks and actions | No |

Not sent: sound, pictures, costumes, screenshots, the page itself, the project file, the project's title, or the
answer to the screen reader question. The programs of other sprites are not sent.

**Where it goes.** Editor → your AI server → [OpenRouter](https://openrouter.ai/) → the company running the
chosen model. The server keeps and logs none of it, only whether a request worked and how long it took. By
default it asks OpenRouter to use only providers that do not collect data (`data_collection: "deny"`) and
endpoints with zero data retention (`zdr`). Those are OpenRouter's settings and the providers' promises, which
Brailled cannot check. Read the terms of OpenRouter and of the model's provider.

**Control.** Nothing the AI replies with is carried out. Its suggestions are checked by the editor and only
described.

**Notice and consent.** The voice bar says that AI requests send the student's words and program to an AI
service, and the command box says where other requests go. What is in
[Notice and consent](#notice-and-consent) applies to the AI helper too: tell students and families, get consent
for children, and ask students not to include names or personal details. Turning voice off does not turn off the
AI helper; remove `aiEndpoint` for that.

## The rest of the editor

The editor Brailled is built from loads library pictures and sounds from Scratch's servers, and some of its
extensions, such as Text to Speech and Translate, send what a project gives them to online services. Those have
not been reviewed for Brailled.
