import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useId, useLayoutEffect, useRef} from 'react';
import {createPortal} from 'react-dom';

import styles from './dialog.css';

// The reading direction of the editor, which the dialog is placed outside of.
const editorDirection = () => document.querySelector('[data-brailled-zone="voice"]')?.closest('[dir]')
    ?.getAttribute('dir');

// A modal dialog. The browser keeps focus inside it and closes it on Escape.
const Modal = ({title, describedBy, onCancel, children}) => {
    const dialogRef = useRef(null);

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        dialog.showModal();
        return () => dialog.close();
    }, []);

    useEffect(() => {
        dialogRef.current.querySelector('[data-autofocus]')?.focus();
    }, []);

    const handleCancel = useCallback(event => {
        // Closing is left to whoever opened the dialog, which removes it.
        event.preventDefault();
        onCancel();
    }, [onCancel]);

    // Placed in the page's body: another window that is open hides the rest of the editor from screen readers.
    return createPortal((
        <dialog
            aria-describedby={describedBy}
            aria-labelledby="brailled-dialog-title"
            className={styles.dialog}
            dir={editorDirection()}
            ref={dialogRef}
            onCancel={handleCancel}
        >
            <h2
                className={styles.title}
                id="brailled-dialog-title"
            >
                {title}
            </h2>
            {children}
        </dialog>
    ), document.body);
};

// A panel beside the editor that leaves focus where the student is. What it shows is said aloud by whoever opens
// it. It sits in the voice bar, so that going to the voice bar reaches it, and Escape inside it cancels.
const Docked = ({title, describedBy, onCancel, children}) => {
    const panelRef = useRef(null);
    const returnTo = useRef(null);
    const titleId = useId();

    // Where focus came from, to go back to if the panel goes away while focus is in it.
    const handleFocus = useCallback(event => {
        if (!panelRef.current.contains(event.relatedTarget)) returnTo.current = event.relatedTarget;
    }, []);
    useLayoutEffect(() => {
        const panel = panelRef.current;
        return () => {
            if (panel.contains(document.activeElement) && returnTo.current?.isConnected) returnTo.current.focus();
        };
    }, []);

    const handleKeyDown = useCallback(event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onCancel();
    }, [onCancel]);

    return createPortal((
        <section
            aria-describedby={describedBy}
            aria-labelledby={titleId}
            className={styles.docked}
            data-brailled-docked
            dir={editorDirection()}
            ref={panelRef}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
        >
            <h2
                className={styles.title}
                id={titleId}
            >
                {title}
            </h2>
            {children}
        </section>
    ), document.querySelector('[data-brailled-zone="voice"]') || document.body);
};

const Dialog = ({docked = false, ...props}) => (docked ? <Docked {...props} /> : <Modal {...props} />);

const shape = {
    title: PropTypes.string.isRequired,
    describedBy: PropTypes.string,
    onCancel: PropTypes.func.isRequired,
    children: PropTypes.node
};
Modal.propTypes = shape;
Docked.propTypes = shape;
Dialog.propTypes = {
    ...shape,
    // Shown beside the editor without taking focus, instead of as a modal dialog.
    docked: PropTypes.bool
};

export default Dialog;
