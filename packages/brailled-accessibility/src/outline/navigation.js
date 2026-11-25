// Keyboard movement in the outline, following the WAI-ARIA tree view pattern.

const isExpanded = (node, collapsed) => !!node.children && !collapsed.has(node.id);

// Nodes in reading order, skipping the contents of collapsed ones.
const visibleNodes = (nodes, collapsed, parent = null) => nodes.flatMap(node => [
    {node, parent},
    ...(isExpanded(node, collapsed) ? visibleNodes(node.children, collapsed, node) : [])
]);

// The chain of nodes from the top of the tree down to the node with this id, or null.
const findPath = (nodes, id) => {
    for (const node of nodes) {
        if (node.id === id) return [node];
        const rest = node.children && findPath(node.children, id);
        if (rest) return [node, ...rest];
    }
    return null;
};

/**
 * Apply a key press to the tree.
 * @param {object[]} nodes The outline.
 * @param {{currentId: string, collapsed: Set<string>}} place The current node and the collapsed nodes.
 * @param {string} key A `KeyboardEvent.key` value.
 * @returns {?{currentId: string, collapsed: Set<string>}} The new place, or null if the tree ignores the key.
 */
const navigate = (nodes, {currentId, collapsed}, key) => {
    const visible = visibleNodes(nodes, collapsed);
    const index = visible.findIndex(entry => entry.node.id === currentId);
    if (index < 0) return null;
    const {node, parent} = visible[index];
    const moveTo = target => ({currentId: target.node.id, collapsed});
    const toggle = () => {
        const next = new Set(collapsed);
        if (!next.delete(node.id)) next.add(node.id);
        return {currentId, collapsed: next};
    };

    switch (key) {
    case 'ArrowDown':
        return moveTo(visible[Math.min(index + 1, visible.length - 1)]);
    case 'ArrowUp':
        return moveTo(visible[Math.max(index - 1, 0)]);
    case 'Home':
        return moveTo(visible[0]);
    case 'End':
        return moveTo(visible[visible.length - 1]);
    case 'ArrowRight':
        if (!node.children) return {currentId, collapsed};
        return isExpanded(node, collapsed) ? moveTo(visible[index + 1]) : toggle();
    case 'ArrowLeft':
        if (isExpanded(node, collapsed)) return toggle();
        return {currentId: parent ? parent.id : currentId, collapsed};
    case 'Enter':
    case ' ':
        return node.children ? toggle() : {currentId, collapsed};
    default:
        return null;
    }
};

/**
 * Choose where the user should be after the tree changes.
 * @param {object[]} previous The outline before the change.
 * @param {object[]} next The outline after it.
 * @param {?string} currentId The node the user was on.
 * @returns {?string} The same node if it still exists, otherwise its closest surviving neighbour.
 */
const keepPlace = (previous, next, currentId) => {
    if (next.length === 0) return null;
    if (currentId && findPath(next, currentId)) return currentId;
    const path = currentId && findPath(previous, currentId);
    if (!path) return next[0].id;

    // A script is named after its first block, which changes when a block is put above it.
    const lost = path[path.length - 1];
    if (lost.type === 'script') {
        const moved = findPath(next, lost.children[0].id);
        if (moved) return moved[0].id;
    }
    for (let depth = path.length - 1; depth >= 0; depth--) {
        const siblings = depth === 0 ? previous : path[depth - 1].children;
        const at = siblings.indexOf(path[depth]);
        // Following siblings first, then preceding ones from the nearest.
        const neighbours = [...siblings.slice(at + 1), ...siblings.slice(0, at).reverse()];
        const survivor = neighbours.find(node => findPath(next, node.id));
        if (survivor) return survivor.id;
        if (depth > 0 && findPath(next, path[depth - 1].id)) return path[depth - 1].id;
    }
    return next[0].id;
};

// Expand whatever hides this node, so that the user can stay on it.
const reveal = (nodes, collapsed, id) => {
    const path = id && findPath(nodes, id);
    if (!path) return collapsed;
    const next = new Set(collapsed);
    path.slice(0, -1).forEach(node => next.delete(node.id));
    return next;
};

export {
    findPath,
    keepPlace,
    navigate,
    reveal,
    visibleNodes
};
