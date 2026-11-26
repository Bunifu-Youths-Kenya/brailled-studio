/*
 * One provider (see `provider.js`) that is the browser's or the recorder, whichever is in use when it is asked
 * to listen.
 */
const createVoiceProviders = ({browser, recorder, online}) => {
    const recording = () => online.provider() !== 'browser';
    const current = () => (recording() ? recorder : browser);
    return {
        isSupported: () => current().isSupported(),
        records: recording,
        // Whether this browser could record at all.
        canRecord: () => recorder.isSupported(),
        listen: options => current().listen(options)
    };
};

export {
    createVoiceProviders
};
