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
| What does Brailled keep or send? | The words are shown on screen until replaced. Brailled's own code does not store or send them, or the sound |

What Google or another provider keeps, for how long and for what purpose is set by that provider. It has not
been reviewed for Brailled.

## Notice and consent

**In the editor.** The voice bar always shows: "Privacy: when you use voice, your browser may send the sound of
your speech to an online service. Chrome sends it to Google." Screen readers read it with the talk button, and
Voice settings repeat it. The browser also asks before first using the microphone.

**Not in the editor.** Brailled does not ask for, record or enforce consent, and has no switch for a school to
turn voice off.

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
that browser and Brailled does not send it. On a shared computer the next person gets the same settings. Clearing
the site's data removes them.

## AI helper

There is none yet, and nothing is sent to an AI. When one is added, this file must say what it receives. The
context snapshot holds sprite names and block text, which students write.

## The rest of the editor

The editor Brailled is built from loads library pictures and sounds from Scratch's servers, and some of its
extensions, such as Text to Speech and Translate, send what a project gives them to online services. Those have
not been reviewed for Brailled.
