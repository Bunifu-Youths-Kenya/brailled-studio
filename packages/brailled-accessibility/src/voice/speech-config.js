/*
 * The school's choice of who turns speech into text and replies into speech, from `voice` in the configuration
 * file. Anything not understood means the usual value, and the usual provider is the browser's own.
 */
import {SWAHILI} from '../proposals/answers.js';

const PROVIDERS = Object.freeze(['browser', 'gemini-pair', 'openai-audio', 'openai-live']);

// A model as OpenRouter names it, and a voice's name. The server decides which models it will use.
const MODEL = /^[a-z0-9-]+\/[a-z0-9.:_-]{1,80}$/i;
const VOICE_NAME = /^[A-Za-z0-9_.:-]{1,60}$/;

const ANSWER = /^[\p{L}\p{M}' ]{1,40}$/u;
const MOST_ANSWERS = 30;

// The ways of answering besides English, as the file lists them, or Swahili ones.
const answersFrom = value => Object.freeze(Object.fromEntries(Object.entries(SWAHILI).map(([key, usual]) => {
    const given = value?.[key];
    if (!Array.isArray(given)) return [key, usual];
    return [key, Object.freeze(given.filter(item => typeof item === 'string' && ANSWER.test(item.trim()))
        .slice(0, MOST_ANSWERS)
        .map(item => item.trim().toLowerCase()))];
})));

// What each number may be: anything outside is brought to the nearest end.
const RANGES = Object.freeze({
    speed: {least: 0.5, usual: 1, most: 2},
    maxRecordSeconds: {least: 5, usual: 30, most: 60, whole: true},
    silenceSeconds: {least: 1, usual: 2, most: 4},
    dailyRequestCap: {least: 0, usual: 300, most: 10000, whole: true},
    dailyCharacterCap: {least: 0, usual: 50000, most: 2000000, whole: true}
});

const SPEECH_DEFAULTS = Object.freeze({
    provider: 'browser',
    listenModel: 'google/gemini-3.5-flash-lite',
    ttsModel: 'hexgrad/kokoro-82m',
    ttsVoice: 'af_heart',
    // The model of the `openai-audio` provider, which is there for comparison.
    compareModel: 'openai/gpt-audio-mini',
    compareVoice: 'alloy',
    // Whether saying "done" ends a recording, which needs the browser's speech recognition to run beside it.
    doneWord: false,
    // Who reads the assistant's replies where the browser does the listening: the device, or the online voice.
    readReplies: 'device',
    // Words besides the English ones that say yes, no or "change it", matched in the editor.
    answers: SWAHILI,
    ...Object.fromEntries(Object.entries(RANGES).map(([key, range]) => [key, range.usual]))
});

const numberIn = (value, {least, usual, most, whole}) => {
    if (!Number.isFinite(value)) return usual;
    return Math.min(Math.max(whole ? Math.round(value) : value, least), most);
};

const matching = (value, pattern, usual) => (typeof value === 'string' && pattern.test(value) ? value : usual);

// `value` is what the file has under `voice`: `true`, `false` or an object of settings.
const speechFrom = value => {
    const given = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const model = key => matching(given[key], MODEL, SPEECH_DEFAULTS[key]);
    return Object.freeze({
        provider: PROVIDERS.includes(given.provider) ? given.provider : SPEECH_DEFAULTS.provider,
        listenModel: model('listenModel'),
        ttsModel: model('ttsModel'),
        compareModel: model('compareModel'),
        ttsVoice: matching(given.ttsVoice, VOICE_NAME, SPEECH_DEFAULTS.ttsVoice),
        compareVoice: matching(given.compareVoice, VOICE_NAME, SPEECH_DEFAULTS.compareVoice),
        doneWord: given.doneWord === true,
        readReplies: given.readReplies === 'online' ? 'online' : 'device',
        answers: answersFrom(given.answers),
        ...Object.fromEntries(Object.entries(RANGES).map(([key, range]) => [key, numberIn(given[key], range)]))
    });
};

// Voice is on for a plain `true`, or for settings whose `enabled` is a plain `true`.
// Who reads replies: with the comparison provider, the model that also hears, in a voice of its own.
const speakingWith = speech => (speech?.provider === 'openai-audio' ?
    {...speech, ttsModel: speech.compareModel, ttsVoice: speech.compareVoice} :
    speech);

// Whether an online voice reads the assistant's replies, whoever listens.
const readsRepliesOnline = speech => !!speech && (speech.provider !== 'browser' || speech.readReplies === 'online');

const voiceIsOn = value => value === true || value?.enabled === true;

export {
    PROVIDERS,
    RANGES,
    SPEECH_DEFAULTS,
    readsRepliesOnline,
    speakingWith,
    speechFrom,
    voiceIsOn
};
