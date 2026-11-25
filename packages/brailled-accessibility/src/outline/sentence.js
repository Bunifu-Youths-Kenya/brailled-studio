import {FALLBACK_LABELS} from './fallback-labels.js';

/**
 * @callback GetDefinition
 * @param {object} block A block from the VM.
 * @returns {?{lines: Array<{message: string, args: Array<object>}>}} The scratch-blocks JSON for the block.
 */

const BRANCH_INPUT = /^SUBSTACK\d*$/;

const tidy = text => text.replace(/\s+/g, ' ').trim();

// "motion_movesteps" becomes "motion: movesteps"; camel case is split into words.
const humanizeOpcode = opcode => {
    const [category, ...rest] = opcode.split('_');
    const name = rest.join(' ').replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase();
    return name ? `${category}: ${name}` : category;
};

const fieldText = (block, name, arg) => {
    const field = block.fields[name];
    if (!field) return '';
    const value = String(field.value);
    if (arg && arg.options) {
        const options = typeof arg.options === 'function' ? arg.options() : arg.options;
        const option = options.find(([, optionValue]) => optionValue === value);
        if (option && typeof option[0] === 'string') return option[0];
    }
    return value;
};

/**
 * Create a function that turns a VM block into a sentence.
 * @param {object} options Options.
 * @param {{[id: string]: object}} options.blocks All of the sprite's blocks, by id.
 * @param {GetDefinition} options.getDefinition Looks up a block's label definition.
 * @param {object} options.words Wording from `words.js`.
 * @returns {function(object): string} Describes one block, including the reporters plugged into it.
 */
const createDescriber = ({blocks, getDefinition, words}) => {
    // These functions describe each other: an input holds a block, which has inputs of its own.
    let describe = null;

    const inputText = (block, name) => {
        const input = block.inputs[name];
        const child = input && blocks[input.block];
        if (!child) return words.blank;
        if (child.opcode === 'procedures_prototype') {
            const names = JSON.parse(child.mutation.argumentnames);
            let index = 0;
            return tidy(child.mutation.proccode.replace(/%[snb]/g, () => `(${names[index++]})`));
        }
        // A shadow block is the value typed or chosen in the slot itself.
        if (child.shadow) {
            const fields = Object.keys(child.fields);
            if (fields.length === 0) return describe(child);
            const definition = getDefinition(child);
            const args = definition ? definition.lines.flatMap(line => line.args) : [];
            const text = fields
                .map(field => fieldText(child, field, args.find(arg => arg.name === field)))
                .join(' ');
            return text === '' ? words.blank : text;
        }
        return `(${describe(child)})`;
    };

    const callText = block => {
        const ids = JSON.parse(block.mutation.argumentids);
        let index = 0;
        return block.mutation.proccode.replace(/%[snb]/g, () => inputText(block, ids[index++]));
    };

    const fromDefinition = (block, definition) => {
        const parts = [];
        for (const {message, args} of definition.lines) {
            // Lines after the first nested stack label the later stacks, not the block.
            if (args.some(arg => arg.type === 'input_statement')) break;
            parts.push(message.replace(/%(\d+)/g, (match, position) => {
                const arg = args[position - 1];
                if (!arg) return '';
                if (arg.type === 'input_value') return inputText(block, arg.name);
                if (arg.type === 'field_image') return words.images[block.opcode] || '';
                if (arg.type.startsWith('field_') && arg.name) return fieldText(block, arg.name, arg);
                return '';
            }));
        }
        return parts.join(' ');
    };

    const fromFallback = block => {
        const template = FALLBACK_LABELS[block.opcode];
        if (template) {
            return template.replace(/\[([A-Za-z0-9_]+)\]/g, (match, name) => (
                block.fields[name] ? fieldText(block, name) : inputText(block, name)
            ));
        }
        const values = [
            ...Object.keys(block.fields).map(name => `${name.toLowerCase()} ${fieldText(block, name)}`),
            ...Object.keys(block.inputs)
                .filter(name => !BRANCH_INPUT.test(name))
                .map(name => `${name.toLowerCase()} ${inputText(block, name)}`)
        ];
        return [humanizeOpcode(block.opcode), ...values].join(', ');
    };

    describe = block => {
        if (block.opcode === 'procedures_call') return tidy(callText(block));
        const definition = getDefinition(block);
        const text = definition && tidy(fromDefinition(block, definition));
        return text || tidy(fromFallback(block));
    };

    return describe;
};

export {
    BRANCH_INPUT,
    createDescriber,
    humanizeOpcode
};
