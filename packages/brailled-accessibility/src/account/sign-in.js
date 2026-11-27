/*
 * Who is signed in, in an editor with accounts, and where their login token goes: to the AI server and nowhere
 * else. Signing in happens on the account page, in a tab of its own; the browser keeps the sign-in where both can
 * find it. In an editor without accounts all of this does nothing.
 */
import {accountSettings, SETTINGS_URL} from './settings.js';

const PAGE = 'account.html';

const loadSettings = async scope => {
    const response = await scope.fetch(SETTINGS_URL, {cache: 'no-store'});
    return accountSettings(response.ok ? await response.json() : null);
};

// Supabase's library is fetched only where there are accounts.
const connectClient = async settings => {
    const {createAccountClient} = await import('./client.js');
    return createAccountClient(settings, {inEditor: true});
};

const resolve = (address, scope) => {
    try {
        return new URL(address, scope.location?.href).href;
    } catch {
        return null;
    }
};

/**
 * @param {object} [options] Options.
 * @param {object} [options.scope] The window.
 * @param {function(object): Promise<?object>} [options.load] Reads the account settings.
 * @param {function(object): Promise<object>} [options.connect] Makes a Supabase client with them.
 * @returns {object} The sign-in. `getState` gives `{enabled, signedIn}`; `signedIn` is null until it is known.
 */
const createSignIn = ({scope = globalThis, load = loadSettings, connect = connectClient} = {}) => {
    const listeners = new Set();
    let state = {enabled: false, signedIn: null};
    let client = null;
    // The address of the AI server's requests, up to their names.
    let server = null;
    let ready = Promise.resolve();
    const set = changes => {
        if (Object.entries(changes).every(([key, value]) => state[key] === value)) return;
        state = {...state, ...changes};
        listeners.forEach(listener => listener());
    };

    const token = async () => {
        try {
            const {data} = await client.auth.getSession();
            return data?.session?.access_token ?? null;
        } catch {
            return null;
        }
    };

    const open = async () => {
        try {
            const settings = await load(scope);
            if (!settings) throw new Error('no account settings');
            client = await connect(settings);
            // Also told of what happens on the account page.
            client.auth.onAuthStateChange((event, session) => set({signedIn: !!session}));
            set({signedIn: !!await token()});
        } catch (error) {
            // eslint-disable-next-line no-console
            console.warn(`account: ${error.message}`);
            set({signedIn: false});
        }
    };

    // Whether the AI may not be asked until someone signs in.
    const required = () => state.enabled && state.signedIn === false;
    const forServer = address => !!server && !!resolve(address, scope)?.startsWith(server);
    // The options for a request, with the login token where the request is for the AI server.
    const authorised = async (address, options) => {
        if (!forServer(address)) return options;
        await ready;
        const current = client ? await token() : null;
        return current ?
            {...options, headers: {...options?.headers, Authorization: `Bearer ${current}`}} :
            options;
    };

    return {
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        // The AI server's address where the editor has accounts, or null.
        configure: ({endpoint}) => {
            const address = endpoint ? resolve(endpoint, scope) : null;
            const next = address && resolve('.', {location: {href: address}});
            if (next === server) return ready;
            server = next;
            set({enabled: !!server});
            if (server && !client) ready = open();
            return ready;
        },
        required,
        authorised,
        // `fetch` for the AI helper: nothing leaves for someone who has to sign in first, whatever asked for it.
        fetcher: fetch => async (address, options) => {
            if (!forServer(address)) return fetch(address, options);
            const sent = await authorised(address, options);
            if (required()) {
                return {ok: false, status: 401, json: () => Promise.resolve({error: 'sign_in_required'})};
            }
            return fetch(address, sent);
        },
        // Returns false where the browser would not open it, which it allows only after a key press or click.
        open: () => !!scope.open?.(PAGE, 'brailled-account'),
        signOut: async () => {
            await client?.auth.signOut().catch(() => {});
        }
    };
};

// The one sign-in of the page, which the menu bar and the actions share.
const signIn = createSignIn();

export {
    createSignIn,
    signIn
};
