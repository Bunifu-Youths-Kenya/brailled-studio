// Writes planned changes into a VM block container, and takes them back.
import {copy} from './program.js';

// A field that refers to a variable, list or message by id.
const isReference = field => !!field && typeof field === 'object' && 'variableType' in field && !!field.id;

// Comparable text for a block: key order, position, empty slots and the names of referenced variables, which
// can change, do not matter.
const canonical = block => JSON.stringify(block, (key, value) => {
    if (key === 'x' || key === 'y') return;
    if (isReference(value)) return {id: value.id, variableType: value.variableType};
    if (key === 'inputs') {
        return Object.fromEntries(Object.entries(value)
            .filter(([, input]) => input.block || input.shadow)
            .sort(([a], [b]) => a.localeCompare(b)));
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
});

/**
 * The difference between two programs.
 * @param {object} before The earlier program.
 * @param {object} after The later program.
 * @returns {object} `{before, after}`, each holding the blocks that differ (null where absent), and the
 * order of scripts on each side.
 */
const makePatch = (before, after) => {
    const ids = Array.from(new Set([...Object.keys(before.blocks), ...Object.keys(after.blocks)]))
        .filter(id => JSON.stringify(before.blocks[id]) !== JSON.stringify(after.blocks[id]));
    const side = program => Object.fromEntries(ids.map(id => [id, program.blocks[id] || null]));
    return {
        before: side(before),
        after: side(after),
        scriptsBefore: before.scripts,
        scriptsAfter: after.scripts
    };
};

const reverse = patch => ({
    before: patch.after,
    after: patch.before,
    scriptsBefore: patch.scriptsAfter,
    scriptsAfter: patch.scriptsBefore
});

// Whether the blocks a patch would change are still as it expects.
const matches = (container, patch) => Object.entries(patch.before).every(([id, expected]) => {
    const current = container.getBlock(id);
    return expected ? !!current && canonical(current) === canonical(expected) : !current;
});

/**
 * Change a VM block container using its own methods.
 * @param {object} container A target's `blocks`.
 * @param {object} patch From `makePatch`.
 * @param {function(string): ?string} currentName The present name of a variable, list or message, by id.
 */
const writePatch = (container, patch, currentName) => {
    // A script that someone has dragged stays there, unless the command itself moves it.
    const planned = Object.entries(patch.after).map(([id, block]) => {
        if (!block) return null;
        const old = patch.before[id];
        const current = container.getBlock(id);
        const unmoved = old && current && block.topLevel && old.x === block.x && old.y === block.y;
        const written = {...copy(block), ...(unmoved ? {x: current.x, y: current.y} : {})};
        // It may have been renamed since the block was recorded.
        for (const field of Object.values(written.fields).filter(isReference)) {
            field.value = currentName(field.id) ?? field.value;
        }
        return written;
    });
    for (const id of Object.keys(patch.after)) {
        const block = container.getBlock(id);
        if (!block) continue;
        // `deleteBlock` also deletes whatever a block links to, so unlink it first.
        block.next = null;
        block.inputs = {};
        container.deleteBlock(id);
    }
    planned.filter(Boolean).forEach(block => container.createBlock(block));

    const scripts = container.getScripts();
    const wanted = patch.scriptsAfter.filter(id => scripts.includes(id));
    scripts.splice(0, scripts.length, ...wanted, ...scripts.filter(id => !wanted.includes(id)));
    container.resetCache();
};

export {
    makePatch,
    matches,
    reverse,
    writePatch
};
