// Talking on after the wake words: what is heard, what may be approved by voice, and guiding. No real service.
import {routeCommand} from '../src/actions/route.js';
import {createConfig} from '../src/config.js';
import {asksToAdd, parseAnswer} from '../src/proposals/answers.js';
import {CHECK_MS} from '../src/proposals/guide.js';
import {createVoice} from '../src/voice/controller.js';
import {readsRepliesOnline, speechFrom} from '../src/voice/speech-config.js';
import {createWakeControl} from '../src/wake/control.js';
import {answer, setUp} from './proposal-setup.js';

const talk = {enabled: true, voiceApproval: true, idleSeconds: 20};
const allowed = {enabled: true, engine: 'demo', greetings: ['hey'], names: ['Mboni']};

const after = (body, opcode) => body.program.find(line => line.includes(` ${opcode}:`)).trim()
    .split(' ')[0];
// Two changes: a wait after "move", then another after that.
const plan = body => answer({type: 'proposal',
    summary: 'Two waits.',
    steps: [
        {command: {op: 'insert', block: 'control_wait', after: after(body, 'motion_movesteps')}},
        {command: {op: 'insert', block: 'control_repeat', after: 'new1'}}
    ]});

// The editor with its gate, guide and voice, in a conversation unless told otherwise.
const editor = ({school = {}, respond = plan, introduced = true} = {}) => {
    const parts = setUp({school: {wakeWord: allowed, conversation: talk, ...school}, respond});
    const {app, settle} = parts;
    const engine = {
        isSupported: () => true,
        start: jest.fn(options => {
            engine.options = options;
        }),
        stop: jest.fn(() => {
            engine.options = null;
            return Promise.resolve();
        })
    };
    const microphone = {isSupported: () => true, listen: jest.fn(() => ({stop: () => {}, cancel: () => {}}))};
    const voice = createVoice({app,
        provider: microphone,
        tone: {opened: () => {}, closed: () => {}},
        language: () => 'en'});
    app.register('voice', voice);
    voice.connect();
    if (introduced) app.introduction.ask();
    const tone = {yourTurn: jest.fn()};
    const wake = createWakeControl({app, engineFor: () => engine, language: () => 'en', document: {hidden: false},
        tone});
    app.register('wake', wake);
    voice.subscribe(wake.sync);
    // The student speaks once a screen reader would have finished saying what came before.
    const hear = async (request, {followUp = true, confidence = 0.92, after = 10000} = {}) => {
        await settle(after);
        expect(engine.options).not.toBeNull();
        engine.options.onWake({request, confidence, ...(followUp ? {followUp} : {})});
        await settle(1500);
    };
    // "Hey Mboni", and whatever followed it.
    const call = (request = '') => hear(request, {followUp: false});
    const begin = async () => {
        wake.start();
        await settle(1000);
        await call();
    };
    // In a conversation, with a suggestion waiting.
    const asked = async () => {
        await begin();
        await hear('help me make two waits');
        expect(parts.gate.isOpen()).toBe(true);
    };
    return {...parts, asked, begin, call, engine, hear, microphone, tone, voice, wake};
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('a conversation', () => {
    test('begins when called: it greets, and hears every phrase', async () => {
        const {begin, engine, heard, microphone, wake} = editor();
        await begin();
        expect(heard.at(-1)).toBe('Hey! I’m listening.');
        expect(wake.getState()).toMatchObject({conversing: true, listening: true});
        expect(engine.options.open).toBe(true);
        expect(microphone.listen).not.toHaveBeenCalled();
    });

    test('introduces itself the first time instead', async () => {
        const {begin, heard} = editor({introduced: false});
        await begin();
        expect(heard.at(-1)).toMatch(/I am Mboni/);
    });

    test('takes a request said with the wake words, and goes on listening', async () => {
        const {wake, call, requests, settle} = editor();
        wake.start();
        await settle(1000);
        await call('help me make two waits');
        expect(requests[0].body.transcript).toBe('help me make two waits');
        expect(wake.getState().conversing).toBe(true);
    });

    test('goes on without the wake words, answering its own questions at once', async () => {
        const {begin, hear, heard, requests} = editor();
        await begin();
        await hear('what does this platform do');
        expect(heard.at(-1)).toMatch(/This is Brailled/);
        expect(requests).toHaveLength(0);
        await hear('I am making a game, help me');
        expect(requests).toHaveLength(1);
        expect(heard.some(line => line.endsWith('Okay, let me look.'))).toBe(true);
    });

    test('passes over words it is not sure of', async () => {
        const {begin, hear, requests, voice} = editor();
        await begin();
        await hear('somebody else talking', {confidence: 0.4});
        await hear('run', {confidence: 0.65});
        expect(requests).toHaveLength(0);
        expect(voice.getState().pending).toBeNull();
    });

    test('asks before a command that changes things, and cannot be answered by voice', async () => {
        const {begin, hear, vm, voice} = editor();
        await begin();
        await hear('run');
        expect(voice.getState().pending).toMatchObject({text: 'run', origin: 'conversation'});
        await hear('yes');
        await hear('add all');
        expect(vm.start).not.toHaveBeenCalled();
        expect(voice.getState().pending).not.toBeNull();
    });

    test.each(['goodbye', 'Thank you.', 'kwaheri'])('ends at "%s", and waits to be called', async words => {
        const {begin, hear, engine, heard, wake, settle} = editor();
        await begin();
        await hear(words);
        await settle(1000);
        expect(wake.getState()).toMatchObject({on: true, conversing: false});
        expect(engine.options.open).toBe(false);
        expect(heard.at(-1)).toBe('Okay. Say hey, then Mboni, when you need me.');
    });

    test('ends after the quiet time, not counting while it is reading', async () => {
        const {begin, reader, wake, settle} = editor();
        await begin();
        reader.speaking = () => true;
        await settle(30000);
        expect(wake.getState().conversing).toBe(true);
        reader.speaking = () => false;
        await settle(19000);
        expect(wake.getState().conversing).toBe(true);
        await settle(2000);
        expect(wake.getState().conversing).toBe(false);
    });

    test('is not begun where the school has not allowed it: one request is taken', async () => {
        const {wake, call, microphone, settle} = editor({school: {conversation: {enabled: false}}});
        wake.start();
        await settle(1000);
        await call();
        expect(wake.getState().conversing).toBe(false);
        expect(microphone.listen).toHaveBeenCalledTimes(1);
    });

    test('ends when listening is stopped', async () => {
        const {begin, hear, wake} = editor();
        await begin();
        await hear('stop listening');
        expect(wake.getState()).toEqual({on: false, listening: false, conversing: false});
    });

    test('is set in the configuration file, off unless it says so', async () => {
        const read = async file => {
            const config = createConfig(() => Promise.resolve(file));
            await jest.advanceTimersByTimeAsync(0);
            return config.get().conversation;
        };
        expect(await read({})).toEqual({enabled: false, voiceApproval: false, idleSeconds: 20});
        expect(await read({conversation: {enabled: 'yes', voiceApproval: 1, idleSeconds: 999}}))
            .toEqual({enabled: false, voiceApproval: false, idleSeconds: 60});
        expect(await read({conversation: {enabled: true, voiceApproval: true, idleSeconds: 10}}))
            .toEqual({enabled: true, voiceApproval: true, idleSeconds: 10});
    });
});

describe('taking turns', () => {
    test('never takes its own words, said by a screen reader, for the student\'s', async () => {
        const {asked, hear, gate, program} = editor();
        await asked();
        // "Say add all, guide me, or no." comes back through the microphone while it is still being said.
        await hear('add all', {after: 500});
        expect(gate.isOpen()).toBe(true);
        expect(program()).not.toContain('repeat 10');
        // Said by the student once it has been read.
        await hear('add all');
        expect(gate.isOpen()).toBe(false);
    });

    test('the student can talk over the reading, which stops, but its own words do not stop it', async () => {
        const {begin, hear, reader, requests, settings} = editor();
        settings.set({readAloud: true});
        await begin();
        reader.speaking = () => true;
        reader.stop.mockClear();
        await hear('Hey! I am listening.', {after: 0});
        expect(reader.stop).not.toHaveBeenCalled();
        await hear('help me make two waits', {after: 0});
        expect(reader.stop).toHaveBeenCalled();
        expect(requests.at(-1).body.transcript).toBe('help me make two waits');
    });

    test('a sound says when it is the student\'s turn, once the reading ends', async () => {
        const {begin, reader, settings, settle, tone} = editor();
        settings.set({readAloud: true});
        await begin();
        reader.speaking = () => true;
        await settle(1000);
        expect(tone.yourTurn).not.toHaveBeenCalled();
        reader.speaking = () => false;
        await settle(1000);
        expect(tone.yourTurn).toHaveBeenCalledTimes(1);
    });

    test('the AI is told it is a conversation, to answer briefly', async () => {
        const {begin, hear, requests} = editor();
        await begin();
        await hear('help me make two waits');
        expect(requests.at(-1).body.conversing).toBe(true);
    });
});

describe('approving in a conversation', () => {
    test('asks in few words', async () => {
        const {asked, reader, settings} = editor();
        settings.set({readAloud: true});
        await asked();
        const spoken = reader.speak.mock.calls.map(call => call[0]).find(words => words.includes('Two waits.'));
        expect(spoken).toMatch(/Say add all, guide me, or no\.$/);
        expect(spoken).not.toMatch(/If there is no answer/);
    });

    test.each(['add all', 'Add them all.', 'yes add them'])('"%s" adds them', async words => {
        const {asked, hear, program, gate, settle} = editor();
        await asked();
        await hear(words);
        await settle(3000);
        expect(gate.isOpen()).toBe(false);
        expect(program()).toContain('wait 1 second');
        expect(program()).toContain('repeat 10');
    });

    test.each(['yes', 'okay', 'go ahead', 'ndiyo', 'all', 'sure add whatever', 'I would not add all of that'])(
        '"%s" adds nothing', async words => {
            const {asked, hear, data, gate, heard} = editor();
            const before = data();
            await asked();
            await hear(words);
            expect(gate.isOpen()).toBe(true);
            expect(data()).toBe(before);
            expect(heard.concat(gate.getState().proposal.note).join(' ')).toMatch(/Say add all, guide me, or no/);
        });

    test('"add all" does nothing where the school has not allowed voice approval', async () => {
        const {asked, hear, data, gate} = editor({school: {conversation: {...talk, voiceApproval: false}}});
        const before = data();
        await asked();
        await hear('add all');
        expect(data()).toBe(before);
        expect(gate.getState().proposal.note).toMatch(/^Say guide me, or no\. To approve, hold F2/);
    });

    test('"Hey Mboni, add all" does not approve: only a conversation may', async () => {
        const {asked, call, data, gate, heard} = editor();
        const before = data();
        await asked();
        await call('add all');
        expect(gate.isOpen()).toBe(true);
        expect(data()).toBe(before);
        expect(heard.at(-1)).toMatch(/A suggestion is waiting\. The wake words cannot answer it/);
    });

    test.each([
        ['running the project', () => [{action: 'project.run'}]],
        ['deleting a script', body => [{command: {op: 'delete', block: after(body, 'event_whenflagclicked')}}]],
        ['a change followed by a run', body => [{command: {op: 'insert',
            block: 'control_wait',
            after: after(body, 'motion_movesteps')}}, {action: 'project.run'}]],
        ['deleting one block', body => [{command: {op: 'delete', block: after(body, 'motion_movesteps')}}]],
        ['changing a value', body => [{command:
            {op: 'set-value', block: after(body, 'motion_movesteps'), name: 'STEPS', value: 50}}]]
    ])('never approves %s by voice', async (_, steps) => {
        const {asked, hear, data, gate, vm} = editor(
            {respond: body => answer({type: 'proposal', summary: 'x', steps: steps(body)})});
        await asked();
        const before = data();
        await hear('add all');
        expect(gate.isOpen()).toBe(true);
        expect(data()).toBe(before);
        expect(vm.start).not.toHaveBeenCalled();
        expect(gate.getState().proposal.note).toMatch(/To approve, hold F2/);
    });

    test('still takes the talk key\'s yes for those', async () => {
        const {asked, app, vm, settle} = editor(
            {respond: () => answer({type: 'proposal', summary: 'x', steps: [{action: 'project.run'}]})});
        await asked();
        routeCommand(app, 'yes', 'voice');
        await settle(3000);
        expect(vm.start).toHaveBeenCalled();
    });

    test('"no" turns it down', async () => {
        const {asked, hear, data, gate} = editor();
        await asked();
        const before = data();
        await hear('no');
        expect(gate.isOpen()).toBe(false);
        expect(data()).toBe(before);
    });
});

describe('being guided', () => {
    const guided = async options => {
        const parts = editor(options);
        await parts.asked();
        const before = parts.data();
        await parts.hear('guide me');
        const add = async command => {
            parts.app.editor.run(command(parts.app.editor.outline()));
            await parts.settle(CHECK_MS * 4);
        };
        return {...parts, add, before};
    };
    const idOf = (nodes, text) => nodes.flatMap(function walk (node) {
        return [node, ...(node.children || []).flatMap(walk)];
    }).find(node => node.text === text).id;
    const addWait = nodes => ({op: 'insert', block: 'control_wait', after: idOf(nodes, 'move 10 steps')});

    test('changes nothing, and says the first step', async () => {
        const {data, before, gate, guide, heard} = await guided();
        expect(data()).toBe(before);
        expect(gate.isOpen()).toBe(false);
        expect(guide.isActive()).toBe(true);
        expect(heard.at(-1)).toMatch(/Let us do it together\. .*Step 1 of 2\. Add.*wait/);
    });

    test('goes on when it sees the step done, without asking the AI', async () => {
        const {add, heard, requests} = await guided();
        await add(addWait);
        expect(heard.at(-1)).toMatch(/^Well done\. Step 2 of 2\. .*repeat/);
        expect(requests).toHaveLength(1);
    });

    test('is not fooled by another block', async () => {
        const {add, heard, guide} = await guided();
        await add(nodes => ({op: 'insert', block: 'looks_say', after: idOf(nodes, 'move 10 steps')}));
        expect(heard.at(-1)).toMatch(/Step 1 of 2/);
        expect(guide.isActive()).toBe(true);
    });

    test('finishes after the last step', async () => {
        const {add, heard, guide} = await guided();
        await add(addWait);
        await add(nodes => ({op: 'insert', block: 'control_repeat', after: idOf(nodes, 'wait 1 second')}));
        expect(heard.at(-1)).toBe('Well done. That is all the steps. Say run to try it.');
        expect(guide.isActive()).toBe(false);
    });

    test('repeats, skips and stops when asked', async () => {
        const {hear, heard, guide, data, before} = await guided();
        await hear('repeat');
        expect(heard.at(-1)).toMatch(/Step 1 of 2/);
        await hear('next step');
        expect(heard.at(-1)).toMatch(/Step 2 of 2/);
        await hear('stop guiding');
        expect(heard.at(-1)).toMatch(/I have stopped guiding\.$/);
        expect(guide.isActive()).toBe(false);
        expect(data()).toBe(before);
    });

    test('lets other things be asked meanwhile', async () => {
        const {hear, heard, guide} = await guided();
        await hear('what does this platform do');
        expect(heard.at(-1)).toMatch(/This is Brailled/);
        expect(guide.isActive()).toBe(true);
    });

    test('is offered to the talk key and keyboard too, and ends for a new student', async () => {
        const {app, gate, guide, settle} = editor();
        routeCommand(app, 'help me', 'voice');
        routeCommand(app, 'make two waits', 'voice');
        await settle(3000);
        expect(gate.isOpen()).toBe(true);
        routeCommand(app, 'guide me', 'voice');
        await settle();
        expect(guide.isActive()).toBe(true);
        app.forgetStudent();
        expect(guide.isActive()).toBe(false);
    });
});

describe('answers and voices', () => {
    test('know "add all" and "guide me"', () => {
        expect(parseAnswer('add all')).toEqual({type: 'all'});
        expect(parseAnswer('Guide me.')).toEqual({type: 'guide'});
        expect([asksToAdd('Add them all!'), asksToAdd('yes'), asksToAdd('all')]).toEqual([true, false, false]);
    });

    test('replies are read online with an online provider, or where the school asks', () => {
        expect(readsRepliesOnline(speechFrom({}))).toBe(false);
        expect(readsRepliesOnline(speechFrom({readReplies: 'online'}))).toBe(true);
        expect(readsRepliesOnline(speechFrom({provider: 'gemini-pair'}))).toBe(true);
        expect(speechFrom({readReplies: 'loud'}).readReplies).toBe('device');
    });

    test('the greeting holds the name only where it may be said', async () => {
        const quiet = editor();
        quiet.reader.isAvailable = () => false;
        quiet.settings.set({studentName: 'Amina'});
        await quiet.begin();
        expect(quiet.heard.at(-1)).toBe('Hey! I’m listening.');
        const said = editor();
        said.reader.isAvailable = () => false;
        said.settings.set({studentName: 'Amina', onlineName: true});
        await said.begin();
        expect(said.heard.at(-1)).toBe('Hey Amina! I’m listening.');
    });
});
