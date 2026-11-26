// The first question about screen readers, and the voice settings.
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useState, useSyncExternalStore} from 'react';
import {useIntl} from 'react-intl';

import Dialog from '../outline/dialog.jsx';
import {INTRODUCTIONS, LISTEN_SECONDS, TALK_KEY_IDS} from '../settings.js';
import {privacyNotice} from '../voice/notice.js';
import {readsRepliesOnline} from '../voice/speech-config.js';
import preferenceMessages from './preference-messages.js';
import {TALK_KEYS} from './shortcuts.js';

import dialogStyles from '../outline/dialog.css';

const appShape = PropTypes.shape({
    announce: PropTypes.func.isRequired,
    assistantName: PropTypes.func.isRequired,
    config: PropTypes.shape({get: PropTypes.func.isRequired}).isRequired,
    forgetStudent: PropTypes.func.isRequired,
    online: PropTypes.shape({provider: PropTypes.func.isRequired}).isRequired,
    say: PropTypes.func.isRequired,
    silence: PropTypes.func.isRequired,
    speak: PropTypes.func.isRequired,
    voiceWarning: PropTypes.func.isRequired,
    wake: PropTypes.func.isRequired,
    settings: PropTypes.shape({
        answerScreenReader: PropTypes.func.isRequired,
        dismissQuestion: PropTypes.func.isRequired,
        get: PropTypes.func.isRequired,
        set: PropTypes.func.isRequired,
        subscribe: PropTypes.func.isRequired
    }).isRequired
});

const useSettings = app => useSyncExternalStore(app.settings.subscribe, app.settings.get);

// Asked once, so that replies are read aloud for those who have nothing else to read them.
const ScreenReaderQuestion = ({app}) => {
    const intl = useIntl();
    const answer = usesOne => {
        app.settings.answerScreenReader(usesOne);
        // Where nothing, or not everything, can be read, that is what they are told.
        app.announce(app.voiceWarning() ??
            app.say(usesOne ? preferenceMessages.keptQuiet : preferenceMessages.willRead));
    };
    const handleYes = () => answer(true);
    const handleNo = () => answer(false);
    const handleDismiss = app.settings.dismissQuestion;
    return (
        <Dialog
            title={intl.formatMessage(preferenceMessages.question)}
            onCancel={handleDismiss}
        >
            <p
                className={dialogStyles.field}
                id="brailled-reader-hint"
            >
                {intl.formatMessage(preferenceMessages.questionHint)}
            </p>
            <button
                aria-describedby="brailled-reader-hint"
                className={dialogStyles.button}
                data-autofocus
                type="button"
                // eslint-disable-next-line react/jsx-no-bind
                onClick={handleYes}
            >
                {intl.formatMessage(preferenceMessages.yes)}
            </button>
            <button
                className={dialogStyles.button}
                type="button"
                // eslint-disable-next-line react/jsx-no-bind
                onClick={handleNo}
            >
                {intl.formatMessage(preferenceMessages.no)}
            </button>
        </Dialog>
    );
};

ScreenReaderQuestion.propTypes = {
    app: appShape.isRequired
};

// Listening for the wake words. It is not kept: each visit starts with it off.
const WakeSetting = ({assistant, wake}) => {
    const intl = useIntl();
    const {on} = useSyncExternalStore(wake.subscribe, wake.getState);
    const handleChange = useCallback(event => {
        if (event.target.checked) wake.start();
        else wake.stop();
    }, [wake]);
    return (
        <div className={dialogStyles.field}>
            <label className={dialogStyles.row}>
                <input
                    aria-describedby="brailled-wake-hint"
                    checked={on}
                    type="checkbox"
                    onChange={handleChange}
                />
                {intl.formatMessage(preferenceMessages.wake, {assistant})}
            </label>
            <p
                className={dialogStyles.count}
                id="brailled-wake-hint"
            >
                {intl.formatMessage(preferenceMessages.wakeHint)}
            </p>
        </div>
    );
};

WakeSetting.propTypes = {
    assistant: PropTypes.string.isRequired,
    wake: PropTypes.shape({
        getState: PropTypes.func.isRequired,
        start: PropTypes.func.isRequired,
        stop: PropTypes.func.isRequired,
        subscribe: PropTypes.func.isRequired
    }).isRequired
};

