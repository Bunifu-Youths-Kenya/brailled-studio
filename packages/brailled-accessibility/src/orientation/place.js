/*
 * Where things are in a program, as the Outline shows it: for summaries, read-backs after edits, "where am I",
 * cues on entering and leaving loops and conditions, and previews of suggestions. Everything here reads the
 * outline's nodes (see `outline/tree.js`) and changes nothing.
 */
import orientationMessages from './messages.js';

// Blocks spoken in a summary before the rest is only counted.
const SUMMARY_LIMIT = 15;
// Blocks on each side of a change in a preview.
const AROUND = 2;

const isBlock = node => node.type === 'block';

// Every block, in reading order.
const blocksOf = nodes => nodes.flatMap(node => [
    ...(isBlock(node) ? [node] : []),
    ...(node.children ? blocksOf(node.children) : [])
]);

// The nodes from a script down to the one with this id, or null.
const pathTo = (nodes, id) => {
    for (const node of nodes) {
        if (node.id === id) return [node];
        const rest = node.children && pathTo(node.children, id);
        if (rest) return [node, ...rest];
    }
    return null;
};

// The blocks that hold the last node of a path, outermost first, each with the branch it is in, if it has several.
const holdersOf = path => path.slice(0, -1).flatMap((node, at) => {
    if (!isBlock(node)) return [];
    const branch = path[at + 1]?.type === 'branch' ? path[at + 1] : null;
    return [{key: branch ? branch.id : node.id, name: branch ? `${node.text}, ${branch.text}` : node.text}];
});

const directBlocks = node => (node.children || []).filter(isBlock);

/**
 * Where a block is: its number among all the sprite's blocks, the block that holds it, and its neighbours.
 * @param {object[]} nodes The outline's script nodes.
 * @param {string} id The block's id.
 * @returns {?object} `{index, total, script, scripts, holder, previous, next}`, or null if it is not a block here.
 */
const placeOf = (nodes, id) => {
    const path = pathTo(nodes, id);
    if (!path || !isBlock(path.at(-1))) return null;
    const all = blocksOf(nodes);
    const siblings = path.at(-2).children.filter(isBlock);
    const at = siblings.findIndex(node => node.id === id);
    return {
        index: all.findIndex(node => node.id === id) + 1,
        total: all.length,
        script: path[0].posinset,
        scripts: nodes.length,
        holder: holdersOf(path).at(-1)?.name ?? null,
        previous: siblings[at - 1]?.text ?? null,
        next: siblings[at + 1]?.text ?? null
    };
};

/**
 * The sentence that says where a block is, at the student's chosen detail.
 * @param {object} options Options.
 * @param {object[]} options.nodes The outline's script nodes.
 * @param {?string} options.id The block's id, or null where no block is in focus, as after a deletion.
 * @param {'brief'|'normal'|'detailed'} options.verbosity How much to say: nothing, the place, or with neighbours.
 * @param {function(object, object): string} options.say Formats a message.
 * @returns {string} The sentence, or empty.
 */
const placeSentence = ({nodes, id, verbosity, say}) => {
    if (verbosity === 'brief') return '';
    const place = id && placeOf(nodes, id);
    // Where nothing is left to point at, as after a deletion, the count says what changed.
    if (!place) return say(orientationMessages.remaining, {count: blocksOf(nodes).length});
    const values = {...place, holder: place.holder ?? 'none'};
    const where = say(place.scripts > 1 ? orientationMessages.placeScript : orientationMessages.place, values);
    if (verbosity !== 'detailed') return where;
    const neighbours = place.previous || place.next ?
        say(orientationMessages.neighbours, {previous: place.previous ?? 'none', next: place.next ?? 'none'}) :
        say(orientationMessages.alone);
    return `${where} ${neighbours}`;
};

/**
 * An ordered summary of the program: how many scripts and blocks, then each block in order, with what each loop
 * or condition holds. Past `limit` blocks the rest is only counted.
 * @param {object[]} nodes The outline's script nodes.
 * @param {function(object, object): string} say Formats a message.
 * @param {object} [options] Options.
 * @param {number} [options.limit] Blocks to name; Infinity names them all.
 * @returns {string} The summary.
 */
