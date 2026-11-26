import {defineMessages} from 'react-intl';

// What the approval gate shows and says.
const proposalMessages = defineMessages(Object.fromEntries(Object.entries({
    title: 'The AI helper suggests a change. Approve it?',
    titleMany: 'The AI helper suggests {count} steps. Approve them?',
    titleStep: 'Step {number} of {count}. Approve it?',
    warning: 'Warning: this is hard to undo. Nothing happens unless you say yes.',
    hardToUndo: 'hard to undo',
    summary: 'The AI says: {summary}',
    howToAnswer: 'Say yes or go ahead, say no, or say change it, and what to change.',
    howToAnswerMany: 'Say yes to do all the steps, step by step to approve each one, no, or change it, and what ' +
        'to change.',
    timeLimit: 'If there is no answer in two minutes, it is cancelled.',
    yes: 'Yes, go ahead',
    yesAll: 'Yes, do all',
    yesStep: 'Yes, do this step',
    yesRest: 'Yes, do all the rest',
    steps: 'One step at a time',
    no: 'No',
    noStop: 'No, stop here',
    changeLabel: 'Or say what to change',
    changeSend: 'Send change',
    sayChange: 'Say or type what to change.',
    notAnswer: 'I heard: {text}. Say yes, no, or change it, and what to change.',
    addSprite: 'Add the {name} sprite and select it',
    spriteAdded: 'Added the {name} sprite and selected it',
    noSprite: 'The sprite {name} could not be found',
    spriteFailed: 'The sprite {name} could not be loaded',
    useAction: 'Use the action "{name}"',
    usedAction: 'Used the action "{name}"',
    actionGone: 'That action cannot be used now',
    unexpected: 'Something went wrong',
    nothingWaiting: 'There is no suggestion waiting for an answer.',
    done: 'Done',
    failed: 'Not all of it was done. {reason}',
    undoHint: 'To take it back, say undo{count, plural, one {} other { # times}}',
    rejected: 'Rejected. Nothing was changed.',
    stopped: 'Stopped. The earlier steps stay. To take them back, say undo{count, plural, one {} ' +
        'other { # times}}.',
    expired: 'The suggestion expired. Nothing more was changed. Ask again if you want it.',
    stale: 'The program or your place changed, so the suggestion was cancelled. Ask again if you want it.',
    revising: 'Asking for that change.',
    changedBlocks: 'Changed blocks are outlined.'
}).map(([key, defaultMessage]) => [key, {
    id: `brailled.proposal.${key}`,
    defaultMessage,
    description: 'Approving a suggestion from the AI helper'
}])));

export default proposalMessages;
