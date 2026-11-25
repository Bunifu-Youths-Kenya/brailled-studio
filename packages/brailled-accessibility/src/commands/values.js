// Creating blocks and setting their values, as part of planning a command.
import {parseColour} from '../outline/colours.js';
import {CATALOG, SHADOWS, lookup} from './catalog.js';
import CommandError from './error.js';
import {getBlock, isValue, shapeOf, subtree} from './program.js';

// Names someone might use for the special menu choices, whatever the language.
const ALIASES = {
    'random position': '_random_',
    'random': '_random_',
    'mouse-pointer': '_mouse_',
    'mouse pointer': '_mouse_',
    'mouse': '_mouse_',
    'edge': '_edge_',
    'myself': '_myself_',
    'stage': '_stage_'
};

/**
 * The choices a menu offers.
 * @param {object} spec Input or field description from the catalog.
 * @param {object} block The block holding the menu.
 * @param {string} name Input or field name.
 * @param {object} program The program holding the block.
 * @param {object} context See `context.js`.
 * @returns {Array<{value: string, label: string}>} The choices, with spoken labels.
 */
const menuChoices = (spec, block, name, program, context) => {
    let values = [];
    if (spec.kind === 'choice') {
        values = spec.options;
    } else if (spec.kind === 'backdrop') {
        values = context.names('backdrops');
    } else if (spec.kind === 'property') {
        const object = program.blocks[block.inputs.OBJECT?.shadow]?.fields.OBJECT?.value;
        values = context.properties(object);
    } else {
        const special = spec.special.filter(value => value !== '_myself_' || !context.isStage);
        values = [...special, ...(spec.source ? context.names(spec.source) : [])];
    }
    const menuBlock = spec.menu ? {opcode: spec.menu, id: `brailled-menu-${spec.menu}`} : block;
    const labels = context.menuLabels(menuBlock, spec.field || name);
    return values.map(value => ({
        value,
        label: labels.find(([, optionValue]) => optionValue === value)?.[0] ||
            Object.keys(ALIASES).find(alias => ALIASES[alias] === value) || value
    }));
};

const resolveChoice = (choices, given, slot) => {
    if (choices.length === 0) throw new CommandError('noChoices', {slot});
    const wanted = String(given).trim()
        .toLowerCase();
    const found = choices.find(choice => choice.value === given) ||
        choices.find(choice => choice.value.toLowerCase() === wanted) ||
        choices.find(choice => String(choice.label).toLowerCase() === wanted) ||
        choices.find(choice => choice.value === ALIASES[wanted]);
    if (!found) {
        throw new CommandError('notAChoice', {
            value: String(given),
            slot,
            options: choices.map(choice => choice.label).join(', ')
        });
    }
    return found.value;
};

const typedValue = (spec, given, slot) => {
    const value = String(given);
    const trimmed = value.trim();
    const numeric = trimmed !== '' && Number.isFinite(Number(trimmed));
    const fail = key => {
        throw new CommandError(key, {value, slot});
    };
    switch (spec.type) {
    case 'text':
        return value;
    case 'colour':
        return parseColour(value) || fail('notAColour');
    case 'number':
    case 'angle':
        return numeric || trimmed === '' ? trimmed : fail('notANumber');
    case 'positive':
        return numeric && Number(trimmed) >= 0 ? trimmed : fail('notPositive');
    case 'whole':
        return numeric && Number.isInteger(Number(trimmed)) && Number(trimmed) >= 0 ?
            trimmed : fail('notWhole');
    case 'integer':
        return numeric && Number.isInteger(Number(trimmed)) ? trimmed : fail('notWhole');
    default:
        // A list position.
        if (spec.words.includes(trimmed.toLowerCase())) return trimmed.toLowerCase();
        return numeric && Number.isInteger(Number(trimmed)) && Number(trimmed) >= 1 ?
            trimmed : fail('notAPosition');
    }
};

const VARIABLE_KINDS = {
    variable: {names: 'variables', type: '', missing: 'noVariable'},
    list: {names: 'lists', type: 'list', missing: 'noList'},
    broadcast: {names: 'broadcasts', type: 'broadcast_msg'}
};

