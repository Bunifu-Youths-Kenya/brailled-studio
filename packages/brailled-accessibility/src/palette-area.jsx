import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import styles from './palette-area.css';

const messages = defineMessages({
    categories: {
        id: 'brailled.palette.categories',
        defaultMessage: 'Block categories',
        description: 'Accessible name of the block category menu'
    },
    blockList: {
        id: 'brailled.palette.blockList',
        defaultMessage: 'Block list',
        description: 'Accessible name of the list of blocks that can be dragged into the workspace'
    },
    searchComingSoon: {
        id: 'brailled.palette.searchComingSoon',
        defaultMessage: 'Search blocks (coming soon)',
        description: 'Accessible name of the block search button, which does nothing yet'
    }
});

// Wraps the block workspace: adds the Search placeholder, marks the category menu as a landmark and keeps
// focus on the selected category.
const PaletteArea = ({children}) => {
    const intl = useIntl();
    const containerRef = useRef(null);
    const categoriesLabel = intl.formatMessage(messages.categories);
    const blockListLabel = intl.formatMessage(messages.blockList);

    // The block library creates the category menu itself, and creates a new one whenever the workspace is
    // rebuilt, so label it after every render.
    useEffect(() => {
        containerRef.current.querySelector('.blocklyFlyout .blocklyWorkspace')
            ?.setAttribute('aria-label', blockListLabel);
        const categories = containerRef.current.querySelector('.blocklyToolbox');
        if (!categories) return;
        categories.setAttribute('role', 'navigation');
        categories.setAttribute('aria-label', categoriesLabel);
        categories.dataset.brailledZone = 'palette';
    });

    // The arrow keys move the selected category but not keyboard focus, which screen readers follow.
    const handleKeyUp = useCallback(event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        const categories = event.target.closest('.blocklyToolbox');
        if (!categories) return;
        const selected = categories.querySelector('.blocklyToolboxSelected');
        if (selected) selected.closest('.blocklyToolboxCategoryContainer').focus();
    }, []);

    return (
        <div
            className={styles.paletteArea}
            data-brailled-workspace
            ref={containerRef}
            onKeyUp={handleKeyUp}
        >
            <button
                aria-disabled="true"
                aria-label={intl.formatMessage(messages.searchComingSoon)}
                className={styles.search}
                title={intl.formatMessage(messages.searchComingSoon)}
                type="button"
            >
                <span
                    aria-hidden="true"
                    className={styles.searchIcon}
                />
                <FormattedMessage
                    defaultMessage="Search"
                    description="Label of the block search button"
                    id="brailled.palette.search"
                />
            </button>
            {children}
        </div>
    );
};

PaletteArea.propTypes = {
    children: PropTypes.node
};

export default PaletteArea;
