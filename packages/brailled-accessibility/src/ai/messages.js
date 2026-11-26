import {defineMessages} from 'react-intl';

// What the AI helper's part of the editor says.
const aiMessages = defineMessages(Object.fromEntries(Object.entries({
    asking: 'Asking the AI helper.',
    busy: 'Still waiting for the AI helper.',
    failed: 'I couldn\'t work that out, please try again.',
    unreachable: 'The AI helper cannot be reached. Everything else still works.',
    tooMany: 'The AI helper has had too many requests. Wait a minute and try again.',
    tooBig: 'This program is too big to send to the AI helper.',
    notReady: 'The AI helper is not set up on this server.',
    noSprite: 'Select a sprite before asking the AI helper.',
    dismissed: 'Closed. Nothing was changed.',
    sayName: 'Say a name or a number from the list, or say more.',
    questionTitle: 'The AI helper asks',
    answerLabel: 'Your answer',
    answerHint: 'Type an answer, choose one, or hold {key} and say it. Your answer is sent to an online service.',
    answerHintTyped: 'Type an answer or choose one. Your answer is sent to an online service.',
    send: 'Send answer',
    explanationTitle: 'The AI helper says',
    close: 'Close'
}).map(([key, defaultMessage]) => [key, {
    id: `brailled.ai.${key}`,
    defaultMessage,
    description: 'AI helper'
}])));

export default aiMessages;
