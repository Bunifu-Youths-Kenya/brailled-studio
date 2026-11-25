// Works out what a command does to a program, without touching the VM.
import {
    branchesOf, chainFrom, checkStructure, copy, getBlock, isValue, shapeOf, slotOf, subtree
} from './program.js';
import CommandError from './error.js';
import {createBlock, setValue} from './values.js';

const SCRIPT_X = 40;
// Rough height of one block, used only to put a new script below the others.
const BLOCK_HEIGHT = 60;

const nextScriptPosition = program => {
    const bottoms = program.scripts
        .filter(id => program.blocks[id])
        .map(id => (Number(program.blocks[id].y) || 0) +
            (subtree(program, id, true).filter(child => !program.blocks[child].shadow).length * BLOCK_HEIGHT));
    return {x: SCRIPT_X, y: bottoms.length > 0 ? Math.max(...bottoms) + BLOCK_HEIGHT : SCRIPT_X};
};

// Make `block` the first block of a script, in place of `old` if given.
const makeTop = (program, block, old) => {
    const {x, y} = old || nextScriptPosition(program);
    Object.assign(block, {topLevel: true, parent: null, x, y});
    if (old) {
        program.scripts.splice(program.scripts.indexOf(old.id), 1, block.id);
        old.topLevel = false;
        delete old.x;
        delete old.y;
    } else {
        program.scripts.push(block.id);
    }
};

// Put `block` where `old` is attached, leaving `old` loose.
const takePlace = (program, block, old) => {
    const slot = slotOf(program, old.id);
    if (slot.kind === 'top') {
        makeTop(program, block, old);
        return;
    }
    if (slot.kind === 'next') slot.parent.next = block.id;
    else slot.parent.inputs[slot.name].block = block.id;
    block.parent = slot.parent.id;
};

// Remove a block, or it and all under it, from its place. The blocks under it close the gap.
const detach = (program, id, following) => {
    const block = program.blocks[id];
    const slot = slotOf(program, id);
    const rest = following ? null : program.blocks[block.next];
    if (rest) block.next = null;

    if (rest) {
        takePlace(program, rest, block);
    } else if (slot.kind === 'top') {
        program.scripts.splice(program.scripts.indexOf(id), 1);
    } else if (slot.kind === 'next') {
        slot.parent.next = null;
    } else {
        delete slot.parent.inputs[slot.name];
    }
    Object.assign(block, {parent: null, topLevel: false});
    delete block.x;
    delete block.y;
};

// Only blocks of a known shape can be put somewhere new.
const requireShape = (block, context) => {
    if (!shapeOf(block, context.extensionShape)) {
        throw new CommandError('unknownBlock', {opcode: block.opcode});
    }
};

const stackAnchor = (program, id, context) => {
    const anchor = getBlock(program, id);
    if (anchor.shadow || isValue(shapeOf(anchor, context.extensionShape))) {
        throw new CommandError('notInStack', {block: context.name(program, id)});
    }
    return anchor;
};

// Attach the stack starting at `root` where a command asks.
const attach = (program, rootId, position, context) => {
    const root = program.blocks[rootId];
    const chain = chainFrom(program, rootId);
    const end = program.blocks[chain[chain.length - 1]];
    const follow = (above, below) => {
        above.next = below ? below.id : null;
        if (below) below.parent = above.id;
    };

    if (position.after) {
        const anchor = stackAnchor(program, position.after, context);
        follow(end, program.blocks[anchor.next]);
        follow(anchor, root);
    } else if (position.before) {
        const anchor = stackAnchor(program, position.before, context);
        takePlace(program, root, anchor);
        follow(end, anchor);
    } else if (position.inside) {
        const holder = getBlock(program, position.inside.block);
        const branches = branchesOf(holder.opcode);
        const branch = position.inside.branch || branches[0];
        if (!branches.includes(branch)) {
            throw new CommandError(branches.length === 0 ? 'holdsNothing' : 'noSuchBranch',
                {block: context.name(program, holder.id)});
        }
        const first = program.blocks[holder.inputs[branch]?.block];
        holder.inputs[branch] = {name: branch, block: rootId, shadow: null};
        root.parent = holder.id;
        follow(end, first);
    } else {
        makeTop(program, root);
    }
};

const positionOf = command => {
    const given = ['after', 'before', 'inside', 'newScript']
        .filter(key => Object.prototype.hasOwnProperty.call(command, key));
    if (given.length > 1) throw new CommandError('onePosition');
    return given.length === 1 ? {[given[0]]: command[given[0]]} : {};
};

const anchorOf = position => position.after || position.before || position.inside?.block || null;

