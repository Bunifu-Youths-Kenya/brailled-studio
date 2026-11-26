// The student's choices, kept in this browser.
const STORAGE_KEY = 'brailled.settings';
const TALK_KEY_IDS = ['f2', 'altShiftV'];
// Seconds the microphone may stay open. There is no unlimited choice: it never listens continuously.
const LISTEN_SECONDS = [5, 10, 15, 30, 60];

const DEFAULTS = Object.freeze({
    talkKey: 'f2',
    maxSeconds: 15,
    readAloud: false,
    // Whether a screen reader is used, or null while the question has not been answered.
    screenReader: null
});

// Stored text may be old or edited by hand: keep only values the editor knows.
const clean = value => ({
    talkKey: TALK_KEY_IDS.includes(value?.talkKey) ? value.talkKey : DEFAULTS.talkKey,
    maxSeconds: LISTEN_SECONDS.includes(value?.maxSeconds) ? value.maxSeconds : DEFAULTS.maxSeconds,
    readAloud: value?.readAloud === true,
    screenReader: typeof value?.screenReader === 'boolean' ? value.screenReader : DEFAULTS.screenReader
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
    LISTEN_SECONDS,
    STORAGE_KEY,
    TALK_KEY_IDS,
    createSettings,
    storageOf
};
