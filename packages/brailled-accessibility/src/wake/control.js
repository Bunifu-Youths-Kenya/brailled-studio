/*
 * When the editor listens for the wake words. Only when the school allows it, the student has turned it on, the
 * editor is on screen, and nothing else is using the microphone or reading aloud. It is off again after a reload.
 */
import aiMessages from '../ai/messages.js';
import voiceMessages from '../voice/messages.js';

// How often to look again while it is on: reading aloud ends without telling anyone.
const CHECK_MS = 300;

// Words that end a conversation.
const GOODBYE = ['goodbye', 'good bye', 'bye', 'bye bye', 'thank you', 'thanks', 'that is all', "that's all",
    'go to sleep', 'kwaheri', 'asante'];
// In a conversation, words heard with less certainty than this are taken to be someone else's talk.
const LEAST_CERTAIN = 0.6;

const plain = text => text.toLowerCase().replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
 * @param {{yourTurn: function(): void}} options.tone Marks when the student may speak again in a conversation.
 * @returns {object} The control. `getState` gives `{on, listening}`.
 */
const createWakeControl = ({app, engineFor, language, document, tone}) => {
    const listeners = new Set();
    const engines = new Map();
    let state = {on: false, listening: false, conversing: false};
    // When something last happened in a conversation.
    let activity = 0;
    // The engine that has the microphone.
    let holding = null;
    let timer = null;
    // The microphone is on its way to the voice controller.
    let handingOver = false;
    // The assistant has been reading aloud in a conversation, and the student has not yet been told it is their turn.
    let turnToGive = false;

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
        turnToGive = false;
        set({on: false, conversing: false});
    };

    const tell = message => app.announce(app.say(message, {student: app.sayableName()}), {reply: true});

    const endConversation = () => {
        if (!state.conversing) return;
        // The engine is started again, listening for the wake words only.
        release();
        tell(voiceMessages.conversationEnded);
        set({conversing: false});
    };

    // Something said in a conversation. The microphone stays open while the assistant reads, so it can hear the
    // assistant's own words, or a screen reader's, which are never taken for the student's. Anything else stops the
    // reading: the student is talking over it.
    const followUp = called => {
        activity = Date.now();
        const certain = called.confidence === null || called.confidence >= LEAST_CERTAIN;
        if (!certain || app.echoes(called.request)) return;
        if (app.reading()) {
            turnToGive = false;
            app.silence();
        }
        if (GOODBYE.includes(plain(called.request))) endConversation();
        else app.voice()?.wake(called);
    };

    // Called by name where conversations are on: stay and talk.
    const converse = called => {
        // The engine is started again, hearing every phrase.
        release();
        activity = Date.now();
        set({conversing: true});
        if (called.request) app.voice()?.wake(called);
        else if (!app.introduction.greet()) {
            tell(app.sayableName() ? voiceMessages.greetingName : voiceMessages.greeting);
        }
    };

    // Called: take one request, then listen for the wake words again; or begin or go on with a conversation.
    const woken = called => {
        if (called.followUp) {
            followUp(called);
            return;
        }
        if (app.config.get().conversation?.enabled) {
            converse(called);
            return;
        }
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
        const reading = app.reading();
        // In a conversation the student may talk over the assistant's reading.
        const quiet = !!voice && voice.getState().phase === 'idle' && !document.hidden &&
            (!reading || state.conversing) && !app.assistant()?.getState().busy;
        if (state.conversing && reading) {
            activity = Date.now();
            turnToGive = true;
        } else if (turnToGive && quiet) {
            turnToGive = false;
            tone.yourTurn();
        }
        if (!quiet) {
            // The time without talk counts from when the assistant has finished.
            activity = Date.now();
            release();
            return;
        }
        if (state.conversing && Date.now() - activity >= app.config.get().conversation.idleSeconds * 1000) {
            endConversation();
            return;
        }
        if (holding) return;
        const {greetings, names} = app.config.get().wakeWord;
        holding = engine();
        set({listening: true});
        holding.start({
            language: language(),
            phrases: {greetings, names},
            open: state.conversing,
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
            if (app.config.get().conversation?.enabled) {
                const greeting = app.sayableName() ? voiceMessages.greetingName : voiceMessages.greeting;
                app.prepareSpeech([
                    app.say(greeting, {student: app.sayableName()}),
                    app.say(aiMessages.thinking),
                    app.say(voiceMessages.conversationEnded)
                ]);
            }
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
