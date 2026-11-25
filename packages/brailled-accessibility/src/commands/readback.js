// The sentences that say what a command did, and the spoken summary of a program.
import {readbacks as text} from './messages.js';
import {branchesOf} from './program.js';

const END_WORDS = {
    control_repeat: 'endRepeat',
    control_repeat_until: 'endRepeat',
    control_forever: 'endForever',
    control_if: 'endIf',
    control_if_else: 'endIf'
};

const placeText = (position, after, name, intl) => {
    if (position.after) return intl.formatMessage(text.after, {block: name(after, position.after)});
    if (position.before) return intl.formatMessage(text.before, {block: name(after, position.before)});
    const {block, branch} = position.inside;
    let message = text.inside;
    if (branchesOf(after.blocks[block].opcode).length > 1) {
        message = branch === 'SUBSTACK2' ? text.insideElse : text.insideThen;
    }
    return intl.formatMessage(message, {block: name(after, block)});
};

/**
 * Say what one command did.
 * @param {object} options Options.
 * @param {object} options.event From the planner.
 * @param {object} options.before The program before the command.
 * @param {object} options.after The program afterwards.
 * @param {function(object, string): string} options.name Names a block of a program.
 * @param {function(object): boolean} options.isInstruction Whether a block is an instruction.
 * @param {object} options.intl A react-intl object.
 * @returns {string} The sentence.
 */
const readBack = ({event, before, after, name, isInstruction, intl}) => {
    const say = (message, values) => intl.formatMessage(message, values);
    switch (event.kind) {
    case 'added': {
        const block = name(after, event.id);
        return Object.keys(event.position).length === 0 ?
            say(text.addedScript, {block}) :
            say(text.added, {block, place: placeText(event.position, after, name, intl)});
    }
    case 'deleted': {
        const block = name(before, event.id);
        const count = event.removed.filter(id => isInstruction(before.blocks[id])).length;
        if (event.following && count > 1) return say(text.deletedStack, {block, count});
        return count > 1 ?
            say(text.deletedHolding, {block, count: count - 1}) :
            say(text.deleted, {block});
    }
    case 'changed':
        return say(text.changed, {block: name(after, event.id), previous: name(before, event.id)});
    case 'moved': {
        const block = name(after, event.id);
        if (event.position.newScript) return say(text.movedScript, {block});
        return say(event.following ? text.movedStack : text.moved,
            {block, place: placeText(event.position, after, name, intl)});
    }
    default: {
        const values = {block: name(before, event.first), holder: name(after, event.id), count: event.count};
        return say(event.count > 1 ? text.wrappedMany : text.wrapped, values);
    }
    }
};

const capitalise = sentence => sentence.charAt(0).toUpperCase() + sentence.slice(1);

/**
 * Summarise scripts as one passage, such as "When green flag clicked: repeat 10: move 10 steps".
 * @param {object[]} scripts Script nodes from the outline.
 * @param {object} intl A react-intl object.
 * @returns {string} The summary.
 */
const summarise = (scripts, intl) => {
    const say = (message, values) => intl.formatMessage(message, values);
    const stack = nodes => nodes.map((node, index) => {
        if (node.type === 'empty') return say(text.summaryNothing);
        if (!node.children) return node.text;
        const [first, second] = node.children[0].type === 'branch' ?
            node.children.map(branch => stack(branch.children)) :
            [stack(node.children)];
        const held = say(text.summaryHolder, {
            block: node.text,
            inner: node.children[0].type === 'branch' ? say(text.summaryElse, {first, second}) : first
        });
        // Say where it stops, if blocks follow it.
        return index < nodes.length - 1 ?
            `${held}, ${say(text[END_WORDS[node.opcode] || 'endOther'])}` :
            held;
    }).join(', ');

    const summaries = scripts.map(script => {
        const [first, ...rest] = script.children;
        const isHat = rest.length > 0 && /^(event_when|control_start_as_clone|procedures_definition)/
            .test(first.opcode);
        return capitalise(isHat ?
            say(text.summaryHat, {hat: first.text, rest: stack(rest)}) :
            stack(script.children));
    });
    if (summaries.length === 1) return `${summaries[0]}.`;
    return summaries
        .map((summary, index) => say(text.summaryScript, {number: index + 1, summary}))
        .join(' ');
};

export {
    readBack,
    summarise
};
