// What the Outline's editing keys act on, worked out from the current item.
import {CATALOG} from '../commands/catalog.js';

/**
 * Where a new block goes, for the item the user is on.
 * @param {?object} node The current outline node, if the program has any.
 * @param {boolean} before Whether to add it before the item rather than after.
 * @returns {object} The position part of an `insert` command; empty for a new script.
 */
const insertPosition = (node, before) => {
    if (!node) return {};
    if (node.type === 'script') {
        return before ? {before: node.children[0].id} : {after: node.lastId};
    }
    if (node.type === 'block') return before ? {before: node.id} : {after: node.id};
    // A branch, or the placeholder in an empty one.
    return {inside: {block: node.blockId, branch: node.branch}};
};

// The command for adding a block there. A block that starts a script always gets a new one.
const insertCommand = (opcode, position) => ({
    op: 'insert',
    block: opcode,
    ...(CATALOG[opcode].shape === 'hat' ? {} : position)
});

// The command that deletes the item, or null if it cannot be deleted by itself.
const deleteCommand = node => {
    if (node?.type === 'block') return {op: 'delete', block: node.id};
    if (node?.type === 'script') return {op: 'delete', block: node.children[0].id, withFollowing: true};
    return null;
};

// A block id that stands for the item.
const blockOf = node => {
    if (!node) return null;
    if (node.type === 'script') return node.children[0].id;
    return node.type === 'block' ? node.id : node.blockId;
};

// The loops and conditions that the wrap key offers.
const WRAPPERS = [
    'control_repeat', 'control_forever', 'control_repeat_until', 'control_if', 'control_if_else'
];

// What the move key picks up on an item: a block, or from a script's heading the whole script.
const pickUp = node => {
    if (node?.type === 'block') return {nodeId: node.id, block: node.id, withFollowing: false};
    if (node?.type === 'script') return {nodeId: node.id, block: node.children[0].id, withFollowing: true};
    return null;
};

// The command that puts down what was picked up, after or before an item, or in a new script.
const moveCommand = (picked, node, {before = false, newScript = false}) => ({
    op: 'move',
    block: picked.block,
    ...(picked.withFollowing ? {withFollowing: true} : {}),
    ...(newScript ? {newScript: true} : insertPosition(node, before))
});

const startsScript = opcode => CATALOG[opcode]?.shape === 'hat' || opcode === 'procedures_definition';

/**
 * The blocks the wrap key would put inside a loop or condition.
 * @param {?object[]} path The nodes from the top of the outline to the current item.
 * @param {boolean} following Whether to take the blocks under the current one too.
 * @returns {?{block: string, through: ?string}} Part of a `wrap` command, or null if there is nothing to wrap.
 */
const wrapRange = (path, following) => {
    const node = path?.[path.length - 1];
    let run;
    if (node?.type === 'script') {
        // All of the script except the block that starts it, which nothing can hold.
        const skip = node.children.length > 1 && startsScript(node.children[0].opcode) ? 1 : 0;
        run = node.children.slice(skip);
    } else if (node?.type === 'block') {
        const stack = path[path.length - 2].children;
        run = following ? stack.slice(stack.indexOf(node)) : [node];
    } else {
        return null;
    }
    const [first] = run;
    const last = run[run.length - 1];
    return {block: first.id, ...(last === first ? {} : {through: last.id})};
};

/**
 * The blocks matching what has been typed, best matches first. Every typed word must appear in the block's
 * name or category.
 * @param {Array<{name: string, category: string}>} entries Blocks to search.
 * @param {string} query What has been typed.
 * @returns {object[]} The matching entries.
 */
const searchBlocks = (entries, query) => {
    const typed = query.trim().toLowerCase();
    if (!typed) return entries;
    const words = typed.split(/\s+/);
    // "seconds" also finds "wait 1 second".
    const has = (text, word) => text.includes(word) ||
        (word.length > 3 && word.endsWith('s') && text.includes(word.slice(0, -1)));
    const rank = entry => {
        const name = entry.name.toLowerCase();
        if (name.startsWith(typed)) return 0;
        if (name.includes(typed)) return 1;
        return words.every(word => has(name, word)) ? 2 : 3;
    };
    return entries
        .filter(entry => {
            const haystack = `${entry.name} ${entry.category}`.toLowerCase();
            return words.every(word => has(haystack, word));
        })
        .map((entry, index) => ({entry, index}))
        .sort((a, b) => (rank(a.entry) - rank(b.entry)) || (a.index - b.index))
        .map(({entry}) => entry);
};

export {
    WRAPPERS,
    blockOf,
    deleteCommand,
    insertCommand,
    insertPosition,
    moveCommand,
    pickUp,
    searchBlocks,
    wrapRange
};
