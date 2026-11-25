import PropTypes from 'prop-types';
import React, {useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';

import Dialog from './dialog.jsx';
import {dataMessages as messages, dialogMessages, kindMessages} from './messages.js';

import styles from './dialog.css';

const KINDS = ['variable', 'list', 'message'];

// These forms are small, so their handlers are made on each render.
/* eslint-disable react/jsx-no-bind */

// A form in a dialog. `onSubmit` receives the entered values and returns why it was refused, if it was.
const FormDialog = ({title, submitLabel, onSubmit, onCancel, children}) => {
    const intl = useIntl();
    const [error, setError] = useState(null);

    const handleSubmit = event => {
        event.preventDefault();
        setError(onSubmit(Object.fromEntries(new FormData(event.target))));
    };

    // Browsers do not submit a form on Enter in a drop-down.
    const handleKeyDown = event => {
        if (event.key !== 'Enter' || event.target.tagName !== 'SELECT') return;
        event.preventDefault();
        event.target.form.requestSubmit();
    };

    return (
        <Dialog
            title={title}
            onCancel={onCancel}
        >
            <form
                noValidate
                onKeyDown={handleKeyDown}
                onSubmit={handleSubmit}
            >
                {children}
                <p
                    className={styles.error}
                    role="alert"
                >
                    {error}
                </p>
                <button
                    className={styles.button}
                    type="submit"
                >
                    {submitLabel}
                </button>
                <button
                    className={styles.button}
                    type="button"
                    onClick={onCancel}
                >
                    {intl.formatMessage(dialogMessages.cancel)}
                </button>
            </form>
        </Dialog>
    );
};

FormDialog.propTypes = {
    title: PropTypes.string.isRequired,
    submitLabel: PropTypes.string.isRequired,
    onSubmit: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    children: PropTypes.node
};

const Field = ({label, id, children}) => (
    <div className={styles.field}>
        <label
            className={styles.label}
            htmlFor={id}
        >
            {label}
        </label>
        {children}
    </div>
);

Field.propTypes = {
    label: PropTypes.node.isRequired,
    id: PropTypes.string.isRequired,
    children: PropTypes.node
};

const CreateDataDialog = ({isStage, onCreate, onCancel}) => {
    const intl = useIntl();
    const [kind, setKind] = useState(KINDS[0]);
    // Messages, and everything made on the stage, are for all sprites.
    const canChooseScope = !isStage && kind !== 'message';

    const handleKind = event => setKind(event.target.value);
    const handleSubmit = values => onCreate({
        kind: values.kind,
        name: values.name,
        ...(values.scope ? {scope: values.scope} : {})
    });

    return (
        <FormDialog
            submitLabel={intl.formatMessage(messages.create)}
            title={intl.formatMessage(messages.createTitle)}
            onCancel={onCancel}
            onSubmit={handleSubmit}
        >
            <Field
                id="brailled-data-name"
                label={<FormattedMessage {...messages.name} />}
            >
                <input
                    autoComplete="off"
                    className={styles.input}
                    data-autofocus
                    id="brailled-data-name"
                    name="name"
                    type="text"
                />
            </Field>
            <Field
                id="brailled-data-kind"
                label={<FormattedMessage {...messages.type} />}
            >
                <select
                    className={styles.input}
                    id="brailled-data-kind"
                    name="kind"
                    value={kind}
                    onChange={handleKind}
                >
                    {KINDS.map(value => (
                        <option
                            key={value}
                            value={value}
                        >
                            {intl.formatMessage(kindMessages[value])}
                        </option>
                    ))}
                </select>
            </Field>
            {canChooseScope ? (
                <Field
                    id="brailled-data-scope"
                    label={<FormattedMessage {...messages.scope} />}
                >
                    <select
                        className={styles.input}
                        id="brailled-data-scope"
                        name="scope"
                    >
                        <option value="all">{intl.formatMessage(messages.allSprites)}</option>
                        <option value="sprite">{intl.formatMessage(messages.thisSprite)}</option>
                    </select>
                </Field>
            ) : null}
        </FormDialog>
    );
};

CreateDataDialog.propTypes = {
    isStage: PropTypes.bool.isRequired,
    onCreate: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

const RenameDataDialog = ({items, onRename, onCancel}) => {
    const intl = useIntl();

    const describe = item => intl.formatMessage(
        item.scope === 'sprite' ? messages.ownItem : messages.item,
        {kind: intl.formatMessage(kindMessages[item.kind]), name: item.name}
    );

    const handleSubmit = values => {
        const {kind, name} = items[Number(values.item)];
        return onRename({kind, name, to: values.to});
    };

    return (
        <FormDialog
            submitLabel={intl.formatMessage(messages.rename)}
            title={intl.formatMessage(messages.renameTitle)}
            onCancel={onCancel}
            onSubmit={handleSubmit}
        >
            <Field
                id="brailled-data-item"
                label={<FormattedMessage {...messages.which} />}
            >
                <select
                    className={styles.input}
                    data-autofocus
                    id="brailled-data-item"
                    name="item"
                >
                    {items.map((item, index) => (
                        <option
                            key={`${item.kind} ${item.scope} ${item.name}`}
                            value={index}
                        >
                            {describe(item)}
                        </option>
                    ))}
                </select>
            </Field>
            <Field
                id="brailled-data-to"
                label={<FormattedMessage {...messages.newName} />}
            >
                <input
                    autoComplete="off"
                    className={styles.input}
                    id="brailled-data-to"
                    name="to"
                    type="text"
                />
            </Field>
        </FormDialog>
    );
};

RenameDataDialog.propTypes = {
    items: PropTypes.arrayOf(PropTypes.shape({
        kind: PropTypes.oneOf(KINDS).isRequired,
        name: PropTypes.string.isRequired,
        scope: PropTypes.oneOf(['all', 'sprite']).isRequired
    })).isRequired,
    onRename: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

export {
    CreateDataDialog,
    RenameDataDialog
};
