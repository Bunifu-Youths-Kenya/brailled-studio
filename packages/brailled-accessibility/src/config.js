/*
 * What whoever runs the editor allows, read from `static/brailled-config.json` when the editor starts, so that
 * it can be changed without rebuilding. Anything that cannot be read is off.
 */
const CONFIG_URL = 'static/brailled-config.json';

// `voice` is null until the file has been read.
const LOADING = Object.freeze({voice: null, unreadable: false});
const UNREADABLE = Object.freeze({voice: false, unreadable: true});

// Only a plain `true` turns something on.
const interpret = file => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) return UNREADABLE;
    return {voice: file.voice === true, unreadable: false};
};

/**
 * @param {function(): Promise<object>} [load] Gives the file's contents. Without it everything is off.
 * @returns {{get: Function, subscribe: Function}} The configuration, which changes once, when it has loaded.
 */
const createConfig = load => {
    const listeners = new Set();
    let state = load ? LOADING : interpret({});
    const settle = next => {
        state = next;
        listeners.forEach(listener => listener());
    };
    if (load) load().then(file => settle(interpret(file)), () => settle(UNREADABLE));
    return {
        get: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};

// Reads the file from beside the editor, never from a cache, so that a change applies on the next visit.
const fetchConfig = scope => async () => {
    const response = await scope.fetch(CONFIG_URL, {cache: 'no-store'});
    if (!response.ok) throw new Error(`${CONFIG_URL}: ${response.status}`);
    return response.json();
};

export {
    CONFIG_URL,
    createConfig,
    fetchConfig
};
