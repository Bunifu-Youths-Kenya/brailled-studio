// Reading with an online voice: the queue of sentences, the sound that ships, falling back, and what is sent.
import {createApp} from '../src/actions/app.js';
import {createOnlineSpeaker} from '../src/speech/online-speaker.js';
import {phraseKey} from '../src/speech/phrases.js';
import {createSettings} from '../src/settings.js';
import {speechFrom} from '../src/voice/speech-config.js';

const school = speechFrom({provider: 'gemini-pair', speed: 1.25});
const keptKey = text => phraseKey(text, school.ttsVoice, school.ttsModel);

// A browser whose server and loudspeaker the test controls.
const browser = ({kept = [], fail = () => false, manifest = true} = {}) => {
    const state = {asked: [], played: [], fetched: [], aborted: 0};
    const scope = {
        AbortController: class {
            constructor () {
                this.signal = {};
            }
            abort () {
                state.aborted += 1;
                this.signal.onabort?.();
            }
        },
        Blob: class {
            constructor (parts) {
                this.bytes = parts[0];
            }
        },
        URL: {
            createObjectURL: blob => blob,
            revokeObjectURL: () => {}
        },
        Audio: class {
            constructor (blob) {
                this.bytes = blob.bytes;
            }
            play () {
                state.played.push(this);
                return Promise.resolve();
            }
            pause () {
                this.paused = true;
            }
        },
        fetch: jest.fn((url, options = {}) => {
            state.fetched.push(url);
            if (url.endsWith('manifest.json')) {
                return Promise.resolve({ok: manifest,
                    json: () => Promise.resolve({phrases:
                    kept.map(text => ({key: keptKey(text), file: `${keptKey(text)}.wav`}))})});
            }
            if (url.endsWith('.wav')) {
                return Promise.resolve({ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([82]).buffer)});
            }
            const body = JSON.parse(options.body);
            state.asked.push(body);
            if (fail(body.text)) return Promise.resolve({ok: false, status: 502});
            return Promise.resolve({ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer)});
        })
    };
    return {scope, state};
};

const speakerFor = (options = {}) => {
    const parts = browser(options);
    const onFail = jest.fn();
    const speaker = createOnlineSpeaker({scope: parts.scope,
        address: () => '/api/speak',
        settings: () => school,
        onFail});
    const settle = () => jest.advanceTimersByTimeAsync(0);
    const finish = async () => {
        parts.state.played.at(-1).onended();
        await settle();
    };
    return {...parts, finish, onFail, settle, speaker};
};

