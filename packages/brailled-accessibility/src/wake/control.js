/*
 * When the editor listens for the wake words. Only when the school allows it, the student has turned it on, the
 * editor is on screen, and nothing else is using the microphone or reading aloud. It is off again after a reload.
 */
import voiceMessages from '../voice/messages.js';

// How often to look again while it is on: reading aloud ends without telling anyone.
const CHECK_MS = 300;

const PROBLEMS = {
    'denied': voiceMessages.denied,
    'no-microphone': voiceMessages.noMicrophone,
    'language': voiceMessages.language,
    'unavailable': voiceMessages.wakeUnavailable,
    'failed': voiceMessages.wakeFailed
};

/**
 * @param {object} options Options.
 * @param {object} options.app The app.
 * @param {Function} options.engineFor Given an engine's name from the configuration, makes it (see `engine.js`).
 * @param {function(): string} options.language The language to listen for.
 * @param {Document} options.document To know whether the editor is on screen.
 * @returns {object} The control. `getState` gives `{on, listening}`.
 */
const createWakeControl = ({app, engineFor, language, document}) => {
    const listeners = new Set();
    const engines = new Map();
    let state = {on: false, listening: false};
    // The engine that has the microphone.
    let holding = null;
    let timer = null;
    // The microphone is on its way to the voice controller.
    let handingOver = false;

    const set = changes => {
        if (Object.entries(changes).every(([key, value]) => state[key] === value)) return;
        state = {...state, ...changes};
        listeners.forEach(listener => listener());
    };

    const engine = () => {
        const name = app.config.get().wakeWord?.engine ?? 'demo';
        if (!engines.has(name)) engines.set(name, engineFor(name));
        return engines.get(name);
    };

    const allowed = () => {
        const {voice, wakeWord} = app.config.get();
        return voice === true && wakeWord?.enabled === true;
    };

    const say = message => app.announce(app.say(message, {key: 'F4'}));

    // Stop listening for now. Returns a promise while the microphone is being let go, otherwise null.
    const release = () => {
        if (!holding) return null;
        const stopping = holding.stop();
        holding = null;
        set({listening: false});
        return stopping;
    };

    const turnOff = () => {
        clearInterval(timer);
        timer = null;
        release();
        set({on: false});
    };

    // Called: take one request, then listen for the wake words again.
    const woken = called => {
        handingOver = true;
        // The one request needs the microphone to itself.
        const free = release() ?? Promise.resolve();
        free.then(() => {
            handingOver = false;
            if (state.on) app.voice()?.wake(called);
        });
    };

    const problem = reason => {
        turnOff();
        say(PROBLEMS[reason] || voiceMessages.wakeFailed);
    };

    // Listen, or not, as things now are.
    const sync = () => {
        if (!state.on || handingOver) return;
        if (!allowed()) {
            turnOff();
            return;
        }
        const voice = app.voice();
        const quiet = !!voice && voice.getState().phase === 'idle' && !document.hidden && !app.reading();
        if (!quiet) {
            release();
            return;
        }
        if (holding) return;
        const {greetings, names} = app.config.get().wakeWord;
        holding = engine();
        set({listening: true});
        holding.start({
            language: language(),
            phrases: {greetings, names},
            onWake: woken,
            onProblem: problem
        });
    };

    const available = () => allowed() && engine().isSupported();

    const turnOn = () => {
        if (state.on) return true;
        if (!available()) return false;
        set({on: true});
        timer = setInterval(sync, CHECK_MS);
        return true;
    };

    return {
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        available,
        // Turn it on or off, as the student asked, and say so.
        start: () => {
            if (!turnOn()) {
                say(allowed() ? voiceMessages.wakeUnavailable : voiceMessages.wakeNotAllowed);
                return;
            }
            say(voiceMessages.wakeOn);
            sync();
        },
        stop: ({quietly = false} = {}) => {
            const was = state.on;
            turnOff();
            if (was && !quietly) say(voiceMessages.wakeOff);
        },
        release,
        sync,
        dispose: turnOff
    };
};

export {
    CHECK_MS,
    createWakeControl
};
