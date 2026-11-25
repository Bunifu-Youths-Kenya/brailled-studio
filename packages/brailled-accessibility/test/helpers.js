// A stand-in project around the VM's real block container.
import {createEditor} from '../src/commands/editor.js';
import {snapshot} from '../src/commands/program.js';

const Blocks = require('../../scratch-vm/src/engine/blocks.js');

const copy = value => JSON.parse(JSON.stringify(value));

const variable = (id, name, type = '') => ({id, name, type, value: 0});

const makeProject = ({program = {blocks: {}, scripts: []}, isStage = false} = {}) => {
    const runtime = {targets: [], _blockInfo: [], emitProjectChanged: () => {}};
    const makeTarget = (id, name, stage) => ({
        id,
        isStage: stage,
        isOriginal: true,
        blocks: new Blocks(runtime),
        comments: {},
        variables: {},
        sprite: {name, costumes: [{name: `${name} one`}, {name: `${name} two`}], sounds: [{name: 'Meow'}]},
        getName: () => name,
        createVariable (variableId, variableName, type) {
            if (!this.variables[variableId]) {
                this.variables[variableId] = variable(variableId, variableName, type);
            }
        }
    });
    const stage = makeTarget('stage', 'Stage', true);
    const sprite = makeTarget('sprite1', 'Sprite1', false);
    const other = makeTarget('sprite2', 'Apple', false);
    stage.variables = {
        score: variable('score', 'my variable'),
        names: variable('names', 'fruit', 'list')
    };
    runtime.targets = [stage, sprite, other];
    runtime.getTargetForStage = () => stage;
    const target = isStage ? stage : sprite;
    const copied = copy(program);
    Object.values(copied.blocks).forEach(block => target.blocks.createBlock(block));
    target.blocks.getScripts().splice(0, Infinity, ...copied.scripts);

    const vm = {editingTarget: target, runtime, emitWorkspaceUpdate: jest.fn()};
    let ids = 0;
    const editor = createEditor(vm, {newId: () => `new${++ids}`});
    return {vm, editor, target, stage, other, program: () => snapshot(target.blocks)};
};

// Every link between blocks must agree from both ends.
const problems = ({blocks, scripts}) => {
    const found = [];
    for (const block of Object.values(blocks)) {
        if (block.next && blocks[block.next]?.parent !== block.id) found.push(`next of ${block.id}`);
        for (const input of Object.values(block.inputs)) {
            for (const child of [input.block, input.shadow]) {
                if (child && !blocks[child]) found.push(`missing ${child} in ${block.id}`);
            }
            if (input.block && blocks[input.block]?.parent !== block.id) found.push(`input of ${block.id}`);
        }
        if (block.parent) {
            const parent = blocks[block.parent];
            const linked = parent && (parent.next === block.id || Object.values(parent.inputs)
                .some(input => input.block === block.id || input.shadow === block.id));
            if (!linked) found.push(`orphan ${block.id}`);
        }
        const isTop = !block.parent && !block.shadow;
        if (isTop !== scripts.includes(block.id)) found.push(`script list and ${block.id}`);
    }
    return found;
};

export {
    makeProject,
    problems
};