// Whether no value was given, so that the default applies.
const isAbsent = given => given === null || typeof given === 'undefined';

// A field naming a variable, list or message; `given` is its name, or absent for the first one.
const variableField = (kind, name, given, context) => {
    const {names, type, missing} = VARIABLE_KINDS[kind];
    const wanted = isAbsent(given) ? null : String(given).trim();
    let found = wanted === null ?
        context[names][0] :
        context[names].find(item => item.name.toLowerCase() === wanted.toLowerCase());
    if (!found && kind === 'broadcast') {
        // As in the palette, naming a new message creates it.
        if (wanted === '') throw new CommandError('emptyMessage');
        found = context.createBroadcast(wanted || 'message1');
    }
    if (!found) throw new CommandError(missing, {name: wanted || ''});
    return {name, value: found.name, id: found.id, variableType: type};
};

const newBlock = (context, opcode, parent, extra = {}) => ({
    id: context.newId(),
    opcode,
    inputs: {},
    fields: {},
    next: null,
    parent,
    topLevel: false,
    shadow: false,
    ...extra
});

const setField = (program, block, name, given, context) => {
    const spec = CATALOG[block.opcode].fields[name];
    if (VARIABLE_KINDS[spec.kind]) {
        block.fields[name] = variableField(spec.kind, name, given, context);
    } else {
        const choices = menuChoices(spec, block, name, program, context);
        const value = isAbsent(given) ?
            (choices.find(choice => choice.value === spec.value) || choices[0])?.value :
            given;
        block.fields[name] = {name, value: resolveChoice(choices, value, name)};
    }
    if (block.opcode === 'control_stop') {
        block.mutation = {
            tagName: 'mutation',
            children: [],
            hasnext: String(block.fields.STOP_OPTION.value === 'other scripts in sprite')
        };
    }
};

// The shadow block of an input, holding `given`, or the default when `given` is absent.
const fillShadow = (program, block, name, given, context) => {
    const spec = CATALOG[block.opcode].inputs[name];
    const existing = program.blocks[block.inputs[name]?.shadow];
    let opcode;
    let field;
    if (spec.type === 'menu') {
        [opcode, field] = [spec.menu, spec.field];
    } else if (spec.type === 'broadcast') {
        [opcode, field] = ['event_broadcast_menu', 'BROADCAST_OPTION'];
    } else {
        [opcode, field] = SHADOWS[spec.type];
    }
    const shadow = existing || newBlock(context, opcode, block.id, {shadow: true});

    if (spec.type === 'broadcast') {
        shadow.fields[field] = variableField('broadcast', field, given, context);
    } else if (spec.type === 'menu') {
        const choices = menuChoices(spec, block, name, program, context);
        const value = isAbsent(given) ?
            (choices.find(choice => choice.value === spec.value) || choices[0])?.value :
            given;
        shadow.fields[field] = {name: field, value: resolveChoice(choices, value, name)};
    } else {
        const initial = spec.from ? String(Math.round(context.position[spec.from])) : spec.value;
        const value = isAbsent(given) ? initial : typedValue(spec, given, name);
        shadow.fields[field] = {name: field, value};
    }
    program.blocks[shadow.id] = shadow;
    return shadow.id;
};

// Creating a block sets its values, and a value can be a new block, so each calls the other.
let setValue = null;

const checkTarget = (opcode, context) => {
    const {only} = CATALOG[opcode];
    if (only === 'sprite' && context.isStage) throw new CommandError('notForStage', {opcode});
    if (only === 'stage' && !context.isStage) throw new CommandError('onlyForStage', {opcode});
};

/**
 * Add a new block, with its default or given values, to a program. It is not attached to anything.
 * @param {object} program The program to add to.
 * @param {string} opcode The kind of block.
 * @param {object} args Values by input or field name.
 * @param {object} context See `context.js`.
 * @param {?string} parent Id of the block it will be plugged into.
 * @returns {object} The new block.
 */
