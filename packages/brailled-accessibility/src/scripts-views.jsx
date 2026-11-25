import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useCallback} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import {VIEW_SHORTCUT_LABEL} from './view-shortcut.js';

import styles from './scripts-views.css';

const SCRIPTS_VIEWS = Object.freeze({
    blocks: 'blocks',
    outline: 'outline'
});

const messages = defineMessages({
    toggleLabel: {
        id: 'brailled.scriptsView.label',
        defaultMessage: 'Scripts view',
        description: 'Accessible name of the buttons that switch how scripts are shown'
    },
    blocks: {
        id: 'brailled.scriptsView.blocks',
        defaultMessage: 'Blocks',
        description: 'Button that shows scripts as blocks'
    },
    outline: {
        id: 'brailled.scriptsView.outline',
        defaultMessage: 'Outline',
        description: 'Button that shows scripts as a text outline'
    },
    python: {
        id: 'brailled.scriptsView.python',
        defaultMessage: 'Python (coming soon)',
        description: 'Unavailable button for showing scripts as Python code'
    }
});

const ScriptsViewToggle = ({view, onChange}) => {
    const intl = useIntl();
    const handleClick = useCallback(event => onChange(event.currentTarget.value), [onChange]);
    return (
        <div
            aria-label={intl.formatMessage(messages.toggleLabel)}
            className={styles.toggle}
            role="group"
        >
            {Object.values(SCRIPTS_VIEWS).map(value => (
                <button
                    aria-keyshortcuts={VIEW_SHORTCUT_LABEL}
                    aria-pressed={view === value}
                    className={styles.toggleButton}
                    key={value}
                    type="button"
                    value={value}
                    onClick={handleClick}
                >
                    <FormattedMessage {...messages[value]} />
                </button>
            ))}
            {/* Stays focusable so that keyboard and screen reader users can find out that it is coming. */}
            <button
                aria-disabled="true"
                className={styles.toggleButton}
                type="button"
            >
                <FormattedMessage {...messages.python} />
            </button>
        </div>
    );
};

ScriptsViewToggle.propTypes = {
    view: PropTypes.oneOf(Object.values(SCRIPTS_VIEWS)).isRequired,
    onChange: PropTypes.func.isRequired
};

// The block workspace stays mounted and keeps its size while hidden, so switching views does not rebuild it.
const ScriptsViews = ({view, outline, children}) => (
    <React.Fragment>
        <div
            className={classNames(styles.blocksView, {
                [styles.hidden]: view !== SCRIPTS_VIEWS.blocks
            })}
        >
            {children}
        </div>
        {outline}
    </React.Fragment>
);

ScriptsViews.propTypes = {
    view: PropTypes.oneOf(Object.values(SCRIPTS_VIEWS)).isRequired,
    outline: PropTypes.node.isRequired,
    children: PropTypes.node
};

export {
    ScriptsViewToggle,
    ScriptsViews,
    SCRIPTS_VIEWS
};