// Changes apply as soon as they are made.
const VoiceSettings = ({app, onClose}) => {
    const intl = useIntl();
    const settings = useSettings(app);
    const [note, setNote] = useState('');
    // Reading stops when the dialog closes.
    useEffect(() => () => app.silence(), [app]);

    const handleKey = useCallback(event => app.settings.set({talkKey: event.target.value}), [app]);
    const handleSeconds = useCallback(
        event => app.settings.set({maxSeconds: Number(event.target.value)}), [app]);
    const handleReadbacks = useCallback(
        event => app.settings.set({onlineReadbacks: event.target.checked}), [app]);
    const handleOnlineName = useCallback(
        event => app.settings.set({onlineName: event.target.checked}), [app]);
    const handleVoiceFirst = useCallback(event => app.settings.set({voiceFirst: event.target.checked}), [app]);
    const handleName = useCallback(event => app.settings.set({studentName: event.target.value}), [app]);
    const handleIntroduction = useCallback(
        event => app.settings.set({introduction: event.target.value}), [app]);
    const handleReadAloud = useCallback(event => {
        const readAloud = event.target.checked;
        app.settings.set({readAloud});
        const text = app.voiceWarning() ??
            app.say(readAloud ? preferenceMessages.willRead : preferenceMessages.willNotRead);
        setNote(text);
        if (readAloud) app.speak(text);
        else app.silence();
    }, [app]);
    // The first-visit question follows, so this dialog closes first.
    const handleReset = useCallback(() => {
        onClose();
        app.forgetStudent();
        app.announce(app.say(preferenceMessages.wasReset));
    }, [app, onClose]);

    // What used to be shown beside the editor: why nothing can be read aloud, and what leaves the computer.
    const {aiEndpoint, speech, voice} = app.config.get();
    const warning = app.voiceWarning();
    const notice = privacyNotice({voice: voice === true,
        aiEndpoint,
        waking: !!app.wake()?.getState().on,
        online: app.online.provider() !== 'browser',
        speech});

    return (
        <Dialog
            title={intl.formatMessage(preferenceMessages.title)}
            onCancel={onClose}
        >
            {warning ? (
                <p
                    className={dialogStyles.error}
                    data-voice-warning
                >
                    {warning}
                </p>
            ) : null}
            {notice ? (
                <p
                    className={dialogStyles.field}
                    data-voice-notice
                >
                    {intl.formatMessage(notice, {assistant: app.assistantName()})}
                </p>
            ) : null}
            <fieldset
                aria-describedby="brailled-key-hint"
                className={dialogStyles.field}
            >
                <legend className={dialogStyles.label}>
                    {intl.formatMessage(preferenceMessages.talkKey)}
                </legend>
                {TALK_KEY_IDS.map(id => (
                    <label
                        className={dialogStyles.row}
                        key={id}
                    >
                        <input
                            checked={settings.talkKey === id}
                            data-autofocus={settings.talkKey === id ? true : null}
                            name="brailled-talk-key"
                            type="radio"
                            value={id}
                            onChange={handleKey}
                        />
                        {TALK_KEYS[id].name}
                    </label>
                ))}
                <p
                    className={dialogStyles.count}
                    id="brailled-key-hint"
                >
                    {intl.formatMessage(preferenceMessages.talkKeyHint)}
                </p>
            </fieldset>
            <div className={dialogStyles.field}>
                <label
                    className={dialogStyles.label}
                    htmlFor="brailled-listen-seconds"
                >
                    {intl.formatMessage(preferenceMessages.longest)}
                </label>
                <select
                    className={dialogStyles.input}
                    id="brailled-listen-seconds"
                    value={settings.maxSeconds}
                    onChange={handleSeconds}
                >
                    {LISTEN_SECONDS.map(seconds => (
                        <option
                            key={seconds}
                            value={seconds}
                        >
                            {intl.formatMessage(preferenceMessages.seconds, {seconds})}
                        </option>
                    ))}
                </select>
            </div>
            <div className={dialogStyles.field}>
                <label className={dialogStyles.row}>
                    <input
                        aria-describedby="brailled-read-hint"
                        checked={settings.readAloud}
                        type="checkbox"
                        onChange={handleReadAloud}
                    />
                    {intl.formatMessage(preferenceMessages.readAloud)}
                </label>
                <p
                    className={dialogStyles.count}
                    id="brailled-read-hint"
                >
                    {intl.formatMessage(preferenceMessages.readAloudHint)}
                </p>
                <p
                    className={dialogStyles.count}
                    role="status"
                >
                    {note}
                </p>
            </div>
            <div className={dialogStyles.field}>
                <label className={dialogStyles.row}>
                    <input
                        aria-describedby="brailled-voice-first-hint"
                        checked={settings.voiceFirst}
                        type="checkbox"
                        onChange={handleVoiceFirst}
                    />
                    {intl.formatMessage(preferenceMessages.voiceFirst)}
                </label>
                <p
                    className={dialogStyles.count}
                    id="brailled-voice-first-hint"
                >
                    {intl.formatMessage(preferenceMessages.voiceFirstHint)}
                </p>
            </div>
            {app.online.provider() === 'browser' ? null : (
                <div className={dialogStyles.field}>
                    <label className={dialogStyles.row}>
                        <input
                            aria-describedby="brailled-readbacks-hint"
                            checked={settings.onlineReadbacks}
                            type="checkbox"
                            onChange={handleReadbacks}
                        />
                        {intl.formatMessage(preferenceMessages.onlineReadbacks)}
                    </label>
                    <p
                        className={dialogStyles.count}
                        id="brailled-readbacks-hint"
                    >
                        {intl.formatMessage(preferenceMessages.onlineReadbacksHint)}
                    </p>
                </div>
            )}
            <div className={dialogStyles.field}>
                <label
                    className={dialogStyles.label}
                    htmlFor="brailled-student-name"
                >
                    {intl.formatMessage(preferenceMessages.studentName)}
                </label>
                {/* Not controlled, so that a name can be typed with its spaces; what is not a name is not kept. */}
                <input
                    aria-describedby="brailled-name-hint"
                    autoComplete="off"
                    className={dialogStyles.input}
                    defaultValue={settings.studentName}
                    id="brailled-student-name"
                    maxLength="30"
                    type="text"
                    onChange={handleName}
                />
                <p
                    className={dialogStyles.count}
                    id="brailled-name-hint"
                >
                    {intl.formatMessage(preferenceMessages.studentNameHint)}
                </p>
            </div>
            {readsRepliesOnline(app.config.get().speech) && app.config.get().ai ? (
                <div className={dialogStyles.field}>
                    <label className={dialogStyles.row}>
                        <input
                            aria-describedby="brailled-online-name-hint"
                            checked={settings.onlineName}
                            type="checkbox"
                            onChange={handleOnlineName}
                        />
                        {intl.formatMessage(preferenceMessages.onlineName)}
                    </label>
                    <p
                        className={dialogStyles.count}
                        id="brailled-online-name-hint"
                    >
                        {intl.formatMessage(preferenceMessages.onlineNameHint)}
                    </p>
                </div>
            ) : null}
            <div className={dialogStyles.field}>
                <label
                    className={dialogStyles.label}
                    htmlFor="brailled-introduction"
                >
                    {intl.formatMessage(preferenceMessages.introduction)}
                </label>
                <select
                    className={dialogStyles.input}
                    id="brailled-introduction"
                    value={settings.introduction}
                    onChange={handleIntroduction}
                >
                    {INTRODUCTIONS.map(length => (
                        <option
                            key={length}
                            value={length}
                        >
                            {intl.formatMessage(preferenceMessages.introductionChoice, {length})}
                        </option>
                    ))}
                </select>
            </div>
            {app.wake()?.available() ? (
                <WakeSetting
                    assistant={app.assistantName()}
                    wake={app.wake()}
                />
            ) : null}
            <button
                className={dialogStyles.button}
                type="button"
                onClick={onClose}
            >
                {intl.formatMessage(preferenceMessages.done)}
            </button>
            <button
                aria-describedby="brailled-reset-hint"
                className={dialogStyles.button}
                type="button"
                onClick={handleReset}
            >
                {intl.formatMessage(preferenceMessages.reset)}
            </button>
            <p
                className={dialogStyles.count}
                id="brailled-reset-hint"
            >
                {intl.formatMessage(preferenceMessages.resetHint)}
            </p>
        </Dialog>
    );
};

VoiceSettings.propTypes = {
    app: appShape.isRequired,
    onClose: PropTypes.func.isRequired
};

export {
    ScreenReaderQuestion,
    VoiceSettings,
    useSettings
};
