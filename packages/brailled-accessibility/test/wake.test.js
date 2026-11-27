// The wake words: matching them, listening for them, and what they may and may not do. No real service is used.
import {createBrowserWakeWord, MOST_FAILURES} from '../src/wake/browser-engine.js';
import {CHECK_MS, createWakeControl} from '../src/wake/control.js';
import {createDeviceWakeWord} from '../src/wake/device-engine.js';
import {createWakeWord} from '../src/wake/engine.js';
import {matchWake} from '../src/wake/match.js';
import {routeCommand} from '../src/actions/route.js';
import {createConfig} from '../src/config.js';
import {createVoice} from '../src/voice/controller.js';
import {answer, setUp} from './proposal-setup.js';

const phrases = {
    greetings: ['hey', 'hi', 'okay', 'ok'],
    names: ['Mboni', 'Boni', 'Bonnie', 'Moni', 'Mbony', 'Mbonyi']
};

describe('matching the wake words', () => {
    test.each([
        'Hey Mboni', 'hi mboni', 'Okay, Mboni.', 'OK Mboni', 'Hey Boni', 'hey Bonnie', 'Hi Moni', 'okay Mbony',
        'Hey Mbonyi!', 'um, hey Mboni', 'hey M boni', 'hey em boni', 'Hey Mbóni', "hey Mbon'i"
    ])('is called by "%s"', text => {
        expect(matchWake(text, phrases)).toEqual({request: ''});
    });

    test.each([
        '', 'hey', 'Mboni', 'Boni hey', 'hello Mboni', 'hey there', 'hey money', 'hey Tony', 'hey Bonita',
        'hey Boniface', 'hi Monica', 'okay boy', 'hey mum, I need help', 'hey mo, ni hao', 'hey mon I need it',
        'they said hey Mboni', 'say hey Mboni', 'I told Bonnie about it', 'we say hi to money',
        'heyMboni is one word', 'okay my bonnet', 'hey, I am Mboni'
    ])('is not called by "%s"', text => {
        expect(matchWake(text, phrases)).toBeNull();
    });

    test.each([
        ['Hey Mboni, where am I?', 'where am I?'],
        ['okay Boni add a wait block', 'add a wait block'],
        ['hi M boni... run', 'run']
    ])('keeps what is asked in "%s"', (text, request) => {
        expect(matchWake(text, phrases)).toEqual({request});
    });

    test('matches a name of more than one word', () => {
        const named = {greetings: ['hey'], names: ['Mama Zuri']};
        expect(matchWake('hey Mama Zuri run', named)).toEqual({request: 'run'});
        expect(matchWake('hey Mama run', named)).toBeNull();
    });

    test('is set by the configuration file, and off unless it says so', async () => {
        const read = async file => {
            const config = createConfig(() => Promise.resolve(file));
            await Promise.resolve();
            await Promise.resolve();
            await new Promise(resolve => setTimeout(resolve, 0));
            return config.get().wakeWord;
        };
        expect(await read({voice: true})).toEqual({enabled: false,
            engine: 'demo',
            greetings: phrases.greetings,
            names: phrases.names});
        expect((await read({wakeWord: {enabled: 'true'}})).enabled).toBe(false);
        expect(await read({wakeWord: {enabled: true,
            engine: 'on-device',
            greetings: ['jambo', 7],
            variants: ['Bony', 'not a name!']}})).toEqual(
            {enabled: true, engine: 'on-device', greetings: ['jambo'], names: ['Mboni', 'Bony']});
        // The usual variants belong to the usual name.
        expect((await read({assistantName: 'Zuri', wakeWord: {}})).names).toEqual(['Zuri']);
    });
});

// Speech recognition as the browser gives it, driven by the test.
const fakeBrowser = ({refuse = false} = {}) => {
    const made = [];
    class Recognition {
        constructor () {
            made.push(this);
        }
        start () {
            if (refuse) throw new Error('busy');
            this.started = true;
        }
        abort () {
            this.aborted = true;
        }
        hear (transcript, {final = true, confidence = 0.9} = {}) {
            const result = Object.assign([{transcript, confidence}], {isFinal: final});
            this.onresult({resultIndex: 0, results: [result]});
        }
    }
    return {scope: {webkitSpeechRecognition: Recognition}, made, last: () => made.at(-1)};
};

