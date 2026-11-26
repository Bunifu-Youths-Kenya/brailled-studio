// Voice input: when the microphone is open, what was heard, and what happens next.
import parseCommand from '../actions/parser.js';
import {routeCommand} from '../actions/route.js';
import {TALK_KEYS} from '../actions/shortcuts.js';
import {parseAnswer} from '../proposals/answers.js';
import {SAFE_ACTIONS} from '../proposals/risk.js';
import voiceMessages from './messages.js';

// A shorter press of the button is a tap: listen for one phrase. Screen readers often can only tap.
const TAP_MS = 350;
const MAX_WAIT_MS = 8000;
// "done" says that the student has finished, and is no part of what they asked.
const withoutDone = words => words.replace(/[\s,.;]+done[\s.!?]*$/i, '').replace(/^done[\s.!?]*$/i, '');

// What to say when a spoken turn fails, and whether the browser's service is used from then on.
const TURN_PROBLEMS = {
    no_endpoint: {message: voiceMessages.noPrivateService, fallBack: true},
    unreachable: {message: voiceMessages.onlineUnavailable, fallBack: true},
    too_many: {message: voiceMessages.onlineLimit, fallBack: true},
    too_big: {message: voiceMessages.tooLong},
    invalid: {message: voiceMessages.couldNot}
};

// A provider that records ends by itself at its longest time: this is only in case it does not.
const SPARE_SECONDS = 5;
// Below this, the student is asked before anything is done.
const CONFIDENCE_THRESHOLD = 0.7;

const YES = ['yes', 'yes please', 'yes go ahead', 'go ahead', 'yes do it', 'do it', 'confirm', 'ok', 'okay'];
const NO = ['no', 'no thanks', 'no thank you', 'cancel', 'wrong', 'do not', "don't"];

// What may be done at once after the wake words: it changes nothing. Anyone nearby can say them, so everything
// else is asked about first.
const FREE_AFTER_WAKE = new Set([...SAFE_ACTIONS, 'help.introduce', 'help.commandBox', 'voice.settings',
    'voice.stopListening', 'mode.build', 'mode.guide']);

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

// The microphone may take a moment to be let go by what had it.
const afterRelease = (release, open) => {
    if (!release) return open();
    let session = null;
    let stopped = false;
    let cancelled = false;
    release.then(() => {
        if (cancelled) return;
        session = open();
        if (stopped) session.stop();
    });
    return {
        stop: () => {
            if (session) session.stop();
            else stopped = true;
        },
        cancel: () => {
            cancelled = true;
            session?.cancel();
        }
    };
};

/**
 * @param {object} options Options.
 * @param {object} options.app The app (see `actions/app.js`).
 * @param {object} options.provider Speech to text (see `provider.js`).
 * @param {{opened: Function, closed: Function}} options.tone Sounds.
 * @param {function(): string} options.language The language to listen for.
 * @param {Function} [options.beforeRun] Called before a command is carried out.
 * @param {Function} [options.onAudio] Given `{audio, origin, asked}` when the provider records instead of giving
 * words. Without it the AI helper's server hears the recording.
 * @param {number} [options.threshold] The confidence needed to act without asking.
 * @returns {object} The controller. `getState` gives `{phase, mode, heard, status, pending}`.
 */
