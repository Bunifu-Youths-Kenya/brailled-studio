// The assistant's name and introduction. Nothing here reaches a model.
import tools from '../src/catalog/tools.json';
import {createApp} from '../src/actions/app.js';
import parseCommand from '../src/actions/parser.js';
import {ACTIONS} from '../src/actions/registry.js';
import {routeCommand} from '../src/actions/route.js';
import {createConfig} from '../src/config.js';
import {introductionText, offers, STORAGE_KEY} from '../src/introduction.js';
import {cleanName} from '../src/names.js';
import {createSettings} from '../src/settings.js';
import {createVoice} from '../src/voice/controller.js';
import {answer, setUp as setUpAi} from './proposal-setup.js';

const actions = ACTIONS.map(action => action.id);

const memory = () => {
    const kept = new Map();
    return {
        getItem: key => kept.get(key) ?? null,
        setItem: (key, value) => kept.set(key, value),
        removeItem: key => kept.delete(key),
        size: () => kept.size
    };
};

const setUp = ({school = {}, session = memory(), supported = true} = {}) => {
    const configured = {voice: true, ai: true, aiEndpoint: '/a', approval: 'every', assistantName: 'Mboni', ...school};
    const config = {get: () => configured, subscribe: () => () => {}};
    const vm = {runtime: {threads: []}, editingTarget: null, start: jest.fn(), stopAll: jest.fn()};
    const reader = {speak: jest.fn(() => true), stop: jest.fn(), isAvailable: () => true};
    const settings = createSettings(null);
    const app = createApp(vm, {config, settings, reader, session});
    const heard = [];
    app.subscribe(text => heard.push(text));
    const provider = {isSupported: () => supported, listen: jest.fn(() => ({stop: jest.fn(), cancel: jest.fn()}))};
    const voice = createVoice({app,
        provider,
        tone: {opened: jest.fn(), closed: jest.fn()},
        language: () => 'en-GB'});
    app.register('voice', voice);
    voice.connect();
    const wait = (time = 500) => jest.advanceTimersByTime(time);
    return {app, heard, provider, reader, session, settings, voice, wait};
};