describe('demo mode', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const listen = options => {
        const browser = fakeBrowser(options);
        const engine = createBrowserWakeWord(browser.scope);
        const onWake = jest.fn();
        const onProblem = jest.fn();
        engine.start({language: 'en-GB', phrases, onWake, onProblem});
        return {...browser, engine, onWake, onProblem};
    };

    test('listens continuously, in the language asked for', () => {
        const {last} = listen();
        expect(last()).toMatchObject({started: true, continuous: true, lang: 'en-GB'});
    });

    test('reports only finished phrases that call the assistant', () => {
        const {last, onWake} = listen();
        last().hear('the cat sat on the mat');
        last().hear('hey Mboni', {final: false});
        expect(onWake).not.toHaveBeenCalled();
        last().hear('Hey Boni, run', {confidence: 0.8});
        expect(onWake.mock.calls).toEqual([[{request: 'run', confidence: 0.8}]]);
        last().hear('hey Mboni', {confidence: 0});
        expect(onWake.mock.calls[1]).toEqual([{request: '', confidence: null}]);
    });

    test('starts again when the browser stops it', () => {
        const {made, last, onProblem} = listen();
        for (let i = 0; i < 20; i++) {
            jest.advanceTimersByTime(30000);
            last().onerror({error: 'no-speech'});
            last().onend();
            jest.advanceTimersByTime(300);
        }
        expect(made).toHaveLength(21);
        expect(onProblem).not.toHaveBeenCalled();
    });

    test('waits longer each time it ends at once, and gives up', () => {
        const {made, last, onProblem} = listen();
        for (let i = 1; i < MOST_FAILURES; i++) {
            last().onend();
            jest.advanceTimersByTime((250 * (2 ** i)) - 1);
            expect(made).toHaveLength(i);
            jest.advanceTimersByTime(1);
            expect(made).toHaveLength(i + 1);
        }
        last().onend();
        jest.advanceTimersByTime(60000);
        expect(made).toHaveLength(MOST_FAILURES);
        expect(onProblem.mock.calls).toEqual([['failed']]);
    });

    test('gives up on a browser that will not start it', () => {
        const {onProblem} = listen({refuse: true});
        jest.advanceTimersByTime(60000);
        expect(onProblem.mock.calls).toEqual([['failed']]);
    });

    test.each([['not-allowed', 'denied'], ['audio-capture', 'no-microphone'],
        ['language-not-supported', 'language']])('stops for good on %s', (error, reason) => {
        const {made, last, onProblem} = listen();
        last().onerror({error});
        last().onend();
        jest.advanceTimersByTime(60000);
        expect(made).toHaveLength(1);
        expect(onProblem.mock.calls).toEqual([[reason]]);
    });

    test('stops, and says when the microphone is free', async () => {
        const {engine, last, made, onWake} = listen();
        const first = last();
        const freed = jest.fn();
        engine.stop().then(freed);
        expect(first.aborted).toBe(true);
        first.hear('hey Mboni');
        expect(onWake).not.toHaveBeenCalled();
        await Promise.resolve();
        expect(freed).not.toHaveBeenCalled();
        first.onend();
        await jest.advanceTimersByTimeAsync(0);
        expect(freed).toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(60000);
        expect(made).toHaveLength(1);
    });

    test('does not wait for ever to be free', async () => {
        const {engine} = listen();
        const freed = jest.fn();
        engine.stop().then(freed);
        await jest.advanceTimersByTimeAsync(1100);
        expect(freed).toHaveBeenCalled();
    });

    test('started again while stopping, starts once the old one has ended', async () => {
        const {engine, last, made} = listen();
        const first = last();
        engine.stop();
        engine.start({language: 'en', phrases, onWake: () => {}, onProblem: () => {}});
        expect(made).toHaveLength(1);
        first.onend();
        await jest.advanceTimersByTimeAsync(0);
        expect(made).toHaveLength(2);
    });

    test('has a place for an engine on the device, which none fills yet', () => {
        const onProblem = jest.fn();
        const engine = createWakeWord('on-device', fakeBrowser().scope);
        expect(engine.isSupported()).toBe(false);
        engine.start({onProblem});
        expect(onProblem).toHaveBeenCalledWith('unavailable');
        expect(createWakeWord('demo', fakeBrowser().scope).isSupported()).toBe(true);
        expect(createDeviceWakeWord().isSupported()).toBe(false);
    });
});

const allowed = {enabled: true, engine: 'demo', ...phrases};

