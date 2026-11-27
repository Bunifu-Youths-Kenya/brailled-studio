// The approval gate: nothing changes without the student's approval.
import {routeCommand} from '../src/actions/route.js';
import {withBlockIds} from '../src/ai/refs.js';
import {parseAnswer} from '../src/proposals/answers.js';
import {checkSteps} from '../src/proposals/check.js';
import {SETTLE_MS} from '../src/proposals/gate.js';
import {createMachine, FINISHED} from '../src/proposals/machine.js';
import {timeLimit} from '../src/proposals/messages.js';
import {needsApproval, proposalRisk, SAFE_ACTIONS, stepRisk, undoable} from '../src/proposals/risk.js';
import {stepRef} from '../src/proposals/steps.js';
import {setUp} from './proposal-setup.js';

// The usual time a proposal waits.
const EXPIRY_MS = 120000;
// The school's configuration asking about big changes only.
const bigOnly = {school: {approval: 'big'}};

describe('the state machine', () => {
    const path = (...events) => {
        const machine = createMachine();
        return [machine.state(), ...events.map(event => machine.send(event))];
    };

    test('goes from idle through approval to done', () => {
        expect(path('propose', 'approve', 'execute', 'finish'))
            .toEqual(['idle', 'proposed', 'approved', 'executing', 'done']);
    });

    test.each([['reject', 'rejected'], ['revise', 'revised'], ['expire', 'expired']])(
        'a proposal that is told to %s ends as %s', (event, state) => {
            expect(path('propose', event).at(-1)).toBe(state);
        });

    test('goes back to proposed for the next step', () => {
        expect(path('propose', 'approve', 'execute', 'next', 'approve', 'execute', 'finish').at(-1)).toBe('done');
    });

    test('an approved proposal can still expire before it starts', () => {
        expect(path('propose', 'approve', 'expire').at(-1)).toBe('expired');
    });

    test.each(FINISHED)('after %s, only a new proposal is possible', state => {
        const routes = {done: ['approve', 'execute', 'finish'],
            rejected: ['reject'],
            revised: ['revise'],
            expired: ['expire']};
        const machine = createMachine();
        ['propose', ...routes[state]].forEach(event => machine.send(event));
        for (const event of ['approve', 'proceed', 'execute', 'finish', 'next', 'reject', 'revise', 'expire']) {
            expect(machine.allows(event)).toBe(false);
        }
        expect(machine.send('propose')).toBe('proposed');
    });

    test.each([
        [[], 'approve'], [[], 'execute'], [[], 'proceed'],
        [['propose'], 'execute'], [['propose'], 'finish'], [['propose'], 'propose'],
        [['propose', 'approve'], 'finish'],
        [['propose', 'approve', 'execute'], 'approve'], [['propose', 'approve', 'execute'], 'propose'],
        [['propose', 'reject'], 'approve'], [['propose', 'expire'], 'approve']
    ])('after %j refuses to %s', (events, event) => {
        const machine = createMachine();
        events.forEach(e => machine.send(e));
        expect(() => machine.send(event)).toThrow(/cannot/);
    });

    test('proceeds without approval only if it needs none, which must be said', () => {
        const asks = createMachine();
        asks.send('propose');
        expect(asks.allows('proceed')).toBe(false);
        const free = createMachine();
        free.send('propose', {needsApproval: false});
        expect(free.send('proceed')).toBe('executing');
        // The next proposal asks again.
        free.send('finish');
        free.send('propose', {});
        expect(free.allows('proceed')).toBe(false);
    });
});

