/*
 * Creating and renaming variables, lists and broadcast messages. Unlike block edits, these can touch the whole
 * project, so each change checks for itself that it can be made or reversed.
 */
import CommandError from './error.js';

const TYPES = {variable: '', list: 'list', message: 'broadcast_msg'};

const originals = vm => vm.runtime.targets.filter(target => target.isOriginal);

/**
 * The variables, lists or messages of a project.
 * @param {object} vm The virtual machine.
 * @param {'variable'|'list'|'message'} kind Which of them.
 * @param {Map<string, string>} messages Messages created here that no block uses yet, by id.
 * @returns {Array<{id: string, name: string, owner: object, variable: ?object}>} Each with the stage or sprite
 * it belongs to.
 */
const itemsOf = (vm, kind, messages) => {
    const items = originals(vm).flatMap(owner => Object.values(owner.variables)
        .filter(variable => variable.type === TYPES[kind])
        .map(variable => ({id: variable.id, name: variable.name, owner, variable})));
    if (kind !== 'message') return items;
    const owner = vm.runtime.getTargetForStage();
    // The project drops a message that no block uses, so those are remembered here.
    const unused = Array.from(messages)
        .filter(([id, name]) => !items.some(item => item.id === id || item.name === name))
        .map(([id, name]) => ({id, name, owner, variable: null}));
    return [...items, ...unused];
};

// The ones that the selected sprite or stage can use: its own, then those for all sprites.
const itemsInScope = (vm, kind, messages) => {
    const target = vm.editingTarget;
    const stage = vm.runtime.getTargetForStage();
    const items = itemsOf(vm, kind, messages);
    return [
        ...items.filter(item => item.owner === target && target !== stage),
        ...items.filter(item => item.owner === stage)
    ];
};

const isUsed = (vm, id) => vm.runtime.targets.some(target => Object.values(target.blocks._blocks)
    .some(block => Object.values(block.fields).some(field => field.id === id)));

// Names are compared as Scratch compares them, ignoring case.
const checkName = ({vm, messages, kind, name, owner, id}) => {
    if (!name) throw new CommandError('emptyName', {kind});
    const stage = vm.runtime.getTargetForStage();
    const same = itemsOf(vm, kind, messages)
        .filter(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase());
    if (same.some(item => item.owner === owner || item.owner === stage)) {
        throw new CommandError('nameTaken', {kind, name});
    }
    // A name for all sprites must not hide behind a sprite's own.
    if (owner === stage && same.length > 0) throw new CommandError('nameUsedBySprite', {kind, name});
};

const targetById = (vm, id) => {
    const target = originals(vm).find(candidate => candidate.id === id);
    if (!target) throw new CommandError('changedSince');
    return target;
};

const planCreate = ({command, vm, messages, newId}) => {
    const {kind} = command;
    const scope = command.scope || 'all';
    if (scope === 'sprite') {
        if (kind === 'message') throw new CommandError('messageScope');
        if (vm.editingTarget.isStage) throw new CommandError('stageScope');
    }
    const name = command.name.trim();
    const ownerId = (scope === 'sprite' ? vm.editingTarget : vm.runtime.getTargetForStage()).id;
    const id = newId();

    return {
        kind: 'created',
        values: {kind, name, scope},
        check: direction => {
            const owner = targetById(vm, ownerId);
            if (direction === 'redo') {
                checkName({vm, messages, kind, name, owner, id});
                return;
            }
            if (isUsed(vm, id)) throw new CommandError('itemInUse', {kind, name});
            const current = itemsOf(vm, kind, messages).find(item => item.id === id);
            if (current && current.name !== name) throw new CommandError('changedSince');
        },
        perform: direction => {
            const owner = targetById(vm, ownerId);
            if (direction === 'redo') {
                owner.createVariable(id, name, TYPES[kind]);
                if (kind === 'message') messages.set(id, name);
            } else {
                owner.deleteVariable(id);
                messages.delete(id);
            }
            vm.runtime.emitProjectChanged();
        },
        // Nothing in the workspace shows a new message, and redrawing it would discard the message.
        redraw: kind !== 'message'
    };
};

// Give an item a new name, everywhere the old one is shown.
const applyName = ({vm, messages, kind, id, owner, name}) => {
    const variable = owner.variables[id];
    if (variable) {
        owner.renameVariable(id, name);
        // A message is saved by its value, which is its name.
        if (kind === 'message') variable.value = name;
    }
    if (messages.has(id) || kind === 'message') messages.set(id, name);

    const shared = owner === vm.runtime.getTargetForStage();
    const affected = shared ? vm.runtime.targets : vm.runtime.targets.filter(t => t.blocks === owner.blocks);
    for (const target of affected) {
        if (kind === 'message') {
            for (const block of Object.values(target.blocks._blocks)) {
                if (block.fields.BROADCAST_OPTION?.id !== id) continue;
                target.blocks.changeBlock(
                    {id: block.id, element: 'field', name: 'BROADCAST_OPTION', value: id});
            }
        } else {
            target.blocks.updateBlocksAfterVarRename(id, name);
        }
        target.blocks.resetCache();
    }
    vm.runtime.emitProjectChanged();
};

const planRename = ({command, vm, messages}) => {
    const {kind} = command;
    const from = command.name.trim();
    const to = command.to.trim();
    const items = itemsInScope(vm, kind, messages);
    const item = items.find(candidate => candidate.name === from) ||
        items.find(candidate => candidate.name.toLowerCase() === from.toLowerCase());
    if (!item) throw new CommandError('noItem', {kind, name: from});
    if (item.variable?.isCloud) throw new CommandError('cloudVariable');
    if (item.name === to) return null;
    const {id, name: oldName} = item;
    const ownerId = item.owner.id;
    const namesFor = direction => (direction === 'redo' ? [oldName, to] : [to, oldName]);

    return {
        kind: 'renamed',
        values: {kind, from: oldName, to},
        check: direction => {
            const owner = targetById(vm, ownerId);
            const [current, next] = namesFor(direction);
            const found = itemsOf(vm, kind, messages).find(candidate => candidate.id === id);
            if (!found || found.name !== current) throw new CommandError('changedSince');
            checkName({vm, messages, kind, name: next, owner, id});
        },
        perform: direction => {
            const owner = targetById(vm, ownerId);
            applyName({vm, messages, kind, id, owner, name: namesFor(direction)[1]});
        },
        redraw: true
    };
};

/**
 * Work out a `create` or `rename` command.
 * @param {object} options `command`, `vm`, `messages` (see `itemsOf`) and `newId`.
 * @returns {?object} `{kind, values, check, perform, redraw}`, or null if nothing would change. `check` and
 * `perform` take `redo` (make the change) or `undo`.
 * @throws {CommandError} If the change cannot be made.
 */
const planData = options => {
    const change = options.command.op === 'create' ? planCreate(options) : planRename(options);
    change?.check('redo');
    return change;
};

export {
    itemsInScope,
    itemsOf,
    planData
};
