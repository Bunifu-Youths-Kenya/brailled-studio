import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {useIntl} from 'react-intl';

import logo from '../brand/brailled-logo.png';
import {SHORTEST_PASSWORD} from './controller.js';
import {Facebook, Google, Instagram, LinkedIn} from './icons.jsx';
import messages from './messages.js';
import photo from './photo.jpg';

import '../theme.css';
import styles from './page.css';

const SOCIAL = [
    ['Facebook', 'https://www.facebook.com/brailleeducation', Facebook],
    ['Instagram', 'https://www.instagram.com/brailled.education', Instagram],
    ['LinkedIn', 'https://www.linkedin.com/in/brailled-education-a9446a404', LinkedIn]
];

const TITLES = {
    'loading': 'createTitle',
    'unavailable': 'createTitle',
    'signup': 'createTitle',
    'login': 'loginTitle',
    'check-email': 'checkTitle',
    'signed-in': 'signedTitle'
};

const errorMessage = name => messages[`error${name.charAt(0).toUpperCase()}${name.slice(1)}`];

// A labelled field. The label is above it, and stays while it is filled in.
const Field = ({id, label, hint, children, ...input}) => (
    <div className={styles.field}>
        <label htmlFor={id}>{label}</label>
        <div className={styles.control}>
            <input
                className={styles.input}
                id={id}
                name={id}
                placeholder={hint}
                {...input}
            />
            {children}
        </div>
    </div>
);

Field.propTypes = {
    children: PropTypes.node,
    hint: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired
};

const EmailForm = ({account, creating, busy}) => {
    const intl = useIntl();
    const say = (message, values) => intl.formatMessage(message, values);
    const [shown, setShown] = useState(false);
    const handleShown = useCallback(event => setShown(event.target.checked), []);
    const handleSubmit = useCallback(event => {
        event.preventDefault();
        account.submit(Object.fromEntries(new FormData(event.target)));
    }, [account]);
    return (
        <React.Fragment>
            <p className={styles.or}>{say(messages.or)}</p>
            <form
                noValidate
                onSubmit={handleSubmit}
            >
                <Field
                    autoComplete="email"
                    hint={say(messages.emailHint)}
                    id="email"
                    label={say(messages.email)}
                    type="email"
                />
                {creating ? (
                    <Field
                        autoComplete="name"
                        hint={say(messages.nameHint)}
                        id="name"
                        label={say(messages.name)}
                        type="text"
                    />
                ) : null}
                <Field
                    autoComplete={creating ? 'new-password' : 'current-password'}
                    hint={creating ?
                        say(messages.passwordCreate, {count: SHORTEST_PASSWORD}) :
                        say(messages.passwordEnter)}
                    id="password"
                    label={say(messages.password)}
                    type={shown ? 'text' : 'password'}
                />
                <label className={styles.show}>
                    <input
                        checked={shown}
                        type="checkbox"
                        onChange={handleShown}
                    />
                    {say(messages.showPassword)}
                </label>
                <button
                    aria-disabled={busy}
                    className={styles.primary}
                    type="submit"
                >
                    {say(creating ? messages.create : messages.login)}
                </button>
            </form>
        </React.Fragment>
    );
};

const accountShape = PropTypes.shape({
    emailAllowed: PropTypes.bool.isRequired,
    getState: PropTypes.func.isRequired,
    google: PropTypes.func.isRequired,
    show: PropTypes.func.isRequired,
    signOut: PropTypes.func.isRequired,
    submit: PropTypes.func.isRequired,
    subscribe: PropTypes.func.isRequired
});

EmailForm.propTypes = {
    account: accountShape.isRequired,
    busy: PropTypes.bool.isRequired,
    creating: PropTypes.bool.isRequired
};

const Allowance = ({allowance}) => {
    const intl = useIntl();
    const say = (message, values) => intl.formatMessage(message, values);
    if (allowance.blocked) return <p>{say(messages.blocked)}</p>;
    if (!allowance.ai_enabled) return <p>{say(messages.aiOff)}</p>;
    if (allowance.requests_limit === null) return <p>{say(messages.unlimited)}</p>;
    return (
        <React.Fragment>
            <p>{say(messages.requests, {used: allowance.requests_used, limit: allowance.requests_limit})}</p>
            <p>{say(messages.live, {used: allowance.live_sessions_used, limit: allowance.live_sessions_limit})}</p>
        </React.Fragment>
    );
};

Allowance.propTypes = {
    allowance: PropTypes.shape({
        ai_enabled: PropTypes.bool,
        blocked: PropTypes.bool,
        live_sessions_limit: PropTypes.number,
        live_sessions_used: PropTypes.number,
        requests_limit: PropTypes.number,
        requests_used: PropTypes.number
    }).isRequired
};