const createBlock = (program, opcode, args, context, parent = null) => {
    const entry = lookup(CATALOG, opcode);
    if (!entry) {
        throw new CommandError(shapeOf({opcode, fields: {}}, context.extensionShape) ?
            'cannotCreate' : 'unknownOpcode', {opcode});
    }
    checkTarget(opcode, context);
    const unknown = Object.keys(args).find(name => !lookup(entry.inputs, name) && !lookup(entry.fields, name));
    if (unknown) {
        const options = [...Object.keys(entry.inputs), ...Object.keys(entry.fields)].join(', ');
        throw new CommandError('noSuchValue', {opcode, name: unknown, options});
    }
    const block = newBlock(context, opcode, parent);
    program.blocks[block.id] = block;
    // Inputs come first: the choices of some fields depend on them.
    for (const name of Object.keys(entry.inputs)) {
        if (entry.inputs[name].type !== 'boolean') {
            const shadow = fillShadow(program, block, name, null, context);
            block.inputs[name] = {name, block: shadow, shadow};
        }
        if (Object.prototype.hasOwnProperty.call(args, name)) {
            setValue(program, block.id, name, args[name], context);
        }
    }
    for (const name of Object.keys(entry.fields)) {
        setField(program, block, name, args[name], context);
    }
    return block;
};

/**
 * Change one value of a block.
 * @param {object} program The program holding the block.
 * @param {string} id The block.
 * @param {string} name Input or field name.
 * @param {*} value Text or a number, `{block, args}` to plug in a block, or null to empty the slot.
 * @param {object} context See `context.js`.
 */
setValue = (program, id, name, value, context) => {
    const block = getBlock(program, id);
    const entry = lookup(CATALOG, block.opcode);
    if (!entry) throw new CommandError('unknownBlock', {opcode: block.opcode});

    if (lookup(entry.fields, name)) {
        if (value === null || typeof value === 'object') throw new CommandError('plainValueOnly', {slot: name});
        setField(program, block, name, value, context);
        return;
    }
    const spec = lookup(entry.inputs, name);
    if (!spec) {
        const options = [...Object.keys(entry.inputs), ...Object.keys(entry.fields)].join(', ');
        throw new CommandError('noSuchValue', {opcode: block.opcode, name, options});
    }

    const input = block.inputs[name];
    const plugged = input && input.block !== input.shadow ? input.block : null;
    const unplug = () => {
        if (plugged) subtree(program, plugged).forEach(child => delete program.blocks[child]);
    };
    const isNested = value !== null && typeof value === 'object';

    if (isNested) {
        const shape = shapeOf({opcode: value.block, fields: {}}, context.extensionShape);
        if (shape && !isValue(shape)) throw new CommandError('instructionAsValue', {opcode: value.block});
        if (shape && spec.type === 'boolean' && shape !== 'boolean') {
            throw new CommandError('needsConditionHere', {slot: name});
        }
        unplug();
        const child = createBlock(program, value.block, value.args || {}, context, id);
        const shadow = spec.type === 'boolean' ?
            null :
            (program.blocks[input?.shadow] ? input.shadow :
                fillShadow(program, block, name, null, context));
        block.inputs[name] = {name, block: child.id, shadow};
    } else if (spec.type === 'boolean') {
        if (value !== null) throw new CommandError('needsConditionHere', {slot: name});
        unplug();
        delete block.inputs[name];
    } else {
        unplug();
        const shadow = fillShadow(program, block, name, value, context);
        block.inputs[name] = {name, block: shadow, shadow};
    }

    // What can be asked about depends on which sprite is asked.
    if (block.opcode === 'sensing_of' && name === 'OBJECT' && block.fields.PROPERTY) {
        const choices = menuChoices(entry.fields.PROPERTY, block, 'PROPERTY', program, context);
        if (!choices.some(choice => choice.value === block.fields.PROPERTY.value)) {
            setField(program, block, 'PROPERTY', null, context);
        }
    }
};

export {
    createBlock,
    menuChoices,
    setValue
};