describe('the queue of sentences', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('plays one at a time, in order, asking for the next while one plays', async () => {
        const {speaker, state, settle, finish} = speakerFor();
        speaker.speak('One. Two. Three.', {online: true});
        await settle();
        expect(state.asked.map(body => body.text)).toEqual(['One.', 'Two.']);
        expect(state.played).toHaveLength(1);
        expect(speaker.speaking()).toBe(true);
        await finish();
        expect(state.asked.map(body => body.text)).toEqual(['One.', 'Two.', 'Three.']);
        expect(state.played).toHaveLength(2);
        await finish();
        await finish();
        expect(speaker.speaking()).toBe(false);
        expect(state.asked).toHaveLength(3);
    });

    test('sends only the words, the model and the voice', async () => {
        const {speaker, state, settle} = speakerFor();
        speaker.speak('One.', {online: true});
        await settle();
        expect(state.asked).toEqual(
            [{text: 'One.', model: school.ttsModel, voice: 'af_heart', provider: 'gemini-pair', cacheHits: 0}]);
    });

    test('plays at the school\'s speed, keeping the pitch', async () => {
        const {speaker, state, settle} = speakerFor();
        speaker.speak('One.', {online: true});
        await settle();
        expect(state.played[0]).toMatchObject({playbackRate: 1.25, preservesPitch: true});
    });

    test('stops at once, and does not go on', async () => {
        const {speaker, state, settle} = speakerFor();
        speaker.speak('One. Two. Three.', {online: true});
        await settle();
        speaker.stop();
        await settle();
        expect(state.played[0].paused).toBe(true);
        expect(speaker.speaking()).toBe(false);
        expect(state.played).toHaveLength(1);
    });

    test('is replaced by newer words', async () => {
        const {speaker, state, settle} = speakerFor();
        speaker.speak('One. Two.', {online: true});
        await settle();
        speaker.speak('New.', {online: true});
        await settle();
        expect(state.played[0].paused).toBe(true);
        expect(state.asked.at(-1).text).toBe('New.');
    });

    test('plays shipped sound without asking the service, offline too', async () => {
        const {speaker, state, settle, finish} = speakerFor({kept: ['Done.', 'Hello.']});
        await speaker.load();
        expect(speaker.has('Done. Hello.')).toBe(true);
        expect(speaker.has('Done. Goodbye.')).toBe(false);
        speaker.speak('Done. Hello.', {online: false});
        await settle();
        await finish();
        expect(state.asked).toEqual([]);
        expect(state.fetched).toContain(`static/brailled-voice/${keptKey('Hello.')}.wav`);
        expect(state.played).toHaveLength(2);
    });

    test('counts the sentences played from shipped sound, and tells the server once', async () => {
        const {speaker, state, settle, finish} = speakerFor({kept: ['Done.', 'Hello.']});
        await speaker.load();
        speaker.speak('Done. Hello. One. Two.', {online: true});
        await settle();
        for (let i = 0; i < 3; i++) await finish();
        expect(state.asked.map(body => body.cacheHits)).toEqual([2, 0]);
        speaker.speak('Done.');
        await settle();
        expect([speaker.takeHits(), speaker.takeHits()]).toEqual([1, 0]);
    });

    test('fetches prepared sentences ahead, and then says them at once, as often as wanted', async () => {
        const {speaker, state, settle, finish} = speakerFor();
        await speaker.prepare('Hey! Okay.');
        expect(state.asked.map(body => body.text)).toEqual(['Hey!', 'Okay.']);
        // Reading something else does not give them up.
        for (let i = 0; i < 2; i++) {
            speaker.speak('Okay.', {online: true});
            await settle();
            await finish();
        }
        expect(state.asked).toHaveLength(2);
        expect(state.played).toHaveLength(2);
    });

    test('holds on to nothing that was not prepared', async () => {
        const {speaker, state, settle, finish} = speakerFor();
        for (let i = 0; i < 2; i++) {
            speaker.speak('Your program says hello.', {online: true});
            await settle();
            await finish();
        }
        expect(state.asked).toHaveLength(2);
    });

    test('mixes shipped and asked-for sentences', async () => {
        const {speaker, state, settle, finish} = speakerFor({kept: ['Done.']});
        speaker.speak('Done. You added a wait.', {online: true});
        await settle();
        await finish();
        expect(state.asked.map(body => body.text)).toEqual(['You added a wait.']);
    });

    test.each([
        ['the service fails', {fail: text => text === 'Two.'}, true],
        ['offline, with no kept sound', {kept: ['One.']}, false]
    ])('hands back what was not read when %s', async (_, options, online) => {
        const {speaker, onFail, settle, finish} = speakerFor(options);
        speaker.speak('One. Two. Three.', {online});
        await settle();
        await finish();
        expect(onFail.mock.calls).toEqual([['Two. Three.']]);
        expect(speaker.speaking()).toBe(false);
    });

    test('works without a list of shipped sound', async () => {
        const {speaker, state, settle} = speakerFor({manifest: false});
        speaker.speak('One.', {online: true});
        await settle();
        expect(state.played).toHaveLength(1);
    });
});

