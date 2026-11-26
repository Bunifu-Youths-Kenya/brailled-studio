// A real project, editing engine, approval gate and AI helper, with only the AI's server stood in for.
import {createApp} from '../src/actions/app.js';
import {createAssistant} from '../src/ai/assistant.js';
import {createAiPorts} from '../src/proposals/ai-ports.js';
import {createExecutor} from '../src/proposals/executor.js';
import {createGate} from '../src/proposals/gate.js';
import {createProposalQueue} from '../src/proposals/queue.js';
import {createSettings} from '../src/settings.js';
import sample from './fixtures/simple-sequence.json';
import {makeProject} from './helpers.js';

const Target = require('../../scratch-vm/src/engine/target.js');
const spriteLibrary = require('../../scratch-gui/src/lib/libraries/sprites.json');

const answer = reply => ({ok: true, status: 200, json: () => Promise.resolve({reply})});
const failure = (status, error) => ({ok: false, status, json: () => Promise.resolve({error})});

/**
 * @param {object} [options] Options.
 * @param {Function} [options.respond] The AI server: given the request's body and number, returns a response.
 * @param {object} [options.school] What the configuration file says besides turning voice and the helper on.
 * @returns {object} The parts, with helpers.
 */
const setUp = ({respond = () => answer({type: 'explanation', text: 'Hello.'}), school = {}} = {}) => {
    const project = makeProject({program: sample});
    const {vm} = project;
    const {runtime} = vm;
    vm.start = jest.fn();
    vm.greenFlag = jest.fn();
    vm.stopAll = jest.fn();
    vm.setEditingTarget = jest.fn(id => {
        vm.editingTarget = runtime.targets.find(target => target.id === id);
    });
    vm.deleteSprite = jest.fn(id => {
        runtime.targets = runtime.targets.filter(target => target.id !== id);
        // The virtual machine picks another sprite, not always the one that was selected before.
        vm.editingTarget = runtime.targets.at(-1);
    });

    const reader = {speak: jest.fn(() => true), stop: jest.fn(), isAvailable: () => true};
    const configured = {voice: true,
        ai: true,
        aiEndpoint: '/api/assistant',
        approval: 'every',
        proposalExpirySeconds: 120,
        assistantMode: 'build',
        ...school};
    const config = {get: () => configured, subscribe: () => () => {}};
    const settings = createSettings(null);
    const app = createApp(vm, {config, reader, settings});
    const device = {name: null, connected: false, mode: 'live'};
    // The page, as far as the snapshot reads it.
    app.snapshot = () => ({
        view: {tab: 'code', scripts: 'outline'},
        sprite: {name: vm.editingTarget.getName(), isStage: false},
        device: {...device},
        actions: []
    });
    const gui = {tab: 0, view: 'outline'};
    app.register('gui', gui);
    const outline = {block: 'move'};
    app.register('outline', {currentBlock: () => outline.block, isMoving: () => false});
    const sprites = {
        items: spriteLibrary,
        openLibrary: jest.fn(),
        closeLibrary: jest.fn(),
        add: jest.fn(item => {
            const target = new Target(runtime);
            Object.assign(target, {
                id: `added-${item.name}`,
                isStage: false,
                isOriginal: true,
                sprite: {name: item.name, costumes: [], sounds: []},
                getName: () => item.name
            });
            runtime.targets.push(target);
            vm.editingTarget = target;
            return Promise.resolve();
        })
    };
    app.register('sprites', sprites);

    const heard = [];
    app.subscribe(text => heard.push(text));
    const highlight = jest.fn();
    const queue = createProposalQueue();
    let assistant = null;
    const windows = {open: false};
    const gate = createGate({app,
        executor: createExecutor(app),
        revise: r => assistant.revise(r),
        highlight,
        windowOpen: () => windows.open});
    queue.connect(gate.take);
    const requests = [];
    const fetch = jest.fn((url, options) => {
        const request = {url, options, body: JSON.parse(options.body)};
        requests.push(request);
        return Promise.resolve(respond(request.body, requests.length));
    });
    const ports = createAiPorts(app, queue.submitter);
    assistant = createAssistant({ports, endpoint: '/api/assistant', fetch});
    app.register('gate', gate);
    app.register('assistant', assistant);

    // Let timers and promises run, for less time than a proposal lasts.
    const settle = async (time = 2000) => {
        for (let passed = 0; passed < time; passed += 100) await jest.advanceTimersByTimeAsync(100);
    };
    // Everything a proposal could change, whatever order it is held in.
    const sorted = (key, value) => (value && typeof value === 'object' && !Array.isArray(value) ?
        Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) :
        value);
    const data = () => JSON.stringify(runtime.targets.map(target => [target.id, target.blocks._blocks,
        Object.values(target.variables).map(item => [item.name, item.value])]), sorted);
    const program = () => app.editor.outline().flatMap(function walk (node) {
        return [...(node.type === 'block' ? [node.text] : []), ...(node.children || []).flatMap(walk)];
    });
    // The reference that the AI would be given for a block of this kind.
    const refOf = (body, opcode) => body.program.find(line => line.includes(` ${opcode}:`)).trim()
        .split(' ')[0];

    return {app,
        assistant,
        data,
        device,
        fetch,
        gate,
        gui,
        heard,
        highlight,
        outline,
        ports,
        program,
        project,
        queue,
        reader,
        refOf,
        requests,
        settings,
        settle,
        sprites,
        vm,
        windows};
};

export {
    answer,
    failure,
    setUp,
    spriteLibrary
};
