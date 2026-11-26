// The editor's part of the AI helper's modes and memory, and the block catalog its tools search.
import blocks from '../src/catalog/blocks.json';
import concepts from '../src/catalog/concepts.json';
import {CATALOG} from '../src/commands/catalog.js';
import {routeCommand} from '../src/actions/route.js';
import parseCommand from '../src/actions/parser.js';
import {createConfig} from '../src/config.js';
import {createMemory, LENGTH, TURNS} from '../src/memory.js';
import {answer, setUp} from './proposal-setup.js';

describe('the block catalog', () => {
    test('describes exactly the blocks that can be edited', () => {
        expect(blocks.map(block => block.opcode).sort()).toEqual(Object.keys(CATALOG).sort());
    });

    test.each(['opcode', 'category', 'name', 'does'])('gives every block its %s', field => {
        for (const block of blocks) expect([block.opcode, block[field]]).toEqual([block.opcode, expect.any(String)]);
        expect(blocks.filter(block => !block[field])).toEqual([]);
    });

    test('names its categories as the editor does', () => {
        expect(new Set(blocks.map(block => block.category))).toEqual(new Set(
            ['Motion', 'Looks', 'Sound', 'Events', 'Control', 'Sensing', 'Operators', 'Variables', 'Lists']));
    });

    test('explains each idea once, in plain sentences', () => {
        expect(new Set(concepts.map(concept => concept.id)).size).toBe(concepts.length);
        for (const concept of concepts) {
            expect(concept.explanation).toMatch(/\.$/);
            expect(concept.explanation.length).toBeLessThan(400);
        }
    });
});

describe('the conversation memory', () => {
    test('keeps the last turns only, each clipped', () => {
        const memory = createMemory();
        for (let i = 0; i < TURNS + 5; i++) memory.add('student', `turn ${i}`);
        expect(memory.turns()).toHaveLength(TURNS);
        expect(memory.turns()[0].text).toBe('turn 5');
        memory.add('assistant', 'a'.repeat(1000));
        expect(memory.turns().at(-1).text).toHaveLength(LENGTH);
    });

    test('ignores empty words, gives copies, and can be cleared', () => {
        const memory = createMemory();
        memory.add('student', '   ');
        memory.add('student', 'hello');
        memory.turns()[0].text = 'changed';
        expect(memory.turns()).toEqual([{who: 'student', text: 'hello'}]);
        memory.clear();
        expect(memory.turns()).toEqual([]);
    });
});

