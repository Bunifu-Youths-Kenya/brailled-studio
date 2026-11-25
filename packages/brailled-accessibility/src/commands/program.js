// A sprite's program as plain data, `{blocks, scripts}`, and the questions asked about its structure.
import {CATALOG, EXISTING_ONLY, lookup} from './catalog.js';
import CommandError from './error.js';

const copy = value => JSON.parse(JSON.stringify(value));

// The data held by a VM block container, detached from it.
const snapshot = container => copy({blocks: container._blocks, scripts: container.getScripts()});

const getBlock = (program, id) => {
    const block = lookup(program.blocks, id);
    if (!block) throw new CommandError('noSuchBlock', {id});
    return block;
};

// Where a block is attached: the top of a script, under another block, or in one of its inputs.
const slotOf = (program, id) => {
    const parent = program.blocks[program.blocks[id].parent];
    if (!parent) return {kind: 'top'};
    if (parent.next === id) return {kind: 'next', parent};
    const name = Object.keys(parent.inputs).find(key => parent.inputs[key].block === id);
    return {kind: 'input', parent, name};
};

// The ids from a block to the end of its stack.
const chainFrom = (program, id) => {
    const ids = [];
    for (let block = program.blocks[id]; block; block = program.blocks[block.next]) ids.push(block.id);
    return ids;
};

// A block's id and the ids of everything held by its inputs; with `following`, the blocks under it too.
const subtree = (program, id, following = false) => {
    const block = program.blocks[id];
    if (!block) return [];
    const held = Object.values(block.inputs).flatMap(input => (
        Array.from(new Set([input.block, input.shadow])).flatMap(child => subtree(program, child, true))
    ));
    return [id, ...held, ...(following ? subtree(program, block.next, true) : [])];
};

/**
 * The shape of a block that is, or could be, in a program.
 * @param {object} block The block.
 * @param {function(string): ?string} extensionShape Shapes of the blocks of loaded extensions.
 * @returns {?string} `hat`, `stack`, `c`, `cap`, `reporter`, `boolean`, or null if the block is unknown.
 */
const shapeOf = (block, extensionShape = () => null) => {
    if (block.opcode === 'control_stop' && block.fields.STOP_OPTION?.value === 'other scripts in sprite') {
        return 'stack';
    }
    const known = lookup(CATALOG, block.opcode) || lookup(EXISTING_ONLY, block.opcode);
    return known ? known.shape : extensionShape(block.opcode);
};

const branchesOf = opcode => (lookup(CATALOG, opcode) || lookup(EXISTING_ONLY, opcode))?.branches || [];

const isValue = shape => shape === 'reporter' || shape === 'boolean';

/**
 * Check the placement of blocks that an edit has touched.
 * @param {object} program The program after the edit.
 * @param {string[]} ids Blocks to check; ids no longer present are skipped.
 * @param {object} context `extensionShape` and `name`, which names a block for a message.
 * @param {object} before The program before the edit.
 * @throws {CommandError} If a block is somewhere its shape does not allow.
 */
const checkStructure = (program, ids, context, before) => {
    for (const id of ids) {
        const block = program.blocks[id];
        if (!block || block.shadow || block.opcode === 'procedures_prototype') continue;
        const shape = shapeOf(block, context.extensionShape);
        if (!shape) {
            // An unknown block may have its neighbours change, but gains nothing under it: it may be one that
            // ends a script. The planner refuses to move it.
            const old = before.blocks[id];
            if (old && (!block.next || old.next)) continue;
            throw new CommandError('unknownBlock', {opcode: block.opcode});
        }
        const name = () => context.name(program, id);
        const slot = slotOf(program, id);
        const inBranch = slot.kind === 'input' && branchesOf(slot.parent.opcode).includes(slot.name);

        if (shape === 'hat' && slot.kind !== 'top') throw new CommandError('hatNotFirst', {block: name()});
        if (shape === 'cap' && block.next) {
            throw new CommandError('nothingAfter', {block: name()});
        }
        if (isValue(shape)) {
            if (slot.kind === 'next' || inBranch || block.next) {
                throw new CommandError('valueNotInstruction', {block: name()});
            }
        } else if (slot.kind === 'input' && !inBranch) {
            throw new CommandError('instructionNotValue', {block: name()});
        }
        if (slot.kind === 'input' && !inBranch && shape !== 'boolean' &&
            lookup(CATALOG, slot.parent.opcode)?.inputs[slot.name]?.type === 'boolean') {
            throw new CommandError('needsCondition', {block: name()});
        }
    }
};

export {
    branchesOf,
    chainFrom,
    checkStructure,
    copy,
    getBlock,
    isValue,
    shapeOf,
    slotOf,
    snapshot,
    subtree
};