describe('risk', () => {
    const live = {connected: false, mode: 'live'};
    const risk = (step, detail = null, device = live) => stepRisk({step, detail, device});
    const command = op => ({command: {op}});

    test.each(['help.whereAmI', 'go.stage', 'view.outline', 'move.next', 'program.describe', 'project.stop',
        'sprite.library'])('%s is safe', action => {
        expect(risk({action})).toBe('safe');
    });

    test.each(['insert', 'set-value', 'move', 'wrap', 'create', 'rename', 'undo', 'redo'])('%s is an edit', op => {
        expect(risk(command(op))).toBe('edit');
    });

    test('reading is safe, and adding a sprite is an edit', () => {
        expect(risk(command('describe'))).toBe('safe');
        expect(risk({sprite: {name: 'Dragon'}})).toBe('edit');
    });

    test('deleting a script, or more than one block, is hard to undo', () => {
        expect(risk(command('delete'), {instructions: 1, wholeScript: false})).toBe('edit');
        expect(risk(command('delete'), {instructions: 1, wholeScript: true})).toBe('big');
        expect(risk(command('delete'), {instructions: 3, wholeScript: false})).toBe('big');
        expect(risk(command('delete'))).toBe('big');
    });

    test('running with a device or in Upload mode is hard to undo', () => {
        expect(risk({action: 'project.run'})).toBe('edit');
        expect(risk({action: 'project.run'}, null, {connected: true, mode: 'live'})).toBe('big');
        expect(risk({action: 'project.run'}, null, {connected: false, mode: 'upload'})).toBe('big');
    });

    test('anything unknown, such as deleting a sprite or uploading, is treated as hard to undo', () => {
        for (const step of [{action: 'sprite.delete'}, {action: 'device.upload'}, {action: 'robot.run'},
            command('overwrite')]) {
            expect(risk(step)).toBe('big');
        }
    });

    test('many changes at once are big', () => {
        expect(proposalRisk(['edit', 'edit', 'edit', 'safe'])).toBe('edit');
        expect(proposalRisk(['edit', 'edit', 'edit', 'edit'])).toBe('big');
        expect(proposalRisk(['safe', 'safe'])).toBe('safe');
        expect(proposalRisk(['safe', 'big'])).toBe('big');
    });

    const insert = {command: {op: 'insert'}};
    const asks = (steps, risks, level) => needsApproval({steps, risks, level});

    test.each([
        ['safe', 'every', false], ['safe', 'big', false],
        ['edit', 'every', true], ['edit', 'big', false],
        ['big', 'every', true], ['big', 'big', true],
        ['edit', 'nonsense', true]
    ])('%s at level %s asks: %s', (given, level, expected) => {
        expect(asks([insert], [given], level)).toBe(expected);
    });

    test.each([
        ['running the project', {action: 'project.run'}],
        ['an undo', {command: {op: 'undo'}}],
        ['a redo', {command: {op: 'redo'}}]
    ])('%s is asked about even when only big changes are, as "undo" cannot take it back', (_, step) => {
        expect(undoable(step)).toBe(false);
        expect(asks([step], ['edit'], 'big')).toBe(true);
        expect(asks([insert, step], ['edit', 'edit'], 'big')).toBe(true);
    });

    test('adding a sprite and editing commands can be taken back', () => {
        const edits = ['insert', 'delete', 'set-value', 'move', 'wrap', 'create', 'rename'];
        for (const step of [{sprite: {name: 'Dragon'}}, ...edits.map(op => ({command: {op}}))]) {
            expect(undoable(step)).toBe(true);
        }
    });

    test.each(['sprite.delete', 'device.upload', 'robot.run'])(
        'deleting a sprite, uploading and running a robot must always be asked about: %s', action => {
            const step = {action};
            for (const level of ['every', 'big']) {
                expect(asks([step], [stepRisk({step, device: {mode: 'live'}})], level)).toBe(true);
            }
            expect(SAFE_ACTIONS.has(action)).toBe(false);
        });
});

describe('answers', () => {
    test.each([
        ['yes', 'approve'], ['Yes.', 'approve'], ['go ahead', 'approve'], ['yes, go ahead', 'approve'],
        ['no', 'reject'], ['No thanks', 'reject'], ['cancel', 'reject'],
        ['yes to all', 'all'], ['step by step', 'steps'], ['one at a time', 'steps']
    ])('%j means %s', (text, type) => {
        expect(parseAnswer(text)).toEqual({type});
    });

    test.each([
        ['change it: three seconds', 'three seconds'], ['Change it to 3', 'to 3'],
        ['please change that, make it faster', 'make it faster'], ['change it', ''], ['Change it: ', '']
    ])('%j asks for a change: %j', (text, wanted) => {
        expect(parseAnswer(text)).toEqual({type: 'change', text: wanted});
    });

    test.each(['', 'ok', 'sure', 'yes but not that', 'maybe', 'yeah no', 'yesterday', 'do not', 'go',
        'change x by 10', 'I said yes', 'no yes'])('%j approves nothing', text => {
        const answer = parseAnswer(text);
        expect(['approve', 'all']).not.toContain(answer?.type);
    });
});