const summarize = (nodes, say, {limit = SUMMARY_LIMIT} = {}) => {
    const total = blocksOf(nodes).length;
    if (total === 0) return say(orientationMessages.empty);
    let left = limit;
    let unsaid = 0;
    // A loop or condition and what it holds, and a stack of blocks, each said through the other.
    let stack = null;
    const one = node => {
        if (left <= 0) {
            unsaid += 1 + blocksOf(node.children || []).length;
            return null;
        }
        left -= 1;
        if (!node.children) return node.text;
        if (node.children[0]?.type === 'branch') {
            const parts = node.children.map(branch => {
                const count = directBlocks(branch).length;
                const inner = stack(branch.children || []).join(', ');
                if (!count) return say(orientationMessages.branchEmpty, {label: branch.text});
                return inner ?
                    say(orientationMessages.branch, {label: branch.text, count, inner}) :
                    say(orientationMessages.holdsUnsaid, {block: branch.text, count});
            });
            return say(orientationMessages.branches, {block: node.text, parts: parts.join('; ')});
        }
        const count = directBlocks(node).length;
        const inner = stack(node.children).join(', ');
        if (!count) return say(orientationMessages.holdsNothing, {block: node.text});
        return inner ?
            say(orientationMessages.holds, {block: node.text, count, inner}) :
            say(orientationMessages.holdsUnsaid, {block: node.text, count});
    };
    // Where a loop or condition ends is said where more blocks follow it.
    stack = children => children.filter(isBlock).flatMap((node, at, blocks) => {
        const said = one(node);
        return said && node.children && at < blocks.length - 1 && left > 0 ?
            [`${said}, ${say(orientationMessages.endOf, {block: node.text})}`] :
            [said].filter(Boolean);
    });

    const scripts = nodes.map(script => ({number: script.posinset, blocks: stack(script.children)}))
        .filter(script => script.blocks.length > 0)
        .map(script => say(orientationMessages.script, {number: script.number, blocks: script.blocks.join('; ')}));
    return [
        say(orientationMessages.counts, {scripts: nodes.length, blocks: total}),
        ...scripts,
        unsaid > 0 ? say(orientationMessages.more, {count: unsaid}) : null
    ].filter(Boolean).join(' ');
};

/**
 * What changes in nesting on moving from one item to another: entering or leaving a loop or condition.
 * @param {object[]} nodes The outline's script nodes.
 * @param {?string} fromId The item before.
 * @param {string} toId The item now.
 * @param {function(object, object): string} say Formats a message.
 * @returns {string} The cue, or empty.
 */
const nestingCue = (nodes, fromId, toId, say) => {
    const before = fromId && pathTo(nodes, fromId);
    const after = pathTo(nodes, toId);
    if (!before || !after) return '';
    const left = holdersOf(before);
    const entered = holdersOf(after);
    let same = 0;
    while (same < left.length && same < entered.length && left[same].key === entered[same].key) same += 1;
    const cues = [];
    if (left.length > same) {
        // Innermost first, as they are left.
        const names = left.slice(same).reverse()
            .map(holder => holder.name)
            .reduce((first, second) => say(orientationMessages.and, {first, second}));
        const outer = entered[same - 1];
        cues.push(entered.length > same || !outer ?
            say(orientationMessages.leaving, {holder: names}) :
            say(orientationMessages.leavingTo, {holder: names, outer: outer.name}));
    }
    if (entered.length > same) cues.push(say(orientationMessages.entering, {holder: entered.at(-1).name}));
    return cues.join(' ');
};

// The blocks around one, in its own stack, and the block that holds that stack.
const region = (nodes, id) => {
    const path = pathTo(nodes, id);
    if (!path) return null;
    const siblings = path.at(-2)?.children.filter(isBlock) ?? path[0].children.filter(isBlock);
    const at = Math.max(0, siblings.findIndex(node => node.id === id));
    return {
        holder: holdersOf(path).at(-1)?.name ?? null,
        ids: siblings.map(node => node.id),
        texts: siblings.slice(Math.max(0, at - AROUND), at + AROUND + 1).map(node => node.text)
    };
};

// The same stack in the other program: around the block itself, or around a neighbour that is in both.
const matching = (from, to, id) => {
    if (pathTo(to, id)) return region(to, id);
    const near = region(from, id);
    const kept = near?.ids.find(other => other !== id && pathTo(to, other));
    return kept ? region(to, kept) : null;
};

/**
 * Before and after of the part of the program a suggestion changes, to be said before it is approved.
 * @param {object} options Options.
 * @param {object[]} options.before The outline now.
 * @param {object[]} options.after The outline if it is done.
 * @param {?string} options.id A block it adds, changes, moves or removes.
 * @param {function(object, object): string} options.say Formats a message.
 * @returns {string} The preview, or empty.
 */
const previewOf = ({before, after, id, say}) => {
    if (!id) return '';
    const later = pathTo(after, id) ? region(after, id) : matching(before, after, id);
    const now = pathTo(before, id) ? region(before, id) : matching(after, before, id);
    if (!later && !now) return '';
    const list = part => (part?.texts.length ? part.texts.join(', ') : say(orientationMessages.previewNothing));
    const holder = (later ?? now).holder;
    return [
        holder ?
            say(orientationMessages.previewIn, {holder, blocks: list(now)}) :
            say(orientationMessages.previewNow, {blocks: list(now)}),
        say(orientationMessages.previewAfter, {blocks: list(later)})
    ].join(' ');
};

export {
    SUMMARY_LIMIT,
    blocksOf,
    nestingCue,
    pathTo,
    placeOf,
    placeSentence,
    previewOf,
    summarize
};