// The editor with its approval gate and voice, and stand-ins for both microphones.
const editor = ({school = {wakeWord: allowed}, supported = true, respond, introduced = true} = {}) => {
    const parts = setUp({school, ...(respond ? {respond} : {})});
    const {app} = parts;
    // Asking for the introduction counts as having had it.
    if (introduced) app.introduction.ask();
    const engine = {
        running: false,
        isSupported: () => supported,
        start: jest.fn(options => {
            engine.running = true;
            engine.options = options;
        }),
        stop: jest.fn(() => {
            engine.running = false;
            return Promise.resolve();
        })
    };
    const requests = [];
    const provider = {
        isSupported: () => true,
        listen: jest.fn(options => {
            // The two never have the microphone at once.
            expect(engine.running).toBe(false);
            const request = {...options, stop: jest.fn(), cancel: jest.fn()};
            requests.push(request);
            return request;
        })
    };
    const voice = createVoice({app, provider, tone: {opened: () => {}, closed: () => {}}, language: () => 'en'});
    app.register('voice', voice);
    voice.connect();
    const page = {hidden: false};
    const wake = createWakeControl({
        app,
        engineFor: () => engine,
        language: () => 'en',
        document: page,
        tone: {yourTurn: () => {}}
    });
    app.register('wake', wake);
    voice.subscribe(wake.sync);
    // The wake words, with whatever followed them.
    const call = async (request = '', confidence = 0.95) => {
        expect(engine.running).toBe(true);
        engine.options.onWake({request, confidence});
        await parts.settle(1000);
    };
    // What is then said into the microphone.
    const say = async (text, confidence = 0.95) => {
        requests.at(-1).onEnd({text, confidence});
        await parts.settle(1000);
    };
    return {...parts, call, engine, page, provider, requests, say, voice, wake};
};

