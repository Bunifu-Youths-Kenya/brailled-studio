import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

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

const HelpAndExamples = ({className, onClickExamples}) => {
    const intl = useIntl();
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
            <button
                className={className}
                type="button"
                onClick={onClickExamples}
            >
                <FormattedMessage
                    defaultMessage="Examples"
                    description="Menu bar button that opens the example projects and tutorials"
                    id="brailled.menuBar.examples"
                />
            </button>
        </React.Fragment>
    );
};

HelpAndExamples.propTypes = {
    className: PropTypes.string,
    onClickExamples: PropTypes.func.isRequired
};

export {
    BrandName,
    LanguageControl,
    SaveButton,
    HelpAndExamples
};
