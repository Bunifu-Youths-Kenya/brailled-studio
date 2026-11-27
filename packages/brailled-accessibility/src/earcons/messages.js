import {defineMessages} from 'react-intl';

// What is said about the short sounds.
const earconMessages = defineMessages({
    on: {
        id: 'brailled.earcons.on',
        defaultMessage: 'Sounds on.',
        description: 'Said when the short sounds that mark what happens are turned on'
    },
    off: {
        id: 'brailled.earcons.off',
        defaultMessage: 'Sounds off.',
        description: 'Said when the short sounds that mark what happens are turned off'
    },
    setting: {
        id: 'brailled.earcons.setting',
        defaultMessage: 'Play short sounds for what happens',
        description: 'Voice settings: the checkbox for the short sounds'
    },
    settingHint: {
        id: 'brailled.earcons.settingHint',
        defaultMessage: 'A rising tone when a block is added, a falling one when one is removed, and others for ' +
            'loops, errors, success and questions. They come before the words, never in place of them. ' +
            'Alt+Shift+E turns them on and off.',
        description: 'Voice settings: what the short sounds are'
    }
});

export default earconMessages;
