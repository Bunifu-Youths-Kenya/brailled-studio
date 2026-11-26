import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useLayoutEffect, useRef} from 'react';

import styles from './dialog.css';

// A modal dialog. The browser keeps focus inside it and closes it on Escape.
const Dialog = ({title, describedBy, onCancel, children}) => {
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

    return (
        <dialog
            aria-describedby={describedBy}
            aria-labelledby="brailled-dialog-title"
            className={styles.dialog}
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
    );
};

Dialog.propTypes = {
    title: PropTypes.string.isRequired,
    describedBy: PropTypes.string,
    onCancel: PropTypes.func.isRequired,
    children: PropTypes.node
};

export default Dialog;
