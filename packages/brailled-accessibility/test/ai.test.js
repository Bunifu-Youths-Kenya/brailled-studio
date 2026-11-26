import {createAssistant, TIMEOUT_MS} from '../src/ai/assistant.js';
import {checkProposal} from '../src/ai/proposal.js';
import {parseReply} from '../src/ai/reply.js';
import {buildRequest, describeProgram} from '../src/ai/request.js';
import {createApp} from '../src/actions/app.js';
import {routeCommand} from '../src/actions/route.js';
import {getEditor} from '../src/commands/editor.js';
import {createSettings} from '../src/settings.js';
import {makeProject} from './helpers.js';
import sample from './fixtures/simple-sequence.json';

describe('the shape of a reply', () => {
    const proposal = {type: 'proposal', summary: 'Add a block.', steps: [{action: 'project.run'}]};

    test.each([
        proposal,
        {type: 'proposal', summary: 'Do both.', steps: [{command: {op: 'undo'}}, {action: 'project.run'}]},
        {type: 'question', question: 'How far?'},
        {type: 'question', question: 'How far?', choices: ['10', '20']},
        {type: 'explanation', text: 'A loop repeats blocks.'}
    ])('accepts %j', reply => {
        expect(parseReply(reply)).toMatchObject({type: reply.type});
    });

    test.each([
        null, 'proposal', [], {}, {type: 'run'}, {type: 'toString'},
        {...proposal, extra: 1},
        {...proposal, steps: []},
        {...proposal, steps: Array(21).fill({action: 'a.b'})},
        {...proposal, steps: [{action: 'a.b', command: {op: 'undo'}}]},
        {...proposal, steps: [{command: 'delete everything'}]},
        {...proposal, steps: [{}]},
        {...proposal, steps: {action: 'a.b'}},
        {...proposal, summary: ''},
        {...proposal, summary: 'a'.repeat(301)},
        {type: 'proposal', steps: proposal.steps},
        {type: 'question', question: 'Which?', choices: ['only one']},
        {type: 'question', question: 'Which?', choices: ['a', 2]},
        {type: 'question', question: 'Which?', choices: ['1', '2', '3', '4', '5', '6']},
        {type: 'question', question: 'Which?', choices: null},
        {type: 'question', question: 5},
        {type: 'explanation', text: ' '},
        {type: 'explanation', text: 'x', steps: []}
    ])('refuses %j', reply => {
        expect(parseReply(reply)).toBeNull();
    });

    test('removes characters that hide or reorder text', () => {
        const hidden = `Safe${String.fromCodePoint(0x202e)}text\n\n${String.fromCodePoint(0)}here`;
        expect(parseReply({type: 'explanation', text: hidden}).text).toBe('Safe text here');
    });
});

// A real project, as the validator sees it.
const setUp = () => {
    const project = makeProject({program: sample});
    const vm = project.vm;
    const editor = getEditor(vm);
    const refs = describeProgram(editor.outline()).refs;
    const idOf = opcode => Object.values(vm.editingTarget.blocks._blocks).find(b => b.opcode === opcode).id;
    const refOf = opcode => [...refs].find(([, id]) => id === idOf(opcode))[0];
    const actions = new Map([['project.run', 'run']]);
    const check = steps => checkProposal(
        {editor, steps, refs, actions, actionSentence: name => `Use "${name}"`});
    const data = () => JSON.stringify(vm.runtime.targets.map(target => [target.blocks._blocks, target.variables]));
    return {project, vm, editor, refs, idOf, refOf, check, data};
};

