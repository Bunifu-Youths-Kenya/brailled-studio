import PropTypes from 'prop-types';
import React, {useEffect, useState} from 'react';
import {useIntl} from 'react-intl';

import Dialog from './dialog.jsx';
import {searchBlocks} from './editing.js';
import {dialogMessages as messages, categoryMessages} from './messages.js';

import styles from './dialog.css';

// A searchable list of blocks, following the WAI-ARIA combobox pattern.
// The handlers depend on the current search, so they are made on each render.
/* eslint-disable react/jsx-no-bind */
const BlockPicker = ({title, entries, onChoose, onCancel}) => {
    const intl = useIntl();
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [error, setError] = useState(null);
    const category = key => (categoryMessages[key] ? intl.formatMessage(categoryMessages[key]) : key);
    const found = searchBlocks(
        entries.map(entry => ({...entry, category: category(entry.category)})),
        query
    );
    const optionId = index => `brailled-option-${found[index]?.opcode}`;

    useEffect(() => {
        document.getElementById(optionId(active))?.scrollIntoView({block: 'nearest'});
    });

    // Choosing keeps the dialog open if the block cannot go there, and says why.
    const choose = entry => {
        if (entry) setError(onChoose(entry.opcode));
    };

    const handleChange = event => {
        setQuery(event.target.value);
        setActive(0);
        setError(null);
    };

    const handleClick = event => {
        const {opcode} = event.currentTarget.dataset;
        choose(found.find(entry => entry.opcode === opcode));
    };

    const handleKeyDown = event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive(Math.max(0, Math.min(found.length - 1, active + step)));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(found[active]);
        }
    };

    return (
        <Dialog
            title={title}
            onCancel={onCancel}
        >
            <label
                className={styles.label}
                htmlFor="brailled-block-search"
            >
                {intl.formatMessage(messages.search)}
            </label>
            <input
                aria-activedescendant={found.length > 0 ? optionId(active) : null}
                aria-autocomplete="list"
                aria-controls="brailled-block-list"
                aria-expanded="true"
                autoComplete="off"
                className={styles.input}
                data-autofocus
                id="brailled-block-search"
                role="combobox"
                type="text"
                value={query}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
            />
            <p
                className={styles.count}
                role="status"
            >
                {intl.formatMessage(messages.count, {count: found.length})}
            </p>
            <p
                className={styles.error}
                role="alert"
            >
                {error}
            </p>
            <ul
                aria-label={intl.formatMessage(messages.list)}
                className={styles.list}
                id="brailled-block-list"
                role="listbox"
            >
                {found.map((entry, index) => (
                    // The keyboard works through the search box; clicking is the mouse equivalent.
                    <li
                        aria-selected={index === active}
                        className={styles.option}
                        id={optionId(index)}
                        data-opcode={entry.opcode}
                        key={entry.opcode}
                        role="option"
                        onClick={handleClick}
                    >
                        <span>{entry.name}</span>
                        <span className={styles.category}>{entry.category}</span>
                    </li>
                ))}
            </ul>
            <button
                className={styles.button}
                type="button"
                onClick={onCancel}
            >
                {intl.formatMessage(messages.cancel)}
            </button>
        </Dialog>
    );
};

BlockPicker.propTypes = {
    title: PropTypes.string.isRequired,
    entries: PropTypes.arrayOf(PropTypes.shape({
        opcode: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        category: PropTypes.string.isRequired
    })).isRequired,
    onChoose: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

export default BlockPicker;
