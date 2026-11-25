import {defineMessages} from 'react-intl';

const messages = defineMessages({
    heading: {
        id: 'brailled.outline.heading',
        defaultMessage: 'Outline: {name}',
        description: 'Heading of the outline view; name is the sprite or stage'
    },
    hint: {
        id: 'brailled.outline.hint',
        defaultMessage: 'Read only. Move with the arrow keys, Home and End. {shortcut} switches to Blocks.',
        description: 'Instructions for the outline view'
    },
    treeLabel: {
        id: 'brailled.outline.treeLabel',
        defaultMessage: 'Program for {name}',
        description: 'Accessible name of the program tree'
    },
    noBlocks: {
        id: 'brailled.outline.noBlocks',
        defaultMessage: '{name} has no blocks yet.',
        description: 'Shown when a sprite or the stage has no scripts'
    },
    switched: {
        id: 'brailled.outline.switched',
        defaultMessage: 'Outline for {name}: {count, plural, =0 {no scripts} one {# script} other {# scripts}}',
        description: 'Announced when another sprite is selected'
    },
    added: {
        id: 'brailled.outline.added',
        defaultMessage: '{count, plural, one {Block added: {text}} other {# blocks added, starting with {text}}}',
        description: 'Announced when blocks are added'
    },
    removed: {
        id: 'brailled.outline.removed',
        defaultMessage:
            '{count, plural, one {Block removed: {text}} other {# blocks removed, starting with {text}}}',
        description: 'Announced when blocks are removed'
    },
    moved: {
        id: 'brailled.outline.moved',
        defaultMessage: '{count, plural, one {Block moved: {text}} other {# blocks moved, starting with {text}}}',
        description: 'Announced when blocks are moved'
    },
    changed: {
        id: 'brailled.outline.changed',
        defaultMessage:
            '{count, plural, one {Block changed: {text}} other {# blocks changed, starting with {text}}}',
        description: 'Announced when the contents of blocks change'
    }
});

const wordMessages = defineMessages({
    blank: {
        id: 'brailled.outline.blank',
        defaultMessage: 'empty',
        description: 'Spoken for a block slot with nothing in it'
    },
    emptyBranch: {
        id: 'brailled.outline.emptyBranch',
        defaultMessage: 'no blocks inside',
        description: 'Shown inside a loop or condition that holds no blocks'
    },
    then: {
        id: 'brailled.outline.then',
        defaultMessage: 'then',
        description: 'Name of the blocks that run when a condition is true'
    },
    else: {
        id: 'brailled.outline.else',
        defaultMessage: 'else',
        description: 'Name of the blocks that run when a condition is false'
    },
    otherBranch: {
        id: 'brailled.outline.otherBranch',
        defaultMessage: 'part {number}',
        description: 'Name of a further group of blocks inside an extension block'
    },
    script: {
        id: 'brailled.outline.script',
        defaultMessage: 'Script {number} of {total}: {firstSentence}',
        description: 'Name of one stack of blocks'
    },
    greenFlag: {
        id: 'brailled.outline.greenFlag',
        defaultMessage: 'green flag',
        description: 'Spoken for the green flag picture in a block'
    },
    clockwise: {
        id: 'brailled.outline.clockwise',
        defaultMessage: 'clockwise',
        description: 'Spoken for the turn right arrow in a block'
    },
    counterclockwise: {
        id: 'brailled.outline.counterclockwise',
        defaultMessage: 'counterclockwise',
        description: 'Spoken for the turn left arrow in a block'
    }
});

const buildWords = intl => ({
    blank: intl.formatMessage(wordMessages.blank),
    emptyBranch: intl.formatMessage(wordMessages.emptyBranch),
    then: intl.formatMessage(wordMessages.then),
    else: intl.formatMessage(wordMessages.else),
    otherBranch: number => intl.formatMessage(wordMessages.otherBranch, {number}),
    script: (number, total, firstSentence) =>
        intl.formatMessage(wordMessages.script, {number, total, firstSentence}),
    images: {
        event_whenflagclicked: intl.formatMessage(wordMessages.greenFlag),
        motion_turnleft: intl.formatMessage(wordMessages.counterclockwise),
        motion_turnright: intl.formatMessage(wordMessages.clockwise)
    }
});

export {
    buildWords,
    messages
};