describe('listening for the wake words', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const on = async options => {
        const parts = editor(options);
        parts.wake.start();
        await parts.settle(500);
        return parts;
    };

    test('is off until the student turns it on', async () => {
        const {engine, wake, settle} = editor();
        await settle(5000);
        expect(wake.getState()).toMatchObject({on: false, listening: false});
        expect(engine.start).not.toHaveBeenCalled();
    });

    test('says so when on, and listens', async () => {
        const {engine, heard, wake} = await on();
        expect(wake.getState()).toMatchObject({on: true, listening: true});
        expect(engine.options.phrases).toEqual(phrases);
        expect(heard.at(-1)).toBe('Now listening for the wake words: say hey, then Mboni. Press F4 to stop.');
        // Read by a screen reader, the announcement does not call it.
        expect(heard.at(-1).split(/[.:] /)
            .some(part => matchWake(part, phrases))).toBe(false);
    });

    test.each([
        ['the school has not allowed it', {school: {wakeWord: {...allowed, enabled: false}}}, /not turned on/],
        ['the school says nothing of it', {school: {}}, /not turned on/],
        ['voice is off', {school: {voice: false, wakeWord: allowed}}, /not turned on/],
        ['nothing can listen', {supported: false}, /cannot be used here/]
    ])('does not start when %s', async (_, options, message) => {
        const {engine, heard, wake} = await on(options);
        expect(wake.getState().on).toBe(false);
        expect(engine.start).not.toHaveBeenCalled();
        expect(heard.at(-1)).toMatch(message);
    });

    test('is started and stopped by one action, with a key of its own', async () => {
        const {app, wake, settle} = editor();
        app.perform('voice.wake');
        await settle(500);
        expect(wake.getState().on).toBe(true);
        app.perform('voice.wake');
        expect(wake.getState()).toMatchObject({on: false, listening: false});
        wake.start();
        routeCommand(app, 'stop listening', 'voice');
        expect(wake.getState().on).toBe(false);
    });

    test('cannot be turned on or off by the AI helper', async () => {
        const {app} = await on();
        expect(app.proposableActions().map(action => action.id)).not.toEqual(
            expect.arrayContaining([expect.stringMatching(/^voice\./)]));
    });

    test.each([
        ['the page is hidden', ({page}) => {
            page.hidden = true;
        }, ({page}) => {
            page.hidden = false;
        }],
        ['something is being read aloud', ({reader}) => {
            reader.speaking = () => true;
        }, ({reader}) => {
            reader.speaking = () => false;
        }],
        ['the talk key is held', ({voice}) => voice.press('key'), ({voice}) => voice.cancel()]
    ])('pauses while %s, then listens again', async (_, begin, end) => {
        const parts = await on();
        begin(parts);
        await parts.settle(CHECK_MS * 2);
        expect(parts.wake.getState()).toMatchObject({on: true, listening: false});
        expect(parts.engine.running).toBe(false);
        end(parts);
        await parts.settle(CHECK_MS * 2);
        expect(parts.wake.getState().listening).toBe(true);
    });

    test('takes the request said with the wake words, then waits again', async () => {
        const {call, heard, engine, provider, vm} = await on();
        await call('stop');
        expect(vm.stopAll).toHaveBeenCalled();
        expect(heard.join(' ')).toMatch(/Project stopped\./);
        expect(provider.listen).not.toHaveBeenCalled();
        expect(engine.running).toBe(true);
    });

    test('after the wake words alone, listens for one request, then waits again', async () => {
        const {call, say, engine, provider, vm, wake} = await on();
        await call();
        expect(provider.listen).toHaveBeenCalledTimes(1);
        expect(wake.getState().listening).toBe(false);
        await say('stop');
        expect(vm.stopAll).toHaveBeenCalled();
        expect(engine.running).toBe(true);
        expect(provider.listen).toHaveBeenCalledTimes(1);
    });

    test('introduces the assistant if this is the first call', async () => {
        const {call, heard, provider} = await on({introduced: false});
        await call();
        expect(heard.at(-1)).toMatch(/I am Mboni/);
        expect(provider.listen).not.toHaveBeenCalled();
    });

    const proposal = body => answer({type: 'proposal',
        summary: 'Add a wait.',
        steps: [{command: {
            op: 'insert',
            block: 'control_wait',
            after: body.program.find(line => line.includes('motion_movesteps')).trim()
                .split(' ')[0]}}]});

    test.each(['yes', 'go ahead', 'yes do it', 'confirm', 'all', 'step by step', 'change it: three', 'no'])(
        'never answers a waiting suggestion: "%s"', async words => {
            const {app, call, say, data, gate, heard, requests: spoken, settle} = await on({respond: proposal});
            routeCommand(app, 'add a wait', 'voice');
            await settle();
            const before = data();
            const waiting = gate.getState();
            await call(words);
            expect(heard.at(-1)).toMatch(/A suggestion is waiting\. The wake words cannot answer it/);
            await call();
            await say(words);
            expect(spoken).toHaveLength(1);
            expect(gate.getState()).toMatchObject({status: waiting.status});
            expect(gate.isOpen()).toBe(true);
            expect(data()).toBe(before);
        });

    test('leaves the suggestion to the talk key', async () => {
        const {app, voice, say, program, settle} = await on({respond: proposal});
        routeCommand(app, 'add a wait', 'voice');
        await settle();
        voice.press('button');
        voice.release('button');
        await settle(500);
        await say('yes');
        await settle();
        expect(program()).toContain('wait 1 second');
    });

    test.each(['delete block', 'forget everything'])('asks before "%s", which changes things',
        async words => {
            const {app, call, data, vm, voice} = await on();
            const forget = jest.spyOn(app.memory, 'clear');
            const before = data();
            await call(words);
            expect(voice.getState().pending).toMatchObject({text: words, origin: 'wake', unsure: false});
            expect(vm.start).not.toHaveBeenCalled();
            expect(forget).not.toHaveBeenCalled();
            expect(data()).toBe(before);
        });

    test('is not answered by the wake words when it asks', async () => {
        const {call, data, voice} = await on();
        const before = data();
        await call('delete block');
        await call('yes');
        await call();
        expect(voice.getState().pending).not.toBeNull();
        expect(data()).toBe(before);
    });

    test('goes ahead once the student confirms', async () => {
        const {app, call, voice, settle} = await on();
        const forget = jest.spyOn(app.memory, 'clear');
        await call('forget everything');
        expect(forget).not.toHaveBeenCalled();
        voice.confirm();
        await settle();
        expect(forget).toHaveBeenCalled();
    });

    test('runs at once, with no device connected, but asks where one is', async () => {
        const {app, call, vm, voice} = await on();
        await call('run');
        expect(voice.getState().pending).toBeNull();
        expect(vm.greenFlag).toHaveBeenCalled();
        const snapshot = app.snapshot;
        app.snapshot = () => ({...snapshot(), device: {name: 'micro:bit', connected: true, mode: 'live'}});
        await call('run');
        expect(voice.getState().pending).toMatchObject({text: 'run'});
    });

    test('asks when the words may have been misheard', async () => {
        const {call, voice} = await on();
        await call('read program', 0.4);
        expect(voice.getState().pending).toMatchObject({unsure: true});
    });

    test('stops the project at once', async () => {
        const {call, vm} = await on();
        await call('stop');
        expect(vm.stopAll).toHaveBeenCalled();
    });

    test('stops when the microphone is refused, and says why', async () => {
        const {engine, heard, wake, settle} = await on();
        engine.options.onProblem('denied');
        await settle(500);
        expect(wake.getState()).toMatchObject({on: false, listening: false});
        expect(heard.at(-1)).toMatch(/microphone is blocked/);
    });

    test('is off again for a new student, and is never stored', async () => {
        const {app, engine, wake, settings} = await on();
        expect(JSON.stringify(settings.get())).not.toMatch(/wake/i);
        app.forgetStudent();
        expect(wake.getState().on).toBe(false);
        expect(engine.running).toBe(false);
    });
});
