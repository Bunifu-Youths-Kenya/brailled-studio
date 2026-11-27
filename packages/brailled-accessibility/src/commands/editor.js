/*
 * The editing engine. Everything that changes a program goes through here: the Outline's keys now, and voice
 * and AI input later.
 */
import {createIntl} from 'react-intl';

import createDefinitionSource from '../outline/block-definitions.js';
import {nameColour, NAMED_COLOURS} from '../outline/colours.js';
import {findPath} from '../outline/navigation.js';
import {createDescriber} from '../outline/sentence.js';
import buildOutline from '../outline/tree.js';
import DEFAULT_WORDS from '../outline/words.js';
import {makePatch, matches, reverse, writePatch} from './apply.js';
import {CATALOG} from './catalog.js';
import {createContext, randomId} from './context.js';
import {itemsInScope, itemsOf, planData} from './data.js';
import CommandError from './error.js';
import {plans, readbacks, reasons} from './messages.js';
import plan from './planner.js';
import {branchesOf, copy, isValue, shapeOf, snapshot} from './program.js';
import {readBack, summarise} from './readback.js';
import checkCommand from './schema-check.js';
import {madeBy, mapBlockIds} from '../proposals/steps.js';
import {createBlock, menuChoices} from './values.js';

const HISTORY_LIMIT = 100;
// Operations that cannot be batched with others.
const SOLO = ['undo', 'redo', 'describe', 'create', 'rename'];
const DATA = ['create', 'rename'];

const defaultEnvironment = () => ({
    intl: createIntl({locale: 'en', defaultLocale: 'en', onError: () => {}}),
    words: DEFAULT_WORDS,
    // The scratch-blocks module, when running in the editor.
    scratchBlocks: null
});

const broadcastsIn = patch => [...Object.values(patch.before), ...Object.values(patch.after)]
    .map(block => block?.fields.BROADCAST_OPTION)
    .filter(Boolean);

/**
 * Create an editing engine for a virtual machine.
 * @param {object} vm The virtual machine.
 * @param {object} [options] Options.
 * @param {function(): string} [options.newId] Makes ids for new blocks.
 * @returns {object} The engine.
 */
