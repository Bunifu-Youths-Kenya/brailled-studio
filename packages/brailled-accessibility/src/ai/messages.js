import {defineMessages} from 'react-intl';

// What the AI helper's part of the editor says.
const aiMessages = defineMessages(Object.fromEntries(Object.entries({
    asking: 'Asking {assistant}.',
    busy: 'Still waiting for {assistant}.',
    failed: 'I couldn\'t work that out, please try again.',
    unreachable: '{assistant} cannot be reached. Everything else still works.',
    tooMany: '{assistant} has had too many requests. Wait a minute and try again.',
    tooBig: 'This program is too big to send to {assistant}.',
    notReady: '{assistant} is not set up on this server.',
    noSprite: 'Select a sprite before asking {assistant}.',
    dismissed: 'Closed. Nothing was changed.',
    sayName: 'Say a name or a number from the list, or say more.',
    questionTitle: '{assistant} asks',
    answerLabel: 'Your answer',
    answerHint: 'Type an answer, choose one, or hold {key} and say it. Your answer is sent to an online service.',
    answerHintTyped: 'Type an answer or choose one. Your answer is sent to an online service.',
    send: 'Send answer',
    explanationTitle: '{assistant} says',
    close: 'Close'
}).map(([key, defaultMessage]) => [key, {
    id: `brailled.ai.${key}`,
    defaultMessage,
    description: 'AI helper'
}])));

export default aiMessages;
