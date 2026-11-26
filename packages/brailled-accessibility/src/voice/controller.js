// Voice input: when the microphone is open, what was heard, and what happens next.
import {routeCommand} from '../actions/route.js';
import {TALK_KEYS} from '../actions/shortcuts.js';
import voiceMessages from './messages.js';

// A shorter press of the button is a tap: listen for one phrase. Screen readers often can only tap.
const TAP_MS = 350;
const MAX_WAIT_MS = 8000;
// Below this, the student is asked before anything is done.
const CONFIDENCE_THRESHOLD = 0.7;

const YES = ['yes', 'yes please', 'yes go ahead', 'go ahead', 'yes do it', 'do it', 'confirm', 'ok', 'okay'];
const NO = ['no', 'no thanks', 'no thank you', 'cancel', 'wrong', 'do not', "don't"];

// The message for each of a provider's errors.
const PROBLEMS = {
    'denied': voiceMessages.denied,
    'no-microphone': voiceMessages.noMicrophone,
    'no-speech': voiceMessages.noSpeech,
    'network': voiceMessages.network,
    'language': voiceMessages.language,
    'failed': voiceMessages.failed
};

const plain = text => text.toLowerCase().replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * @param {object} options Options.
 * @param {object} options.app The app (see `actions/app.js`).
 * @param {object} options.provider Speech to text (see `provider.js`).
 * @param {{opened: Function, closed: Function}} options.tone Sounds.
 * @param {function(): string} options.language The language to listen for.
 * @param {Function} [options.beforeRun] Called before a command is carried out.
 * @param {number} [options.threshold] The confidence needed to act without asking.
 * @returns {object} The controller. `getState` gives `{phase, mode, heard, status, pending}`.
 */
