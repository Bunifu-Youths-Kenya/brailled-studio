import {defineMessages} from 'react-intl';

// What the editor says to keep the student oriented in their program.
const orientationMessages = defineMessages(Object.fromEntries(Object.entries({
    empty: 'This sprite has no blocks yet.',
    counts: '{scripts, plural, one {One script} other {# scripts}}, ' +
        '{blocks, plural, one {one block} other {# blocks}}.',
    script: 'Script {number}: {blocks}.',
    holds: '{block}, which holds {count, plural, =0 {nothing} one {one block} other {# blocks}}: {inner}',
    holdsNothing: '{block}, which holds nothing',
    holdsUnsaid: '{block}, which holds {count, plural, one {one block} other {# blocks}}',
    endOf: 'end of {block}',
    branches: '{block}: {parts}',
    branch: '{label}, {count, plural, one {one block} other {# blocks}}: {inner}',
    branchEmpty: '{label}: nothing',
    more: 'And {count, plural, one {one more block} other {# more blocks}}. Say more detail to hear everything.',
    place: 'Block {index} of {total}{holder, select, none {} other {, inside {holder}}}.',
    placeScript: 'Block {index} of {total}, in script {script} of {scripts}' +
        '{holder, select, none {} other {, inside {holder}}}.',
    neighbours: '{previous, select, none {First} other {After {previous}}}' +
        '{next, select, none {, and last.} other {, before {next}.}}',
    alone: 'It is the only block there.',
    remaining: '{count, plural, =0 {No blocks left.} one {One block now.} other {# blocks now.}}',
    entering: 'Inside {holder}.',
    leaving: 'Out of {holder}.',
    and: '{first} and {second}',
    leavingTo: 'Out of {holder}, back in {outer}.',
    previewNow: 'Now: {blocks}.',
    previewAfter: 'After: {blocks}.',
    previewIn: 'Inside {holder}, now: {blocks}.',
    previewNothing: 'nothing',
    verbosity: 'Replies are {level, select, brief {brief} detailed {detailed} other {normal}}.',
    slower: 'Speaking slower.',
    faster: 'Speaking faster.',
    slowest: 'This is the slowest speed.',
    fastest: 'This is the fastest speed.',
    nothingToRepeat: 'There is nothing to repeat yet.',
    narrateStart: 'Running, and telling you each step. Escape stops it.',
    narrateEnd: 'The program has finished.',
    narrateStopped: 'Stopped.',
    narrateNothing: 'There is nothing to run here yet.',
    narrateAgain: '{block}, again'
}).map(([key, defaultMessage]) => [key, {
    id: `brailled.orientation.${key}`,
    defaultMessage,
    description: 'What the editor says to keep the student oriented in their program'
}])));

export default orientationMessages;