// The instruction that a block is, or is plugged into.
const instructionOf = (program, id, context) => {
    let block = program.blocks[id];
    while (block.parent && isValue(shapeOf(block, context.extensionShape))) block = program.blocks[block.parent];
    return block.id;
};

const procedureInUse = (program, block, removed) => {
    const prototype = program.blocks[block.inputs.custom_block?.block];
    const proccode = prototype?.mutation.proccode;
    return Object.values(program.blocks).some(other => other.opcode === 'procedures_call' &&
        other.mutation.proccode === proccode && !removed.includes(other.id));
};

const operations = {
    'insert': (command, program, context) => {
        const position = positionOf(command);
        const block = createBlock(program, command.block, command.args || {}, context);
        attach(program, block.id, position, context);
        return {kind: 'added', id: block.id, position, focusBefore: anchorOf(position)};
    },
    'delete': (command, program, context) => {
        const block = getBlock(program, command.block);
        if (block.shadow || block.opcode === 'procedures_prototype') {
            throw new CommandError('cannotDeleteSlot');
        }
        const following = !!command.withFollowing;
        const removed = subtree(program, block.id, following);
        if (removed.some(id => program.blocks[id].opcode === 'procedures_definition' &&
            procedureInUse(program, program.blocks[id], removed))) {
            throw new CommandError('procedureInUse');
        }
        const slot = slotOf(program, block.id);
        if (slot.kind === 'input' && isValue(shapeOf(block, context.extensionShape))) {
            // A value leaves its slot as it was before.
            const input = slot.parent.inputs[slot.name];
            if (input.shadow) input.block = input.shadow;
            else delete slot.parent.inputs[slot.name];
        } else {
            detach(program, block.id, following);
        }
        removed.forEach(id => delete program.blocks[id]);
        return {kind: 'deleted', id: block.id, following, removed, focusBefore: block.id};
    },
    'set-value': (command, program, context) => {
        setValue(program, command.block, command.name, command.value, context);
        const id = instructionOf(program, command.block, context);
        return {kind: 'changed', id, focusBefore: id};
    },
    'move': (command, program, context) => {
        const block = getBlock(program, command.block);
        if (block.shadow || isValue(shapeOf(block, context.extensionShape))) {
            throw new CommandError('cannotMoveValue');
        }
        requireShape(block, context);
        const position = positionOf(command);
        if (Object.keys(position).length === 0) throw new CommandError('needPosition');
        const following = !!command.withFollowing;
        const moving = subtree(program, block.id, following);
        if (moving.includes(anchorOf(position))) throw new CommandError('insideItself');
        detach(program, block.id, following);
        attach(program, block.id, position, context);
        return {kind: 'moved', id: block.id, following, position, focusBefore: block.id};
    },
    'wrap': (command, program, context) => {
        const holder = shapeOf({opcode: command.in, fields: {}}, context.extensionShape);
        if (holder && branchesOf(command.in).length === 0) {
            throw new CommandError('notAContainer', {opcode: command.in});
        }
        const first = stackAnchor(program, command.block, context);
        const chain = chainFrom(program, first.id);
        const count = chain.indexOf(command.through || first.id) + 1;
        if (count === 0) throw new CommandError('notSameStack');
        chain.slice(0, count).forEach(id => requireShape(program.blocks[id], context));
        const last = program.blocks[chain[count - 1]];
        const rest = program.blocks[last.next];
        const wrapper = createBlock(program, command.in, command.args || {}, context);

        takePlace(program, wrapper, first);
        wrapper.inputs.SUBSTACK = {name: 'SUBSTACK', block: first.id, shadow: null};
        first.parent = wrapper.id;
        last.next = null;
        if (rest) {
            wrapper.next = rest.id;
            rest.parent = wrapper.id;
        }
        return {kind: 'wrapped', id: wrapper.id, first: first.id, count, focusBefore: first.id};
    }
};

/**
 * Apply a checked editing command to a copy of a program.
 * @param {object} command A command that matches the schema, other than undo, redo or describe.
 * @param {object} program The program before the command; it is not changed.
 * @param {object} context See `context.js`.
 * @returns {{program: object, event: object}} The program afterwards, and what happened.
 * @throws {CommandError} If the command cannot be carried out or would leave an invalid program.
 */
const plan = (command, program, context) => {
    const next = copy(program);
    const event = operations[command.op](command, next, context);
    const touched = Object.keys(next.blocks).filter(id =>
        JSON.stringify(next.blocks[id]) !== JSON.stringify(program.blocks[id]));
    checkStructure(next, touched, context, program);
    return {program: next, event};
};

export default plan;
