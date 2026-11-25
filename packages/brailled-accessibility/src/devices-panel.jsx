import React, {useCallback, useState} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import styles from './devices-panel.css';

const messages = defineMessages({
    addComingSoon: {
        id: 'brailled.devices.addComingSoon',
        defaultMessage: 'Adding devices is coming soon.',
        description: 'Announced when the Add device button is used'
    },
    guideComingSoon: {
        id: 'brailled.devices.guideComingSoon',
        defaultMessage: 'The device guide is coming soon.',
        description: 'Announced when the device guide link is used'
    }
});

const MODES = ['upload', 'live'];

const modeMessages = defineMessages({
    upload: {
        id: 'brailled.devices.upload',
        defaultMessage: 'Upload',
        description: 'Device mode that copies the program onto the device'
    },
    live: {
        id: 'brailled.devices.live',
        defaultMessage: 'Live',
        description: 'Device mode that runs the program from the computer'
    }
});

// Interface only: nothing here talks to hardware.
const DevicesPanel = () => {
    const intl = useIntl();
    const [mode, setMode] = useState('live');
    const [notice, setNotice] = useState(null);

    const handleModeChange = useCallback(event => setMode(event.target.value), []);
    const handleAdd = useCallback(() => setNotice(messages.addComingSoon), []);
    const handleGuide = useCallback(event => {
        event.preventDefault();
        setNotice(messages.guideComingSoon);
    }, []);

    return (
        <div
            className={styles.panel}
            data-brailled-device-mode={mode}
        >
            <div className={styles.card}>
                <div
                    aria-hidden="true"
                    className={styles.placeholderImage}
                />
                <p className={styles.deviceName}>
                    <FormattedMessage
                        defaultMessage="No device"
                        description="Shown when no hardware device is selected"
                        id="brailled.devices.none"
                    />
                </p>
                <button
                    className={styles.button}
                    type="button"
                    onClick={handleAdd}
                >
                    <FormattedMessage
                        defaultMessage="Add device"
                        description="Button to add a hardware device"
                        id="brailled.devices.add"
                    />
                </button>
            </div>
            <fieldset className={styles.group}>
                <legend>
                    <FormattedMessage
                        defaultMessage="Connection"
                        description="Heading for the ways to connect a device"
                        id="brailled.devices.connection"
                    />
                </legend>
                <button
                    className={styles.button}
                    disabled
                    type="button"
                >
                    <FormattedMessage
                        defaultMessage="Bluetooth"
                        description="Button to connect a device over Bluetooth"
                        id="brailled.devices.bluetooth"
                    />
                </button>
                <button
                    className={styles.button}
                    disabled
                    type="button"
                >
                    <FormattedMessage
                        defaultMessage="Serial"
                        description="Button to connect a device over a serial cable"
                        id="brailled.devices.serial"
                    />
                </button>
            </fieldset>
            <fieldset className={styles.group}>
                <legend>
                    <FormattedMessage
                        defaultMessage="Mode"
                        description="Heading for the choice between upload and live mode"
                        id="brailled.devices.mode"
                    />
                </legend>
                {MODES.map(value => (
                    <label
                        className={styles.mode}
                        key={value}
                    >
                        <input
                            checked={mode === value}
                            name="brailled-device-mode"
                            type="radio"
                            value={value}
                            onChange={handleModeChange}
                        />
                        <FormattedMessage {...modeMessages[value]} />
                    </label>
                ))}
            </fieldset>
            <a
                className={styles.guide}
                href="#device-guide"
                onClick={handleGuide}
            >
                <FormattedMessage
                    defaultMessage="How to use device"
                    description="Link to instructions for using a hardware device"
                    id="brailled.devices.guide"
                />
            </a>
            <p
                className={styles.notice}
                role="status"
            >
                {notice ? intl.formatMessage(notice) : null}
            </p>
        </div>
    );
};

export default DevicesPanel;