// The part that changes with what the person is doing.
const Panel = ({account, state}) => {
    const intl = useIntl();
    const say = (message, values) => intl.formatMessage(message, values);
    const {view, busy, email, allowance} = state;
    const handleGoogle = useCallback(() => account.google(), [account]);
    const handleLogin = useCallback(() => account.show('login'), [account]);
    const handleSwitch = useCallback(
        () => account.show(view === 'signup' ? 'login' : 'signup'), [account, view]);
    const handleSignOut = useCallback(() => account.signOut(), [account]);

    if (view === 'loading') return <p>{say(messages.loading)}</p>;
    if (view === 'unavailable') {
        return (
            <React.Fragment>
                <p>{say(messages.unavailable)}</p>
                <a href="./">{say(messages.openEditor)}</a>
            </React.Fragment>
        );
    }
    if (view === 'check-email') {
        return (
            <React.Fragment>
                <p>{say(messages.check, {email})}</p>
                <button
                    className={styles.link}
                    type="button"
                    onClick={handleLogin}
                >
                    {say(messages.back)}
                </button>
            </React.Fragment>
        );
    }
    if (view === 'signed-in') {
        return (
            <React.Fragment>
                {allowance?.name ? <p>{say(messages.hello, {name: allowance.name})}</p> : null}
                {allowance ? <Allowance allowance={allowance} /> : null}
                <p>{say(messages.close)}</p>
                <a href="./">{say(messages.openEditor)}</a>
                <button
                    className={styles.secondary}
                    type="button"
                    onClick={handleSignOut}
                >
                    {say(messages.signOut)}
                </button>
            </React.Fragment>
        );
    }
    const creating = view === 'signup';
    return (
        <React.Fragment>
            <p className={styles.intro}>{say(messages.intro)}</p>
            <button
                aria-disabled={busy}
                className={styles.secondary}
                type="button"
                onClick={handleGoogle}
            >
                {say(creating ? messages.googleCreate : messages.googleLogin)}
                <Google />
            </button>
            {account.emailAllowed ? (
                <EmailForm
                    account={account}
                    busy={busy}
                    creating={creating}
                    key={view}
                />
            ) : null}
            <p className={styles.switch}>
                {say(creating ? messages.haveAccount : messages.noAccount)}
                {' '}
                <button
                    className={styles.link}
                    type="button"
                    onClick={handleSwitch}
                >
                    {say(creating ? messages.toLogin : messages.toCreate)}
                </button>
            </p>
            <p className={styles.small}>{say(messages.kept)}</p>
        </React.Fragment>
    );
};

Panel.propTypes = {
    account: accountShape.isRequired,
    state: PropTypes.shape({
        allowance: PropTypes.shape({name: PropTypes.string}),
        busy: PropTypes.bool.isRequired,
        email: PropTypes.string,
        view: PropTypes.string.isRequired
    }).isRequired
};

const AccountPage = ({account}) => {
    const intl = useIntl();
    const state = useSyncExternalStore(account.subscribe, account.getState);
    const heading = useRef(null);
    const shown = useRef(state.view);
    // A screen reader is taken to the new heading when what is shown changes, but is left alone as the page opens.
    useEffect(() => {
        if (shown.current !== state.view && shown.current !== 'loading') heading.current.focus();
        shown.current = state.view;
    }, [state.view]);
    return (
        <main className={styles.page}>
            <div className={styles.card}>
                <div className={styles.photo}>
                    <img
                        alt={intl.formatMessage(messages.photo)}
                        src={photo}
                    />
                </div>
                <div className={styles.side}>
                    <a href="./">
                        <img
                            alt="Brailled Education"
                            className={styles.logo}
                            src={logo}
                        />
                    </a>
                    <h1
                        ref={heading}
                        tabIndex="-1"
                    >
                        {intl.formatMessage(messages[TITLES[state.view]])}
                    </h1>
                    {/* Always there, so that what is put in it is announced. */}
                    <p
                        className={styles.error}
                        role="alert"
                    >
                        {state.error ? intl.formatMessage(errorMessage(state.error)) : null}
                    </p>
                    <Panel
                        account={account}
                        state={state}
                    />
                    <p className={styles.privacy}>
                        <a
                            href="privacy.html"
                            rel="noopener"
                            target="_blank"
                        >
                            {intl.formatMessage(messages.privacy)}
                        </a>
                    </p>
                    <ul
                        aria-label={intl.formatMessage(messages.social)}
                        className={styles.social}
                    >
                        {SOCIAL.map(([place, address, Icon]) => (
                            <li key={place}>
                                <a
                                    aria-label={intl.formatMessage(messages.on, {place})}
                                    href={address}
                                    rel="noopener noreferrer"
                                    target="_blank"
                                >
                                    <Icon />
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </main>
    );
};

AccountPage.propTypes = {
    account: accountShape.isRequired
};

export default AccountPage;
