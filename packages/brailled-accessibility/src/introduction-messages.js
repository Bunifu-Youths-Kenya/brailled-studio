import {defineMessages} from 'react-intl';

// How the assistant introduces itself. Kept short: read aloud, the longest takes under 20 seconds.
const introductionMessages = defineMessages(Object.fromEntries(Object.entries({
    hello: 'Hello.',
    helloName: 'Hello {student}.',
    who: 'I am {assistant}, your coding helper.',
    whoShort: 'I am {assistant}.',
    can: 'I can {list}.',
    where: 'tell you where you are',
    blocks: 'find blocks',
    build: 'build with you',
    guide: 'guide you',
    explain: 'explain ideas',
    fix: 'fix mistakes',
    read: 'read your program',
    run: 'run it',
    asksEvery: 'Nothing changes unless you say yes.',
    asksBig: 'I ask you before big changes.',
    talk: 'Hold {key} to talk to me.',
    type: 'Press {key} to type to me.'
}).map(([key, defaultMessage]) => [key, {
    id: `brailled.introduction.${key}`,
    defaultMessage,
    description: 'The assistant introducing itself'
}])));

export default introductionMessages;
