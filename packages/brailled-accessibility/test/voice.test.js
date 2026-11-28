import {createApp} from '../src/actions/app.js';
import parseCommand from '../src/actions/parser.js';
import {findAction} from '../src/actions/registry.js';
import {createConfig} from '../src/config.js';
import {createSettings, STORAGE_KEY} from '../src/settings.js';
import {createVoice, TAP_MS} from '../src/voice/controller.js';
import {createWebSpeechProvider, speechLanguage} from '../src/voice/provider.js';

// A provider driven by the test: `last()` is the newest request to listen.
const fakeProvider = (supported = true) => {
    const requests = [];
    return {
        requests,
        last: () => requests[requests.length - 1],
        isSupported: () => supported,
        listen: options => {
            const request = {...options, stop: jest.fn(), cancel: jest.fn()};
            requests.push(request);
            return request;
        }
    };
};

// A configuration that has already loaded.
const configured = values => ({get: () => ({voice: true, unreadable: false, ...values}), subscribe: () => () => {}});

const setUp = ({supported = true, config = configured()} = {}) => {
    const vm = {runtime: {threads: []}, editingTarget: null, start: jest.fn(), stopAll: jest.fn()};
    const reader = {speak: jest.fn(() => true), stop: jest.fn(), isAvailable: () => true};
    const settings = createSettings(null);
    // Introduced already, so that the talk key listens.
    const session = {getItem: () => 'yes', setItem: () => {}, removeItem: () => {}};
    const app = createApp(vm, {config, settings, reader, session});
    const heard = [];
    app.subscribe(text => heard.push(text));
    const provider = fakeProvider(supported);
    const tone = {opened: jest.fn(), closed: jest.fn()};
    const beforeRun = jest.fn();
    const voice = createVoice({app, provider, tone, language: () => 'en-GB', beforeRun});
    app.register('voice', voice);
    voice.connect();
    const wait = (ms = 3000) => jest.advanceTimersByTime(ms);
    // Hold the key, say something, let go.
    const say = (text, confidence = 0.95) => {
        voice.press('key');
        provider.last().onReady();
        wait(TAP_MS + 100);
        voice.release('key');
        provider.last().onEnd({text, confidence});
        wait();
    };
    const status = () => {
        const {text, message, values} = voice.getState().status;
        return text ?? app.say(message, {key: 'F2', ...values});
    };
    const spoken = () => reader.speak.mock.calls.map(([text]) => text);
    return {vm, app, voice, provider, tone, reader, settings, spoken, heard, beforeRun, wait, say, status};
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('holding to talk', () => {
    test('the microphone is closed until asked', () => {
        const {voice, provider} = setUp();
        expect(provider.requests).toHaveLength(0);
        expect(voice.getState().phase).toBe('idle');
    });

    test('opens on the press and closes on the release', () => {
        const {voice, provider, tone, wait, status} = setUp();
        voice.press('key');
        expect(provider.last().language).toBe('en-GB');
        expect(voice.getState()).toMatchObject({phase: 'listening', mode: 'hold'});
        provider.last().onReady();
        expect(tone.opened).toHaveBeenCalled();
        expect(status()).toBe('Listening. Let go when you have finished.');
        provider.last().onHear({text: 'ne', final: false});
        expect(voice.getState().heard).toBe('ne');
        wait(1000);
        voice.release('key');
        expect(provider.last().stop).toHaveBeenCalled();
        expect(voice.getState().phase).toBe('finishing');
    });

    test('a sure command is carried out, and only its result is said', () => {
        const {vm, say, heard, status, beforeRun, voice} = setUp();
        say('Stop.');
        expect(beforeRun).toHaveBeenCalled();
        expect(vm.stopAll).toHaveBeenCalled();
        expect(heard).toEqual(['Project stopped.']);
        expect(status()).toBe('Project stopped.');
        expect(voice.getState()).toMatchObject({phase: 'idle', heard: 'Stop', pending: null});
    });

    test('nothing is announced while the microphone is open', () => {
        const {voice, provider, heard, wait} = setUp();
        voice.press('key');
        provider.last().onReady();
        wait(1000);
        expect(heard).toEqual([]);
    });

    test('other words get an answer and change nothing', () => {
        const {vm, say, heard} = setUp();
        say('draw me a house');
        expect(heard).toEqual([expect.stringMatching(
            /^That is not a command I know, and Mboni is not connected here/)]);
        expect(vm.start).not.toHaveBeenCalled();
        expect(vm.stopAll).not.toHaveBeenCalled();
    });

    test('other words go to the assistant once there is one', () => {
        const {app, say} = setUp();
        const handle = jest.fn();
        app.register('assistant', {handle, isOpen: () => false});
        say('draw me a house');
        expect(handle).toHaveBeenCalledWith('draw me a house', {source: 'voice'});
        // Local commands never reach it.
        say('stop');
        expect(handle).toHaveBeenCalledTimes(1);
    });

    test('a short press of the key explains how to hold it', () => {
        const {voice, provider, heard, wait} = setUp();
        voice.press('key');
        provider.last().onReady();
        voice.release('key');
        expect(provider.last().cancel).toHaveBeenCalled();
        wait();
        expect(heard).toEqual(['Hold F2 down while you speak, then let go.']);
    });

    test('letting go before the microphone opens says so', () => {
        const {voice, wait, status} = setUp();
        voice.press('key');
        wait(1000);
        voice.release('key');
        expect(status()).toMatch(/^The microphone was not open yet/);
        expect(voice.getState().phase).toBe('idle');
    });

    test('only the key or button that started it can end it', () => {
        const {voice, provider, wait} = setUp();
        voice.press('key');
        provider.last().onReady();
        wait(1000);
        voice.release('button');
        expect(voice.getState().phase).toBe('listening');
    });

    test.each([[null, 15], [5, 5], [60, 60]])('with the limit set to %s, closes after %i seconds',
        (maxSeconds, seconds) => {
            const {voice, provider, settings, wait} = setUp();
            if (maxSeconds) settings.set({maxSeconds});
            voice.press('key');
            provider.last().onReady();
            wait((seconds * 1000) - 1);
            expect(provider.last().stop).not.toHaveBeenCalled();
            wait(1);
            expect(provider.last().stop).toHaveBeenCalled();
        });

    test('gives up if the service never answers', () => {
        const {voice, provider, wait, status} = setUp();
        voice.press('key');
        provider.last().onReady();
        wait(1000);
        voice.release('key');
        wait(10000);
        expect(voice.getState().phase).toBe('idle');
        expect(status()).toMatch(/^Speech recognition failed/);
    });

    test('can be cancelled, and late reports are ignored', () => {
        const {vm, voice, provider, wait, status} = setUp();
        voice.press('key');
        const request = provider.last();
        request.onReady();
        voice.cancel();
        request.onEnd({text: 'run', confidence: 0.99});
        wait();
        expect(vm.start).not.toHaveBeenCalled();
        expect(status()).toBe('Stopped listening. Nothing was done.');
    });

    test('stops when the window loses focus', () => {
        const {voice, provider, status} = setUp();
        voice.press('key');
        provider.last().onReady();
        voice.interrupt();
        expect(provider.last().cancel).toHaveBeenCalled();
        expect(status()).toMatch(/^Stopped listening because you left the window/);
    });
});

describe('tapping the button', () => {
    test('listens for one phrase and then closes', () => {
        const {vm, voice, provider, wait} = setUp();
        voice.press('button');
        voice.release('button');
        expect(voice.getState()).toMatchObject({phase: 'listening', mode: 'tap'});
        provider.last().onReady();
        provider.last().onHear({text: 'stop', final: true});
        expect(provider.last().stop).toHaveBeenCalled();
        provider.last().onEnd({text: 'stop', confidence: 0.9});
        wait();
        expect(vm.stopAll).toHaveBeenCalled();
    });

    test('a second tap closes the microphone', () => {
        const {voice, provider} = setUp();
        voice.toggle();
        provider.last().onReady();
        voice.toggle();
        expect(provider.last().stop).toHaveBeenCalled();
        expect(provider.requests).toHaveLength(1);
    });
});

describe('doubtful words', () => {
    test.each([['low', 0.3], ['unmeasured', null]])('%s confidence asks first', (_, confidence) => {
        const {vm, voice, say} = setUp();
        say('run', confidence);
        expect(voice.getState().pending).toMatchObject({text: 'run'});
        expect(vm.start).not.toHaveBeenCalled();
        expect(vm.stopAll).not.toHaveBeenCalled();
    });

    test('yes carries the command out', () => {
        const {vm, voice, say, wait, heard, settings} = setUp();
        settings.set({voiceFirst: false});
        say('stop', 0.3);
        voice.confirm();
        wait();
        expect(vm.stopAll).toHaveBeenCalled();
        expect(heard).toEqual(['Project stopped.']);
    });

    test('no does nothing', () => {
        const {vm, voice, say, wait, heard, settings} = setUp();
        settings.set({voiceFirst: false});
        say('stop', 0.3);
        voice.reject();
        wait();
        expect(vm.stopAll).not.toHaveBeenCalled();
        expect(voice.getState().pending).toBeNull();
        expect(heard).toEqual(['Nothing was done.']);
    });

    test('beside the editor, the question reaches a screen reader too', () => {
        const {voice, say, wait, heard} = setUp();
        say('stop', 0.3);
        wait();
        voice.reject();
        wait();
        expect(heard).toEqual([
            'I heard: stop. I am not sure. Should I go ahead? Say yes or no while holding F2, or choose a button.',
            'Nothing was done.'
        ]);
    });

    test('can be answered by voice', () => {
        const {vm, voice, say} = setUp();
        say('stop', 0.3);
        say('Yes.');
        expect(vm.stopAll).toHaveBeenCalledTimes(1);
        say('stop', 0.3);
        say('no');
        expect(vm.stopAll).toHaveBeenCalledTimes(1);
        expect(voice.getState().pending).toBeNull();
    });

    test('a doubtful yes or other words keep the question open', () => {
        const {vm, voice, say, status} = setUp();
        say('stop', 0.3);
        say('yes', 0.2);
        say('run');
        expect(voice.getState().pending).toMatchObject({text: 'stop'});
        expect(status()).toBe('I heard: run. Say yes or no, or choose a button.');
        expect(vm.stopAll).not.toHaveBeenCalled();
        expect(vm.start).not.toHaveBeenCalled();
    });
});

describe('when voice cannot be used', () => {
    test('an unsupported browser says so and never listens', () => {
        const {voice, provider, wait, heard, status} = setUp({supported: false});
        expect(status()).toMatch(/^This browser cannot turn speech into text/);
        voice.press('key');
        voice.toggle();
        wait();
        expect(provider.requests).toHaveLength(0);
        expect(heard[0]).toMatch(/You can type commands instead, with Alt\+Shift\+K\.$/);
    });

    test.each([
        ['denied', /^The microphone is blocked/],
        ['no-microphone', /^No microphone was found/],
        ['no-speech', /^I did not hear anything/],
        ['network', /^The speech service cannot be reached/],
        ['language', /cannot understand speech in this language/],
        ['failed', /^Speech recognition failed/],
        ['something new', /^Speech recognition failed/]
    ])('%s is explained', (error, message) => {
        const {voice, provider, wait, heard, status} = setUp();
        voice.press('key');
        provider.last().onEnd({error});
        wait();
        expect(status()).toMatch(message);
        expect(heard).toEqual([expect.stringMatching(message)]);
        expect(voice.getState().phase).toBe('idle');
        // It can be tried again.
        voice.press('key');
        expect(provider.requests).toHaveLength(2);
    });
});

describe('voice actions', () => {
    test('talking and finding the voice bar are registered actions', () => {
        const {app, settings} = setUp();
        const key = () => findAction('voice.talk').shortcutsFor(app)[0];
        expect(key()).toMatchObject({key: 'F2', hold: true});
        settings.set({talkKey: 'altShiftV'});
        expect(key()).toMatchObject({code: 'KeyV', alt: true, shift: true, hold: true});
        expect(parseCommand('go to voice bar')).toBe('go.voice');
        expect(parseCommand('open voice settings')).toBe('voice.settings');
    });

    test('messages name the chosen talk key', () => {
        const {voice, provider, settings, wait, heard} = setUp();
        settings.set({talkKey: 'altShiftV'});
        voice.press('key');
        provider.last().onReady();
        voice.release('key');
        wait();
        expect(heard).toEqual(['Hold Alt+Shift+V down while you speak, then let go.']);
    });

    test('the talk key is not treated as a pressed shortcut', () => {
        const {app} = setUp();
        expect(app.handleKey({key: 'F2', code: 'F2'}, 'global')).toBe(false);
    });

    test('"talk" listens for one phrase', () => {
        const {app, voice, provider} = setUp();
        app.perform('voice.talk');
        expect(provider.requests).toHaveLength(1);
        expect(voice.getState()).toMatchObject({phase: 'listening', mode: 'tap'});
    });

    test('"talk" says when the browser cannot', () => {
        const {app, wait, heard} = setUp({supported: false});
        app.perform('voice.talk');
        wait();
        expect(heard).toEqual(['This browser cannot turn speech into text.']);
    });
});

describe('reading aloud', () => {
    test('is off to begin with', () => {
        const {say, reader} = setUp();
        say('stop');
        expect(reader.speak).not.toHaveBeenCalled();
    });

    test('reads replies when chosen', () => {
        const {say, settings, spoken} = setUp();
        settings.answerScreenReader(false);
        say('stop');
        expect(spoken()).toEqual(['Project stopped.']);
    });

    test('reads the question about doubtful words, and its answers', () => {
        const {say, settings, spoken} = setUp();
        settings.set({readAloud: true});
        say('run', 0.2);
        expect(spoken()).toEqual([
            'I heard: run. I am not sure. Should I go ahead? Say yes or no while holding F2, or choose a button.']);
        say('maybe');
        expect(spoken()[1]).toBe('I heard: maybe. Say yes or no, or choose a button.');
    });

    test('is silenced before the microphone opens, and stays silent while it is', () => {
        const {app, voice, settings, reader, spoken, wait} = setUp();
        settings.set({readAloud: true});
        voice.press('key');
        expect(reader.stop).toHaveBeenCalled();
        app.announce('Something happened.');
        wait(1000);
        expect(spoken()).toEqual([]);
    });
});

describe('where voice is turned off', () => {
    test.each([
        [{voice: false}, /^Voice is turned off for this editor\./],
        [{voice: false, unreadable: true}, /configuration could not be read/],
        [{voice: null}, /^Checking whether voice can be used/]
    ])('with %o the microphone never opens', (values, message) => {
        const {app, voice, provider, wait, heard, status} = setUp({config: configured(values)});
        expect(status()).toMatch(message);
        voice.press('key');
        voice.release('key');
        voice.press('button');
        voice.toggle();
        app.perform('voice.talk');
        wait();
        expect(provider.requests).toHaveLength(0);
        expect(heard.length).toBeGreaterThan(0);
    });

    test('nothing is read aloud, and voice actions say why', () => {
        const {app, settings, reader, wait, heard} = setUp({config: configured({voice: false})});
        settings.set({readAloud: true});
        app.perform('voice.settings');
        wait();
        expect(heard).toEqual(['Voice is turned off for this editor.']);
        expect(reader.speak).not.toHaveBeenCalled();
    });

    test('other actions still work', () => {
        const {app, vm, wait} = setUp({config: configured({voice: false})});
        app.perform('project.stop');
        wait();
        expect(vm.stopAll).toHaveBeenCalled();
    });

    test('the bar learns the configuration when it loads', async () => {
        jest.useRealTimers();
        const config = createConfig(() => Promise.resolve({voice: true}));
        const {status} = setUp({config});
        expect(status()).toMatch(/^Checking/);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(status()).toMatch(/^Hold F2/);
    });
});

describe('the configuration', () => {
    const loaded = async load => {
        const config = createConfig(load);
        await new Promise(resolve => setTimeout(resolve, 0));
        return config.get();
    };

    beforeEach(() => jest.useRealTimers());

    test.each([
        [{voice: true}, true], [{voice: false}, false], [{voice: 'true'}, false], [{}, false]
    ])('%o turns voice on: %s', async (file, voice) => {
        expect(await loaded(() => Promise.resolve(file))).toEqual({voice,
            ai: false,
            aiEndpoint: null,
            account: false,
            homeUrl: null,
            approval: 'every',
            proposalExpirySeconds: 120,
            assistantMode: 'build',
            assistantName: 'Mboni',
            wakeWord: expect.objectContaining({enabled: false}),
            speech: expect.objectContaining({provider: 'browser'}),
            conversation: expect.objectContaining({enabled: false, voiceApproval: false}),
            earcons: expect.objectContaining({enabled: false, volume: 0.15}),
            unreadable: false});
    });

    test.each([
        ['a missing file', () => Promise.reject(new Error('404'))],
        ['something else', () => Promise.resolve('voice')],
        ['a list', () => Promise.resolve([true])]
    ])('is off for %s', async (_, load) => {
        expect(await loaded(load)).toEqual({voice: false,
            ai: false,
            aiEndpoint: null,
            account: false,
            homeUrl: null,
            approval: 'every',
            proposalExpirySeconds: 120,
            assistantMode: 'build',
            assistantName: 'Mboni',
            wakeWord: expect.objectContaining({enabled: false}),
            speech: expect.objectContaining({provider: 'browser'}),
            conversation: expect.objectContaining({enabled: false, voiceApproval: false}),
            earcons: expect.objectContaining({enabled: false, volume: 0.15}),
            unreadable: true});
    });

    test.each([
        ['https://ai.school.example/api/assistant', 'https://ai.school.example/api/assistant'],
        ['http://localhost:8787/api/assistant', 'http://localhost:8787/api/assistant'],
        ['http://127.0.0.1:8787/a', 'http://127.0.0.1:8787/a'],
        ['/api/assistant', '/api/assistant'],
        ['http://ai.school.example/api/assistant', null],
        ['//elsewhere.example/api', null],
        [['javascript', 'alert(1)'].join(':'), null],
        ['api/assistant', null],
        ['', null],
        [true, null]
    ])('takes %j as the AI helper\'s address: %j', async (aiEndpoint, expected) => {
        expect(await loaded(() => Promise.resolve({voice: false, ai: true, aiEndpoint})))
            .toMatchObject({aiEndpoint: expected, ai: expected !== null});
    });

    test.each([
        [{aiEndpoint: '/api/assistant'}],
        [{ai: false, aiEndpoint: '/api/assistant'}],
        [{ai: 'true', aiEndpoint: '/api/assistant'}],
        [{voice: true, aiEndpoint: '/api/assistant'}]
    ])('keeps the AI helper off unless "ai" is true: %j', async file => {
        expect(await loaded(() => Promise.resolve(file))).toMatchObject({ai: false, aiEndpoint: null});
    });

    test.each([[true, false], [false, true]])('switches voice (%s) and the AI helper (%s) apart', async (voice, ai) => {
        expect(await loaded(() => Promise.resolve({voice, ai, aiEndpoint: '/api/assistant'})))
            .toMatchObject({voice, ai});
    });

    test.each([
        ['big changes only', 'big'], ['every time', 'every'], ['big', 'every'], ['never', 'every'],
        ['Big Changes Only', 'every'], [true, 'every'], [null, 'every']
    ])('"approval": %j means asking at level %s', async (approval, level) => {
        expect((await loaded(() => Promise.resolve({approval}))).approval).toBe(level);
    });

    test.each([
        [120, 120], [30, 30], [600, 600], [900, 900], [5, 30], [0, 30], [-1, 30], [100000, 900], [90.6, 91],
        ['300', 120], [null, 120], [Infinity, 120]
    ])('"proposalExpirySeconds": %j gives %i', async (proposalExpirySeconds, seconds) => {
        const config = await loaded(() => Promise.resolve({proposalExpirySeconds}));
        expect(config.proposalExpirySeconds).toBe(seconds);
    });

    test('asks every time, for the usual time, when it says nothing or cannot be read', async () => {
        for (const load of [() => Promise.resolve({}), () => Promise.reject(new Error('404'))]) {
            expect(await loaded(load)).toMatchObject({approval: 'every', proposalExpirySeconds: 120});
        }
        expect(createConfig().get()).toMatchObject({approval: 'every', proposalExpirySeconds: 120});
    });

    test('is off when there is nothing to load', () => {
        expect(createConfig().get().voice).toBe(false);
    });
});

describe('reset for a new student', () => {
    test('forgets every choice and the stored copy', () => {
        const values = {};
        const storage = {
            getItem: key => values[key] ?? null,
            setItem: (key, value) => {
                values[key] = value;
            },
            removeItem: key => delete values[key]
        };
        const settings = createSettings(storage);
        settings.answerScreenReader(false);
        settings.set({talkKey: 'altShiftV', maxSeconds: 60});
        const listener = jest.fn();
        settings.subscribe(listener);
        settings.reset();
        expect(values[STORAGE_KEY]).toBeUndefined();
        expect(settings.get()).toEqual({
            talkKey: 'f2',
            maxSeconds: 15,
            readAloud: false,
            screenReader: null,
            studentName: '',
            introduction: 'full',
            onlineReadbacks: false,
            onlineName: false,
            voiceFirst: true,
            verbosity: 'normal',
            narrationSpeed: 'normal',
            speechRate: 1,
            earcons: null,
            liveInterrupt: false,
            questionDismissed: false
        });
        expect(listener).toHaveBeenCalled();
        expect(createSettings(storage).get().screenReader).toBeNull();
    });

    test('asks again even if the question was put off', () => {
        const settings = createSettings(null);
        settings.dismissQuestion();
        settings.reset();
        expect(settings.get().questionDismissed).toBe(false);
    });
});

// A stand-in for the browser's recognition object.
const fakeBrowser = () => {
    const instances = [];
    class Recognition {
        constructor () {
            this.start = jest.fn();
            this.stop = jest.fn();
            this.abort = jest.fn();
            instances.push(this);
        }
    }
    return {scope: {webkitSpeechRecognition: Recognition}, instances};
};

const result = (transcript, confidence, isFinal = true) =>
    Object.assign([{transcript, confidence}], {isFinal});

describe('the browser speech provider', () => {
    const listen = () => {
        const {scope, instances} = fakeBrowser();
        const calls = {onReady: jest.fn(), onHear: jest.fn(), onEnd: jest.fn()};
        const session = createWebSpeechProvider(scope).listen({language: 'en-US', ...calls});
        return {recognition: instances[0], session, ...calls};
    };

    test('is unsupported without the browser feature', () => {
        expect(createWebSpeechProvider({}).isSupported()).toBe(false);
        expect(createWebSpeechProvider(fakeBrowser().scope).isSupported()).toBe(true);
    });

    test('listens until stopped and reports the least sure confidence', () => {
        const {recognition, session, onReady, onHear, onEnd} = listen();
        expect(recognition).toMatchObject({lang: 'en-US', continuous: true, interimResults: true});
        recognition.onaudiostart();
        expect(onReady).toHaveBeenCalled();
        recognition.onresult({results: [result('go to', 0.9), result(' the', 0, false)]});
        expect(onHear).toHaveBeenLastCalledWith({text: 'go to the', final: false});
        recognition.onresult({results: [result('go to', 0.9), result(' the stage', 0.6)]});
        expect(onHear).toHaveBeenLastCalledWith({text: 'go to the stage', final: true});
        session.stop();
        expect(recognition.stop).toHaveBeenCalled();
        recognition.onend();
        expect(onEnd).toHaveBeenCalledWith({text: 'go to the stage', confidence: 0.6});
    });

    test('gives no confidence when the browser measures none', () => {
        const {recognition, onEnd} = listen();
        recognition.onresult({results: [result('run', 0)]});
        recognition.onend();
        expect(onEnd).toHaveBeenCalledWith({text: 'run', confidence: null});
    });

    test.each([
        ['not-allowed', 'denied'],
        ['service-not-allowed', 'denied'],
        ['audio-capture', 'no-microphone'],
        ['no-speech', 'no-speech'],
        ['network', 'network'],
        ['language-not-supported', 'language'],
        ['bad-grammar', 'failed']
    ])('reports %s as %s, once', (browserError, error) => {
        const {recognition, onEnd} = listen();
        recognition.onerror({error: browserError});
        recognition.onend();
        recognition.onend();
        expect(onEnd.mock.calls).toEqual([[{error}]]);
    });

    test('silence is "no speech"', () => {
        const {recognition, onEnd} = listen();
        recognition.onend();
        expect(onEnd).toHaveBeenCalledWith({error: 'no-speech'});
    });

    test('says nothing after being cancelled', () => {
        const {recognition, session, onHear, onEnd} = listen();
        session.cancel();
        expect(recognition.abort).toHaveBeenCalled();
        recognition.onresult({results: [result('run', 1)]});
        recognition.onend();
        expect(onHear).not.toHaveBeenCalled();
        expect(onEnd).not.toHaveBeenCalled();
    });

    test('a browser that refuses to start reports failure', () => {
        const onEnd = jest.fn();
        const scope = {SpeechRecognition: class {
            start () {
                throw new Error('already started');
            }
        }};
        createWebSpeechProvider(scope).listen({language: 'en-US', onReady: jest.fn(), onHear: jest.fn(), onEnd});
        expect(onEnd).not.toHaveBeenCalled();
        jest.runAllTimers();
        expect(onEnd).toHaveBeenCalledWith({error: 'failed'});
    });

    test('listens in the editor\'s language, or the browser\'s English', () => {
        expect(speechLanguage('en', 'en-KE')).toBe('en-KE');
        expect(speechLanguage('en', 'sw')).toBe('en-US');
        expect(speechLanguage('sw', 'en-KE')).toBe('sw');
    });
});

describe('a provider that records', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const recording = () => {
        const provider = {...fakeProvider(), records: () => true};
        const school = configured({speech: {maxRecordSeconds: 20}});
        const app = createApp({runtime: {threads: []}, editingTarget: null},
            {config: school,
                settings: createSettings(null),
                reader: {speak: () => true,
                    stop: () => {},
                    isAvailable: () => true},
                session: {getItem: () => 'yes', setItem: () => {}, removeItem: () => {}}});
        const onAudio = jest.fn();
        const voice = createVoice({app,
            provider,
            tone: {opened: () => {}, closed: () => {}},
            language: () => 'en',
            onAudio});
        app.register('voice', voice);
        return {app, onAudio, provider, voice};
    };
    const audio = {data: 'sound', format: 'wav', seconds: 1};

    test('hands over the sound, saying where it came from', () => {
        const {onAudio, provider, voice} = recording();
        voice.press('button');
        expect(voice.getState().recording).toBe(true);
        provider.last().onEnd({audio});
        expect(onAudio.mock.calls).toEqual([[{audio, origin: 'voice', asked: {proposal: null, pending: null}}]]);
        expect(voice.getState()).toMatchObject({phase: 'idle', recording: false});
        voice.wake({request: '', confidence: 0.9});
        provider.last().onEnd({audio});
        expect(onAudio.mock.calls[1][0]).toMatchObject({audio, origin: 'wake'});
    });

    test('listens after a tap of the talk key, until a second press', () => {
        const {provider, voice} = recording();
        voice.press('key');
        provider.last().onReady();
        voice.release('key');
        expect(voice.getState()).toMatchObject({phase: 'listening', mode: 'tap'});
        expect(provider.last().held()).toBe(false);
        voice.press('key');
        expect(provider.last().stop).toHaveBeenCalled();
    });

    test('is told while the key is held, and stops when it is let go', () => {
        const {provider, voice} = recording();
        voice.press('key');
        provider.last().onReady();
        expect(provider.last().held()).toBe(true);
        jest.advanceTimersByTime(TAP_MS + 100);
        voice.release('key');
        expect(provider.last().stop).toHaveBeenCalled();
    });

    test('is stopped if it outlasts the longest recording', () => {
        const {provider, voice} = recording();
        voice.press('button');
        provider.last().onReady();
        jest.advanceTimersByTime(24000);
        expect(provider.last().stop).not.toHaveBeenCalled();
        jest.advanceTimersByTime(2000);
        expect(provider.last().stop).toHaveBeenCalled();
    });
});
