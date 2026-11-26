import {createApp} from '../src/actions/app.js';
import parseCommand from '../src/actions/parser.js';
import {findAction} from '../src/actions/registry.js';
import {createVoice, MAX_LISTEN_MS, TAP_MS} from '../src/voice/controller.js';
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

const setUp = ({supported = true} = {}) => {
    const vm = {runtime: {threads: []}, editingTarget: null, start: jest.fn(), stopAll: jest.fn()};
    const app = createApp(vm);
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
        return text ?? app.say(message, values);
    };
    return {vm, app, voice, provider, tone, heard, beforeRun, wait, say, status};
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

    test('a sure command is carried out and echoed with the reply', () => {
        const {vm, say, heard, status, beforeRun, voice} = setUp();
        say('Stop.');
        expect(beforeRun).toHaveBeenCalled();
        expect(vm.stopAll).toHaveBeenCalled();
        expect(heard).toEqual(['I heard: Stop. Project stopped.']);
        expect(status()).toBe('I heard: Stop. Project stopped.');
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
            /^I heard: draw me a house\. That is not a command I know, and the AI helper is not available yet/)]);
        expect(vm.start).not.toHaveBeenCalled();
        expect(vm.stopAll).not.toHaveBeenCalled();
    });

    test('other words go to the assistant once there is one', () => {
        const {app, say} = setUp();
        const handle = jest.fn();
        app.register('assistant', {handle});
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

    test('never stays open longer than the limit', () => {
        const {voice, provider, wait} = setUp();
        voice.press('key');
        provider.last().onReady();
        wait(MAX_LISTEN_MS);
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
        expect(voice.getState().pending).toEqual({text: 'run'});
        expect(vm.start).not.toHaveBeenCalled();
        expect(vm.stopAll).not.toHaveBeenCalled();
    });

    test('yes carries the command out', () => {
        const {vm, voice, say, wait, heard} = setUp();
        say('stop', 0.3);
        voice.confirm();
        wait();
        expect(vm.stopAll).toHaveBeenCalled();
        expect(heard).toEqual(['I heard: stop. Project stopped.']);
    });

    test('no does nothing', () => {
        const {vm, voice, say, wait, heard} = setUp();
        say('stop', 0.3);
        voice.reject();
        wait();
        expect(vm.stopAll).not.toHaveBeenCalled();
        expect(voice.getState().pending).toBeNull();
        expect(heard).toEqual(['Nothing was done.']);
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
        expect(voice.getState().pending).toEqual({text: 'stop'});
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
        expect(findAction('voice.talk').shortcuts[0]).toMatchObject({key: 'F2', hold: true});
        expect(parseCommand('go to voice bar')).toBe('go.voice');
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
