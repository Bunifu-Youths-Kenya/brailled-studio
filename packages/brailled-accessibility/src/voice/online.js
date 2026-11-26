/*
 * Whose service hears and speaks. The school's choice applies where it can; once an online provider has failed,
 * the browser's is used until the page is reloaded.
 */
const createOnlineVoice = config => {
    const listeners = new Set();
    let failed = false;
    // The one the school chose.
    const chosen = () => config.get().speech?.provider ?? 'browser';
    return {
        chosen,
        // The one in use now.
        provider: () => {
            const {voice, ai} = config.get();
            return voice === true && ai && !failed ? chosen() : 'browser';
        },
        hasFallenBack: () => failed,
        fallBack: () => {
            if (failed) return;
            failed = true;
            listeners.forEach(listener => listener());
        },
        subscribe: listener => {
            listeners.add(listener);
            const configured = config.subscribe(listener);
            return () => {
                listeners.delete(listener);
                configured();
            };
        }
    };
};

export {
    createOnlineVoice
};
