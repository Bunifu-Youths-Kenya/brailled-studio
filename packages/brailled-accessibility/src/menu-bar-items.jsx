/* global process */
import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useCallback, useSyncExternalStore} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import signInMessages from './account/editor-messages.js';
import {signIn} from './account/sign-in.js';
import logo from './brand/brailled-logo.png';
import styles from './menu-bar-items.css';

const messages = defineMessages({
    language: {
        id: 'brailled.menuBar.language',
        defaultMessage: 'Language',
        description: 'Label for the language picker in the menu bar'
    },
    saveLabel: {
        id: 'brailled.menuBar.saveLabel',
        defaultMessage: 'Save project to your computer',
        description: 'Accessible name of the Save button in the menu bar'
    },
    helpComingSoon: {
        id: 'brailled.menuBar.helpComingSoon',
        defaultMessage: 'Help is coming soon',
        description: 'Tooltip on the Help button, which does nothing yet'
    }
});

// The product logo, drawn straight on the menu bar. Its name is what the lettering says, which is not translated.
const BrandName = () => (
    <span className={styles.brand}>
        <img
            alt="Brailled Education"
            className={styles.brandLogo}
            draggable={false}
            src={logo}
        />
    </span>
);

const LanguageControl = ({className, icon, Selector}) => {
    const intl = useIntl();
    return (
        <div className={classNames(className, styles.language)}>
            <img
                alt=""
                className={styles.languageIcon}
                src={icon}
            />
            <span aria-hidden="true">
                <FormattedMessage {...messages.language} />
            </span>
            <Selector label={intl.formatMessage(messages.language)} />
        </div>
    );
};

LanguageControl.propTypes = {
    className: PropTypes.string,
    icon: PropTypes.string.isRequired,
    Selector: PropTypes.elementType.isRequired
};

const SaveButton = ({className, onClick}) => {
    const intl = useIntl();
    return (
        <button
            aria-label={intl.formatMessage(messages.saveLabel)}
            className={className}
            type="button"
            onClick={onClick}
        >
            <FormattedMessage
                defaultMessage="Save"
                description="Menu bar button that saves the project"
                id="brailled.menuBar.save"
            />
        </button>
    );
};

SaveButton.propTypes = {
    className: PropTypes.string,
    onClick: PropTypes.func.isRequired
};

// Opens the account page, in an editor with accounts.
const AccountButton = ({className}) => {
    const intl = useIntl();
    const {enabled, signedIn} = useSyncExternalStore(signIn.subscribe, signIn.getState);
    const handleClick = useCallback(() => signIn.open(), []);
    if (!enabled) return null;
    return (
        <button
            className={className}
            type="button"
            onClick={handleClick}
        >
            {intl.formatMessage(signedIn ? signInMessages.account : signInMessages.button)}
        </button>
    );
};

AccountButton.propTypes = {
    className: PropTypes.string
};

// The code of the version being served, which its licence asks to be offered to whoever uses it.
const SOURCE = process.env.BRAILLED_SOURCE;

// A page that opens in a new tab, so that the project stays open.
const MenuLink = ({children, className, href}) => (
    <a
        className={classNames(className, styles.link)}
        href={href}
        rel="noopener noreferrer"
        target="_blank"
    >
        {children}
    </a>
);

MenuLink.propTypes = {
    children: PropTypes.node.isRequired,
    className: PropTypes.string,
    href: PropTypes.string.isRequired
};

const HelpAndLinks = ({className}) => {
    const intl = useIntl();
    // The privacy page is about accounts and what is kept online.
    const {enabled} = useSyncExternalStore(signIn.subscribe, signIn.getState);
    return (
        <React.Fragment>
            <button
                aria-disabled="true"
                className={classNames(className, styles.unavailable)}
                title={intl.formatMessage(messages.helpComingSoon)}
                type="button"
            >
                <FormattedMessage
                    defaultMessage="Help"
                    description="Menu bar button for help"
                    id="brailled.menuBar.help"
                />
            </button>
            <MenuLink
                className={className}
                href={SOURCE}
            >
                <FormattedMessage
                    defaultMessage="Source code"
                    description="Menu bar link to the code of this editor"
                    id="brailled.menuBar.source"
                />
            </MenuLink>
            {enabled ? (
                <MenuLink
                    className={className}
                    href="privacy.html"
                >
                    <FormattedMessage
                        defaultMessage="Privacy"
                        description="Menu bar link to the page about what is kept and sent"
                        id="brailled.menuBar.privacy"
                    />
                </MenuLink>
            ) : null}
            <AccountButton className={className} />
        </React.Fragment>
    );
};

HelpAndLinks.propTypes = {
    className: PropTypes.string
};

export {
    BrandName,
    LanguageControl,
    SaveButton,
    HelpAndLinks
};