// A proposal as the AI side submits it, with ids already in place of references.
const wait = {command: {op: 'insert', block: 'control_wait', after: 'move', args: {DURATION: 5}}};
const turn = {command: {op: 'insert', block: 'motion_turnright', after: 'move'}};

describe('checking steps with the validator', () => {
    test('describes each step in the editor\'s words and changes nothing', () => {
        const {app, data} = setUp();
        const before = data();
        const result = checkSteps({app, steps: [wait, {action: 'project.run'}]});
        expect(result.steps.map(step => step.sentence)).toEqual([
            'Add wait 5 seconds, after move 10 steps', 'Use the action "run"']);
        expect(data()).toBe(before);
    });

    test('lets a step use the block an earlier step makes', () => {
        const {app} = setUp();
        const result = checkSteps({app,
            steps: [
                {command: {op: 'insert', block: 'control_repeat', after: 'hat'}},
                {command: {op: 'insert', block: 'motion_movesteps', inside: {block: stepRef(1)}}},
                {command: {op: 'set-value', block: stepRef(2), name: 'STEPS', value: 25}}
            ]});
        expect(result.reason).toBeUndefined();
        expect(result.steps[2].sentence).toBe('Change move 10 steps to move 25 steps');
    });

    test('lets a step use a variable an earlier step creates', () => {
        const {app} = setUp();
        const result = checkSteps({app,
            steps: [
                {command: {op: 'create', kind: 'variable', name: 'speed'}},
                {command: {op: 'insert',
                    block: 'data_setvariableto',
                    after: 'hat',
                    args: {VARIABLE: 'speed', VALUE: 5}}}
            ]});
        expect(result.reason).toBeUndefined();
        expect(result.steps[0].sentence).toBe('Create variable speed, for all sprites');
    });

    test.each([
        ['an unknown block', [{command: {op: 'insert', block: 'motion_fly'}}], /motion_fly/],
        ['a block that is not there', [{command: {op: 'delete', block: 'gone'}}], /gone/],
        ['a block made by a later step', [{command: {op: 'delete', block: stepRef(2)}}], /Step 1/],
        ['a command outside the schema', [{command: {op: 'format-disk'}}], /unknownOperation/],
        ['a wrong value', [{command: {op: 'set-value', block: 'move', name: 'STEPS', value: 'far'}}], /number/],
        ['an action that is not offered', [{action: 'voice.settings'}], /no action/],
        ['an edit by hand', [{action: 'edit.delete'}], /no action/],
        ['approving', [{action: 'proposal.approve'}], /no action/],
        ['a sprite that is not in the library', [{sprite: {name: 'Unicorn Rider'}}], /no sprite/],
        ['a command after adding a sprite', [{sprite: {name: 'Dragon'}}, wait], /cannot follow/],
        ['nothing to undo', [{command: {op: 'undo'}}], /nothing to undo/i],
        ['undo among other steps', [wait, {command: {op: 'undo'}}], /on their own/],
        ['a second step that the first rules out', [{command: {op: 'delete', block: 'wait'}},
            {command: {op: 'delete', block: 'wait'}}], /^Step 2/],
        ['two variables of one name', [{command: {op: 'create', kind: 'variable', name: 'x'}},
            {command: {op: 'create', kind: 'variable', name: 'x'}}], /already/]
    ])('refuses %s, changing nothing', (_, steps, reason) => {
        const {app, data} = setUp();
        const before = data();
        const result = checkSteps({app, steps});
        expect(result).toMatchObject({ok: false});
        expect(result.reason).toMatch(reason);
        expect(data()).toBe(before);
    });

    test('references become ids, and ids that were not listed are refused', () => {
        const refs = new Map([['b1', 'hat'], ['b2', 'move']]);
        expect(withBlockIds([{command: {op: 'insert', block: 'control_wait', after: 'b2'}},
            {command: {op: 'delete', block: 'new1'}}], refs)).toEqual([
            {command: {op: 'insert', block: 'control_wait', after: 'move'}},
            {command: {op: 'delete', block: stepRef(1)}}]);
        for (const block of ['move', 'b3', stepRef(1), 5, null]) {
            expect(withBlockIds([{command: {op: 'delete', block}}], refs)).toBeNull();
        }
    });
});