const createEditor = (vm, {newId = randomId} = {}) => {
    let environment = defaultEnvironment();
    const listeners = new Set();
    // Undo and redo stacks, by sprite.
    const histories = new Map();
    // For each project's stage, the messages created here, by id.
    const messageSets = new Map();

    const messagesOf = () => {
        const stage = vm.runtime.getTargetForStage();
        if (!messageSets.has(stage.id)) messageSets.set(stage.id, new Map());
        return messageSets.get(stage.id);
    };

    const historyOf = target => {
        if (!histories.has(target.id)) histories.set(target.id, {undo: [], redo: []});
        return histories.get(target.id);
    };

    const say = (message, values) => environment.intl.formatMessage(message, values);

    const definitionSource = () => (environment.scratchBlocks ?
        createDefinitionSource(environment.scratchBlocks) :
        () => null);

    const describer = program => createDescriber({
        blocks: program.blocks,
        getDefinition: definitionSource(),
        words: environment.words
    });
    const name = (program, id) => describer(program)(program.blocks[id]);
    // The name that tells a kind of block apart: "if" and "if, else" would otherwise sound the same.
    const fullName = (program, id) => (branchesOf(program.blocks[id].opcode).length > 1 ?
        say(readbacks.withElse, {block: name(program, id)}) :
        name(program, id));

    const contextFor = () => {
        if (!vm.editingTarget) throw new CommandError('noTarget');
        const definitions = definitionSource();
        const unusedMessages = itemsOf(vm, 'message', messagesOf())
            .filter(item => !item.variable)
            .map(item => ({id: item.id, name: item.name}));
        return createContext({vm, name, getDefinition: definitions, newId, unusedMessages});
    };

    const report = result => {
        listeners.forEach(listener => listener(result));
        return result;
    };

    // The name of a kind of block as it is spoken, such as "move 10 steps"; the opcode if that is unknown.
    const kindName = opcode => {
        const entry = CATALOG[opcode];
        if (!entry || !vm.editingTarget) return opcode;
        const program = {blocks: {}, scripts: []};
        // Name it as if on a sprite or stage that can use it.
        const context = {...contextFor(), isStage: entry.only === 'stage'};
        try {
            return name(program, createBlock(program, opcode, {}, context).id);
        } catch (error) {
            // A block that needs a variable or list the project lacks has no example to name.
            if (!(error instanceof CommandError)) throw error;
            return opcode;
        }
    };

    // Turn a rejection into a result; anything else is a bug and is thrown onwards.
    const rejected = error => {
        if (!(error instanceof CommandError)) throw error;
        const values = {...error.values};
        if (values.opcode) values.opcode = kindName(values.opcode);
        if (values.slot) values.slot = values.slot.toLowerCase().replace(/_/g, ' ');
        const reason = say(reasons[error.key], values);
        return {ok: false, changed: false, reason, message: say(readbacks.notDone, {reason})};
    };

    // Replace each reference to a block that an earlier command makes with its id.
    const withMadeBlocks = (command, made) => {
        const resolved = mapBlockIds(command, id => {
            const number = madeBy(id);
            if (!number) return id;
            if (!made[number - 1]) throw new CommandError('noSuchBlock', {id});
            return made[number - 1];
        });
        return resolved;
    };

    // Plan editing commands in turn, each on the result of the last.
    const prepare = commands => {
        commands.forEach(checkCommand);
        if (commands.some(command => SOLO.includes(command.op))) throw new CommandError('oneAtATime');
        const context = contextFor();
        const original = snapshot(vm.editingTarget.blocks);
        const isInstruction = block => !block.shadow && block.opcode !== 'procedures_prototype' &&
            !isValue(shapeOf(block, context.extensionShape));
        let program = original;
        const sentences = [];
        const made = [];
        let first = null;
        let last = null;
        for (const [index, command] of commands.entries()) {
            const {program: next, event} = plan(withMadeBlocks(command, made), program, context);
            if (event.kind === 'added' || event.kind === 'wrapped') made[index] = event.id;
            sentences.push(readBack({
                event, before: program, after: next, name, fullName, isInstruction, intl: environment.intl
            }));
            program = next;
            first = first || event;
            last = event;
        }
        return {original, program, sentences, made, first, last};
    };

    const currentName = id => {
        const owner = vm.runtime.targets.find(target => target.variables[id]);
        return owner ? owner.variables[id].name : messagesOf().get(id);
    };

    // A history entry for a change to blocks. It can be reversed if they are still as it left them.
    const blockEntry = (target, patch, comments) => {
        const patchFor = direction => (direction === 'undo' ? reverse(patch) : patch);
        return {
            check: direction => {
                if (!matches(target.blocks, patchFor(direction))) throw new CommandError('changedSince');
            },
            perform: direction => {
                const side = patchFor(direction);
                const stage = vm.runtime.getTargetForStage();
                // Redrawing the workspace discards messages that no block uses, so bring back those needed.
                broadcastsIn(side).forEach(field => stage.createVariable(
                    field.id, messagesOf().get(field.id) ?? field.value, 'broadcast_msg'));
                writePatch(target.blocks, side, currentName);
                // Comments go and come back with their blocks.
                for (const [id, comment] of Object.entries(comments)) {
                    if (side.after[id]) target.comments[comment.id] = comment;
                    else delete target.comments[comment.id];
                }
                vm.emitWorkspaceUpdate();
            }
        };
    };

    const record = (target, entry) => {
        const history = historyOf(target);
        history.undo.push(entry);
        if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
        history.redo.length = 0;
        return {ok: true,
            changed: true,
            dataChanged: !!entry.data,
            message: entry.sentence,
            focusId: entry.focusAfter};
    };

    const edit = commands => {
        const {original, program, sentences, made, first, last} = prepare(commands);
        const target = vm.editingTarget;
        const patch = makePatch(original, program);
        if (Object.keys(patch.after).length === 0) {
            return {ok: true, changed: false, message: say(readbacks.noChange)};
        }
        const comments = {};
        for (const [id, block] of Object.entries(patch.before)) {
            const comment = block?.comment && target.comments[block.comment];
            if (comment && !patch.after[id]) comments[id] = comment;
        }
        const entry = {
            ...blockEntry(target, patch, comments),
            sentence: sentences.join('. '),
            focusBefore: first.focusBefore,
            focusAfter: last.kind === 'deleted' ? null : last.id
        };
        entry.perform('redo');
        // One for each command: the block it made, or null.
        return {...record(target, entry), made: commands.map((_, index) => made[index] ?? null)};
    };

    const planDataCommand = command => {
        checkCommand(command);
        if (!vm.editingTarget) throw new CommandError('noTarget');
        return planData({command, vm, messages: messagesOf(), newId});
    };

    // Create or rename a variable, list or message.
    const editData = command => {
        const change = planDataCommand(command);
        if (!change) return {ok: true, changed: false, message: say(readbacks.noChange)};
        let message = readbacks.renamedItem;
        if (change.kind === 'created') {
            message = change.values.kind === 'message' ? readbacks.createdMessage : readbacks.createdItem;
        }
        const entry = {
            check: change.check,
            perform: direction => {
                change.perform(direction);
                if (change.redraw) vm.emitWorkspaceUpdate();
            },
            data: true,
            sentence: say(message, change.values),
            focusBefore: null,
            focusAfter: null
        };
        const target = vm.editingTarget;
        entry.perform('redo');
        return record(target, entry);
    };

    const travel = direction => {
        if (!vm.editingTarget) throw new CommandError('noTarget');
        const history = historyOf(vm.editingTarget);
        const entry = history[direction][history[direction].length - 1];
        if (!entry) throw new CommandError(direction === 'undo' ? 'nothingToUndo' : 'nothingToRedo');
        entry.check(direction);
        entry.perform(direction);
        history[direction].pop();
        if (!entry.once) history[direction === 'undo' ? 'redo' : 'undo'].push(entry);
        return {
            ok: true,
            changed: true,
            dataChanged: !!entry.data,
            message: say(direction === 'undo' ? readbacks.undone : readbacks.redone, {sentence: entry.sentence}),
            focusId: direction === 'undo' ? entry.focusBefore : entry.focusAfter
        };
    };

    /**
     * Put a change made elsewhere, to the selected sprite, in its history so that "undo" takes it back. It
     * cannot be redone.
     * @param {object} change The change.
     * @param {string} change.sentence What it did.
     * @param {function(): boolean} change.unchanged Whether it can still be taken back.
     * @param {function()} change.undo Takes it back.
     */
    const addEntry = ({sentence, unchanged, undo}) => {
        record(vm.editingTarget, {
            check: () => {
                if (!unchanged()) throw new CommandError('changedSince');
            },
            perform: undo,
            once: true,
            sentence,
            focusBefore: null,
            focusAfter: null
        });
    };

    const describe = ({script}) => {
        if (!vm.editingTarget) throw new CommandError('noTarget');
        const program = snapshot(vm.editingTarget.blocks);
        let nodes = buildOutline({...program, getDefinition: definitionSource(), words: environment.words});
        if (script) {
            const path = findPath(nodes, script);
            if (!path) throw new CommandError('noSuchBlock', {id: script});
            nodes = [path[0]];
        }
        return {
            ok: true,
            changed: false,
            message: nodes.length === 0 ?
                say(readbacks.emptyProgram, {name: vm.editingTarget.getName()}) :
                summarise(nodes, environment.intl)
        };
    };

    /**
     * Carry out a command, or several editing commands as one step that can be undone together.
     * @param {object|object[]} input Commands matching `schema.json`.
     * @returns {{ok: boolean, changed: boolean, message: string, reason: ?string, focusId: ?string,
     * dataChanged: ?boolean}} The result. `message` is the sentence to say; `dataChanged` means variables, lists
     * or messages changed. Subscribers receive the result too.
     */
    const run = (input, {quiet = false} = {}) => {
        // `quiet` marks a result that whoever ran it will say, so that subscribers do not say it again.
        const tell = result => report(quiet ? {...result, quiet: true} : result);
        const commands = Array.isArray(input) ? input : [input];
        try {
            if (commands.length === 1 && SOLO.includes(commands[0]?.op)) {
                const [command] = commands;
                if (DATA.includes(command.op)) return tell(editData(command));
                checkCommand(command);
                return tell(command.op === 'describe' ? describe(command) : travel(command.op));
            }
            return tell(edit(commands));
        } catch (error) {
            return tell(rejected(error));
        }
    };

    /**
     * Check commands without carrying them out.
     * @param {object|object[]} input Commands matching `schema.json`.
     * @returns {{ok: boolean, reason: ?string}} Whether they would work, and if not, why.
     */
    const validate = input => {
        const commands = Array.isArray(input) ? input : [input];
        try {
            if (commands.length === 1 && DATA.includes(commands[0]?.op)) planDataCommand(commands[0]);
            else if (commands.length === 1 && SOLO.includes(commands[0]?.op)) checkCommand(commands[0]);
            else prepare(commands);
            return {ok: true};
        } catch (error) {
            return {ok: false, reason: rejected(error).reason};
        }
    };

    /**
     * Check a list of proposed steps, each planned on the result of those before, and say what each would do.
     * Nothing is changed. A step may name the block an earlier step makes with `stepRef` (see
     * `proposals/steps.js`).
     * @param {Array<?object>} commands One per step: a command matching `schema.json`, or null for a step that
     * is not a command.
     * @returns {{ok: boolean, sentences: ?Array<?string>, details: ?Array<?object>, reason: ?string,
     * step: ?number}} The sentences in step order, with how much each deletion removes, or why the step numbered
     * `step` (from 1) cannot be done.
     */
    const preview = commands => {
        let step = 0;
        try {
            commands.forEach((command, index) => {
                step = index + 1;
                if (command !== null) checkCommand(command);
            });
            if (!vm.editingTarget) throw new CommandError('noTarget');
            const context = contextFor();
            const isInstruction = block => !block.shadow && block.opcode !== 'procedures_prototype' &&
                !isValue(shapeOf(block, context.extensionShape));
            const lists = {variable: context.variables, list: context.lists, message: context.broadcasts};
            const original = snapshot(vm.editingTarget.blocks);
            let program = original;
            let touched = null;
            const made = [];
            const details = commands.map(() => null);
            const sentences = commands.map((command, index) => {
                step = index + 1;
                if (command === null) return null;
                if (command.op === 'undo' || command.op === 'redo') {
                    // The history is of the program as it is now, so nothing can come with it.
                    if (commands.length > 1) throw new CommandError('oneAtATime');
                    const entry = historyOf(vm.editingTarget)[command.op].at(-1);
                    if (!entry) throw new CommandError(command.op === 'undo' ? 'nothingToUndo' : 'nothingToRedo');
                    entry.check(command.op);
                    return say(plans[command.op], {sentence: entry.sentence});
                }
                if (command.op === 'describe') {
                    const script = command.script && withMadeBlocks(command, made).script;
                    if (script && !program.blocks[script]) throw new CommandError('noSuchBlock', {id: script});
                    return say(plans.describe);
                }
                if (DATA.includes(command.op)) {
                    const change = planDataCommand(command);
                    if (!change) return say(readbacks.noChange);
                    const {kind, name: itemName, from, to} = change.values;
                    // Later steps see the new name.
                    if (change.kind === 'created') {
                        if (lists[kind].some(item => item.name === itemName)) {
                            throw new CommandError('nameTaken', {kind, name: itemName});
                        }
                        lists[kind].push({id: context.newId(), name: itemName});
                    } else {
                        const item = lists[kind].find(candidate => candidate.name === from);
                        if (item) item.name = to;
                    }
                    let message = plans.renamedItem;
                    if (change.kind === 'created') {
                        message = kind === 'message' ? plans.createdMessage : plans.createdItem;
                    }
                    return say(message, change.values);
                }
                const {program: next, event} = plan(withMadeBlocks(command, made), program, context);
                touched = touched ?? event.id;
                const sentence = readBack({
                    event,
                    before: program,
                    after: next,
                    name,
                    fullName,
                    isInstruction,
                    intl: environment.intl,
                    text: {...readbacks, ...plans}
                });
                if (event.kind === 'added' || event.kind === 'wrapped') made[index] = event.id;
                if (event.kind === 'deleted') {
                    details[index] = {
                        instructions: event.removed.filter(id => isInstruction(program.blocks[id])).length,
                        // Nothing of the script is left.
                        wholeScript: program.scripts.includes(event.id) &&
                            (event.following || !program.blocks[event.id].next)
                    };
                }
                program = next;
                return sentence;
            });
            // The program as the Outline would show it before and after, for a preview of what changes.
            const shown = blocks => buildOutline({...blocks,
                getDefinition: definitionSource(),
                words: environment.words});
            return {ok: true, sentences, details, before: shown(original), after: shown(program), touched};
        } catch (error) {
            return {ok: false, reason: rejected(error).reason, step};
        }
    };

    // The selected sprite's program as the Outline shows it.
    const outline = () => (vm.editingTarget ?
        buildOutline({...snapshot(vm.editingTarget.blocks),
            getDefinition: definitionSource(),
            words: environment.words}) :
        []);

    // The names the project gives the things that menus offer.
    const projectNames = () => {
        if (!vm.editingTarget) return {};
        const context = contextFor();
        return Object.fromEntries(['sprites', 'costumes', 'sounds', 'backdrops']
            .map(source => [source, context.names(source)]));
    };

    /**
     * Every block that can be created for the selected sprite, with the values it takes.
     * @returns {Array<{opcode: string, name: string, shape: string, values: object[]}>} Each value has a `name`,
     * the `type` of thing it takes and, for a menu, its `choices`.
     */
    const blockSpecs = () => {
        const context = contextFor();
        // Blocks are named with these in place of the project's own names, which students write.
        const placeholder = (items, word) => items.slice(0, 1).map(item => ({...item, name: `(${word})`}));
        const naming = {
            ...context,
            names: source => [`(${source.replace(/s$/, '')} name)`],
            variables: placeholder(context.variables, 'variable name'),
            lists: placeholder(context.lists, 'list name'),
            broadcasts: [{id: 'brailled-placeholder', name: '(message name)'}]
        };
        return Object.entries(CATALOG).flatMap(([opcode, entry]) => {
            const program = {blocks: {}, scripts: []};
            const named = {blocks: {}, scripts: []};
            let block;
            let shown;
            try {
                block = createBlock(program, opcode, {}, context);
                shown = createBlock(named, opcode, {}, naming);
            } catch (error) {
                // Not usable here: a stage without motion, or a project without a list.
                if (!(error instanceof CommandError)) throw error;
                return [];
            }
            const values = Object.entries({...entry.inputs, ...entry.fields}).map(([slot, spec]) => {
                const type = spec.type || spec.kind;
                if (type !== 'menu' && type !== 'choice') return {name: slot, type};
                // Names from the project, which students write, are given apart from the editor's own choices.
                if (type === 'menu' && spec.source) {
                    return {name: slot, type: 'choice', choices: spec.special, source: spec.source};
                }
                const choices = menuChoices(spec, block, slot, program, context).map(choice => choice.value);
                return {name: slot, type: 'choice', choices};
            });
            return [{opcode, name: fullName(named, shown.id), shape: entry.shape, values}];
        });
    };

    /**
     * The blocks that can be created for the selected sprite, each with its spoken name.
     * @param {'instruction'|'value'|'boolean'} kind What the block is wanted for.
     * @returns {Array<{opcode: string, name: string, category: string}>} The blocks.
     */
    const listBlocks = kind => {
        const context = contextFor();
        const wanted = {
            instruction: shape => !isValue(shape),
            value: isValue,
            boolean: shape => shape === 'boolean'
        }[kind];
        return Object.entries(CATALOG)
            .filter(([, entry]) => wanted(entry.shape))
            .flatMap(([opcode]) => {
                const program = {blocks: {}, scripts: []};
                try {
                    const block = createBlock(program, opcode, {}, context);
                    return [{opcode, name: fullName(program, block.id), category: opcode.split('_')[0]}];
                } catch (error) {
                    // Not usable here: a stage without motion, or a project without a list.
                    if (!(error instanceof CommandError)) throw error;
                    return [];
                }
            });
    };

    /**
     * The values of a block, including those of blocks plugged into it, for editing.
     * @param {string} blockId The block.
     * @returns {object[]} One entry per value: `{blockId, name, label, control, value, options, accepts,
     * plugged}`. `control` is `text`, `select` or `block`.
     */
    const valuesOf = blockId => {
        const context = contextFor();
        const program = snapshot(vm.editingTarget.blocks);

        // The block's sentence, with a marker where this value is.
        const labelFor = (block, slot, marker) => {
            const draft = copy(program);
            const target = draft.blocks[block.id];
            if (target.inputs[slot] || CATALOG[block.opcode].inputs[slot]) {
                draft.blocks['brailled-marker'] = {id: 'brailled-marker',
                    opcode: 'text',
                    inputs: {},
                    fields: {TEXT: {name: 'TEXT', value: marker}},
                    shadow: true,
                    parent: target.id};
                target.inputs[slot] = {name: slot, block: 'brailled-marker', shadow: 'brailled-marker'};
            } else {
                target.fields[slot].value = marker;
            }
            return name(draft, block.id);
        };

        const walk = id => {
            const block = program.blocks[id];
            const entry = block && CATALOG[block.opcode];
            if (!entry) return [];
            const base = slot => ({
                blockId: id,
                name: slot,
                label: labelFor(block, slot, environment.words.marker)
            });
            const inputs = Object.entries(entry.inputs).flatMap(([slot, spec]) => {
                const input = block.inputs[slot];
                const accepts = spec.type === 'boolean' ? 'boolean' : 'value';
                const plugged = input?.block && input.block !== input.shadow ? input.block : null;
                if (plugged || accepts === 'boolean') {
                    return [{...base(slot),
                        control: 'block',
                        accepts,
                        plugged: plugged ? name(program, plugged) : null},
                    ...(plugged ? walk(plugged) : [])];
                }
                const shadow = program.blocks[input?.shadow];
                const current = shadow ? Object.values(shadow.fields)[0] : null;
                if (spec.type === 'menu' || spec.type === 'broadcast') {
                    const options = spec.type === 'broadcast' ?
                        context.broadcasts.map(item => ({value: item.name, label: item.name})) :
                        menuChoices(spec, block, slot, program, context);
                    return [{...base(slot),
                        control: 'select',
                        accepts,
                        options,
                        value: String(current?.value ?? '')}];
                }
                if (spec.type === 'colour') {
                    // Colours are chosen by name.
                    const options = Object.entries(NAMED_COLOURS)
                        .map(([value, hex]) => ({value, label: environment.words.colour(hex)}));
                    return [{...base(slot),
                        control: 'select',
                        accepts,
                        options,
                        value: nameColour(String(current?.value ?? spec.value))}];
                }
                return [{...base(slot), control: 'text', accepts, value: String(current?.value ?? '')}];
            });
            const fields = Object.entries(entry.fields).map(([slot, spec]) => {
                const lists = {variable: context.variables, list: context.lists, broadcast: context.broadcasts};
                const options = lists[spec.kind] ?
                    lists[spec.kind].map(item => ({value: item.name, label: item.name})) :
                    menuChoices(spec, block, slot, program, context);
                return {...base(slot), control: 'select', options, value: String(block.fields[slot]?.value ?? '')};
            });
            return [...fields, ...inputs];
        };
        return walk(blockId);
    };

    /**
     * The variables, lists and messages that the selected sprite or stage can use.
     * @returns {{isStage: boolean, items: Array<{kind: string, name: string, scope: string}>}} Them, and whether
     * the stage is selected.
     */
    const listData = () => {
        if (!vm.editingTarget) return {isStage: false, items: []};
        const stage = vm.runtime.getTargetForStage();
        const items = ['variable', 'list', 'message'].flatMap(kind => itemsInScope(vm, kind, messagesOf())
            .map(item => ({kind, name: item.name, scope: item.owner === stage ? 'all' : 'sprite'})));
        return {isStage: !!vm.editingTarget.isStage, items};
    };

    return {
        run,
        validate,
        preview,
        outline,
        blockSpecs,
        projectNames,
        addEntry,
        listBlocks,
        listData,
        valuesOf,
        setEnvironment: next => {
            environment = {...defaultEnvironment(), ...next};
        },
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};

const editors = new WeakMap();

// The one editing engine of a virtual machine, so that every part of the interface shares its history.
const getEditor = vm => {
    if (!editors.has(vm)) editors.set(vm, createEditor(vm));
    return editors.get(vm);
};

export {
    createEditor,
    getEditor
};
