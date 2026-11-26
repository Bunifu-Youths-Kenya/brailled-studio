/*
 * What whoever runs the editor allows, read from `static/brailled-config.json` when the editor starts, so that
 * it can be changed without rebuilding. Anything that cannot be read is off.
 */
import {DEFAULT_ASSISTANT_NAME, cleanName} from './names.js';
import {speechFrom, voiceIsOn} from './voice/speech-config.js';

const CONFIG_URL = 'static/brailled-config.json';

// How long a suggestion from the AI helper waits for an answer, in seconds.
const EXPIRY_SECONDS = Object.freeze({least: 30, usual: 120, most: 900});
// The one value of `approval` that lets small changes be made without asking.
const BIG_CHANGES_ONLY = 'big changes only';

// What calls the assistant where the configuration lists nothing of its own.
const GREETINGS = Object.freeze(['hey', 'hi', 'okay', 'ok']);
// Ways in which "Mboni" is often heard.
const VARIANTS = Object.freeze(['Boni', 'Bonnie', 'Moni', 'Mbony', 'Mboni', 'Mbonyi']);
const MOST_PHRASES = 20;

// The wake word: off unless allowed with a plain `true`.
const wakeFrom = (value, assistant) => {
    const words = given => (Array.isArray(given) ?
        given.map(cleanName).filter(Boolean)
            .slice(0, MOST_PHRASES) :
        null);
    const greetings = words(value?.greetings);
    // The usual variants are of the usual name only.
    const variants = words(value?.variants) ?? (assistant === DEFAULT_ASSISTANT_NAME ? VARIANTS : []);
    return Object.freeze({
        enabled: value?.enabled === true,
        engine: value?.engine === 'on-device' ? 'on-device' : 'demo',
        greetings: greetings?.length ? greetings : GREETINGS,
        names: Array.from(new Set([assistant, ...variants]))
    });
};

// What applies until the file says otherwise.
const SAFEST = Object.freeze({ai: false,
    assistantName: DEFAULT_ASSISTANT_NAME,
    wakeWord: wakeFrom(null, DEFAULT_ASSISTANT_NAME),
    speech: speechFrom(null),
    aiEndpoint: null,
    approval: 'every',
    proposalExpirySeconds: EXPIRY_SECONDS.usual,
    assistantMode: 'build'});
// `voice` is null until the file has been read.
const LOADING = Object.freeze({...SAFEST, voice: null, unreadable: false});
const UNREADABLE = Object.freeze({...SAFEST, voice: false, unreadable: true});

// Hosts where an unencrypted address stays on this computer.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// Students' words must not cross a network unencrypted: https, this computer, or the editor's own server.
const endpointFrom = value => {
    if (typeof value !== 'string') return null;
    if (/^\/(?!\/)/.test(value)) return value;
    try {
        const url = new URL(value);
        const local = url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname);
        return url.protocol === 'https:' || local ? url.href : null;
    } catch {
        return null;
    }
};

// A number of seconds, brought within what is allowed; anything else means the usual time.
const expiryFrom = value => (Number.isFinite(value) ?
    Math.min(Math.max(Math.round(value), EXPIRY_SECONDS.least), EXPIRY_SECONDS.most) :
    EXPIRY_SECONDS.usual);

// Voice and the AI helper are separate switches, and only a plain `true` turns either on. The helper also needs
// a safe address: `aiEndpoint` is null whenever it is off. Every change is asked about unless the file says
// exactly otherwise.
const interpret = file => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) return UNREADABLE;
    const aiEndpoint = file.ai === true ? endpointFrom(file.aiEndpoint) : null;
    const assistantName = cleanName(file.assistantName) ?? DEFAULT_ASSISTANT_NAME;
    return {
        voice: voiceIsOn(file.voice),
        speech: speechFrom(file.voice),
        ai: !!aiEndpoint,
        aiEndpoint,
        approval: file.approval === BIG_CHANGES_ONLY ? 'big' : 'every',
        proposalExpirySeconds: expiryFrom(file.proposalExpirySeconds),
        // How the AI helper starts: suggesting changes, or teaching the student to make them.
        assistantMode: file.assistantMode === 'guide' ? 'guide' : 'build',
        // What the assistant is called on screen and aloud.
        assistantName,
        wakeWord: wakeFrom(file.wakeWord, assistantName),
        unreadable: false
    };
};

/**
 * @param {function(): Promise<object>} [load] Gives the file's contents. Without it everything is off.
 * @returns {{get: Function, subscribe: Function}} The configuration, which changes once, when it has loaded.
 */
const createConfig = load => {
    const listeners = new Set();
    let state = load ? LOADING : interpret({});
    const settle = next => {
        state = next;
        listeners.forEach(listener => listener());
    };
    if (load) load().then(file => settle(interpret(file)), () => settle(UNREADABLE));
    return {
        get: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};

// Reads the file from beside the editor, never from a cache, so that a change applies on the next visit.
const fetchConfig = scope => async () => {
    const response = await scope.fetch(CONFIG_URL, {cache: 'no-store'});
    if (!response.ok) throw new Error(`${CONFIG_URL}: ${response.status}`);
    return response.json();
};

export {
    BIG_CHANGES_ONLY,
    CONFIG_URL,
    EXPIRY_SECONDS,
    createConfig,
    fetchConfig
};
