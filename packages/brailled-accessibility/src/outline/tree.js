import {FALLBACK_BRANCHES} from './fallback-labels.js';
import {BRANCH_INPUT, createDescriber} from './sentence.js';
import DEFAULT_WORDS from './words.js';

/**
 * @typedef {object} OutlineNode
 * @property {string} id Stable id: the block id, or one derived from it.
 * @property {'script'|'block'|'branch'|'empty'} type What the node stands for.
 * @property {string} text The sentence to show and read.
 * @property {number} level Depth in the tree, starting at 1.
 * @property {number} setsize Number of nodes beside this one, including it.
 * @property {number} posinset Position among those nodes, starting at 1.
 * @property {?OutlineNode[]} children Child nodes, or null if the node cannot be expanded.
 * @property {string} [opcode] Block opcode, for block nodes.
 * @property {?string} [previousId] Id of the block this one hangs from in the VM, for block nodes.
 */

// Set each node's place among its siblings.
const place = (nodes, level) => nodes.map((node, index) => ({
    ...node,
    level,
    setsize: nodes.length,
    posinset: index + 1,
    children: node.children && place(node.children, level + 1)
}));

const branchNames = (block, definition) => {
    const names = new Set(FALLBACK_BRANCHES[block.opcode]);
    if (definition) {
        for (const {args} of definition.lines) {
            args.filter(arg => arg.type === 'input_statement').forEach(arg => names.add(arg.name));
        }
    }
    Object.keys(block.inputs)
        .filter(name => BRANCH_INPUT.test(name))
        .forEach(name => names.add(name));
    return Array.from(names).sort();
};

// The text that scratch-blocks puts between two nested stacks, such as "else".
const branchLabel = (definition, name, index, words) => {
    if (definition) {
        const at = definition.lines.findIndex(line => line.args.some(arg => arg.name === name));
        const before = at > 0 && definition.lines[at - 1];
        if (index > 0 && before && before.args.length === 0) return before.message;
    }
    if (index === 0) return words.then;
    if (index === 1) return words.else;
    return words.otherBranch(index + 1);
};

/**
 * Build the outline of one sprite's program from the VM's block data.
 * @param {object} options Options.
 * @param {{[id: string]: object}} options.blocks The target's blocks by id (`target.blocks._blocks`).
 * @param {string[]} options.scripts Ids of the top-level blocks (`target.blocks.getScripts()`).
 * @param {function(object): ?object} [options.getDefinition] Label definitions; see `sentence.js`.
 * @param {object} [options.words] Wording; see `words.js`.
 * @returns {OutlineNode[]} One node per script.
 */
const buildOutline = ({blocks, scripts, getDefinition = () => null, words = DEFAULT_WORDS}) => {
    const describe = createDescriber({blocks, getDefinition, words});

    const buildStack = firstId => {
        const nodes = [];
        for (let block = blocks[firstId]; block; block = blocks[block.next]) {
            const definition = getDefinition(block);
            const names = branchNames(block, definition);
            const stack = name => {
                const input = block.inputs[name];
                if (input && blocks[input.block]) return buildStack(input.block);
                return [{id: `${block.id}:${name}:empty`, type: 'empty', text: words.emptyBranch, children: null}];
            };
            let children = null;
            if (names.length === 1) {
                children = stack(names[0]);
            } else if (names.length > 1) {
                children = names.map((name, index) => ({
                    id: `${block.id}:${name}`,
                    type: 'branch',
                    text: branchLabel(definition, name, index, words),
                    children: stack(name)
                }));
            }
            nodes.push({
                id: block.id,
                type: 'block',
                opcode: block.opcode,
                previousId: block.parent,
                text: describe(block),
                children
            });
        }
        return nodes;
    };

    const tops = scripts.filter(id => blocks[id] && !blocks[id].shadow);
    return place(tops.map((id, index) => {
        const children = buildStack(id);
        return {
            id: `script:${id}`,
            type: 'script',
            text: words.script(index + 1, tops.length, children[0].text),
            children
        };
    }), 1);
};

export default buildOutline;
