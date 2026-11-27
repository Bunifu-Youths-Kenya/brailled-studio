import PropTypes from 'prop-types';
import React, {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {useIntl} from 'react-intl';

import {getApp} from '../actions/app.js';
import {hasOpenDialog} from '../actions/dom.js';
import {useSettings} from '../actions/preferences.jsx';
import {matches, releases, TALK_KEYS, WAKE_KEY} from '../actions/shortcuts.js';
import Dialog from '../outline/dialog.jsx';
import {createWakeControl} from '../wake/control.js';
import {createWakeWord} from '../wake/engine.js';
import {createVoice} from './controller.js';
import voiceMessages from './messages.js';
import {createSpeechProvider, speechLanguage} from './provider.js';
import {createVoiceProviders} from './providers.js';
import {createRecorderProvider} from './recorder.js';
import {privacyNotice} from './notice.js';
import createTone from './tone.js';

import dialogStyles from '../outline/dialog.css';
import styles from './voice-bar.css';

const ZONE = '[data-brailled-zone="voice"], [data-brailled-voice-dialog]';

// Asks before acting on words that may have been misheard.
const Question = ({text, unsure, hint, status, listening, docked, onYes, onNo}) => {
    const intl = useIntl();
    return (
        <Dialog
            docked={docked}
            title={intl.formatMessage(
                unsure ? voiceMessages.confirmTitle : voiceMessages.confirmChangeTitle, {text})}
            onCancel={onNo}
        >
            <div data-brailled-voice-dialog>
                <p
                    className={dialogStyles.count}
                    id="brailled-voice-hint"
                >
                    {hint}
                </p>
                {/* Announced, except while the microphone is open and would hear it. Beside the editor, the
                    live region says it already. */}
                <p
                    className={dialogStyles.count}
                    role={docked ? null : 'status'}
                >
                    {listening ? '' : status}
                </p>
                <p
                    aria-hidden="true"
                    className={dialogStyles.count}
                >
                    {listening ? status : ''}
                </p>
                {/* "No" has focus, so that pressing Enter without listening does nothing. */}
                <button
                    aria-describedby="brailled-voice-hint"
                    className={dialogStyles.button}
                    data-autofocus
                    type="button"
                    onClick={onNo}
                >
                    {intl.formatMessage(voiceMessages.no)}
                </button>
                <button
                    className={dialogStyles.button}
                    type="button"
                    onClick={onYes}
                >
                    {intl.formatMessage(voiceMessages.yes)}
                </button>
            </div>
        </Dialog>
    );
};

Question.propTypes = {
    text: PropTypes.string.isRequired,
    // Whether it is asked because the words may have been misheard.
    unsure: PropTypes.bool.isRequired,
    hint: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    listening: PropTypes.bool.isRequired,
    // Shown beside the editor, and said aloud, instead of in a window.
    docked: PropTypes.bool.isRequired,
    onYes: PropTypes.func.isRequired,
    onNo: PropTypes.func.isRequired
};

// Voice input by keys and speech, with nothing on screen but a dot while the microphone is open. It opens only when
// asked.
const VoiceBar = ({vm, createProvider = createSpeechProvider, createEngine = createWakeWord}) => {
    const intl = useIntl();
    const app = getApp(vm);
    const locale = useRef(intl.locale);
    locale.current = intl.locale;
    // Where focus was outside the voice bar: commands such as "delete block" act there.
    const lastFocus = useRef(null);

    const [voice] = useState(() => createVoice({
        app,
        provider: createVoiceProviders({
            browser: createProvider(window),
            recorder: createRecorderProvider(window, () => app.config.get().speech),
            online: app.online
        }),
        tone: createTone(window),
        language: () => speechLanguage(locale.current, window.navigator.language),
        beforeRun: () => {
            const active = document.activeElement;
            if (active && active !== document.body && !active.closest(ZONE)) return;
            if (lastFocus.current?.isConnected) lastFocus.current.focus();
        }
    }));
    const state = useSyncExternalStore(voice.subscribe, voice.getState);
    const [wake] = useState(() => createWakeControl({
        app,
        engineFor: engine => createEngine(engine, window),
        language: () => speechLanguage(locale.current, window.navigator.language),
        tone: createTone(window),
        document
    }));
    const waking = useSyncExternalStore(wake.subscribe, wake.getState);
    const talkKey = TALK_KEYS[useSettings(app).talkKey];
    // Off until the configuration says otherwise. Then there is nothing to hear, set or send.
    const {voice: allowed, aiEndpoint, speech: chosenSpeech} =
        useSyncExternalStore(app.config.subscribe, app.config.get);
    const assistant = useSyncExternalStore(app.config.subscribe, app.assistantName);
    const off = allowed !== true;
    const online = useSyncExternalStore(app.online.subscribe, app.online.provider) !== 'browser';

    useEffect(() => app.register('voice', voice), [app, voice]);
    useEffect(() => {
        const leave = app.register('wake', wake);
        // At once, so that the microphone is let go as soon as anything else needs it.
        const unfollow = [voice.subscribe(wake.sync), app.config.subscribe(wake.sync)];
        document.addEventListener('visibilitychange', wake.sync);
        return () => {
            document.removeEventListener('visibilitychange', wake.sync);
            unfollow.forEach(stop => stop());
            leave();
            wake.dispose();
        };
    }, [app, voice, wake]);
    useEffect(() => {
        const disconnect = voice.connect();
        return () => {
            disconnect();
            voice.dispose();
        };
    }, [voice]);

    useEffect(() => {
        const handleFocus = event => {
            if (!event.target.closest?.(ZONE)) lastFocus.current = event.target;
        };
        const handleKeyDown = event => {
            // The live voice, where the school chose it, takes the hands-free key; while it is on, Escape ends it
            // and the talk key is not needed.
            const live = app.live();
            const liveChosen = live && app.online.provider() === 'openai-live';
            if (live && live.getState().phase !== 'off' && (event.key === 'Escape' || matches(WAKE_KEY, event))) {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) live.stop();
                return;
            }
            if (liveChosen && matches(WAKE_KEY, event)) {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) live.start();
                return;
            }
            // In a live session the talk key, held while speaking, makes an answer deliberate, as it is anywhere
            // else; with nothing waiting for an answer it is not needed.
            if (live?.active() && matches(TALK_KEYS[app.settings.get().talkKey], event)) {
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) return;
                if (app.gate()?.isOpen()) live.holdToAnswer(true);
                else app.announce(app.say(voiceMessages.liveTalk, {key: WAKE_KEY.label}));
                return;
            }
            if (event.key === 'Escape' && voice.getState().phase !== 'idle') {
                event.preventDefault();
                event.stopPropagation();
                voice.cancel();
                return;
            }
            // Escape also stops the introduction. A dialog keeps the key for itself.
            if (event.key === 'Escape' && !hasOpenDialog(document) && app.introduction.skip()) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            // Escape stops reading aloud. A dialog still closes with it.
            if (event.key === 'Escape' && app.reading()) {
                app.silence();
                if (!hasOpenDialog(document)) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            }
            // One key starts and stops listening for the wake words, dialogs or not.
            if (matches(WAKE_KEY, event) && (wake.getState().on || wake.available())) {
                event.preventDefault();
                event.stopPropagation();
                if (event.repeat) return;
                if (wake.getState().on) wake.stop();
                else wake.start();
                return;
            }
            // Read when pressed, so that a new choice applies at once.
            if (!matches(TALK_KEYS[app.settings.get().talkKey], event)) return;
            // Dialogs keep the keyboard to themselves, apart from the voice's own question, the AI's replies and
            // suggestions waiting for an answer.
            const answerable = voice.getState().pending || app.assistant()?.isOpen() || app.gate()?.isOpen();
            if (hasOpenDialog(document) && !answerable) return;
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) voice.press('key');
        };
        const handleKeyUp = event => {
            if (app.live()?.active() && releases(TALK_KEYS[app.settings.get().talkKey], event)) {
                app.live().holdToAnswer(false);
                return;
            }
            // Otherwise these keys, which include modifiers, are left alone.
            const {phase, mode} = voice.getState();
            if (phase !== 'listening' || mode !== 'hold') return;
            if (!releases(TALK_KEYS[app.settings.get().talkKey], event)) return;
            event.preventDefault();
            voice.release('key');
        };
        const handleLeave = () => voice.interrupt();
        const handleVisibility = () => {
            if (document.hidden) voice.cancel(voiceMessages.interrupted);
        };
        document.addEventListener('focusin', handleFocus);
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('keyup', handleKeyUp, true);
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('blur', handleLeave);
        return () => {
            document.removeEventListener('focusin', handleFocus);
            document.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('keyup', handleKeyUp, true);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('blur', handleLeave);
        };
    }, [app, voice, wake]);

    const handleNo = voice.reject;
    const handleYes = voice.confirm;

    const words = {assistant, key: talkKey.name, ...state.status.values};
    const status = state.status.text ?? intl.formatMessage(state.status.message, words);
    const hint = intl.formatMessage(voiceMessages.confirmHint, words);
    const micOpen = state.phase === 'listening' || waking.listening;

    // What leaves the computer is said once, the first time the microphone opens, before what follows it. Voice
    // settings shows it whenever it is wanted.
    const noticeSaid = useRef(false);
    const notice = privacyNotice({voice: !off, aiEndpoint, waking: waking.on, online, speech: chosenSpeech});
    useEffect(() => {
        if (!micOpen || !notice || noticeSaid.current) return;
        noticeSaid.current = true;
        app.preface(intl.formatMessage(notice, {assistant}));
    }, [app, assistant, intl, micOpen, notice]);

    // Nothing to look at but a dot while the microphone is open: the student uses keys and their voice. The
    // element holds questions said beside the editor, which going to the voice zone reaches.
    return (
        <div
            className={styles.host}
            data-brailled-zone="voice"
            data-voice-phase={state.phase}
        >
            {micOpen ? (
                <span
                    aria-hidden="true"
                    className={styles.mic}
                    data-voice-mic
                />
            ) : null}
            {state.pending ? (
                <Question
                    docked={app.voiceFirst()}
                    hint={hint}
                    listening={state.phase !== 'idle'}
                    status={status}
                    text={state.pending.text}
                    unsure={state.pending.unsure}
                    onNo={handleNo}
                    onYes={handleYes}
                />
            ) : null}
        </div>
    );
};

VoiceBar.propTypes = {
    vm: PropTypes.shape({on: PropTypes.func}).isRequired,
    createEngine: PropTypes.func,
    createProvider: PropTypes.func
};

export default VoiceBar;