describe('checking a proposal with the validator', () => {
    test('describes each step in the editor\'s words and changes nothing', () => {
        const {check, refOf, data} = setUp();
        const before = data();
        const result = check([
            {command: {op: 'insert', block: 'motion_movesteps', after: refOf('event_whenflagclicked')}},
            {action: 'project.run'}
        ]);
        expect(result).toMatchObject({ok: true});
        expect(result.steps[0].sentence).toMatch(/^Add move 10 steps, after when .* clicked$/);
        expect(result.steps[1].sentence).toBe('Use "run"');
        expect(data()).toBe(before);
    });

    test('lets a step use the block an earlier step makes', () => {
        const {check, refOf, data} = setUp();
        const before = data();
        const result = check([
            {command: {op: 'insert', block: 'control_repeat', after: refOf('event_whenflagclicked')}},
            {command: {op: 'insert', block: 'motion_movesteps', inside: {block: 'new1'}}},
            {command: {op: 'set-value', block: 'new2', name: 'STEPS', value: 25}}
        ]);
        expect(result.reason).toBeUndefined();
        expect(result.steps.map(step => step.sentence)).toEqual([
            expect.stringMatching(/^Add repeat 10, after/),
            'Add move 10 steps, inside repeat 10',
            'Change move 10 steps to move 25 steps'
        ]);
        expect(data()).toBe(before);
    });

    test('lets a step use a variable an earlier step creates', () => {
        const {check, refOf, data} = setUp();
        const before = data();
        const result = check([
            {command: {op: 'create', kind: 'variable', name: 'speed'}},
            {command: {op: 'insert',
                block: 'data_setvariableto',
                after: refOf('event_whenflagclicked'),
                args: {VARIABLE: 'speed', VALUE: 5}}}
        ]);
        expect(result.reason).toBeUndefined();
        expect(result.steps[0].sentence).toBe('Create variable speed, for all sprites');
        expect(result.steps[1].sentence).toMatch(/set speed to 5/);
        expect(data()).toBe(before);
    });

    test.each([
        ['an unknown block', () => [{command: {op: 'insert', block: 'motion_fly'}}], /motion_fly/],
        ['an id that was not listed', ({idOf}) => [{command: {op: 'delete', block: idOf('motion_movesteps')}}],
            /not listed/],
        ['a reference that does not exist', () => [{command: {op: 'delete', block: 'b99'}}], /not listed/],
        ['a block made by a later step', () => [{command: {op: 'delete', block: 'new2'}}], /new2/],
        ['a command outside the schema', () => [{command: {op: 'format-disk'}}], /unknownOperation/],
        ['an extra property', () => [{command: {op: 'undo', now: true}}], /unexpected/],
        ['a wrong value', ({refOf}) => [
            {command: {op: 'set-value', block: refOf('motion_movesteps'), name: 'STEPS', value: 'far'}}],
        /must be a number/],
        ['an action that was not offered', () => [{action: 'voice.settings'}], /no action/],
        ['nothing to undo', () => [{command: {op: 'undo'}}], /nothing to undo/i],
        ['a second step that the first rules out', ({refOf}) => [
            {command: {op: 'delete', block: refOf('motion_movesteps')}},
            {command: {op: 'delete', block: refOf('motion_movesteps')}}], /^Step 2/],
        ['two variables of one name', () => [
            {command: {op: 'create', kind: 'variable', name: 'x'}},
            {command: {op: 'create', kind: 'variable', name: 'x'}}], /already/],
        ['undo among other steps', ({refOf}) => [
            {command: {op: 'delete', block: refOf('motion_movesteps')}}, {command: {op: 'undo'}}], /on their own/]
    ])('refuses %s, changing nothing', (_, steps, reason) => {
        const context = setUp();
        const before = context.data();
        const result = context.check(steps(context));
        expect(result).toMatchObject({ok: false});
        expect(result.reason).toMatch(reason);
        expect(context.data()).toBe(before);
    });

    test('one bad step refuses the whole proposal', () => {
        const {check, refOf} = setUp();
        expect(check([
            {command: {op: 'delete', block: refOf('motion_movesteps')}},
            {command: {op: 'insert', block: 'motion_fly'}}
        ]).steps).toBeUndefined();
    });
});

const assistantFor = respond => {
    const {vm, data} = setUp();
    const reader = {speak: jest.fn(), stop: jest.fn(), isAvailable: () => true};
    const config = {get: () => ({voice: true, aiEndpoint: '/api/assistant'}), subscribe: () => () => {}};
    const app = createApp(vm, {config, reader, settings: createSettings(null)});
    // The page, as far as the snapshot reads it.
    app.snapshot = () => ({view: {tab: 'code'}, actions: []});
    const heard = [];
    app.subscribe(text => heard.push(text));
    const requests = [];
    const fetch = jest.fn((url, options) => {
        requests.push({url, options, body: JSON.parse(options.body)});
        return Promise.resolve(respond(requests.length, requests.at(-1)));
    });
    const assistant = createAssistant({app, endpoint: '/api/assistant', fetch});
    app.register('assistant', assistant);
    const settle = async () => {
        for (let i = 0; i < 10; i++) await jest.advanceTimersByTimeAsync(200);
    };
    return {app, vm, assistant, fetch, requests, heard, reader, settle, data};
};

const answer = reply => ({ok: true, status: 200, json: () => Promise.resolve({reply})});
const failure = (status, error) => ({ok: false, status, json: () => Promise.resolve({error})});