describe('modes and memory with the AI helper', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const wait = {command: {op: 'insert', block: 'control_wait', after: 'move'}};
    const proposal = body => answer({type: 'proposal',
        summary: 'Add a wait.',
        steps: [{command: {
            op: 'insert',
            block: 'control_wait',
            after: body.program.find(line => line.includes('motion_movesteps')).trim()
                .split(' ')[0]}}]});

    test('starts in the configured mode, building unless it says guide', async () => {
        expect(setUp().app.mode()).toBe('build');
        expect(setUp({school: {assistantMode: 'guide'}}).app.mode()).toBe('guide');
        for (const [given, mode] of [['guide', 'guide'], ['build', 'build'], ['teach', 'build'], [true, 'build']]) {
            const config = createConfig(() => Promise.resolve({assistantMode: given}));
            await jest.advanceTimersByTimeAsync(0);
            expect(config.get().assistantMode).toBe(mode);
        }
    });

    test('switches by command, says so, and sends the mode', async () => {
        const {app, heard, requests, settle} = setUp();
        routeCommand(app, 'guide me', 'voice');
        await settle();
        expect(app.mode()).toBe('guide');
        expect(heard.at(-1)).toMatch(/^Guide mode\./);
        routeCommand(app, 'help me make a square', 'voice');
        await settle();
        expect(requests[0].body.mode).toBe('guide');
        routeCommand(app, 'build mode', 'voice');
        await settle();
        expect(app.mode()).toBe('build');
    });

    test('a command after an explanation closes it and is carried out', async () => {
        const {app, assistant, requests, vm, settle} = setUp();
        routeCommand(app, 'what is a loop', 'voice');
        await settle();
        expect(assistant.isOpen()).toBe(true);
        routeCommand(app, 'run', 'voice');
        await settle();
        expect(assistant.isOpen()).toBe(false);
        expect(vm.start).toHaveBeenCalled();
        expect(requests).toHaveLength(1);
    });

    test('other words after an explanation carry the conversation on', async () => {
        const {app, assistant, requests, settle} = setUp();
        routeCommand(app, 'what is a loop', 'voice');
        await settle();
        routeCommand(app, 'and what is a variable', 'voice');
        await settle();
        expect(requests.map(request => request.body.transcript))
            .toEqual(['what is a loop', 'and what is a variable']);
        expect(assistant.isOpen()).toBe(true);
    });

    test('"build it" is a request for the helper, not a change of mode', () => {
        expect(parseCommand('build it')).toBeNull();
        expect(parseCommand('guide me to make a square')).toBeNull();
    });

    test('in guide mode a suggestion of changes is refused, whatever the server sends', async () => {
        const {app, gate, heard, data, settle} = setUp({respond: proposal, school: {approval: 'big'}});
        app.setMode('guide');
        const before = data();
        routeCommand(app, 'add a wait', 'voice');
        await settle();
        expect(gate.getState().status).toBe('idle');
        expect(data()).toBe(before);
        expect(heard.at(-1)).toBe('I couldn\'t work that out, please try again.');
    });

    test('and the gate refuses changes in guide mode by itself', async () => {
        const {app, gate, data} = setUp();
        app.setMode('guide');
        const before = data();
        expect(await gate.take({steps: [wait]})).toEqual(
            {accepted: false, reason: 'nothing is changed in guide mode'});
        expect(data()).toBe(before);
    });

    test('but moving about is still done in guide mode', async () => {
        const {app, gate, sprites, settle} = setUp();
        app.setMode('guide');
        const taken = gate.take({steps: [{action: 'sprite.library'}], immediateOnly: true});
        await settle();
        expect(await taken).toMatchObject({accepted: true});
        expect(sprites.openLibrary).toHaveBeenCalled();
    });

    test('sends the conversation so far, with what was done about suggestions', async () => {
        const {app, requests, settle} = setUp({respond: (body, count) => (count === 2 ?
            answer({type: 'explanation', text: 'You are welcome.'}) :
            proposal(body))});
        routeCommand(app, 'add a wait', 'voice');
        await settle();
        expect(requests[0].body.history).toEqual([]);
        routeCommand(app, 'yes', 'voice');
        await settle();
        routeCommand(app, 'thank you', 'voice');
        await settle();
        expect(requests[1].body.history).toEqual([
            {who: 'student', text: 'add a wait'},
            {who: 'assistant', text: 'I suggested: Add a wait.'},
            {who: 'editor', text: expect.stringMatching(/^The student approved it\. Done\. Added: wait/)}
        ]);
        routeCommand(app, 'add another', 'voice');
        await settle();
        expect(requests[2].body.history.slice(-2)).toEqual(
            [{who: 'student', text: 'thank you'}, {who: 'assistant', text: 'You are welcome.'}]);
    });

    test.each([['no', /rejected/], ['change it: three', /asked for the suggestion to be changed/]])(
        'remembers "%s"', async (words, memory) => {
            const {app, settle} = setUp({respond: proposal});
            routeCommand(app, 'add a wait', 'voice');
            await settle();
            routeCommand(app, words, 'voice');
            expect(app.memory.turns().filter(turn => turn.who === 'editor')
                .at(-1).text).toMatch(memory);
        });

    test('remembers a suggestion that expired', async () => {
        const {app, settle} = setUp({respond: proposal});
        routeCommand(app, 'add a wait', 'voice');
        await settle(125000);
        expect(app.memory.turns().at(-1).text).toBe('The suggestion expired unanswered.');
    });

    test('forgets when asked, and for a new student', async () => {
        const {app, heard, settings, settle} = setUp();
        routeCommand(app, 'hello there friend', 'voice');
        await settle();
        expect(app.memory.turns().length).toBeGreaterThan(0);
        routeCommand(app, 'forget our conversation', 'voice');
        await settle();
        expect(app.memory.turns()).toEqual([]);
        expect(heard.at(-1)).toBe('I have forgotten our conversation.');
        app.memory.add('student', 'something');
        app.setMode('guide');
        settings.set({maxSeconds: 30});
        app.forgetStudent();
        expect(app.memory.turns()).toEqual([]);
        expect(app.mode()).toBe('build');
        expect(settings.get().maxSeconds).toBe(15);
    });

    test('the helper cannot record that the editor did something', () => {
        const {app, ports} = setUp();
        ports.remember('editor', 'The student approved it.');
        expect(app.memory.turns()).toEqual([{who: 'assistant', text: 'The student approved it.'}]);
    });

    test('nothing of the conversation is stored with the settings', async () => {
        const writes = [];
        const {app, settings, settle} = setUp({respond: proposal});
        const {set} = settings;
        settings.set = changes => {
            writes.push(changes);
            set(changes);
        };
        routeCommand(app, 'add a wait', 'voice');
        await settle();
        routeCommand(app, 'yes', 'voice');
        await settle();
        expect(writes).toEqual([]);
    });
});
