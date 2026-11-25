import {defineMessages} from 'react-intl';

import {nameColour, NAMED_COLOURS} from './colours.js';
import DEFAULT_WORDS from './words.js';

const messages = defineMessages({
    heading: {
        id: 'brailled.outline.heading',
        defaultMessage: 'Outline: {name}',
        description: 'Heading of the outline view; name is the sprite or stage'
    },
    hint: {
        id: 'brailled.outline.hint',
        defaultMessage: 'Arrow keys move. I adds a block after this one, Shift+I before. Enter edits values. ' +
            'Delete removes. D reads the program. Control+Z undoes, Control+Y redoes. {shortcut} switches to Blocks.',
        description: 'Instructions for the outline view'
    },
    treeLabel: {
        id: 'brailled.outline.treeLabel',
        defaultMessage: 'Program for {name}',
        description: 'Accessible name of the program tree'
    },
    noBlocks: {
        id: 'brailled.outline.noBlocks',
        defaultMessage: '{name} has no blocks yet. Press I to add one.',
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
    marker: {
        id: 'brailled.outline.marker',
        defaultMessage: '(this value)',
        description: 'Stands in a block sentence for the value being edited'
    },
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

const colourMessages = defineMessages(Object.fromEntries(Object.keys(NAMED_COLOURS).map(name => [name, {
    id: `brailled.colour.${name.replace(' ', '_')}`,
    defaultMessage: name,
    description: 'Name of a colour'
}])));

const fromTexts = (prefix, description, texts) => defineMessages(Object.fromEntries(
    Object.entries(texts).map(([key, defaultMessage]) =>
        [key, {id: `${prefix}.${key}`, defaultMessage, description}])
));

const dialogMessages = fromTexts('brailled.edit', 'Text of the outline editing dialogs and keys', {
    addNew: 'Add a block to a new script',
    addAfter: 'Add a block after {block}',
    addBefore: 'Add a block before {block}',
    addInside: 'Add a block inside {block}',
    addValue: 'Choose a block for {label}',
    search: 'Search blocks',
    list: 'Blocks',
    count: '{count, plural, =0 {No blocks match} one {# block} other {# blocks}}',
    edit: 'Edit {block}',
    save: 'Save',
    cancel: 'Cancel',
    emptySlot: 'Empty',
    useBlock: 'Use a block',
    useBlockFor: 'Use a block for {label}',
    chooseCondition: 'Choose a condition',
    chooseConditionFor: 'Choose a condition for {label}',
    removeBlock: 'Remove block',
    removeBlockNamed: 'Remove block {block}',
    noChange: 'No change.',
    noValues: 'This block has no values to edit.',
    valuesUnsupported: 'The values of this block cannot be edited here yet.',
    chooseBlockToDelete: 'Choose a block or a script to delete.'
});

const categoryMessages = fromTexts('brailled.category', 'Name of a group of blocks', {
    motion: 'Motion',
    looks: 'Looks',
    sound: 'Sound',
    event: 'Events',
    control: 'Control',
    sensing: 'Sensing',
    operator: 'Operators',
    data: 'Variables'
});

const buildWords = intl => ({
    colour: hex => intl.formatMessage(colourMessages[nameColour(hex)]),
    // The singular form is only known for English.
    polish: intl.locale.startsWith('en') ? DEFAULT_WORDS.polish : text => text,
    blank: intl.formatMessage(wordMessages.blank),
    marker: intl.formatMessage(wordMessages.marker),
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
    categoryMessages,
    colourMessages,
    dialogMessages,
    messages
};
