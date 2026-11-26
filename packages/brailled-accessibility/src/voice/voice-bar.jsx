import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
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
import createTone from './tone.js';

import dialogStyles from '../outline/dialog.css';
import styles from './voice-bar.css';

const BUTTON_KEYS = [' ', 'Enter'];
const VOICES_MS = 2000;
const ZONE = '[data-brailled-zone="voice"], [data-brailled-voice-dialog]';

// Asks before acting on words that may have been misheard.
const Question = ({text, unsure, hint, status, listening, onYes, onNo}) => {
    const intl = useIntl();
    return (
        <Dialog
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
                {/* Announced, except while the microphone is open and would hear it. */}
                <p
                    className={dialogStyles.count}
                    role="status"
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
    onYes: PropTypes.func.isRequired,
    onNo: PropTypes.func.isRequired
};

// The microphone button, what was heard, and what happened. The microphone opens only when asked.
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
        document
    }));
    const waking = useSyncExternalStore(wake.subscribe, wake.getState);
    const talkKey = TALK_KEYS[useSettings(app).talkKey];
    // Off until the configuration says otherwise. Then there is nothing to hear, set or send.
    const {voice: allowed, aiEndpoint} = useSyncExternalStore(app.config.subscribe, app.config.get);
    const assistant = useSyncExternalStore(app.config.subscribe, app.assistantName);
    const off = allowed !== true;
    const aiMode = useSyncExternalStore(app.subscribeMode, app.mode);
    const online = useSyncExternalStore(app.online.subscribe, app.online.provider) !== 'browser';

    // A browser lists its voices a moment after it starts: before that, none missing is reported.
    const [voicesKnown, setVoicesKnown] = useState(0);
    useEffect(() => {
        const listed = () => setVoicesKnown(times => times + 1);
        const timer = setTimeout(listed, VOICES_MS);
        window.speechSynthesis?.addEventListener?.('voiceschanged', listed);
        return () => {
            clearTimeout(timer);
            window.speechSynthesis?.removeEventListener?.('voiceschanged', listed);
        };
    }, []);
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

    // A click that follows the button's own press and release has been dealt with already. A click on its own,
    // as some assistive technology sends, listens for one phrase.
    const handled = useRef(false);
    const settle = () => setTimeout(() => {
        handled.current = false;
    }, 0);
    const handlePointerDown = useCallback(event => {
        if (event.button !== 0) return;
        handled.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        voice.press('button');
    }, [voice]);
    const handlePointerUp = useCallback(() => {
        voice.release('button');
        settle();
    }, [voice]);
    // Pressing the button must not move focus away from what the command is about.
    const handleMouseDown = useCallback(event => event.preventDefault(), []);
    const handleButtonKeyDown = useCallback(event => {
        if (!BUTTON_KEYS.includes(event.key)) return;
        event.preventDefault();
        handled.current = true;
        if (!event.repeat) voice.press('button');
    }, [voice]);
    const handleButtonKeyUp = useCallback(event => {
        if (!BUTTON_KEYS.includes(event.key)) return;
        event.preventDefault();
        voice.release('button');
        settle();
    }, [voice]);
    const handleClick = useCallback(() => {
        if (!handled.current) voice.toggle();
    }, [voice]);

    const handleNo = voice.reject;
    const handleYes = voice.confirm;

    const listening = state.phase === 'listening';
    const words = {assistant, key: talkKey.name, ...state.status.values};
    const status = state.status.text ?? intl.formatMessage(state.status.message, words);
    const hint = intl.formatMessage(voiceMessages.confirmHint, words);
    const heardLine = intl.formatMessage(voiceMessages.heard, {text: state.heard});
    // While a question is open the bar says how to answer it. A reply is spoken after what was heard, which the bar
    // already shows above it.
    let barStatus = state.pending && !status ? hint : status;
    if (state.heard && barStatus.startsWith(`${heardLine} `)) barStatus = barStatus.slice(heardLine.length + 1);
    const handleSettings = () => app.perform('voice.settings');
    const handleWaking = () => {
        if (waking.on) wake.stop();
        else wake.start();
    };
    // Offered where the school allows the wake words and this browser can listen for them.
    const handsFree = !off && wake.available();
    const warning = voicesKnown ? app.voiceWarning() : null;
    // What leaves the computer is shown whenever it can: by voice, to the AI helper, or both.
    let notice = off ? null : voiceMessages.privacy;
    if (aiEndpoint) notice = off ? voiceMessages.aiNotice : voiceMessages.aiNoticeWithVoice;
    if (waking.on) notice = aiEndpoint ? voiceMessages.wakeNoticeAi : voiceMessages.wakeNotice;
    if (online) notice = waking.on ? voiceMessages.onlineNoticeWake : voiceMessages.onlineNotice;
    const recordingNow = listening && state.recording;
    const wakeState = waking.listening ? 'listening' : 'paused';
    let wakeWords = voiceMessages.handsFreeHint;
    let wakeClass = styles.handsFreeHint;
    if (waking.on) {
        wakeWords = waking.listening ? voiceMessages.wakeListening : voiceMessages.wakePaused;
        wakeClass = waking.listening ? styles.wakeListening : styles.wakePaused;
    }
    const describedBy = [off ? 'brailled-voice-status' : null, notice ? 'brailled-voice-privacy' : null]
        .filter(Boolean)
        .join(' ');
    let buttonText = listening ? voiceMessages.buttonListening : voiceMessages.button;
    if (off) buttonText = voiceMessages.buttonOff;
    return (
        <div
            aria-label={intl.formatMessage(voiceMessages.region)}
            className={styles.bar}
            data-brailled-zone="voice"
            data-voice-phase={state.phase}
            role="region"
        >
            <button
                aria-describedby={describedBy}
                aria-disabled={off || !voice.isSupported()}
                aria-keyshortcuts={off ? null : talkKey.name}
                data-voice-talk
                aria-pressed={listening}
                className={styles.talk}
                type="button"
                onClick={handleClick}
                onContextMenu={handleMouseDown}
                onKeyDown={handleButtonKeyDown}
                onKeyUp={handleButtonKeyUp}
                onMouseDown={handleMouseDown}
                onPointerCancel={handlePointerUp}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
            >
                <svg
                    aria-hidden="true"
                    className={styles.icon}
                    viewBox="0 0 24 24"
                >
                    <rect
                        height="12"
                        rx="4"
                        width="8"
                        x="8"
                        y="2"
                    />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
                </svg>
                {intl.formatMessage(buttonText)}
            </button>
            {recordingNow ? (
                <div
                    className={styles.wake}
                    data-voice-recording
                >
                    <span className={styles.wakeListening}>{intl.formatMessage(voiceMessages.recording)}</span>
                </div>
            ) : null}
            {(waking.on || handsFree) && !recordingNow ? (
                <div
                    className={styles.wake}
                    data-voice-handsfree={waking.on ? null : true}
                    data-voice-wake={waking.on ? wakeState : null}
                >
                    <span
                        className={wakeClass}
                        id="brailled-wake-state"
                    >
                        {intl.formatMessage(wakeWords, {assistant})}
                    </span>
                    {/* One button for both, so that focus stays on it. */}
                    <button
                        aria-describedby="brailled-wake-state"
                        aria-keyshortcuts={WAKE_KEY.label}
                        className={styles.settings}
                        type="button"
                        // eslint-disable-next-line react/jsx-no-bind
                        onClick={handleWaking}
                        onMouseDown={handleMouseDown}
                    >
                        {intl.formatMessage(waking.on ? voiceMessages.wakeStop : voiceMessages.handsFree)}
                    </button>
                </div>
            ) : null}
            {/* Focusable so that a long reply can be scrolled with the keyboard. Said by the live region. */}
            <div
                aria-label={intl.formatMessage(voiceMessages.words)}
                className={styles.words}
                role="group"
                tabIndex="0"
            >
                {warning ? (
                    <p
                        className={styles.warning}
                        data-voice-warning
                    >
                        {/* A command-line switch is kept on one line, to be read and typed as one word. */}
                        {warning.split(/(--[a-z-]+)/).map((part, index) => (index % 2 ? (
                            <span
                                className={styles.flag}
                                key={part}
                            >
                                {part}
                            </span>
                        ) : part))}
                    </p>
                ) : null}
                {/* In place of "nothing heard", which says less. */}
                {off || (warning && !state.heard) ? null : (
                    <p
                        className={styles.transcript}
                        data-voice-transcript
                    >
                        {state.heard ? heardLine : intl.formatMessage(voiceMessages.nothingHeard)}
                    </p>
                )}
                <p
                    className={styles.status}
                    data-voice-status
                    id="brailled-voice-status"
                >
                    {barStatus}
                </p>
            </div>
            {notice ? (
                <div className={styles.side}>
                    <div className={styles.top}>
                        {aiEndpoint ? (
                            <span
                                className={styles.mode}
                                data-voice-mode={aiMode}
                            >
                                {intl.formatMessage(voiceMessages.mode, {assistant, mode: aiMode})}
                            </span>
                        ) : null}
                        {off ? null : (
                            <button
                                className={styles.settings}
                                type="button"
                                // eslint-disable-next-line react/jsx-no-bind
                                onClick={handleSettings}
                            >
                                {intl.formatMessage(voiceMessages.settings)}
                            </button>
                        )}
                    </div>
                    <p
                        className={aiEndpoint ? styles.aiNotice : styles.privacy}
                        data-voice-notice
                        id="brailled-voice-privacy"
                    >
                        {intl.formatMessage(notice, {assistant})}
                    </p>
                </div>
            ) : null}
            {state.pending ? (
                <Question
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
