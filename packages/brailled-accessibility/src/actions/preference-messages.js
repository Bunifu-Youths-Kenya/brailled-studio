import {defineMessages} from 'react-intl';

const preferenceMessages = defineMessages(Object.fromEntries(Object.entries({
    question: 'Do you use a screen reader?',
    questionHint: 'If you answer no, the editor reads its replies aloud. You can change this in Voice settings.',
    yes: 'Yes, I use a screen reader',
    no: 'No, read replies aloud',
    willRead: 'Replies will be read aloud.',
    willNotRead: 'Replies will not be read aloud.',
    keptQuiet: 'The editor will not read replies aloud. Your screen reader says them.',
    noVoice: 'This computer has no built-in voice for reading aloud.',
    title: 'Voice settings',
    talkKey: 'Talk key, held while speaking',
    talkKeyHint: 'On many laptops F2 works only while Fn is held too. Alt+Shift+V needs no Fn.',
    longest: 'Longest time to listen',
    seconds: '{seconds} seconds',
    readAloud: 'Read replies aloud',
    readAloudHint: 'Leave this off if you use a screen reader, or you will hear everything twice.',
    done: 'Done',
    reset: 'Reset for new student',
    resetHint: 'Forgets the talk key, listening time, reading aloud and the screen reader answer.',
    wasReset: 'Settings reset for a new student.'
}).map(([key, defaultMessage]) => [key, {
    id: `brailled.preferences.${key}`,
    defaultMessage,
    description: 'Voice settings and the first question about screen readers'
}])));

export default preferenceMessages;