const createVoice = ({app, provider, tone, language, beforeRun = () => {}, threshold = CONFIDENCE_THRESHOLD}) => {
    const listeners = new Set();
    let state = {
        phase: 'idle',
        mode: null,
        heard: '',
        status: {message: provider.isSupported() ? voiceMessages.ready : voiceMessages.unsupported},
        // `{text}` while waiting for the student to say yes or no.
        pending: null
    };
    let session = null;
    // Which request to listen is current; reports from earlier ones are ignored.
    let turn = 0;
    let heldBy = null;
    let startedAt = 0;
    let open = false;
    let phraseEnded = false;
    let timer = null;

    const set = changes => {
        state = {...state, ...changes};
        listeners.forEach(listener => listener());
    };

    // What messages may mention.
    const keyWords = () => ({key: TALK_KEYS[app.settings.get().talkKey].name});

    // Show a message and say it.
    const tell = (message, changes = {}) => {
        set({...changes, status: {message}});
        const text = app.say(message, keyWords());
        // While a question is open, its own dialog shows the message and the screen reader says it from there.
        if (state.pending) app.speak(text);
        else app.announce(text);
    };

    const close = () => {
        clearTimeout(timer);
        session = null;
        turn += 1;
        if (open) tone.closed();
        open = false;
    };

    const cancel = (message = voiceMessages.cancelled) => {
        if (state.phase === 'idle') return;
        session?.cancel();
        close();
        tell(message, {phase: 'idle', mode: null});
    };

    // Close the microphone and wait for the words.
    const finish = () => {
        if (state.phase !== 'listening') return;
        clearTimeout(timer);
        timer = setTimeout(() => cancel(voiceMessages.failed), MAX_WAIT_MS);
        set({phase: 'finishing', status: {message: voiceMessages.working}});
        session?.stop();
    };

    const deliver = text => {
        beforeRun();
        app.preface(app.say(voiceMessages.heard, {text}));
        routeCommand(app, text, 'voice');
    };

    // Leave the question, then act once its dialog has closed and focus is back where it was.
    const answer = then => {
        if (!state.pending) return;
        const {text} = state.pending;
        app.silence();
        if (state.phase !== 'idle') {
            session?.cancel();
            close();
        }
        set({pending: null, phase: 'idle', mode: null});
        setTimeout(() => then(text), 50);
    };
    const confirm = () => answer(deliver);
    const reject = () => answer(() => tell(voiceMessages.notDone));

    const heard = (words, confidence) => {
        // Some services add a full stop, which would be doubled in the sentences that quote the words.
        const text = words.replace(/[\s.!?]+$/, '');
        const sure = confidence === null || confidence >= threshold;
        if (state.pending) {
            if (YES.includes(plain(text)) && sure) confirm();
            else if (NO.includes(plain(text))) reject();
            else {
                set({heard: text, status: {message: voiceMessages.sayYesOrNo, values: {text}}});
                app.speak(app.say(voiceMessages.sayYesOrNo, {text}));
            }
            return;
        }
        // No measure of confidence counts as low: ask first.
        if (confidence === null || confidence < threshold) {
            set({heard: text, pending: {text}, status: {text: ''}});
            app.speak(`${app.say(voiceMessages.confirmTitle, {text})} ${
                app.say(voiceMessages.confirmHint, keyWords())}`);
            return;
        }
        set({heard: text});
        deliver(text);
    };

    const ended = outcome => {
        close();
        set({phase: 'idle', mode: null});
        if (outcome.error) tell(PROBLEMS[outcome.error] || voiceMessages.failed);
        else heard(outcome.text, outcome.confidence);
    };

    const begin = (mode, source = null) => {
        turn += 1;
        const current = turn;
        const ifCurrent = report => value => {
            if (current === turn) report(value);
        };
        heldBy = source;
        startedAt = Date.now();
        open = false;
        phraseEnded = false;
        // Anything being read aloud would be heard as speech.
        app.silence();
        // The microphone never stays open longer than the chosen time.
        timer = setTimeout(finish, app.settings.get().maxSeconds * 1000);
        set({phase: 'listening', mode, heard: '', status: {message: voiceMessages.starting}});
        const listening = () => ({
            message: state.mode === 'hold' ? voiceMessages.listeningHold : voiceMessages.listeningTap
        });
        const opened = () => {
            if (open) return;
            open = true;
            tone.opened();
            set({status: listening()});
        };
        session = provider.listen({
            language: language(),
            onReady: ifCurrent(opened),
            onHear: ifCurrent(({text, final}) => {
                opened();
                phraseEnded = final;
                set({heard: text});
                if (final && state.mode === 'tap') finish();
            }),
            onEnd: ifCurrent(ended)
        });
    };

    const unsupported = () => {
        if (provider.isSupported()) return false;
        tell(voiceMessages.unsupported);
        return true;
    };

    // The key or button went down.
    const press = source => {
        if (unsupported()) return;
        if (state.phase === 'listening') {
            // A second tap ends listening.
            if (state.mode === 'tap') finish();
        } else if (state.phase === 'idle') {
            begin('hold', source);
        }
    };

    // The key or button came up.
    const release = source => {
        if (state.phase !== 'listening' || state.mode !== 'hold' || source !== heldBy) return;
        if (Date.now() - startedAt < TAP_MS) {
            if (source !== 'button') {
                cancel(voiceMessages.tooShort);
                return;
            }
            set({mode: 'tap', status: {message: open ? voiceMessages.listeningTap : voiceMessages.starting}});
            if (phraseEnded) finish();
        } else if (open) {
            finish();
        } else {
            cancel(voiceMessages.notOpen);
        }
    };

    // For input that cannot hold: listen for one phrase, or stop listening.
    const toggle = () => {
        if (unsupported()) return;
        if (state.phase === 'listening') finish();
        else if (state.phase === 'idle') begin('tap');
    };

    // The window lost focus, so letting go of the key may never be seen.
    const interrupt = () => {
        if (state.phase !== 'listening') return;
        if (open) cancel(voiceMessages.interrupted);
        else if (state.mode === 'hold') cancel(voiceMessages.notOpen);
    };

    // Replies to what was said are shown in the voice bar too.
    const connect = () => app.subscribe(text => {
        if (state.phase === 'idle' && !state.pending) set({status: {text}});
    });

    return {
        isSupported: () => provider.isSupported(),
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        connect,
        press,
        release,
        toggle,
        cancel,
        interrupt,
        confirm,
        reject,
        // Stop without saying anything, for example when the interface is rebuilt.
        dispose: () => {
            session?.cancel();
            close();
        }
    };
};

export {
    CONFIDENCE_THRESHOLD,
    TAP_MS,
    createVoice
};
