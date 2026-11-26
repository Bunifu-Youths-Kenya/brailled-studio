import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {useIntl} from 'react-intl';

import {getApp} from '../actions/app.js';
import {hasOpenDialog} from '../actions/dom.js';
import {useSettings} from '../actions/preferences.jsx';
import {matches, releases, TALK_KEYS} from '../actions/shortcuts.js';
import Dialog from '../outline/dialog.jsx';
import {createVoice} from './controller.js';
import voiceMessages from './messages.js';
import {createSpeechProvider, speechLanguage} from './provider.js';
import createTone from './tone.js';

import dialogStyles from '../outline/dialog.css';
import styles from './voice-bar.css';

const BUTTON_KEYS = [' ', 'Enter'];
const ZONE = '[data-brailled-zone="voice"], [data-brailled-voice-dialog]';

// Asks before acting on words that may have been misheard.
const Question = ({text, hint, status, listening, onYes, onNo}) => {
    const intl = useIntl();
    return (
        <Dialog
            title={intl.formatMessage(voiceMessages.confirmTitle, {text})}
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
    hint: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    listening: PropTypes.bool.isRequired,
    onYes: PropTypes.func.isRequired,
    onNo: PropTypes.func.isRequired
};

// The microphone button, what was heard, and what happened. The microphone opens only when asked.
const VoiceBar = ({vm, createProvider = createSpeechProvider}) => {
    const intl = useIntl();
    const app = getApp(vm);
    const locale = useRef(intl.locale);
    locale.current = intl.locale;
    // Where focus was outside the voice bar: commands such as "delete block" act there.
    const lastFocus = useRef(null);

    const [voice] = useState(() => createVoice({
        app,
        provider: createProvider(window),
        tone: createTone(window),
        language: () => speechLanguage(locale.current, window.navigator.language),
        beforeRun: () => {
            const active = document.activeElement;
            if (active && active !== document.body && !active.closest(ZONE)) return;
            if (lastFocus.current?.isConnected) lastFocus.current.focus();
        }
    }));
    const state = useSyncExternalStore(voice.subscribe, voice.getState);
    const talkKey = TALK_KEYS[useSettings(app).talkKey];
    // Off until the configuration says otherwise. Then there is nothing to hear, set or send.
    const {voice: allowed, aiEndpoint} = useSyncExternalStore(app.config.subscribe, app.config.get);
    const off = allowed !== true;

    useEffect(() => app.register('voice', voice), [app, voice]);
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
            // Read when pressed, so that a new choice applies at once.
            if (!matches(TALK_KEYS[app.settings.get().talkKey], event)) return;
            // Dialogs keep the keyboard to themselves, apart from the voice's own question and the AI's replies.
            if (hasOpenDialog(document) && !voice.getState().pending && !app.assistant()?.isOpen()) return;
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
    }, [app, voice]);

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
    const words = {key: talkKey.name, ...state.status.values};
    const status = state.status.text ?? intl.formatMessage(state.status.message, words);
    const hint = intl.formatMessage(voiceMessages.confirmHint, words);
    // While a question is open the bar says how to answer it.
    const barStatus = state.pending && !status ? hint : status;
    const handleSettings = () => app.perform('voice.settings');
    // What leaves the computer is shown whenever it can: by voice, to the AI helper, or both.
    let notice = off ? null : voiceMessages.privacy;
    if (aiEndpoint) notice = off ? voiceMessages.aiNotice : voiceMessages.aiNoticeWithVoice;
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
            {/* Focusable so that a long reply can be scrolled with the keyboard. Said by the live region. */}
            <div
                aria-label={intl.formatMessage(voiceMessages.words)}
                className={styles.words}
                role="group"
                tabIndex="0"
            >
                {off ? null : (
                    <p
                        className={styles.transcript}
                        data-voice-transcript
                    >
                        {state.heard ?
                            intl.formatMessage(voiceMessages.heard, {text: state.heard}) :
                            intl.formatMessage(voiceMessages.nothingHeard)}
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
                    <p
                        className={aiEndpoint ? styles.aiNotice : styles.privacy}
                        data-voice-notice
                        id="brailled-voice-privacy"
                    >
                        {intl.formatMessage(notice)}
                    </p>
                </div>
            ) : null}
            {state.pending ? (
                <Question
                    hint={hint}
                    listening={state.phase !== 'idle'}
                    status={status}
                    text={state.pending.text}
                    onNo={handleNo}
                    onYes={handleYes}
                />
            ) : null}
        </div>
    );
};

VoiceBar.propTypes = {
    vm: PropTypes.shape({on: PropTypes.func}).isRequired,
    createProvider: PropTypes.func
};

export default VoiceBar;
