import {defineMessages} from 'react-intl';

const fromTexts = (prefix, description, texts) => defineMessages(Object.fromEntries(
    Object.entries(texts).map(([key, defaultMessage]) =>
        [key, {id: `${prefix}.${key}`, defaultMessage, description}])
));

const TYPE_INSTEAD = 'You can type commands instead, with Alt+Shift+K.';

// What the voice bar shows and says.
const voiceMessages = fromTexts('brailled.voice', 'Voice input', {
    region: 'Voice',
    button: 'Hold to talk',
    buttonListening: 'Listening',
    words: 'What was heard, and the reply',
    nothingHeard: 'Nothing heard yet.',
    heard: 'I heard: {text}.',
    ready: 'Hold {key}, or this button, to talk to {assistant}.',
    privacy: 'Privacy: when you use voice, your browser may send the sound of your speech to an online ' +
        'service. Chrome sends it to Google.',
    aiNotice: '{assistant} (AI) is on: text you type for it, and your program, are sent to an online service.',
    aiNoticeWithVoice: '{assistant} (AI) is on: text you type or say to it, and your program, are sent to an online ' +
        'service. Chrome sends speech to Google.',
    settings: 'Voice settings',
    mode: '{assistant}: {mode, select, guide {Guide mode} other {Build mode}}',
    starting: 'Opening the microphone.',
    listeningHold: 'Listening. Let go when you have finished.',
    listeningTap: 'Listening. Speak now.',
    working: 'Working out what you said.',
    cancelled: 'Stopped listening. Nothing was done.',
    tooShort: 'Hold {key} down while you speak, then let go.',
    notOpen: 'The microphone was not open yet. If your browser asks to use it, allow that, then try again.',
    interrupted: 'Stopped listening because you left the window. Nothing was done.',
    unsupported: `This browser cannot turn speech into text. ${TYPE_INSTEAD}`,
    checking: 'Checking whether voice can be used.',
    turnedOff: `Voice is turned off for this editor. ${TYPE_INSTEAD} Everything else works as usual.`,
    configUnreadable: `Voice is off because the editor's configuration could not be read. ${TYPE_INSTEAD}`,
    buttonOff: 'Voice is off',
    denied: `The microphone is blocked. Allow it in your browser settings. ${TYPE_INSTEAD}`,
    noMicrophone: `No microphone was found. ${TYPE_INSTEAD}`,
    noSpeech: 'I did not hear anything. Hold {key} and try again.',
    network: `The speech service cannot be reached. Check the internet connection. ${TYPE_INSTEAD}`,
    language: `Your browser cannot understand speech in this language. ${TYPE_INSTEAD}`,
    failed: `Speech recognition failed. Try again. ${TYPE_INSTEAD}`,
    confirmTitle: 'I heard: {text}. I am not sure. Should I go ahead?',
    confirmHint: 'Say yes or no while holding {key}, or choose a button.',
    sayYesOrNo: 'I heard: {text}. Say yes or no, or choose a button.',
    yes: 'Yes, go ahead',
    no: 'No',
    notDone: 'Nothing was done.'
});

export default voiceMessages;
