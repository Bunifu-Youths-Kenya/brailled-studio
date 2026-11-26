// The student's choices, kept in this browser.
import {cleanName} from './names.js';

const STORAGE_KEY = 'brailled.settings';
const TALK_KEY_IDS = ['f2', 'altShiftV'];
// Seconds the microphone may stay open for one request. There is no unlimited choice.
const LISTEN_SECONDS = [5, 10, 15, 30, 60];

// How much the assistant says when it introduces itself.
const INTRODUCTIONS = ['full', 'short', 'off'];

const DEFAULTS = Object.freeze({
    talkKey: 'f2',
    maxSeconds: 15,
    readAloud: false,
    // Whether a screen reader is used, or null while the question has not been answered.
    screenReader: null,
    // The first name to greet the student by, or empty. It is never sent anywhere.
    studentName: '',
    introduction: 'full',
    // Whether an online voice, where there is one, also reads what edits and commands did.
    onlineReadbacks: false,
    // Whether the student's name may be sent to an online voice, to be said.
    onlineName: false,
    // Whether questions are said and shown beside the editor instead of in windows that take focus.
    voiceFirst: true
});

// Stored text may be old or edited by hand: keep only values the editor knows.
const clean = value => ({
    talkKey: TALK_KEY_IDS.includes(value?.talkKey) ? value.talkKey : DEFAULTS.talkKey,
    maxSeconds: LISTEN_SECONDS.includes(value?.maxSeconds) ? value.maxSeconds : DEFAULTS.maxSeconds,
    readAloud: value?.readAloud === true,
    screenReader: typeof value?.screenReader === 'boolean' ? value.screenReader : DEFAULTS.screenReader,
    studentName: cleanName(value?.studentName) ?? DEFAULTS.studentName,
    introduction: INTRODUCTIONS.includes(value?.introduction) ? value.introduction : DEFAULTS.introduction,
    onlineReadbacks: value?.onlineReadbacks === true,
    onlineName: value?.onlineName === true,
    voiceFirst: value?.voiceFirst !== false
});

// The browser's storage, which can be switched off.
const storageOf = scope => {
    try {
        return scope.localStorage || null;
    } catch {
        return null;
    }
};

/**
 * @param {?Storage} storage Where to keep the choices. Without it they last until the page closes.
 * @returns {object} The settings.
 */
const createSettings = storage => {
    const listeners = new Set();
    const load = () => {
        try {
            return clean(JSON.parse(storage?.getItem(STORAGE_KEY)));
        } catch {
            return clean(null);
        }
    };
    // `questionDismissed` lasts only until the page closes.
    let state = {...load(), questionDismissed: false};
    const set = changes => {
        state = {...clean({...state, ...changes}),
            questionDismissed: changes.questionDismissed ?? state.questionDismissed};
        try {
            storage?.setItem(STORAGE_KEY, JSON.stringify(clean(state)));
        } catch {
            // Full or blocked storage: the choice still applies to this visit.
        }
        listeners.forEach(listener => listener());
    };
    return {
        get: () => state,
        set,
        // Without a screen reader the editor reads its replies aloud.
        answerScreenReader: usesOne => set({screenReader: usesOne, readAloud: !usesOne}),
        dismissQuestion: () => set({questionDismissed: true}),
        // Forget every choice, so that the next student starts as on a first visit.
        reset: () => {
            try {
                storage?.removeItem(STORAGE_KEY);
            } catch {
                // Blocked storage holds nothing to remove.
            }
            state = {...clean(null), questionDismissed: false};
            listeners.forEach(listener => listener());
        },
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};

export {
    DEFAULTS,
    INTRODUCTIONS,
    LISTEN_SECONDS,
    STORAGE_KEY,
    TALK_KEY_IDS,
    createSettings,
    storageOf
};