describe('the approval gate', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const proposed = async (steps = [wait], options) => {
        const context = setUp(options);
        context.start = context.data();
        context.taken = context.gate.take({summary: 'A change.', steps});
        await context.settle();
        return context;
    };

    test('asks, and changes nothing meanwhile', async () => {
        const {gate, data, start, taken, reader, settings} = await proposed();
        expect(await taken).toEqual({accepted: true, asked: true});
        expect(gate.getState()).toMatchObject({status: 'proposed',
            proposal: {risk: 'edit',
                mode: null,
                steps: [{sentence: 'Add wait 5 seconds, after move 10 steps', risk: 'edit'}]}});
        expect(gate.isOpen()).toBe(true);
        expect(data()).toBe(start);
        expect(settings.get().readAloud).toBe(false);
        expect(reader.speak).not.toHaveBeenCalled();
    });

    test('beside the editor, a suggestion is said through the live region, for a screen reader too', async () => {
        const {gate, heard} = await proposed();
        expect(gate.getState().proposal.docked).toBe(true);
        // Said as one person asks another, with no title or label.
        expect(heard.at(-1)).toBe('A change. Add wait 5 seconds, after move 10 steps. ' +
            'Now: when green flag clicked, move 10 steps, wait 2 seconds. ' +
            'After: when green flag clicked, move 10 steps, wait 5 seconds, wait 2 seconds. Shall I? ' +
            'Say yes or go ahead, say no, or say change it, and what to change.');
    });

    test('what is hard to undo still stops the student in a window', async () => {
        const context = setUp();
        Object.assign(context.device, {name: 'micro:bit', connected: true});
        context.gate.take({steps: [{action: 'project.run'}]});
        await context.settle();
        expect(context.gate.getState().proposal).toMatchObject({risk: 'big', docked: false});
        expect(context.heard).toEqual([]);
    });

    test('with questions in windows, a suggestion is left to the window', async () => {
        const context = setUp();
        context.settings.set({voiceFirst: false});
        context.gate.take({steps: [wait]});
        await context.settle();
        expect(context.gate.getState().proposal.docked).toBe(false);
        expect(context.heard).toEqual([]);
    });

    test('reads the proposal aloud when wanted', async () => {
        const context = setUp();
        context.settings.set({readAloud: true});
        context.gate.take({summary: 'Wait a bit.', steps: [wait]});
        await context.settle();
        expect(context.reader.speak.mock.calls.at(-1)[0]).toBe(
            'Wait a bit. Add wait 5 seconds, after move 10 steps. ' +
            'Now: when green flag clicked, move 10 steps, wait 2 seconds. ' +
            'After: when green flag clicked, move 10 steps, wait 5 seconds, wait 2 seconds. Shall I? ' +
            'Say yes or go ahead, say no, or say change it, and what to change.');
    });

    test.each(['yes', 'Go ahead.'])('"%s" approves: it is done, read back and can be undone', async words => {
        const {app, gate, data, start, heard, program, highlight, settle} = await proposed();
        routeCommand(app, words, 'voice');
        await settle();
        expect(program()).toEqual(['when green flag clicked', 'move 10 steps', 'wait 5 seconds', 'wait 2 seconds']);
        expect(gate.getState()).toEqual({status: 'done', proposal: null});
        expect(heard.at(-1)).toBe('Done. Added: wait 5 seconds, after move 10 steps. Block 3 of 4. ' +
            'To take it back, say undo.');
        const [changed] = highlight.mock.calls.at(-1);
        expect(changed.length).toBeGreaterThan(0);
        expect(app.vm.editingTarget.blocks._blocks[changed[0]].opcode).toBe('control_wait');
        app.perform('edit.undo');
        await settle();
        expect(data()).toBe(start);
    });

    test.each(['no', 'cancel'])('"%s" rejects, changing nothing', async words => {
        const {app, gate, data, start, heard, settle} = await proposed();
        routeCommand(app, words, 'voice');
        await settle();
        expect(gate.getState()).toEqual({status: 'rejected', proposal: null});
        expect(data()).toBe(start);
        expect(heard.at(-1)).toBe('Rejected. Nothing was changed.');
        gate.approve();
        await settle();
        expect(data()).toBe(start);
    });

    test('never approves on its own: other words and waiting change nothing', async () => {
        const {app, gate, data, start, settle} = await proposed();
        for (const words of ['ok', 'sure', 'yes but make it three', 'next', 'undo', 'run', 'add a block']) {
            routeCommand(app, words, 'voice');
            await settle(200);
        }
        expect(gate.getState().status).toBe('proposed');
        expect(data()).toBe(start);
        expect(gate.getState().proposal.note).toMatch(/^I heard: add a block\. Say yes, no, or change it/);
        await settle(EXPIRY_MS);
        expect(gate.getState().status).toBe('expired');
        expect(data()).toBe(start);
    });

    test.each(['yes', 'Go ahead.', 'no', 'yes to all'])(
        '"%s" with nothing waiting goes nowhere, not to the AI', async words => {
            const {app, gate, fetch, data, start, heard, settle} = await proposed();
            await settle(EXPIRY_MS);
            expect(gate.getState().status).toBe('expired');
            routeCommand(app, words, 'voice');
            await settle();
            expect(fetch).not.toHaveBeenCalled();
            expect(data()).toBe(start);
            expect(heard.at(-1)).toBe('There is no suggestion waiting for an answer.');
        });

    test('an unexpected error while carrying out ends the proposal, and another can follow', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const context = await proposed([{action: 'project.run'}]);
        context.vm.start.mockImplementation(() => {
            throw new Error('broken');
        });
        context.gate.approve();
        await context.settle();
        expect(context.gate.getState()).toEqual({status: 'done', proposal: null});
        expect(context.heard.at(-1)).toMatch(/^Not all of it was done\./);
        context.gate.take({steps: [wait]});
        await context.settle();
        expect(context.gate.getState().status).toBe('proposed');
        jest.restoreAllMocks();
    });

    test('"stop" stops the project and leaves the question', async () => {
        const {app, vm, gate} = await proposed();
        routeCommand(app, 'stop', 'voice');
        expect(vm.stopAll).toHaveBeenCalled();
        expect(gate.getState().status).toBe('proposed');
    });

    test('expires after a short time, and cannot be approved afterwards', async () => {
        const {gate, data, start, heard, settle} = await proposed();
        await settle(EXPIRY_MS - 5000);
        expect(gate.getState().status).toBe('proposed');
        await settle(6000);
        expect(gate.getState()).toEqual({status: 'expired', proposal: null});
        expect(heard.at(-1)).toMatch(/^The suggestion expired/);
        await gate.approve();
        await settle();
        expect(data()).toBe(start);
    });

    test('refuses an approval that arrives too late, even before it has noticed', async () => {
        const {gate, data, start} = await proposed();
        jest.setSystemTime(Date.now() + EXPIRY_MS + 1);
        await gate.approve();
        expect(gate.getState().status).toBe('expired');
        expect(data()).toBe(start);
    });

    const changes = {
        'a block is edited': ({app}) => app.editor.run({op: 'set-value', block: 'move', name: 'STEPS', value: 5}),
        'a variable is renamed': ({app}) => app.editor.run(
            {op: 'rename', kind: 'variable', name: 'my variable', to: 'score'}),
        'another sprite is selected': ({vm, project}) => {
            vm.editingTarget = project.other;
        },
        'the place in the outline moves': ({outline}) => {
            outline.block = 'hat';
        },
        'the view changes': ({gui}) => {
            gui.view = 'blocks';
        }
    };

    test.each(Object.keys(changes))('is cancelled if %s', async name => {
        const context = await proposed();
        changes[name](context);
        const after = context.data();
        await context.settle();
        expect(context.gate.getState().status).toBe('expired');
        expect(context.heard.at(-1)).toMatch(/^The program or your place changed, so the suggestion was cancelled/);
        await context.gate.approve();
        await context.settle();
        expect(context.data()).toBe(after);
    });

    test.each(Object.keys(changes))('does not carry it out if %s just before approval', async name => {
        const context = await proposed();
        changes[name](context);
        const after = context.data();
        await context.gate.approve();
        expect(context.gate.getState().status).toBe('expired');
        expect(context.data()).toBe(after);
    });

    test('is not cancelled by a running project moving sprites and changing values', async () => {
        const {gate, vm, project, settle} = await proposed();
        Object.values(project.stage.variables)[0].value = '99';
        vm.editingTarget.blocks._blocks.hat.x += 50;
        vm.editingTarget.x = 100;
        await settle();
        expect(gate.getState().status).toBe('proposed');
    });

    test('asks for a change, sending what was suggested', async () => {
        const {app, gate, data, start, requests, settle} = await proposed();
        routeCommand(app, 'change it: three seconds', 'voice');
        expect(gate.getState()).toEqual({status: 'revised', proposal: null});
        await settle();
        expect(requests.at(-1).body).toMatchObject({transcript: 'three seconds',
            revises: {summary: 'A change.', steps: ['Add wait 5 seconds, after move 10 steps']}});
        expect(data()).toBe(start);
    });

    test('"change it" alone asks what to change, then takes the answer', async () => {
        const {app, gate, requests, settle} = await proposed();
        routeCommand(app, 'change it', 'voice');
        expect(gate.getState().proposal).toMatchObject({askingChange: true, note: 'Say or type what to change.'});
        expect(requests).toHaveLength(0);
        routeCommand(app, 'make it three seconds', 'voice');
        await settle();
        expect(requests.at(-1).body.transcript).toBe('make it three seconds');
    });

    test('takes one proposal at a time', async () => {
        const {gate} = await proposed();
        expect(await gate.take({steps: [turn]})).toEqual({accepted: false, reason: 'another proposal is waiting'});
        expect(gate.getState().proposal.steps[0].sentence).toMatch(/wait/);
    });

    test.each([
        [{steps: []}], [{steps: 'yes'}], [{}], [{steps: [{command: {op: 'insert', block: 'motion_fly'}}]}]
    ])('refuses %j', async proposal => {
        const context = setUp();
        const before = context.data();
        expect((await context.gate.take(proposal)).accepted).toBe(false);
        expect(context.gate.getState()).toEqual({status: 'idle', proposal: null});
        expect(context.data()).toBe(before);
    });

    test('does all the steps on one yes, as one change to undo', async () => {
        const {app, gate, data, start, program, heard, settle} = await proposed([wait, turn]);
        expect(gate.getState().proposal.steps).toHaveLength(2);
        routeCommand(app, 'yes', 'voice');
        await settle();
        expect(program()).toHaveLength(5);
        expect(heard.at(-1)).toMatch(/^Done\. Added: wait .*Added: turn .*To take it back, say undo\.$/);
        app.perform('edit.undo');
        await settle();
        expect(data()).toBe(start);
    });

    test('goes step by step, doing each only on its own yes', async () => {
        const {app, gate, program, settle} = await proposed([wait, turn]);
        routeCommand(app, 'step by step', 'voice');
        expect(gate.getState().proposal).toMatchObject({mode: 'steps', index: 0});
        expect(program()).toHaveLength(3);
        routeCommand(app, 'yes', 'voice');
        await settle();
        expect(program()).toContain('wait 5 seconds');
        expect(program()).toHaveLength(4);
        expect(gate.getState()).toMatchObject({status: 'proposed', proposal: {mode: 'steps', index: 1}});
        routeCommand(app, 'yes', 'voice');
        await settle();
        expect(program()).toHaveLength(5);
        expect(gate.getState().status).toBe('done');
    });

    test('stopping part way keeps the earlier steps and says how to take them back', async () => {
        const {app, program, heard, settle} = await proposed([wait, turn]);
        routeCommand(app, 'one at a time', 'voice');
        routeCommand(app, 'yes', 'voice');
        await settle();
        routeCommand(app, 'no', 'voice');
        await settle();
        expect(program()).toHaveLength(4);
        expect(heard.at(-1)).toBe('Stopped. The earlier steps stay. To take them back, say undo.');
    });

    test('a later step can use an earlier one\'s block, step by step', async () => {
        const {app, gate, program, settle} = await proposed([
            {command: {op: 'insert', block: 'control_repeat', after: 'move'}},
            {command: {op: 'insert', block: 'motion_turnright', inside: {block: stepRef(1)}}}
        ]);
        routeCommand(app, 'step by step', 'voice');
        routeCommand(app, 'yes', 'voice');
        await settle();
        routeCommand(app, 'yes', 'voice');
        await settle();
        expect(gate.getState().status).toBe('done');
        expect(program().join()).toMatch(/repeat 10,turn .*15 degrees/);
    });

    test('a change between steps cancels the rest', async () => {
        const context = await proposed([wait, turn]);
        const {app, gate, program, settle} = context;
        routeCommand(app, 'step by step', 'voice');
        routeCommand(app, 'yes', 'voice');
        await settle();
        context.outline.block = 'hat';
        routeCommand(app, 'yes', 'voice');
        await settle();
        expect(gate.getState().status).toBe('expired');
        expect(program()).toHaveLength(4);
    });

    test('each step has its own time', async () => {
        const {app, gate, settle} = await proposed([wait, turn]);
        routeCommand(app, 'step by step', 'voice');
        await settle(EXPIRY_MS - 5000);
        routeCommand(app, 'yes', 'voice');
        await settle(EXPIRY_MS - 5000);
        expect(gate.getState().status).toBe('proposed');
        await settle(10000);
        expect(gate.getState().status).toBe('expired');
    });

    test('a deleted script is marked hard to undo, whatever the school allows', async () => {
        const context = setUp(bigOnly);
        context.settings.set({readAloud: true});
        const before = context.data();
        context.gate.take({summary: 'Tidy up.',
            steps: [
                {command: {op: 'delete', block: 'hat', withFollowing: true}}]});
        await context.settle();
        expect(context.gate.getState()).toMatchObject({status: 'proposed', proposal: {risk: 'big'}});
        expect(context.reader.speak.mock.calls.at(-1)[0])
            .toMatch(/Warning: this is hard to undo\. Nothing happens unless you say yes\..*, hard to undo\./);
        expect(context.data()).toBe(before);
    });

    test('a student cannot choose to be asked less', async () => {
        const context = setUp();
        context.settings.set({approval: 'big'});
        expect(context.settings.get()).not.toHaveProperty('approval');
        context.gate.take({steps: [wait]});
        await context.settle();
        expect(context.gate.getState().status).toBe('proposed');
        expect(context.program()).toHaveLength(3);
    });

    test.each([
        ['an inserted block', {op: 'insert', block: 'control_wait', after: 'move'}],
        ['a changed value', {op: 'set-value', block: 'move', name: 'STEPS', value: 7}],
        ['a deleted block', {op: 'delete', block: 'wait'}],
        ['a moved block', {op: 'move', block: 'wait', before: 'move'}],
        ['a wrapped block', {op: 'wrap', block: 'move', in: 'control_repeat'}],
        ['a new variable', {op: 'create', kind: 'variable', name: 'speed'}],
        ['a renamed variable', {op: 'rename', kind: 'variable', name: 'my variable', to: 'score'}]
    ])('where the school asks about big changes only, %s is made, said, and can be undone',
        async (_, command) => {
            const context = setUp(bigOnly);
            const before = context.data();
            const taken = context.gate.take({steps: [{command}]});
            await context.settle();
            expect(await taken).toEqual({accepted: true, asked: false});
            expect(context.data()).not.toBe(before);
            expect(context.heard.at(-1)).toMatch(/^Done\. .+To take it back, say undo\.$/);
            context.app.perform('edit.undo');
            await context.settle();
            expect(context.data()).toBe(before);
        });

    test('an added sprite is said and can be undone, going back to the sprite before', async () => {
        const context = setUp(bigOnly);
        const before = context.data();
        context.gate.take({steps: [{command: {op: 'create', kind: 'variable', name: 'speed'}},
            {sprite: {name: 'Dragon'}}]});
        await context.settle();
        expect(context.heard.at(-1)).toMatch(/Added the Dragon sprite.*To take it back, say undo 2 times\.$/);
        context.app.perform('edit.undo');
        // Removing the sprite goes back to where the student was, so the second undo works there.
        expect(context.vm.editingTarget).toBe(context.project.target);
        context.app.perform('edit.undo');
        await context.settle();
        expect(context.data()).toBe(before);
    });

    test('where the school asks about big changes only, more than three changes are still asked about',
        async () => {
            const context = setUp(bigOnly);
            context.gate.take({steps: [wait, turn, wait, turn]});
            await context.settle();
            expect(context.gate.getState()).toMatchObject({status: 'proposed', proposal: {risk: 'big'}});
            expect(context.program()).toHaveLength(3);
        });

    test('and so is a change that arrives while another window is open', async () => {
        const context = setUp(bigOnly);
        context.windows.open = true;
        context.gate.take({steps: [wait]});
        await context.settle();
        expect(context.gate.getState().status).toBe('proposed');
        expect(context.program()).toHaveLength(3);
    });

    test('and running the project, which cannot be undone', async () => {
        const context = setUp(bigOnly);
        context.gate.take({steps: [{action: 'project.run'}]});
        await context.settle();
        expect(context.gate.getState().status).toBe('proposed');
        expect(context.vm.start).not.toHaveBeenCalled();
    });

    test.each([[30, '30 seconds'], [300, '5 minutes'], [60, '1 minute'], [90, '90 seconds']])(
        'waits the %i seconds the configuration gives, and shows it', async (seconds, words) => {
            const context = setUp({school: {proposalExpirySeconds: seconds}});
            context.settings.set({readAloud: true});
            context.gate.take({steps: [wait]});
            await context.settle();
            expect(context.gate.getState().proposal.seconds).toBe(seconds);
            // The dialog shows the time; it is not said, so that the question stays short.
            expect(context.reader.speak.mock.calls.at(-1)[0]).not.toContain('If there is no answer');
            expect(context.app.say(...timeLimit(seconds)))
                .toBe(`If there is no answer in ${words}, it is cancelled.`);
            await context.settle((seconds * 1000) - 5000);
            expect(context.gate.getState().status).toBe('proposed');
            await context.settle(6000);
            expect(context.gate.getState().status).toBe('expired');
        });

    test('moving about is done at once', async () => {
        const context = setUp();
        const taken = context.gate.take({steps: [{action: 'sprite.library'}], immediateOnly: true});
        await context.settle();
        expect(await taken).toEqual({accepted: true, asked: false});
        expect(context.sprites.openLibrary).toHaveBeenCalled();
        expect(context.gate.getState()).toEqual({status: 'done', proposal: null});
    });

    test.each([['wait'], ['run'], ['sprite']])(
        'nothing but moving about is done with a question, even where small changes need no asking: %s',
        async kind => {
            const steps = {wait: [wait], run: [{action: 'project.run'}], sprite: [{sprite: {name: 'Dragon'}}]};
            const context = setUp(bigOnly);
            const before = context.data();
            expect((await context.gate.take({steps: steps[kind], immediateOnly: true})).accepted).toBe(false);
            expect(context.data()).toBe(before);
            expect(context.vm.start).not.toHaveBeenCalled();
        });

    test('running in Upload mode is always asked about', async () => {
        const context = setUp(bigOnly);
        context.device.mode = 'upload';
        context.gate.take({steps: [{action: 'project.run'}]});
        await context.settle();
        expect(context.gate.getState()).toMatchObject({status: 'proposed', proposal: {risk: 'big'}});
        expect(context.vm.start).not.toHaveBeenCalled();
    });

    test('says what could not be done', async () => {
        const context = await proposed([{sprite: {name: 'Dragon'}}]);
        context.sprites.add.mockImplementation(() => Promise.reject(new Error('offline')));
        context.gate.approve();
        await context.settle(SETTLE_MS * 4);
        expect(context.heard.at(-1)).toBe('Not all of it was done. The sprite Dragon could not be loaded.');
    });

    test('an added sprite is removed by undo only while it is as it was added', async () => {
        const context = await proposed([{sprite: {name: 'Dragon'}}]);
        context.gate.approve();
        await context.settle();
        const {app, vm} = context;
        // A block put in it by hand would be lost with the sprite.
        vm.editingTarget.blocks.createBlock({id: 'mine',
            opcode: 'motion_movesteps',
            inputs: {},
            fields: {},
            next: null,
            parent: null,
            topLevel: true,
            shadow: false});
        expect(app.editor.run({op: 'undo'}).ok).toBe(false);
        expect(vm.deleteSprite).not.toHaveBeenCalled();
        vm.editingTarget.blocks.deleteBlock('mine');
        expect(app.editor.run({op: 'undo'}).ok).toBe(true);
        expect(vm.deleteSprite).toHaveBeenCalledWith('added-Dragon');
        // It cannot be redone.
        expect(app.editor.run({op: 'redo'}).ok).toBe(false);
    });
});
