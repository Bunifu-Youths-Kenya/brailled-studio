// Works out which blocks were added, removed, changed or moved between two outlines.

// Block nodes in reading order, each with the block and nested stack that contain it.
const listBlocks = (nodes, container = '', outer = null) => nodes.flatMap(node => {
    if (node.type === 'block') {
        const entry = {node, container, outer};
        return [entry, ...(node.children ? listBlocks(node.children, node.id, node.id) : [])];
    }
    // A branch is part of its block's identity; a script is only a grouping.
    const inner = node.type === 'branch' ? node.id : container;
    return node.children ? listBlocks(node.children, inner, outer) : [];
});

// The most ids that appear in the same order in both lists. Both hold the same unique ids, so this is the
// longest increasing run of old positions in the new order, found in O(n log n).
const commonSequence = (before, after) => {
    const oldPosition = new Map(before.map((id, index) => [id, index]));
    const positions = after.map(id => oldPosition.get(id));
    // ends[k] is the index in `after` of the smallest value that ends an increasing run of length k + 1.
    const ends = [];
    const links = [];
    positions.forEach((position, index) => {
        let low = 0;
        let high = ends.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (positions[ends[middle]] < position) low = middle + 1;
            else high = middle;
        }
        links[index] = low > 0 ? ends[low - 1] : null;
        ends[low] = index;
    });
    const common = new Set();
    for (let i = ends.length > 0 ? ends[ends.length - 1] : null; i !== null; i = links[i]) {
        common.add(after[i]);
    }
    return common;
};

// Group changed blocks: how many there are, and the first one that is not inside another of them.
const summarise = entries => {
    if (entries.length === 0) return null;
    const ids = new Set(entries.map(entry => entry.node.id));
    const first = entries.find(entry => !ids.has(entry.outer)) || entries[0];
    return {count: entries.length, text: first.node.text};
};

// Scripts are listed by their place on screen, which dragging one changes without changing the program. Put
// the later scripts back in the earlier order, judged by the first block of each that existed before.
const inEarlierOrder = (scripts, before) => {
    const earlier = new Map(before.map((entry, index) => [entry.node.id, index]));
    const rank = script => Math.min(before.length,
        ...listBlocks([script]).map(entry => earlier.get(entry.node.id) ?? before.length));
    return scripts
        .map(script => ({script, at: rank(script)}))
        .sort((a, b) => a.at - b.at)
        .map(({script}) => script);
};

/**
 * Compare two outlines of the same sprite.
 * @param {object[]} previous The earlier outline.
 * @param {object[]} next The later outline.
 * @returns {{added: ?object, removed: ?object, moved: ?object, changed: ?object}} For each kind of change,
 * `{count, text}` where `text` describes the first block affected, or null if there was none.
 */
const diffOutlines = (previous, next) => {
    const before = listBlocks(previous);
    const after = listBlocks(inEarlierOrder(next, before));
    const beforeById = new Map(before.map(entry => [entry.node.id, entry]));
    const afterById = new Map(after.map(entry => [entry.node.id, entry]));

    const added = after.filter(entry => !beforeById.has(entry.node.id));
    const removed = before.filter(entry => !afterById.has(entry.node.id));
    const kept = after.filter(entry => beforeById.has(entry.node.id));
    // A block in a different container has moved. Order is compared only among the others, so that a block
    // arriving from elsewhere does not make its new neighbours look moved.
    const settled = new Set(kept
        .filter(entry => beforeById.get(entry.node.id).container === entry.container)
        .map(entry => entry.node.id));
    const settledIds = entries => entries.map(entry => entry.node.id).filter(id => settled.has(id));
    const stationary = commonSequence(settledIds(before), settledIds(after));
    let moved = kept.filter(entry => !stationary.has(entry.node.id));
    // Joining or splitting scripts can leave the reading order unchanged.
    if (moved.length === 0) {
        const survives = id => id === null || (beforeById.has(id) && afterById.has(id));
        moved = kept.filter(entry => {
            const was = beforeById.get(entry.node.id).node.previousId;
            const is = entry.node.previousId;
            return was !== is && survives(was) && survives(is);
        });
    }
    // A block whose reporters changed counts as changed; one that only moved does not.
    const changed = kept.filter(entry => beforeById.get(entry.node.id).node.text !== entry.node.text);

    return {
        added: summarise(added),
        removed: summarise(removed),
        moved: summarise(moved),
        changed: summarise(changed)
    };
};

export default diffOutlines;
