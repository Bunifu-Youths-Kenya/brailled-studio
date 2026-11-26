import React, {useCallback} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import styles from './shell.css';

const STAGE_ZONE_ID = 'brailled-stage-zone';
const SCRIPTS_ZONE_ID = 'brailled-scripts-zone';
const PALETTE_ZONE_SELECTOR = '[data-brailled-zone="palette"]';

const messages = defineMessages({
    skipLinks: {
        id: 'brailled.skipLinks.label',
        defaultMessage: 'Skip to',
        description: 'Label for the list of links that jump to a part of the editor'
    }
});

// The block categories are not displayed in the Outline view or on the Costumes and Sounds tabs.
const findZone = zone => {
    if (zone === 'stage') return document.getElementById(STAGE_ZONE_ID);
    if (zone === 'palette') {
        const palette = document.querySelector(PALETTE_ZONE_SELECTOR);
        if (palette && palette.offsetParent && getComputedStyle(palette).visibility !== 'hidden') {
            return palette;
        }
    }
    return document.getElementById(SCRIPTS_ZONE_ID);
};

const SkipLinks = () => {
    const intl = useIntl();
    // The URL hash selects the project to load, so following these links must not change it.
    const handleClick = useCallback(event => {
        event.preventDefault();
        findZone(event.currentTarget.dataset.zone).focus();
    }, []);
    return (
        <nav
            aria-label={intl.formatMessage(messages.skipLinks)}
            className={styles.skipLinks}
        >
            <a
                data-zone="stage"
                href={`#${STAGE_ZONE_ID}`}
                onClick={handleClick}
            >
                <FormattedMessage
                    defaultMessage="Skip to stage area"
                    description="Link that moves focus to the stage area"
                    id="brailled.skipLinks.stage"
                />
            </a>
            <a
                data-zone="palette"
                href={`#${SCRIPTS_ZONE_ID}`}
                onClick={handleClick}
            >
                <FormattedMessage
                    defaultMessage="Skip to block categories"
                    description="Link that moves focus to the block categories"
                    id="brailled.skipLinks.palette"
                />
            </a>
            <a
                data-zone="scripts"
                href={`#${SCRIPTS_ZONE_ID}`}
                onClick={handleClick}
            >
                <FormattedMessage
                    defaultMessage="Skip to scripts area"
                    description="Link that moves focus to the scripts area"
                    id="brailled.skipLinks.scripts"
                />
            </a>
        </nav>
    );
};

const shellClassName = styles.shell;
// For the area between the menu bar and the voice bar.
const shellBodyClassName = styles.body;

export {
    SkipLinks,
    SCRIPTS_ZONE_ID,
    STAGE_ZONE_ID,
    shellBodyClassName,
    shellClassName
};
