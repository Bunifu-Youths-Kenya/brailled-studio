// Recording, turning sound into WAV, and knowing when a student has finished. The microphone is stood in for.
import {encodeWav, HEADER_BYTES, RATE, resample, toBase64, toMono, toRecording} from '../src/voice/audio.js';
import {createEndpointer, WAIT_SECONDS} from '../src/voice/endpointer.js';
import {createRecorderProvider, LEVEL_MS} from '../src/voice/recorder.js';

const text = (bytes, at, length) => String.fromCharCode(...bytes.subarray(at, at + length));

describe('turning sound into WAV', () => {
    test('writes a header for one channel of 16 bit samples at 16 kHz', () => {
        const bytes = encodeWav(new Float32Array([0, 1, -1]));
        const view = new DataView(bytes.buffer);
        expect([text(bytes, 0, 4), text(bytes, 8, 8), text(bytes, 36, 4)]).toEqual(['RIFF', 'WAVEfmt ', 'data']);
        expect(view.getUint32(4, true)).toBe(bytes.length - 8);
        expect([view.getUint16(20, true), view.getUint16(22, true), view.getUint16(34, true)]).toEqual([1, 1, 16]);
        expect([view.getUint32(24, true), view.getUint32(28, true)]).toEqual([RATE, RATE * 2]);
        expect(view.getUint32(40, true)).toBe(6);
        expect(bytes).toHaveLength(HEADER_BYTES + 6);
    });

    test('holds samples to the loudest that can be written', () => {
        const view = new DataView(encodeWav(new Float32Array([0, 0.5, 4, -4])).buffer);
        expect([0, 1, 2, 3].map(i => view.getInt16(HEADER_BYTES + (i * 2), true)))
            .toEqual([0, 16384, 32767, -32767]);
    });

    test('mixes channels into one', () => {
        expect(Array.from(toMono([new Float32Array([1, 0]), new Float32Array([0, -1])]))).toEqual([0.5, -0.5]);
    });

    test('lowers and raises the rate', () => {
        expect(Array.from(resample(new Float32Array([0, 2, 4, 6]), 32000, 16000))).toEqual([1, 5]);
        expect(Array.from(resample(new Float32Array([0, 2]), 8000, 16000))).toEqual([0, 1, 2, 2]);
        expect(resample(new Float32Array(48000), 48000, 16000)).toHaveLength(16000);
        expect(resample(new Float32Array(44100), 44100, 16000)).toHaveLength(16000);
    });

    test('writes base64 that reads back, however long', () => {
        const bytes = Uint8Array.from({length: 100000}, (_, i) => i % 251);
        expect(Uint8Array.from(atob(toBase64(bytes)), letter => letter.charCodeAt(0))).toEqual(bytes);
    });

    test('says how long the recording is', () => {
        const buffer = {numberOfChannels: 2, sampleRate: 48000, getChannelData: () => new Float32Array(96000)};
        const recording = toRecording(buffer);
        expect(recording).toMatchObject({format: 'wav', seconds: 2});
        expect(atob(recording.data)).toHaveLength(HEADER_BYTES + 64000);
    });
});

// Feed an endpointer a level for a while, ten times a second. Returns why it stopped, and when.
const feed = (endpointer, parts, held = false) => {
    let tenths = 0;
    for (const [level, seconds] of parts) {
        for (let i = 0; i < Math.round(seconds * 10); i++) {
            tenths += 1;
            const why = endpointer.add(level, tenths / 10, held);
            if (why) return [why, tenths / 10];
        }
    }
    return [null, tenths / 10];
};

const quiet = 0.002;
const speech = 0.15;
const usual = () => createEndpointer({silenceSeconds: 2, maxSeconds: 30});

