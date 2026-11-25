// A small project made of the VM's real targets and block containers.
import {createEditor} from '../src/commands/editor.js';
import {snapshot} from '../src/commands/program.js';

const Blocks = require('../../scratch-vm/src/engine/blocks.js');
const Target = require('../../scratch-vm/src/engine/target.js');

const copy = value => JSON.parse(JSON.stringify(value));

const makeProject = ({program = {blocks: {}, scripts: []}, isStage = false} = {}) => {
    const runtime = {
        targets: [],
        _blockInfo: [],
        emitProjectChanged: () => {},
        requestBlocksUpdate: () => {},
        requestRemoveMonitor: () => {},
        requestUpdateMonitor: () => {},
        canAddCloudVariable: () => false
    };
    runtime.monitorBlocks = new Blocks(runtime, true);
    const makeTarget = (id, name, stage) => {
        const target = new Target(runtime);
        Object.assign(target, {
            id,
            isStage: stage,
            isOriginal: true,
            sprite: {name, costumes: [{name: `${name} one`}, {name: `${name} two`}], sounds: [{name: 'Meow'}]},
            getName: () => name
        });
        return target;
    };
    const stage = makeTarget('stage', 'Stage', true);
    const sprite = makeTarget('sprite1', 'Sprite1', false);
    const other = makeTarget('sprite2', 'Apple', false);
    stage.createVariable('score', 'my variable', '');
    stage.createVariable('names', 'fruit', 'list');
    runtime.targets = [stage, sprite, other];
    runtime.getTargetForStage = () => stage;
    const target = isStage ? stage : sprite;
    const copied = copy(program);
    Object.values(copied.blocks).forEach(block => target.blocks.createBlock(block));
    target.blocks.getScripts().splice(0, Infinity, ...copied.scripts);

    const vm = {editingTarget: target, runtime, emitWorkspaceUpdate: jest.fn()};
    runtime.getEditingTarget = () => vm.editingTarget;
    let ids = 0;
    const editor = createEditor(vm, {newId: () => `new${++ids}`});
    // Everything a command may change, in every target.
    const everything = () => copy(runtime.targets.map(t => ({
        ...snapshot(t.blocks),
        variables: Object.fromEntries(Object.entries(t.variables)
            .map(([key, variable]) => [key, {name: variable.name, type: variable.type, value: variable.value}]))
    })));
    return {vm, editor, target, stage, other, program: () => snapshot(target.blocks), everything};
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
