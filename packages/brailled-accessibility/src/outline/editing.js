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
    blockOf,
    deleteCommand,
    insertCommand,
    insertPosition,
    searchBlocks
};
