import {createSettings, STORAGE_KEY, storageOf} from '../src/settings.js';
import {createReader} from '../src/speech/read-aloud.js';

const memory = (initial = {}) => {
    const values = {...initial};
    return {
        values,
        getItem: key => values[key] ?? null,
        setItem: (key, value) => {
            values[key] = value;
        },
        removeItem: key => delete values[key]
    };
};

const defaults = {
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
};

describe('settings', () => {
    test('start with reading aloud off and the question unanswered', () => {
        expect(createSettings(memory()).get()).toEqual(defaults);
    });

    test('are kept for the next visit', () => {
        const storage = memory();
        createSettings(storage).set({talkKey: 'altShiftV', maxSeconds: 30});
        expect(createSettings(storage).get()).toEqual({...defaults, talkKey: 'altShiftV', maxSeconds: 30});
    });

    test('hold nothing about when the AI helper asks, whatever was stored', () => {
        const storage = memory({[STORAGE_KEY]: '{"approval":"big","maxSeconds":30}'});
        const settings = createSettings(storage);
        expect(settings.get()).not.toHaveProperty('approval');
        settings.set({approval: 'big'});
        expect(settings.get()).not.toHaveProperty('approval');
        expect(storage.values[STORAGE_KEY]).not.toContain('approval');
    });

    test.each([[true, false], [false, true]])(
        'answering "uses a screen reader: %s" sets reading aloud to %s', (usesOne, readAloud) => {
            const storage = memory();
            createSettings(storage).answerScreenReader(usesOne);
            expect(createSettings(storage).get()).toMatchObject({screenReader: usesOne, readAloud});
        });

    test('saying questions instead of opening windows is on unless switched off', () => {
        const storage = memory({[STORAGE_KEY]: '{"voiceFirst":"no"}'});
        expect(createSettings(storage).get().voiceFirst).toBe(true);
        createSettings(storage).set({voiceFirst: false});
        expect(createSettings(storage).get().voiceFirst).toBe(false);
    });

    test('putting the question off is not remembered after the visit', () => {
        const storage = memory();
        const settings = createSettings(storage);
        settings.dismissQuestion();
        expect(settings.get()).toMatchObject({questionDismissed: true, screenReader: null, readAloud: false});
        // Another change does not bring the question back.
        settings.set({maxSeconds: 10});
        expect(settings.get().questionDismissed).toBe(true);
        expect(createSettings(storage).get().questionDismissed).toBe(false);
        expect(storage.values[STORAGE_KEY]).not.toContain('questionDismissed');
    });

    test.each([
        'not json', '5', 'null',
        '{"talkKey":"a","maxSeconds":100000,"readAloud":"yes","screenReader":"no"}'
    ])('unknown stored values are ignored: %s', stored => {
        expect(createSettings(memory({[STORAGE_KEY]: stored})).get()).toEqual(defaults);
    });

    test('there is no way to listen without a limit', () => {
        const settings = createSettings(memory());
        for (const maxSeconds of [0, -1, Infinity, 3600]) {
            settings.set({maxSeconds});
            expect(settings.get().maxSeconds).toBe(15);
        }
    });

    test('work without storage, or when it fails', () => {
        const broken = {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('full');
            }
        };
        for (const storage of [null, broken]) {
            const settings = createSettings(storage);
            settings.set({readAloud: true});
            expect(settings.get().readAloud).toBe(true);
        }
        expect(storageOf({
            get localStorage () {
                throw new Error('denied');
            }
        })).toBeNull();
    });

    test('tell listeners about changes', () => {
        const settings = createSettings(null);
        const listener = jest.fn();
        const stop = settings.subscribe(listener);
        settings.set({maxSeconds: 5});
        stop();
        settings.set({maxSeconds: 10});
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('reading aloud', () => {
    const voice = (lang, localService = true) => ({lang, localService});
    const browser = voices => {
        const synth = {getVoices: () => voices, speak: jest.fn(), cancel: jest.fn()};
        return {
            speechSynthesis: synth,
            SpeechSynthesisUtterance: class {
                constructor (text) {
                    this.text = text;
                }
            }
        };
    };
    const used = scope => scope.speechSynthesis.speak.mock.calls.map(([utterance]) => utterance);

    test('uses a voice on the device, never an online one', () => {
        const online = browser([voice('en-US', false)]);
        expect(createReader(online).isAvailable('en')).toBe(false);
        expect(createReader(online).speak('Hello.', 'en')).toBe(false);
        expect(used(online)).toEqual([]);

        const both = browser([voice('en-GB', false), voice('en-US')]);
        createReader(both).speak('Hello.', 'en-GB');
        expect(used(both)[0].voice).toEqual(voice('en-US'));
    });

    test.each([
        ['sw', 'sw-KE'],
        ['en-KE', 'en-KE'],
        ['fr', 'en_US']
    ])('for %s picks %s', (language, expected) => {
        const scope = browser([voice('en_US'), voice('en-KE'), voice('sw-KE')]);
        createReader(scope).speak('Hello.', language);
        expect(used(scope)[0].lang).toBe(expected);
    });

    test('replaces what was being read, sentence by sentence', () => {
        const scope = browser([voice('en-US')]);
        createReader(scope).speak('I heard: next. Move 1.5 seconds. Done', 'en');
        expect(scope.speechSynthesis.cancel).toHaveBeenCalled();
        expect(used(scope).map(utterance => utterance.text))
            .toEqual(['I heard:', 'next.', 'Move 1.5 seconds.', 'Done']);
    });

    test('does nothing in a browser that cannot', () => {
        const reader = createReader({});
        expect(reader.isAvailable('en')).toBe(false);
        expect(reader.speak('Hello.', 'en')).toBe(false);
        expect(() => reader.stop()).not.toThrow();
    });
});
