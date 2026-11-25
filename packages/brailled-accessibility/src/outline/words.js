import {nameColour} from './colours.js';

// English wording for the parts of the outline that no block label covers. The view passes translations.
const DEFAULT_WORDS = {
    blank: 'empty',
    // Stands in a block's sentence for the value being edited.
    marker: '(this value)',
    emptyBranch: 'no blocks inside',
    then: 'then',
    else: 'else',
    otherBranch: number => `part ${number}`,
    script: (number, total, firstSentence) => `Script ${number} of ${total}: ${firstSentence}`,
    colour: nameColour,
    // "wait 1 seconds" is how the block is labelled, but not how it is said.
    polish: text => text.replace(/(^| )1 (steps|seconds|degrees|secs)(?= |,|$)/g,
        (match, before, unit) => `${before}1 ${unit.slice(0, -1)}`),
    // Words for the pictures inside some block labels, by opcode.
    images: {
        event_whenflagclicked: 'green flag',
        motion_turnleft: 'counterclockwise',
        motion_turnright: 'clockwise'
    }
};

export default DEFAULT_WORDS;
