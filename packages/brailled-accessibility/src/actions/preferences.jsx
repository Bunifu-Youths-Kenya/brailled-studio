// The first question about screen readers, and the voice settings.
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useState, useSyncExternalStore} from 'react';
import {useIntl} from 'react-intl';

import Dialog from '../outline/dialog.jsx';
import {LISTEN_SECONDS, TALK_KEY_IDS} from '../settings.js';
import voiceMessages from '../voice/messages.js';
import preferenceMessages from './preference-messages.js';
import {TALK_KEYS} from './shortcuts.js';

import dialogStyles from '../outline/dialog.css';

const appShape = PropTypes.shape({
    announce: PropTypes.func.isRequired,
    canReadAloud: PropTypes.func.isRequired,
    say: PropTypes.func.isRequired,
    silence: PropTypes.func.isRequired,
    speak: PropTypes.func.isRequired,
    settings: PropTypes.shape({
        answerScreenReader: PropTypes.func.isRequired,
        dismissQuestion: PropTypes.func.isRequired,
        get: PropTypes.func.isRequired,
        reset: PropTypes.func.isRequired,
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
        app.announce(app.say(usesOne ? preferenceMessages.keptQuiet : preferenceMessages.willRead));
        if (!usesOne && !app.canReadAloud()) app.announce(app.say(preferenceMessages.noVoice));
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
    const handleReadAloud = useCallback(event => {
        const readAloud = event.target.checked;
        app.settings.set({readAloud});
        let message = readAloud ? preferenceMessages.willRead : preferenceMessages.willNotRead;
        if (readAloud && !app.canReadAloud()) message = preferenceMessages.noVoice;
        const text = app.say(message);
        setNote(text);
        if (readAloud) app.speak(text);
        else app.silence();
    }, [app]);
    // The first-visit question follows, so this dialog closes first.
    const handleReset = useCallback(() => {
        onClose();
        app.settings.reset();
        app.announce(app.say(preferenceMessages.wasReset));
    }, [app, onClose]);

    return (
        <Dialog
            title={intl.formatMessage(preferenceMessages.title)}
            onCancel={onClose}
        >
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
            <p className={dialogStyles.field}>
                {intl.formatMessage(voiceMessages.privacy)}
            </p>
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