describe('the AI helper', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const explanation = {type: 'explanation', text: 'A loop repeats blocks.'};

    test('sends text only: the words, place, program, blocks and actions', async () => {
        const {assistant, requests, settle} = assistantFor(() => answer(explanation));
        assistant.handle('what is a loop');
        await settle();
        const [{url, options, body}] = requests;
        expect(url).toBe('/api/assistant');
        expect(options).toMatchObject({method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer'});
        expect(Object.keys(body).sort()).toEqual(
            ['actions', 'blocks', 'context', 'data', 'language', 'program', 'transcript']);
        expect(body.transcript).toBe('what is a loop');
        expect(body.context).toEqual({view: {tab: 'code'}});
        expect(body.program).toContainEqual(expect.stringMatching(/^ {2}b[0-9]+ motion_movesteps: move/));
        expect(body.blocks).toContainEqual(expect.stringMatching(/^motion_movesteps \(stack\) "move 10 steps" STEPS=/));
        expect(body.actions.map(action => action.id)).toEqual(expect.arrayContaining(['project.stop']));
        // Edits by hand and the like are not offered.
        expect(body.actions.map(action => action.id).filter(id => id.startsWith('edit.'))).toEqual([]);
        expect(options.body).not.toMatch(/<[a-z]+[ >]|data:image/);
    });

    test('shows an explanation and reads it only if wanted', async () => {
        const {app, assistant, heard, reader, settle} = assistantFor(() => answer(explanation));
        app.settings.set({readAloud: true});
        assistant.handle('what is a loop');
        await settle();
        expect(heard).toEqual(['Asking the AI helper.']);
        expect(assistant.getState()).toEqual({busy: false, reply: explanation});
        expect(reader.speak.mock.calls.at(-1)[0]).toBe('The AI helper says. A loop repeats blocks.');
    });

    test('shows a checked proposal without carrying it out', async () => {
        const {assistant, settle, data, vm} = assistantFor((_, {body}) => {
            const hat = body.program.find(line => line.includes('event_whenflagclicked')).trim()
                .split(' ')[0];
            return answer({type: 'proposal',
                summary: 'Move first.',
                steps: [{command: {op: 'insert', block: 'motion_movesteps', after: hat}}]});
        });
        const before = data();
        vm.start = jest.fn();
        assistant.handle('move first');
        await settle();
        expect(assistant.getState().reply.steps[0].sentence).toMatch(/^Add move 10 steps, after/);
        expect(data()).toBe(before);
        expect(vm.start).not.toHaveBeenCalled();
    });

    test.each([
        ['a reply of the wrong form', () => answer({type: 'proposal'})],
        ['no reply', () => answer()],
        ['a command the validator refuses', () => answer(
            {type: 'proposal', summary: 'Fly.', steps: [{command: {op: 'insert', block: 'motion_fly'}}]})],
        ['an unusable reply from the model', () => failure(502, 'invalid_output')],
        ['a body that is not JSON', () => ({ok: true,
            status: 200,
            json: () => Promise.reject(new SyntaxError('bad'))})]
    ])('says it could not work out %s, and changes nothing', async (_, respond) => {
        const {assistant, heard, settle, data} = assistantFor(respond);
        const before = data();
        assistant.handle('do something');
        await settle();
        expect(heard.at(-1)).toBe('I couldn\'t work that out, please try again.');
        expect(assistant.getState()).toEqual({busy: false, reply: null});
        expect(data()).toBe(before);
    });

    test.each([
        [400, 'invalid_request', /couldn't work that out/],
        [429, 'too_many_requests', /too many requests/],
        [413, 'too_large', /too big/],
        [503, 'not_configured', /not set up/],
        [502, 'upstream_error', /cannot be reached/],
        [500, null, /cannot be reached/]
    ])('explains status %i', async (status, error, message) => {
        const {assistant, heard, settle} = assistantFor(() => failure(status, error));
        assistant.handle('do something');
        await settle();
        expect(heard.at(-1)).toMatch(message);
        expect(assistant.getState().busy).toBe(false);
    });

    test('says when the server cannot be reached, including after waiting too long', async () => {
        const {assistant, heard, fetch, settle} = assistantFor(() => answer(explanation));
        fetch.mockImplementation((url, {signal}) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
        }));
        assistant.handle('hello');
        assistant.handle('hello again');
        await settle();
        expect(heard.at(-1)).toBe('Still waiting for the AI helper.');
        expect(fetch).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(TIMEOUT_MS);
        await settle();
        expect(heard.at(-1)).toMatch(/cannot be reached/);
        expect(assistant.getState().busy).toBe(false);
    });

    test('refuses a proposal if another sprite has been selected meanwhile', async () => {
        const context = assistantFor(() => {
            context.vm.editingTarget = context.vm.runtime.getTargetForStage();
            return answer({type: 'proposal', summary: 'Run.', steps: [{action: 'project.stop'}]});
        });
        context.assistant.handle('stop it');
        await context.settle();
        expect(context.assistant.getState().reply).toBeNull();
        expect(context.heard.at(-1)).toMatch(/couldn't work that out/);
    });

    test('waits until the microphone is closed before showing a reply', async () => {
        const {app, assistant, settle} = assistantFor(() => answer(explanation));
        let phase = 'listening';
        let changed = null;
        app.register('voice', {getState: () => ({phase}),
            subscribe: listener => {
                changed = listener;
                return () => {};
            }});
        assistant.handle('what is a loop');
        await settle();
        expect(assistant.getState().reply).toBeNull();
        phase = 'idle';
        changed();
        await settle();
        expect(assistant.getState().reply).toEqual(explanation);
    });

    test('sends the answer to its question with the question', async () => {
        const question = {type: 'question', question: 'How far?', choices: ['10', '20']};
        const {app, assistant, requests, settle} = assistantFor(
            count => answer(count === 1 ? question : explanation));
        assistant.handle('move');
        await settle();
        expect(assistant.isOpen()).toBe(true);
        // What is said while the question is open answers it, even if it sounds like a command.
        expect(routeCommand(app, 'next', 'voice')).toBe('assistant');
        await settle();
        expect(requests[1].body).toMatchObject(
            {transcript: 'next', previous: {question: 'How far?', choices: ['10', '20']}});
    });

    test.each(['close', 'Cancel.', 'never mind'])('"%s" closes the reply', async words => {
        const {app, assistant, heard, fetch, settle} = assistantFor(
            () => answer({type: 'question', question: 'How far?'}));
        assistant.handle('move');
        await settle();
        routeCommand(app, words, 'voice');
        await settle();
        expect(assistant.isOpen()).toBe(false);
        expect(heard.at(-1)).toBe('Closed. Nothing was changed.');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('"stop" still stops the project while a reply is open', async () => {
        const {app, vm, assistant, settle} = assistantFor(() => answer(explanation));
        vm.stopAll = jest.fn();
        assistant.handle('what');
        await settle();
        routeCommand(app, 'stop', 'voice');
        expect(vm.stopAll).toHaveBeenCalled();
        expect(assistant.isOpen()).toBe(true);
    });

    test('a project with long names and many variables still fits what the server accepts', () => {
        const {vm} = setUp();
        const long = 'very long '.repeat(500);
        const stage = vm.runtime.getTargetForStage();
        for (let i = 0; i < 250; i++) stage.createVariable(`id${i}`, `${long}${i}`, '');
        const app = createApp(vm, {settings: createSettings(null)});
        app.snapshot = () => ({
            sprite: {name: long, isStage: false},
            focus: {zone: 'scripts', area: long, control: {name: long, role: long}},
            outline: {item: long},
            moving: long,
            actions: []
        });
        const {body} = buildRequest({app, transcript: long});
        // The server's limits, in `brailled-ai-server/src/request.ts`.
        expect(JSON.stringify(body.context).length).toBeLessThanOrEqual(6000);
        expect(body.transcript.length).toBeLessThanOrEqual(500);
        const limits = [[body.program, 400, 300], [body.data, 200, 300], [body.blocks, 400, 400]];
        for (const [list, count, length] of limits) {
            expect(list.length).toBeLessThanOrEqual(count);
            expect(Math.max(...list.map(line => line.length))).toBeLessThanOrEqual(length);
        }
        expect(body.actions.length).toBeLessThanOrEqual(80);
    });

    test('the request is built from the editor, not the page', () => {
        const {vm} = setUp();
        const app = createApp(vm, {settings: createSettings(null)});
        app.snapshot = () => ({sprite: {name: 'Sprite1'}, actions: [1]});
        const {body, refs, targetId} = buildRequest({app, transcript: 'x'.repeat(900)});
        expect(body.transcript).toHaveLength(500);
        expect(body.data).toContain('variable "my variable" for all sprites');
        expect(body.context).toEqual({sprite: {name: 'Sprite1'}});
        expect(refs.size).toBeGreaterThan(0);
        expect(targetId).toBe(vm.editingTarget.id);
    });
});
