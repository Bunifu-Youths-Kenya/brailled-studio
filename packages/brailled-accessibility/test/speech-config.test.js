// The school's voice settings. No real service is used.
import {createConfig} from '../src/config.js';
import {PROVIDERS, RANGES, SPEECH_DEFAULTS, speechFrom, voiceIsOn} from '../src/voice/speech-config.js';

const read = async file => {
    const config = createConfig(() => Promise.resolve(file));
    await new Promise(resolve => setTimeout(resolve, 0));
    return config.get();
};

describe('the voice settings', () => {
    test('are the browser\'s provider and the usual models unless the file says otherwise', () => {
        expect(speechFrom(true)).toEqual(SPEECH_DEFAULTS);
        expect(SPEECH_DEFAULTS).toMatchObject({
            provider: 'browser',
            listenModel: 'google/gemini-3.5-flash-lite',
            ttsModel: 'google/gemini-3.8-flash-lite-tts',
            ttsVoice: 'Kore',
            silenceSeconds: 2,
            doneWord: false
        });
    });

    test.each([true, {enabled: true}, {enabled: true, provider: 'gemini-pair'}])('turn voice on for %j', value => {
        expect(voiceIsOn(value)).toBe(true);
    });

    test.each([false, null, 'true', {}, {enabled: 'true'}, {provider: 'gemini-pair'}, [true]])(
        'leave voice off for %j', value => {
            expect(voiceIsOn(value)).toBe(false);
        });

    test.each(PROVIDERS)('may choose %s', provider => {
        expect(speechFrom({provider}).provider).toBe(provider);
    });

    test.each(['gemini', 'GEMINI-PAIR', '', 7])('take %j as the browser', provider => {
        expect(speechFrom({provider}).provider).toBe('browser');
    });

    test.each(['listenModel', 'ttsModel', 'compareModel'])('keep only model names for %s', key => {
        expect(speechFrom({[key]: 'vendor/model-1.5:free'})[key]).toBe('vendor/model-1.5:free');
        for (const bad of ['model', 'a/b c', 'https://example.org/x/y', '../x', 5]) {
            expect(speechFrom({[key]: bad})[key]).toBe(SPEECH_DEFAULTS[key]);
        }
    });

    test('keep only plain voice names', () => {
        expect(speechFrom({ttsVoice: 'Puck'}).ttsVoice).toBe('Puck');
        expect(speechFrom({ttsVoice: 'Kore; and more'}).ttsVoice).toBe('Kore');
    });

    test.each(Object.entries(RANGES))('hold %s within its range', (key, {least, usual, most}) => {
        expect(speechFrom({[key]: least - 100})[key]).toBe(least);
        expect(speechFrom({[key]: most + 100})[key]).toBe(most);
        expect(speechFrom({[key]: '3'})[key]).toBe(usual);
    });

    test('wait one to four seconds of silence', () => {
        expect([0, 1, 2.5, 4, 9].map(silenceSeconds => speechFrom({silenceSeconds}).silenceSeconds))
            .toEqual([1, 1, 2.5, 4, 4]);
    });

    test('come from the configuration file, in either form', async () => {
        expect(await read({voice: true})).toMatchObject({voice: true, speech: {provider: 'browser'}});
        expect(await read({voice: {enabled: true, provider: 'gemini-pair', ttsVoice: 'Leda'}}))
            .toMatchObject({voice: true, speech: {provider: 'gemini-pair', ttsVoice: 'Leda'}});
        expect(await read({voice: {enabled: false, provider: 'gemini-pair'}})).toMatchObject({voice: false});
    });
});
