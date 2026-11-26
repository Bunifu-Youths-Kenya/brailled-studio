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
// The keys to choose from for holding while speaking. `name` is the key alone.
const TALK_KEYS = {
    f2: {key: 'F2', hold: true, name: 'F2', label: 'hold F2'},
    altShiftV: {...altShift('V'), hold: true, name: 'Alt+Shift+V', label: 'hold Alt+Shift+V'}
};

/**
 * Whether letting this key up ends holding a shortcut: its own key, or one of its modifiers.
 * @param {Shortcut} shortcut The shortcut.
 * @param {KeyboardEvent} event The key release.
 * @returns {boolean} Whether the shortcut is no longer held.
 */
const releases = (shortcut, event) => {
    if (!shortcut.code) return event.key === shortcut.key;
    return event.code === shortcut.code || (!!shortcut.alt && event.key === 'Alt') ||
        (!!shortcut.shift && event.key === 'Shift');
};

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
    TALK_KEYS,
    VIEW_TOGGLE,
    altShift,
    control,
    matches,
    plain,
    releases,
    shift
};
