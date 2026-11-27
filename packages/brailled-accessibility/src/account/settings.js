/*
 * Where the online editor's accounts are, read from `static/brailled-account.json`. Both values are public: the
 * database decides what anyone holding them may do.
 */
const SETTINGS_URL = 'static/brailled-account.json';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

const safeAddress = value => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname));
    } catch {
        return false;
    }
};

/**
 * @param {?object} file The file's contents.
 * @returns {?{supabaseUrl: string, publishableKey: string, email: boolean}} The settings, or null where they cannot
 * be used. Only a publishable key is taken, so that a secret one put there by mistake is not used. `email` is
 * whether accounts may be made with an email address and password, which needs an email service.
 */
const accountSettings = file => {
    const {supabaseUrl, publishableKey, email} = file || {};
    if (typeof supabaseUrl !== 'string' || !safeAddress(supabaseUrl)) return null;
    if (typeof publishableKey !== 'string' || !publishableKey.startsWith('sb_publishable_')) return null;
    return {supabaseUrl, publishableKey, email: email === true};
};

export {
    SETTINGS_URL,
    accountSettings
};