describe('knowing when a student has finished', () => {
    test('stops after the chosen silence', () => {
        expect(feed(usual(), [[quiet, 1], [speech, 2], [quiet, 5]])).toEqual(['silence', 5]);
    });

    test.each([1, 4])('waits %i seconds of silence when that is chosen', silenceSeconds => {
        const endpointer = createEndpointer({silenceSeconds, maxSeconds: 30});
        expect(feed(endpointer, [[speech, 2], [quiet, 10]])).toEqual(['silence', 2 + silenceSeconds]);
    });

    test('does not stop for pauses shorter than that', () => {
        const pauses = [[speech, 1], [quiet, 1.8], [speech, 1], [quiet, 1.8], [speech, 1]];
        expect(feed(usual(), pauses)).toEqual([null, 6.6]);
    });

    test('gives a student time to start', () => {
        expect(feed(usual(), [[quiet, 7], [speech, 1], [quiet, 3]])).toEqual(['silence', 10]);
        expect(feed(usual(), [[quiet, 20]])).toEqual(['nothing', WAIT_SECONDS]);
    });

    test('stops at the longest time, whatever is said', () => {
        const endpointer = createEndpointer({silenceSeconds: 2, maxSeconds: 10});
        expect(feed(endpointer, [[speech, 20]])).toEqual(['max', 10]);
    });

    test('stops only at the longest time while the talk key is held', () => {
        const endpointer = createEndpointer({silenceSeconds: 2, maxSeconds: 12});
        expect(feed(endpointer, [[speech, 1], [quiet, 30]], true)).toEqual(['max', 12]);
    });

    test('allows for a noisy room', () => {
        const noise = 0.03;
        const endpointer = usual();
        expect(feed(endpointer, [[noise, 1], [speech, 2], [noise, 5]])).toEqual(['silence', 5]);
        const only = usual();
        expect(feed(only, [[noise, 20]])[0]).toBe('nothing');
        expect(only.spoke()).toBe(false);
    });

    test('hears someone who starts talking at once', () => {
        const endpointer = usual();
        expect(feed(endpointer, [[speech, 2], [quiet, 3]])[0]).toBe('silence');
        expect(endpointer.spoke()).toBe(true);
    });

    test('does not take a click for speech', () => {
        const endpointer = usual();
        feed(endpointer, [[quiet, 1], [0.5, 0.1], [quiet, 1]]);
        expect(endpointer.spoke()).toBe(false);
    });
});

// A microphone whose loudness the test sets, with a recognizer for "done".
const browser = ({refuse = null, noRecognizer = false} = {}) => {
    const state = {level: quiet, track: {stop: jest.fn()}, recognizers: [], closed: false};
    class MediaRecorder {
        constructor () {
            state.recorder = this;
            this.state = 'inactive';
            this.mimeType = 'audio/webm';
        }
        start () {
            this.state = 'recording';
        }
        stop () {
            this.state = 'inactive';
            this.ondataavailable({data: 'sound'});
            this.onstop();
        }
    }
    class AudioContext {
        resume () {
            return Promise.resolve();
        }
        close () {
            state.closed = true;
            return Promise.resolve();
        }
        createAnalyser () {
            return {getFloatTimeDomainData: samples => samples.fill(state.level)};
        }
        createMediaStreamSource () {
            return {connect: () => {}};
        }
        decodeAudioData () {
            return Promise.resolve(
                {numberOfChannels: 1, sampleRate: RATE, getChannelData: () => new Float32Array(RATE)});
        }
    }
    class Recognition {
        start () {
            state.recognizers.push(this);
        }
        abort () {
            this.aborted = true;
        }
        hear (transcript) {
            this.onresult?.({results: [[{transcript}]]});
        }
    }
    class Blob {
        arrayBuffer () {
            return Promise.resolve(new ArrayBuffer(8));
        }
    }
    const scope = {
        navigator: {mediaDevices: {getUserMedia: jest.fn(() => (refuse ?
            Promise.reject(Object.assign(new Error(refuse), {name: refuse})) :
            Promise.resolve({getTracks: () => [state.track]})))}},
        MediaRecorder,
        AudioContext,
        Blob,
        ...(noRecognizer ? {} : {SpeechRecognition: Recognition})
    };
    return {scope, state};
};