const compose = changes => introductionText({
    say: (message, values) => message.defaultMessage
        .replace(/\{assistant\}/g, 'Mboni')
        .replace(/\{(\w+)\}/g, (_, key) => values[key]),
    locale: 'en',
    length: 'full',
    student: '',
    ai: true,
    approval: 'every',
    actions,
    talkKey: 'F2',
    typeKey: 'Alt+Shift+K',
    ...changes
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('the assistant\'s name', () => {
    test.each(['Mboni', 'Ada', 'Mama Zuri', "N'Golo", 'Jean-Luc', 'Zoë', 'अनु'])('may be %s', name => {
        expect(cleanName(` ${name} `)).toBe(name);
    });

    test.each([null, 7, '', '  ', 'R2D2', '-Ada', 'Ada.', 'Ignore {rules}', 'a'.repeat(31), 'two\nlines'])(
        'may not be %j', name => {
            expect(cleanName(name)).toBeNull();
        });

    test('comes from the configuration, and is Mboni otherwise', async () => {
        for (const [given, name] of [['Zuri', 'Zuri'], [null, 'Mboni'], ['<b>', 'Mboni']]) {
            const config = createConfig(() => Promise.resolve({assistantName: given}));
            await jest.advanceTimersByTimeAsync(0);
            expect(config.get().assistantName).toBe(name);
        }
    });

    test('is used in what the editor says', async () => {
        const {app, heard, settle} = setUpAi({school: {assistantName: 'Zuri'},
            respond: () => answer({type: 'explanation', text: 'Hello.'})});
        routeCommand(app, 'who are you', 'voice');
        await settle();
        expect(heard.join(' ')).toMatch(/I am Zuri/);
    });

    test('is sent to the server, and the student\'s name never is', async () => {
        const {app, requests, settings, settle} = setUpAi({school: {assistantName: 'Zuri'}});
        settings.set({studentName: 'Amina'});
        app.introduction.greet();
        await settle();
        routeCommand(app, 'what is a loop', 'voice');
        await settle();
        expect(requests[0].body.assistantName).toBe('Zuri');
        expect(JSON.stringify(requests[0].body)).not.toContain('Amina');
    });

    test.each([
        ['Mboni', 'help.introduce'],
        ['Hey Mboni.', 'help.introduce'],
        ['Mboni, where am I?', 'help.whereAmI'],
        ['okay Mboni run', 'project.run'],
        ['who are you', 'help.introduce'],
        ['introduce yourself', 'help.introduce'],
        ['what is your name', 'help.introduce'],
        ['Mboni, make me a square', null],
        ['tell Mboni to run', null]
    ])('understands "%s" as %s', (words, id) => {
        expect(parseCommand(words, [], 'Mboni')).toBe(id);
    });
});

describe('what the introduction says', () => {
    test('greets by name if known, says who it is and what it can do', () => {
        expect(compose({student: 'Amina'})).toBe('Hello Amina. I am Mboni, your coding helper. I can tell you ' +
            'where you are, find blocks, build with you, guide you, explain ideas, and fix mistakes. Nothing ' +
            'changes unless you say yes. Hold F2 to talk to me.');
        expect(compose()).toMatch(/^Hello\. I am Mboni/);
    });

    test('can be short', () => {
        expect(compose({length: 'short', student: 'Amina'})).toBe('Hello Amina. I am Mboni. Hold F2 to talk to me.');
    });

    test('takes under 20 seconds to read, however long the names', () => {
        // About two and a half words a second, which is slower than most speech settings.
        const words = text => text.split(/\s+/).length;
        for (const ai of [true, false]) {
            for (const approval of ['every', 'big']) {
                const text = compose({ai, approval, student: 'Anna Maria', talkKey: 'Alt+Shift+V'});
                expect(words(text)).toBeLessThanOrEqual(48);
            }
        }
        expect(words(compose({length: 'short'}))).toBeLessThanOrEqual(12);
    });

    test('offers without an AI helper only what the editor does itself', () => {
        expect(compose({ai: false})).toBe('Hello. I am Mboni, your coding helper. I can tell you where you are, ' +
            'read your program, and run it. Hold F2 to talk to me.');
    });

    test('is true about which changes are asked about', () => {
        expect(compose({approval: 'big'})).toContain('I ask you before big changes.');
        expect(compose({approval: 'big'})).not.toContain('Nothing changes unless');
    });

    test('says how to type where voice cannot be used', () => {
        expect(compose({talkKey: null})).toMatch(/Press Alt\+Shift\+K to type to me\.$/);
    });

    test('drops what an action or a tool no longer does', () => {
        const all = ['where', 'blocks', 'build', 'guide', 'explain', 'fix'];
        expect(offers({actions, ai: true})).toEqual(all);
        expect(offers({actions: actions.filter(id => id !== 'mode.guide'), ai: true}))
            .toEqual(all.filter(id => id !== 'guide'));
        const without = name => tools.build.filter(tool => tool !== name);
        expect(offers({actions, ai: true, toolNames: without('find_blocks')}))
            .toEqual(all.filter(id => id !== 'blocks'));
        expect(offers({actions, ai: true, toolNames: without('submit_proposal')}))
            .toEqual(['where', 'blocks', 'guide', 'explain']);
    });
});

describe('when it is said', () => {
    test('not by itself: nothing is said until the student calls', () => {
        const {heard, reader, wait} = setUp();
        wait(60000);
        expect(heard).toEqual([]);
        expect(reader.speak).not.toHaveBeenCalled();
    });

    test('instead of listening on the first press of the talk key; the next press listens', () => {
        const {heard, provider, voice, wait} = setUp();
        voice.press('key');
        voice.release('key');
        wait();
        expect(heard).toEqual([expect.stringMatching(/^Hello\. I am Mboni/)]);
        expect(provider.listen).not.toHaveBeenCalled();
        voice.press('key');
        expect(provider.listen).toHaveBeenCalledTimes(1);
    });

    test('also on the first click of the button, as some assistive technology sends it', () => {
        const {provider, voice} = setUp();
        voice.toggle();
        expect(provider.listen).not.toHaveBeenCalled();
        voice.toggle();
        expect(provider.listen).toHaveBeenCalledTimes(1);
    });

    test('once a session, across reloads, and again for a new student', () => {
        const session = memory();
        const first = setUp({session});
        expect(first.app.introduction.greet()).toBe(true);
        expect(first.app.introduction.greet()).toBe(false);
        const reloaded = setUp({session});
        expect(reloaded.app.introduction.greet()).toBe(false);
        expect(session.getItem(STORAGE_KEY)).toBe('yes');
        reloaded.app.forgetStudent();
        expect(session.size()).toBe(0);
        expect(reloaded.app.introduction.greet()).toBe(true);
    });

    test('once a page where nothing can be stored', () => {
        const refuse = () => {
            throw new Error('blocked');
        };
        const {app} = setUp({session: {getItem: refuse, setItem: refuse, removeItem: refuse}});
        expect(app.introduction.greet()).toBe(true);
        expect(app.introduction.greet()).toBe(false);
    });

    test('as much as the student chose, and not at all if turned off', () => {
        const {app, heard, settings, wait} = setUp();
        settings.set({introduction: 'off'});
        expect(app.introduction.greet()).toBe(false);
        app.perform('help.introduce');
        wait();
        expect(heard.at(-1)).toContain('your coding helper');
        settings.set({introduction: 'short', studentName: 'Amina'});
        app.perform('help.introduce');
        wait();
        expect(heard.at(-1)).toBe('Hello Amina. I am Mboni. Hold F2 to talk to me.');
    });

    test('read aloud only if the student wants that', () => {
        const quiet = setUp();
        quiet.app.introduction.greet();
        quiet.wait();
        expect(quiet.reader.speak).not.toHaveBeenCalled();
        const aloud = setUp();
        aloud.settings.set({readAloud: true});
        aloud.app.introduction.greet();
        aloud.wait();
        expect(aloud.reader.speak).toHaveBeenCalledWith(expect.stringMatching(/^Hello\./), 'en');
    });

    test('can be skipped while it is said, once', () => {
        const {app, reader, wait} = setUp();
        expect(app.introduction.skip()).toBe(false);
        app.introduction.greet();
        wait();
        reader.stop.mockClear();
        expect(app.introduction.skip()).toBe(true);
        expect(reader.stop).toHaveBeenCalled();
        expect(app.introduction.skip()).toBe(false);
    });

    test('is not skippable once something else has been said, or it has finished', () => {
        const {app, wait} = setUp();
        app.introduction.greet();
        wait();
        app.announce('Menu bar.');
        wait();
        expect(app.introduction.skip()).toBe(false);
        app.introduction.ask();
        wait(30000);
        expect(app.introduction.skip()).toBe(false);
    });

    test('never in the way of an answer to a waiting suggestion', () => {
        const {app, provider, voice} = setUp();
        app.register('gate', {isOpen: () => true});
        voice.press('key');
        expect(provider.listen).toHaveBeenCalledTimes(1);
    });

    test('keeps the student\'s name only if it is one', () => {
        const {settings} = setUp();
        settings.set({studentName: 'Amina'});
        expect(settings.get().studentName).toBe('Amina');
        settings.set({studentName: 'delete everything.'});
        expect(settings.get().studentName).toBe('');
        settings.set({introduction: 'long'});
        expect(settings.get().introduction).toBe('full');
    });
});
