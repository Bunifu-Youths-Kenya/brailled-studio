// Keys: how a shortcut is written in the registry, shown, and matched against a key press.

/**
 * @typedef {object} Shortcut
 * @property {string} [key] `KeyboardEvent.key`, compared ignoring case.
 * @property {string} [code] `KeyboardEvent.code`, for Alt shortcuts, where the typed character varies.
 * @property {boolean} [ctrl] Needs Control, or Command on a Mac.
 * @property {boolean} [alt] Needs Alt.
 * @property {boolean} [shift] Needs Shift.
 * @property {boolean} [hold] The key is held down, not just pressed.
 * @property {string} label How it is written and spoken.
 */

const plain = (key, label = key) => ({key, label});
const shift = (key, label = `Shift+${key}`) => ({key, shift: true, label});
const control = (key, label = `Control+${key}`) => ({key, ctrl: true, label});
const altShift = letter => ({code: `Key${letter}`, alt: true, shift: true, label: `Alt+Shift+${letter}`});

const VIEW_TOGGLE = altShift('O');
// Held down while speaking.
const TALK = {key: 'F2', hold: true, label: 'hold F2'};

/**
 * Whether a key press is this shortcut.
 * @param {Shortcut} shortcut The shortcut.
 * @param {KeyboardEvent} event The key press.
 * @returns {boolean} Whether they match, modifiers included.
 */
const matches = (shortcut, event) => {
    if (!!shortcut.ctrl !== !!(event.ctrlKey || event.metaKey)) return false;
    if (!!shortcut.alt !== !!event.altKey) return false;
    if (!!shortcut.shift !== !!event.shiftKey) return false;
    return shortcut.code ?
        event.code === shortcut.code :
        String(event.key).toLowerCase() === shortcut.key.toLowerCase();
};

export {
    TALK,
    VIEW_TOGGLE,
    altShift,
    control,
    matches,
    plain,
    shift
};
