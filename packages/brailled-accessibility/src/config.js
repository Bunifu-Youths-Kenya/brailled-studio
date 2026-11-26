/*
 * What whoever runs the editor allows, read from `static/brailled-config.json` when the editor starts, so that
 * it can be changed without rebuilding. Anything that cannot be read is off.
 */
const CONFIG_URL = 'static/brailled-config.json';

// `voice` is null until the file has been read.
const LOADING = Object.freeze({voice: null, aiEndpoint: null, unreadable: false});
const UNREADABLE = Object.freeze({voice: false, aiEndpoint: null, unreadable: true});

// Hosts where an unencrypted address stays on this computer.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// Students' words must not cross a network unencrypted: https, this computer, or the editor's own server.
const endpointFrom = value => {
    if (typeof value !== 'string') return null;
    if (/^\/(?!\/)/.test(value)) return value;
    try {
        const url = new URL(value);
        const local = url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname);
        return url.protocol === 'https:' || local ? url.href : null;
    } catch {
        return null;
    }
};

// Only a plain `true` turns voice on, and only a safe address turns the AI helper on.
const interpret = file => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) return UNREADABLE;
    return {voice: file.voice === true, aiEndpoint: endpointFrom(file.aiEndpoint), unreadable: false};
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
