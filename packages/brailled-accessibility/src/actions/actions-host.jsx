import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {useIntl} from 'react-intl';
import {createPortal} from 'react-dom';

import Dialog from '../outline/dialog.jsx';
import {dialogMessages} from '../outline/messages.js';
import AssistantHost from '../proposals/assistant-host.jsx';
import {getApp} from './app.js';
import {hasOpenDialog} from './dom.js';
import {speech} from './messages.js';
import parseCommand from './parser.js';
import {ScreenReaderQuestion, useSettings, VoiceSettings} from './preferences.jsx';
import {snapshotToText} from './snapshot.js';

import dialogStyles from '../outline/dialog.css';
import styles from './actions-host.css';

const CommandBox = ({app, onClose}) => {
    const intl = useIntl();
    const [error, setError] = useState(null);

    const handleSubmit = event => {
        event.preventDefault();
        const text = String(new FormData(event.target).get('command'))
            .trim();
        const id = parseCommand(text, app.actionNames());
        if (id) {
            onClose({id});
        } else if (text && app.assistant()) {
            // What is not a command goes to the AI helper, as when spoken.
            onClose({ask: text});
        } else {
            setError(intl.formatMessage(text ? speech.commandUnknown : speech.commandEmpty, {text}));
        }
    };
    const handleCancel = () => onClose(null);

    return (
        <Dialog
            title={intl.formatMessage(speech.commandTitle)}
            // eslint-disable-next-line react/jsx-no-bind
            onCancel={handleCancel}
        >
            <form
                noValidate
                // eslint-disable-next-line react/jsx-no-bind
                onSubmit={handleSubmit}
            >
                <label
                    className={dialogStyles.label}
                    htmlFor="brailled-command"
                >
                    {intl.formatMessage(speech.commandLabel)}
                </label>
                <input
                    aria-describedby="brailled-command-hint"
                    autoComplete="off"
                    className={dialogStyles.input}
                    data-autofocus
                    id="brailled-command"
                    name="command"
                    type="text"
                />
                <p
                    className={dialogStyles.count}
                    id="brailled-command-hint"
                >
                    {intl.formatMessage(speech.commandHint)}
                    {app.assistant() ? ` ${intl.formatMessage(speech.commandHintAi)}` : null}
                </p>
                <p
                    className={dialogStyles.error}
                    role="alert"
                >
                    {error}
                </p>
                <button
                    className={dialogStyles.button}
                    type="submit"
                >
                    {intl.formatMessage(speech.commandRun)}
                </button>
                <button
                    className={dialogStyles.button}
                    type="button"
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={handleCancel}
                >
                    {intl.formatMessage(dialogMessages.cancel)}
                </button>
            </form>
        </Dialog>
    );
};

CommandBox.propTypes = {
    app: PropTypes.shape({
        actionNames: PropTypes.func.isRequired,
        assistant: PropTypes.func.isRequired
    }).isRequired,
    onClose: PropTypes.func.isRequired
};

// The editor-wide part of the actions: the live region, the global shortcuts, the command box and the voice
// settings. It also tells actions which view and tab are shown.
const BrailledActions = ({vm, view, tab, onChangeView, onChangeTab}) => {
    const intl = useIntl();
    const app = getApp(vm);
    const [notice, setNotice] = useState({text: '', serial: 0});
    const [commandBoxOpen, setCommandBoxOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settings = useSettings(app);
    const {voice} = useSyncExternalStore(app.config.subscribe, app.config.get);
    // Reading aloud is part of voice, so there is nothing to ask where voice is off.
    const asking = voice === true && settings.screenReader === null && !settings.questionDismissed;
    const gui = useRef({});

    // Kept current on every render, so that actions see what is shown now.
    Object.assign(gui.current, {
        tab,
        view,
        setView: onChangeView,
        setTab: onChangeTab,
        openCommandBox: () => setCommandBoxOpen(true),
        openSettings: () => setSettingsOpen(true)
    });

    useEffect(() => app.setIntl(intl), [app, intl]);
    useEffect(() => app.register('gui', gui.current), [app]);
    useEffect(() => app.subscribe(
        text => setNotice(current => ({text, serial: current.serial + 1}))
    ), [app]);

    useEffect(() => {
        // Lets the actions and the snapshot be tried from the browser console in development builds.
        if (process.env.NODE_ENV !== 'production') {
            window.brailledApp = Object.assign(app, {snapshotText: () => snapshotToText(app.snapshot())});
        }
    }, [app]);

    useEffect(() => {
        const handleKeyDown = event => {
            // Escape also stops reading aloud, and keeps its other meanings.
            if (event.key === 'Escape') app.silence();
            // Dialogs keep the keyboard to themselves.
            if (event.repeat || hasOpenDialog(document)) return;
            if (app.handleKey(event, 'global')) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [app]);

    // The block library creates a text box, with no name, wherever a value is typed on a block.
    useEffect(() => {
        const handleFocus = event => {
            const box = event.target;
            if (box.classList?.contains('blocklyHtmlInput') && !box.getAttribute('aria-label')) {
                box.setAttribute('aria-label', intl.formatMessage(speech.blockValueBox));
            }
        };
        document.addEventListener('focus', handleFocus, true);
        return () => document.removeEventListener('focus', handleFocus, true);
    }, [intl]);

    const closeSettings = useCallback(() => setSettingsOpen(false), []);

    // The command runs after the box has closed, so that focus is back where the user was.
    const pending = useRef(null);
    const closeCommandBox = useCallback(command => {
        pending.current = command;
        setCommandBoxOpen(false);
    }, []);
    useEffect(() => {
        if (commandBoxOpen || !pending.current) return;
        const {id, ask} = pending.current;
        pending.current = null;
        if (id) app.perform(id);
        else app.assistant()?.handle(ask);
    }, [app, commandBoxOpen]);

    return (
        <React.Fragment>
            {/* In the page's body: an open library hides the rest of the editor from screen readers. */}
            {createPortal((
                <div
                    aria-atomic="true"
                    aria-live="polite"
                    className={styles.announcer}
                    data-brailled-announcer
                >
                    {/* A new element each time, so that a repeated message is announced again. */}
                    <span key={notice.serial}>{notice.text}</span>
                </div>
            ), document.body)}
            <AssistantHost app={app} />
            {asking ? <ScreenReaderQuestion app={app} /> : null}
            {settingsOpen ? (
                <VoiceSettings
                    app={app}
                    onClose={closeSettings}
                />
            ) : null}
            {commandBoxOpen ? (
                <CommandBox
                    app={app}
                    onClose={closeCommandBox}
                />
            ) : null}
        </React.Fragment>
    );
};

BrailledActions.propTypes = {
    vm: PropTypes.shape({on: PropTypes.func}).isRequired,
    view: PropTypes.string.isRequired,
    tab: PropTypes.number.isRequired,
    onChangeView: PropTypes.func.isRequired,
    onChangeTab: PropTypes.func.isRequired
};

export default BrailledActions;
