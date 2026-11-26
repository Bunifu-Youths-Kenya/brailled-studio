/*
 * The place for a wake word engine that runs on the device, so that no sound leaves it until the assistant is
 * called. None is built in yet. See `engine.js` for what one must do.
 */
const createDeviceWakeWord = () => ({
    isSupported: () => false,
    start: ({onProblem}) => onProblem('unavailable'),
    stop: () => Promise.resolve()
});

export {
    createDeviceWakeWord
};