describe('the recording provider', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const settings = {silenceSeconds: 2, maxRecordSeconds: 30, doneWord: false};
    const listen = async ({held, ...options} = {}, school = {}) => {
        const parts = browser(options);
        const provider = createRecorderProvider(parts.scope, () => ({...settings, ...school}));
        const onReady = jest.fn();
        const onEnd = jest.fn();
        const session = provider.listen({language: 'en', onReady, onEnd, onHear: () => {}, held});
        await jest.advanceTimersByTimeAsync(0);
        const wait = seconds => jest.advanceTimersByTimeAsync(seconds * 1000);
        const say = async (seconds = 1) => {
            parts.state.level = speech;
            await wait(seconds);
            parts.state.level = quiet;
        };
        return {...parts, provider, session, onReady, onEnd, wait, say};
    };

    test('needs a microphone, a recorder and sound processing', () => {
        const {scope} = browser();
        expect(createRecorderProvider(scope, () => settings).isSupported()).toBe(true);
        expect(createRecorderProvider({}, () => settings).isSupported()).toBe(false);
        expect(createRecorderProvider({...scope, MediaRecorder: null}, () => settings).isSupported()).toBe(false);
    });

    test('opens the microphone only when asked, and says when it is open', async () => {
        const {scope, onReady} = await listen();
        expect(scope.navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
        expect(onReady).toHaveBeenCalled();
    });

    test('hands over a recording after a pause, and closes the microphone', async () => {
        const {onEnd, say, wait, state} = await listen();
        await say();
        await wait(2.2);
        expect(onEnd.mock.calls).toEqual([[{audio: expect.objectContaining({format: 'wav', seconds: 1})}]]);
        expect(state.track.stop).toHaveBeenCalled();
        expect(state.closed).toBe(true);
    });

    test('hands it over when told to stop', async () => {
        const {onEnd, say, session, wait} = await listen();
        await say();
        session.stop();
        await wait(0.1);
        expect(onEnd.mock.calls[0][0]).toHaveProperty('audio');
    });

    test('keeps recording through pauses while the key is held, up to the longest time', async () => {
        const {onEnd, say, wait} = await listen({held: () => true}, {maxRecordSeconds: 10});
        await say();
        await wait(8);
        expect(onEnd).not.toHaveBeenCalled();
        await wait(1.5);
        expect(onEnd.mock.calls[0][0]).toHaveProperty('audio');
    });

    test('hands over nothing when nobody spoke', async () => {
        const {onEnd, wait} = await listen();
        await wait(WAIT_SECONDS + 1);
        expect(onEnd.mock.calls).toEqual([[{error: 'no-speech'}]]);
    });

    test('throws the sound away when cancelled', async () => {
        const {onEnd, say, session, state, wait} = await listen();
        await say();
        session.cancel();
        await wait(5);
        expect(onEnd).not.toHaveBeenCalled();
        expect(state.track.stop).toHaveBeenCalled();
    });

    test('closes a microphone that opens after it was cancelled', async () => {
        const parts = browser();
        const onEnd = jest.fn();
        createRecorderProvider(parts.scope, () => settings)
            .listen({language: 'en', onReady: () => {}, onEnd})
            .cancel();
        await jest.advanceTimersByTimeAsync(0);
        expect(parts.state.track.stop).toHaveBeenCalled();
        expect(onEnd).not.toHaveBeenCalled();
    });

    test.each([['NotAllowedError', 'denied'], ['NotFoundError', 'no-microphone'], ['Odd', 'failed']])(
        'reports %s as %s', async (refuse, error) => {
            const {onEnd} = await listen({refuse});
            expect(onEnd.mock.calls).toEqual([[{error}]]);
        });

    test('runs no speech recognition unless "done" is asked for', async () => {
        const {state} = await listen();
        expect(state.recognizers).toHaveLength(0);
    });

    test('stops at "done" where the school asks for that', async () => {
        const {onEnd, say, state, wait} = await listen({}, {doneWord: true});
        await say();
        state.recognizers[0].hear('I am nearly done with this');
        await wait(LEVEL_MS / 1000);
        expect(onEnd).not.toHaveBeenCalled();
        state.recognizers[0].hear('add a wait, done');
        await wait(0.1);
        expect(onEnd.mock.calls[0][0]).toHaveProperty('audio');
        expect(state.recognizers[0].aborted).toBe(true);
    });

    test('works without a recognizer for "done"', async () => {
        const {onEnd, say, wait} = await listen({noRecognizer: true}, {doneWord: true});
        await say();
        await wait(2.2);
        expect(onEnd.mock.calls[0][0]).toHaveProperty('audio');
    });
});