describe('which voice reads', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const setUp = ({provider = 'gemini-pair', kept = ['Done.'], ai = true} = {}) => {
        const configured = {voice: true,
            ai,
            aiEndpoint: ai ? '/api/assistant' : null,
            speech: speechFrom({provider}),
            assistantName: 'Mboni'};
        const config = {get: () => configured, subscribe: () => () => {}};
        const device = {speak: jest.fn(() => true), stop: jest.fn(), isAvailable: () => true};
        const online = {speak: jest.fn(),
            stop: jest.fn(),
            load: jest.fn(),
            speaking: () => false,
            has: text => kept.includes(text)};
        let failure;
        let address;
        const settings = createSettings(null);
        settings.set({readAloud: true});
        const app = createApp({runtime: {threads: []}}, {config,
            reader: device,
            settings,
            createSpeaker: options => {
                failure = options.onFail;
                address = options.address;
                return online;
            }});
        return {address: () => address(), app, device, fail: rest => failure(rest), online, settings};
    };

    test('replies go to the online voice, and read-backs stay on the device', () => {
        const {app, device, online} = setUp();
        app.speak('It repeats.', {reply: true});
        expect(online.speak).toHaveBeenCalledWith('It repeats.', {online: true});
        app.speak('Added: wait 1 second.');
        expect(device.speak).toHaveBeenCalledWith('Added: wait 1 second.', 'en');
        expect(online.speak).toHaveBeenCalledTimes(1);
    });

    test('read-backs go online only if the student chooses', () => {
        const {app, online, settings} = setUp();
        settings.set({onlineReadbacks: true});
        app.speak('Added: wait 1 second.');
        expect(online.speak).toHaveBeenCalled();
    });

    test('fixed sentences use the shipped sound', () => {
        const {app, online} = setUp();
        app.speak('Done.');
        expect(online.speak).toHaveBeenCalledWith('Done.', {online: true});
    });

    test('the student\'s name is never sent', () => {
        const {app, device, online, settings} = setUp();
        settings.set({studentName: 'Amina', onlineReadbacks: true});
        app.speak('Hello amina. Done.', {reply: true});
        expect(online.speak).not.toHaveBeenCalled();
        expect(device.speak).toHaveBeenCalled();
    });

    test.each([['browser', true], ['gemini-pair', false]])('with %s and the AI %s, only the device reads',
        (provider, ai) => {
            const {app, online} = setUp({provider, ai});
            app.speak('Done.', {reply: true});
            expect(online.speak).not.toHaveBeenCalled();
        });

    test('nothing is read when reading aloud is off', () => {
        const {app, device, online, settings} = setUp();
        settings.set({readAloud: false});
        app.speak('Done.', {reply: true});
        expect(online.speak).not.toHaveBeenCalled();
        expect(device.speak).not.toHaveBeenCalled();
    });

    test('shipped sound still plays after listening has fallen back', () => {
        const {app, online} = setUp();
        app.online.fallBack();
        app.speak('Done.');
        expect(online.speak).toHaveBeenCalledWith('Done.', {online: false});
        app.speak('It repeats.', {reply: true});
        expect(online.speak).toHaveBeenCalledTimes(1);
    });

    test('after a failure the device reads, saying so, from then on', () => {
        const {app, device, online, fail} = setUp();
        const heard = [];
        app.subscribe(text => heard.push(text));
        fail('It repeats.');
        jest.advanceTimersByTime(500);
        expect(heard).toEqual(['The online voice cannot be reached. Using the device’s voice. It repeats.']);
        expect(device.speak).toHaveBeenCalledWith(heard[0], 'en');
        app.speak('Done.', {reply: true});
        expect(online.speak).not.toHaveBeenCalled();
    });

    test('silence stops both', () => {
        const {app, device, online} = setUp();
        app.silence();
        expect(device.stop).toHaveBeenCalled();
        expect(online.stop).toHaveBeenCalled();
    });

    test('speech is asked for beside the assistant', () => {
        expect(setUp().address()).toBe('/api/speak');
    });
});

describe('what is said when something cannot be read aloud', () => {
    const warned = ({provider = 'browser', voices = false, ai = true, choose = {}, fall = false} = {}) => {
        const configured = {voice: true,
            ai,
            aiEndpoint: ai ? '/api/assistant' : null,
            speech: speechFrom({provider}),
            assistantName: 'Mboni'};
        const settings = createSettings(null);
        settings.set({readAloud: true, ...choose});
        const app = createApp({runtime: {threads: []}}, {
            config: {get: () => configured, subscribe: () => () => {}},
            reader: {speak: () => voices, stop: () => {}, isAvailable: () => voices},
            settings,
            createSpeaker: () => ({speak: () => {},
                stop: () => {},
                load: () => {},
                speaking: () => false,
                has: () => false})
        });
        if (fall) app.online.fallBack();
        return app.voiceWarning();
    };

    test('with no voice on the device, that nothing is read, and how to get one', () => {
        expect(warned()).toMatch(/nothing is read aloud.*--enable-speech-dispatcher/);
        expect(warned({provider: 'gemini-pair', fall: true})).toMatch(/nothing is read aloud/);
        expect(warned({provider: 'gemini-pair', ai: false})).toMatch(/nothing is read aloud/);
    });

    test('with an online voice, that only replies are read, unless it reads everything', () => {
        expect(warned({provider: 'gemini-pair'})).toMatch(/only Mboni’s replies are read aloud/);
        expect(warned({provider: 'gemini-pair', choose: {onlineReadbacks: true}})).toBeNull();
    });

    test('nothing, where there is a voice or reading aloud is off', () => {
        expect(warned({voices: true})).toBeNull();
        expect(warned({choose: {readAloud: false}})).toBeNull();
    });
});
