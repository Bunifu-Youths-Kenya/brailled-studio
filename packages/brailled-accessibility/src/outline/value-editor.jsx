import PropTypes from 'prop-types';
import React, {useState} from 'react';
import {useIntl} from 'react-intl';

import Dialog from './dialog.jsx';
import {dialogMessages as messages} from './messages.js';

import styles from './dialog.css';

const keyOf = field => `${field.blockId}:${field.name}`;

// One labelled field for each value of a block, including the values of blocks plugged into it.
// The handlers depend on what has been entered, so they are made on each render.
/* eslint-disable react/jsx-no-bind */
const ValueEditor = ({title, fields, onSave, onRemove, onChooseBlock, onCancel}) => {
    const intl = useIntl();
    const [entered, setEntered] = useState({});
    const [error, setError] = useState(null);
    const valueOf = field => entered[keyOf(field)] ?? field.value;

    const handleChange = event => {
        const {name, value} = event.target;
        setEntered(current => ({...current, [name]: value}));
        setError(null);
    };

    const handleSubmit = event => {
        event.preventDefault();
        const changes = fields
            .filter(field => field.control !== 'block' && valueOf(field) !== field.value)
            .map(field => ({op: 'set-value', block: field.blockId, name: field.name, value: valueOf(field)}));
        setError(onSave(changes));
    };

    // Browsers do not submit a form on Enter in a drop-down.
    const handleSelectKeyDown = event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.target.form.requestSubmit();
    };

    const fieldOf = event => fields.find(field => keyOf(field) === event.currentTarget.value);
    const handleChoose = event => onChooseBlock(fieldOf(event));
    const handleRemove = event => setError(onRemove(fieldOf(event)));

    const blockButtons = (field, first) => (
        <span className={styles.row}>
            <button
                aria-label={intl.formatMessage(
                    field.accepts === 'boolean' ? messages.chooseConditionFor : messages.useBlockFor,
                    {label: field.label})}
                className={styles.button}
                data-autofocus={first ? true : null}
                type="button"
                value={keyOf(field)}
                onClick={handleChoose}
            >
                {intl.formatMessage(field.accepts === 'boolean' ? messages.chooseCondition : messages.useBlock)}
            </button>
            {field.plugged ? (
                <button
                    aria-label={intl.formatMessage(messages.removeBlockNamed, {block: field.plugged})}
                    className={styles.button}
                    type="button"
                    value={keyOf(field)}
                    onClick={handleRemove}
                >
                    {intl.formatMessage(messages.removeBlock)}
                </button>
            ) : null}
        </span>
    );

    return (
        <Dialog
            title={title}
            onCancel={onCancel}
        >
            <form
                noValidate
                onSubmit={handleSubmit}
            >
                {fields.map((field, index) => {
                    const id = `brailled-value-${keyOf(field)}`;
                    if (field.control === 'block') {
                        return (
                            <fieldset
                                className={styles.field}
                                key={keyOf(field)}
                            >
                                <legend>{field.label}</legend>
                                <p>{field.plugged || intl.formatMessage(messages.emptySlot)}</p>
                                {blockButtons(field, index === 0)}
                            </fieldset>
                        );
                    }
                    return (
                        <div
                            className={styles.field}
                            key={keyOf(field)}
                        >
                            <label
                                className={styles.label}
                                htmlFor={id}
                            >
                                {field.label}
                            </label>
                            {field.control === 'select' ? (
                                <select
                                    className={styles.input}
                                    data-autofocus={index === 0 ? true : null}
                                    id={id}
                                    name={keyOf(field)}
                                    value={valueOf(field)}
                                    onChange={handleChange}
                                    onKeyDown={handleSelectKeyDown}
                                >
                                    {field.options.map(option => (
                                        <option
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    autoComplete="off"
                                    className={styles.input}
                                    data-autofocus={index === 0 ? true : null}
                                    id={id}
                                    name={keyOf(field)}
                                    type="text"
                                    value={valueOf(field)}
                                    onChange={handleChange}
                                />
                            )}
                            {field.accepts ? blockButtons(field, false) : null}
                        </div>
                    );
                })}
                <p
                    className={styles.error}
                    role="alert"
                >
                    {error}
                </p>
                {/* The first submit button, so that Enter in a field saves. */}
                <button
                    className={styles.button}
                    type="submit"
                >
                    {intl.formatMessage(messages.save)}
                </button>
                <button
                    className={styles.button}
                    type="button"
                    onClick={onCancel}
                >
                    {intl.formatMessage(messages.cancel)}
                </button>
            </form>
        </Dialog>
    );
};

ValueEditor.propTypes = {
    title: PropTypes.string.isRequired,
    fields: PropTypes.arrayOf(PropTypes.shape({
        blockId: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        control: PropTypes.oneOf(['text', 'select', 'block']).isRequired,
        value: PropTypes.string,
        options: PropTypes.arrayOf(PropTypes.shape({value: PropTypes.string, label: PropTypes.string})),
        accepts: PropTypes.oneOf(['value', 'boolean']),
        plugged: PropTypes.string
    })).isRequired,
    onSave: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired,
    onChooseBlock: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

export default ValueEditor;
