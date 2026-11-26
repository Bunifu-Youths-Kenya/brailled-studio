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
    studentName: 'Your first name, if you want to be greeted by it',
    studentNameHint: 'Kept in this browser. It is not sent to the AI helper.',
    introduction: 'Introduction, the first time you call the helper',
    introductionChoice: '{length, select, short {Short} off {Off} other {Full}}',
    wake: 'Listen for “Hey {assistant}” without pressing a key (demo mode)',
    wakeHint: 'While this is on, the sound around you goes to your browser’s speech service (Chrome: Google). ' +
        'F4 turns it on and off, and it is off again after the page is reloaded.',
    onlineReadbacks: 'Use the online voice for read-backs too',
    onlineReadbacksHint: 'Sends what is read, which can include your program, to the online voice.',
    done: 'Done',
    reset: 'Reset for new student',
    resetHint: 'Forgets your name, the talk key, listening time, reading aloud, the introduction choice, the ' +
        'screen reader answer and the conversation.',
    wasReset: 'Settings reset for a new student.'
}).map(([key, defaultMessage]) => [key, {
    id: `brailled.preferences.${key}`,
    defaultMessage,
    description: 'Voice settings and the first question about screen readers'
}])));

export default preferenceMessages;