const createVoice = ({app, provider, tone, language, beforeRun = () => {}, threshold = CONFIDENCE_THRESHOLD,
    onAudio = null}) => {
    const records = () => !!provider.records?.();
    const listeners = new Set();
    // Why voice cannot be used, as a message, or null if it can.
    const problem = () => {
        const {voice, unreadable} = app.config.get();
        if (voice === null) return voiceMessages.checking;
        if (unreadable) return voiceMessages.configUnreadable;
        if (!voice) return voiceMessages.turnedOff;
        return provider.isSupported() ? null : voiceMessages.unsupported;
    };
    const resting = () => ({message: problem() || voiceMessages.ready});
    let state = {
        phase: 'idle',
        mode: null,
        heard: '',
        status: null,
        // Whether the sound is being recorded, to be sent to a service.
        recording: false,
        // `{text, origin, unsure}` while waiting for the student to say yes or no.
        pending: null
    };
    state.status = resting();
    let session = null;
    // Which request to listen is current; reports from earlier ones are ignored.
    let turn = 0;
    let heldBy = null;
    let startedAt = 0;
    let open = false;
    let phraseEnded = false;
    let timer = null;
    // Which recording is the newest, and what waited for an answer when it began.
    let recordings = 0;
    let asked = null;

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
        // While a question is open in a window, the window shows the message and the screen reader says it there.
        if (state.pending) app.present(text, {reply: false});
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
        tell(message, {phase: 'idle', mode: null, recording: false});
    };

    // Close the microphone and wait for the words.
    const finish = () => {
        if (state.phase !== 'listening') return;
        clearTimeout(timer);
        timer = setTimeout(() => cancel(voiceMessages.failed), MAX_WAIT_MS);
        set({phase: 'finishing', status: {message: state.recording ? voiceMessages.sending : voiceMessages.working}});
        session?.stop();
    };

    // `origin` is `voice`, `wake` for words that followed the wake words, or `conversation` for words said after them.
    const deliver = (text, origin) => {
        beforeRun();
        routeCommand(app, text, origin);
    };

    const changesThings = text => {
        const id = parseCommand(text, app.actionNames(), app.assistantName());
        return !!id && !FREE_AFTER_WAKE.has(id);
    };

    // Leave the question, then act once its dialog has closed and focus is back where it was.
    const answer = then => {
        if (!state.pending) return;
        const {text, origin} = state.pending;
        app.silence();
        if (state.phase !== 'idle') {
            session?.cancel();
            close();
        }
        set({pending: null, phase: 'idle', mode: null, recording: false});
        setTimeout(() => then(text, origin), 50);
    };
    const confirm = () => answer(deliver);
    const reject = () => answer(() => tell(voiceMessages.notDone));

    // `use` carries out the reply that came with spoken words. `fromModel` marks words written down by a model
    // that had also read the project, whose text could try to put words in the student's mouth.
    const heard = (words, confidence, origin = 'voice', {use = null, fromModel = false} = {}) => {
        // Some services add a full stop, which would be doubled in the sentences that quote the words.
        const text = words.replace(/[\s.!?]+$/, '');
        const sure = confidence === null || confidence >= threshold;
        if (state.pending) {
            // Hands-free words answer none of these questions.
            if (origin !== 'voice') return;
            const said = parseAnswer(text, app.answerWords())?.type;
            if ((YES.includes(plain(text)) || said === 'approve') && sure) confirm();
            else if (NO.includes(plain(text)) || said === 'reject') reject();
            else {
                set({heard: text, status: {message: voiceMessages.sayYesOrNo, values: {text}}});
                app.present(app.say(voiceMessages.sayYesOrNo, {text}), {reply: false});
            }
            return;
        }
        // No measure of confidence counts as low: ask first.
        const unsure = confidence === null || confidence < threshold;
        // In a conversation doubtful words are most likely not meant for the assistant.
        if (unsure && origin === 'conversation') return;
        if (unsure || ((origin !== 'voice' || fromModel) && changesThings(text))) {
            set({heard: text, pending: {text, origin, unsure}, status: {text: ''}});
            const title = unsure ? voiceMessages.confirmTitle : voiceMessages.confirmChangeTitle;
            app.present(`${app.say(title, {text})} ${app.say(voiceMessages.confirmHint, keyWords())}`, {reply: false});
            return;
        }
        set({heard: text});
        // The reply is for a request, not for a command, an answer or something said while a window waits.
        const request = use && !app.gate()?.isOpen() && !app.assistant()?.isOpen() &&
            !parseCommand(text, app.actionNames(), app.assistantName()) &&
            !['approve', 'all', 'reject'].includes(parseAnswer(text, app.answerWords())?.type);
        if (request) {
            beforeRun();
            use();
        } else {
            deliver(text, origin);
        }
    };

    // What waits for an answer now, so that an answer to something else can be told.
    const waiting = () => ({
        proposal: app.gate()?.isOpen() ? app.gate().getState().proposal.serial : null,
        pending: state.pending
    });

    // Have a recording heard, then treat the words as the editor treats any: the model decides nothing.
    const hearRecording = async ({audio, origin, asked: before}) => {
        recordings += 1;
        const number = recordings;
        const assistant = app.assistant();
        const answering = before.proposal !== null || !!before.pending;
        set({status: {message: voiceMessages.working}});
        app.announce(app.say(voiceMessages.working));
        const {speech} = app.config.get();
        const service = app.online.provider();
        const spoken = assistant ?
            await assistant.hear({
                audio: {data: audio.data, format: audio.format},
                pending: answering,
                model: service === 'openai-audio' ? speech.compareModel : speech.listenModel,
                provider: service === 'browser' ? '' : service,
                cacheHits: app.takeCacheHits()
            }) :
            {error: 'unreachable'};
        // The student has spoken again since.
        if (number !== recordings || spoken.error === 'stale') return;
        if (spoken.error) {
            const {message, fallBack} = TURN_PROBLEMS[spoken.error] || TURN_PROBLEMS.unreachable;
            if (fallBack) app.online.fallBack();
            tell(message);
            return;
        }
        const words = withoutDone(spoken.transcript).trim();
        const now = waiting();
        if (now.proposal !== before.proposal || now.pending !== before.pending) {
            tell(voiceMessages.tooLate);
            return;
        }
        // Where an answer is waited for, doubtful words are not guessed at.
        if (!words || (now.proposal !== null && !spoken.clear)) {
            tell(voiceMessages.sayAgain);
            return;
        }
        heard(words, spoken.clear ? 1 : 0, origin, {use: spoken.use, fromModel: !answering});
    };

    const ended = outcome => {
        close();
        set({phase: 'idle', mode: null, recording: false});
        const origin = heldBy === 'wake' ? 'wake' : 'voice';
        if (outcome.error) tell(PROBLEMS[outcome.error] || voiceMessages.failed);
        else if (outcome.audio) (onAudio || hearRecording)({audio: outcome.audio, origin, asked});
        else heard(outcome.text, outcome.confidence, origin);
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
        const recording = records();
        if (recording) {
            // Anything still being heard is overtaken by this.
            recordings += 1;
            asked = waiting();
        }
        const longest = recording ?
            app.config.get().speech.maxRecordSeconds + SPARE_SECONDS :
            app.settings.get().maxSeconds;
        timer = setTimeout(finish, longest * 1000);
        set({phase: 'listening', mode, heard: '', recording, status: {message: voiceMessages.starting}});
        const listening = () => {
            if (recording) {
                return {message: state.mode === 'hold' ? voiceMessages.recordingHold : voiceMessages.recordingTap};
            }
            return {message: state.mode === 'hold' ? voiceMessages.listeningHold : voiceMessages.listeningTap};
        };
        const opened = () => {
            if (open) return;
            open = true;
            tone.opened();
            set({status: listening()});
        };
        session = afterRelease(app.wake()?.release() ?? null, () => provider.listen({
            language: language(),
            held: () => state.mode === 'hold',
            onReady: ifCurrent(opened),
            onHear: ifCurrent(({text, final}) => {
                opened();
                phraseEnded = final;
                set({heard: text});
                if (final && state.mode === 'tap') finish();
            }),
            onEnd: ifCurrent(ended)
        }));
    };

    const unusable = () => {
        const reason = problem();
        if (reason) tell(reason);
        if (reason) return true;
        // The chosen service cannot work here: say so, and use the browser's from the next press.
        const {online} = app;
        if (online.chosen() === 'browser' || online.hasFallenBack()) return false;
        if (app.config.get().ai && (!provider.canRecord || provider.canRecord())) return false;
        online.fallBack();
        tell(voiceMessages.onlineUnavailable);
        return true;
    };

    // The first call of a session is answered with an introduction rather than by listening. Not while something
    // waits for an answer.
    const introduced = () => !state.pending && !app.gate()?.isOpen() && !app.assistant()?.isOpen() &&
        app.introduction.greet();

    // The key or button went down.
    const press = source => {
        if (unusable()) return;
        if (state.phase === 'listening') {
            // A second tap ends listening.
            if (state.mode === 'tap') finish();
        } else if (state.phase === 'idle' && !introduced()) {
            begin('hold', source);
        }
    };

    // The wake words were heard. Take one request, which may have come with them.
    const wake = ({request, confidence, followUp = false}) => {
        if (state.phase !== 'idle' || state.pending || problem()) return;
        app.silence();
        if (request) heard(request, confidence, followUp ? 'conversation' : 'wake');
        else if (!followUp && !introduced()) begin('tap', 'wake');
    };

    // The key or button came up.
    const release = source => {
        if (state.phase !== 'listening' || state.mode !== 'hold' || source !== heldBy) return;
        if (Date.now() - startedAt < TAP_MS) {
            // A recording ends by itself, so the talk key may be tapped as well as the button.
            if (source !== 'button' && !state.recording) {
                cancel(voiceMessages.tooShort);
                return;
            }
            const tapped = state.recording ? voiceMessages.recordingTap : voiceMessages.listeningTap;
            set({mode: 'tap', status: {message: open ? tapped : voiceMessages.starting}});
            if (phraseEnded) finish();
        } else if (open) {
            finish();
        } else {
            cancel(voiceMessages.notOpen);
        }
    };

    // For input that cannot hold: listen for one phrase, or stop listening.
    const toggle = () => {
        if (unusable()) return;
        if (state.phase === 'listening') finish();
        else if (state.phase === 'idle' && !introduced()) begin('tap');
    };

    // The window lost focus, so letting go of the key may never be seen.
    const interrupt = () => {
        if (state.phase !== 'listening') return;
        if (open) cancel(voiceMessages.interrupted);
        else if (state.mode === 'hold') cancel(voiceMessages.notOpen);
    };

    // Replies to what was said are shown in the voice bar too.
    const connect = () => {
        const replies = app.subscribe(text => {
            if (state.phase === 'idle' && !state.pending) set({status: {text}});
        });
        const configured = app.config.subscribe(() => set({status: resting()}));
        // It may have loaded before there was anyone to tell.
        set({status: resting()});
        return () => {
            replies();
            configured();
        };
    };

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
        wake,
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
