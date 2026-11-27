/*
 * What the account page does. It holds what is shown; the page draws it. Errors are held as short names, which the
 * page says in its own words, as the service's words are not for students and can quote what was typed.
 */

// Why the service refused, by its code.
const REASONS = {
    invalid_credentials: 'credentials',
    email_not_confirmed: 'unconfirmed',
    user_already_exists: 'taken',
    weak_password: 'password',
    over_request_rate_limit: 'wait',
    over_email_send_rate_limit: 'wait'
};
const SHORTEST_PASSWORD = 8;

// This page, without anything that came with the visit: where Google and email links lead back to.
const pageOf = url => {
    const {origin, pathname} = new URL(url);
    return `${origin}${pathname}`;
};

const sentBackWithError = url => {
    const {searchParams, hash} = new URL(url);
    return searchParams.has('error') || new URLSearchParams(hash.slice(1)).has('error');
};

/**
 * @param {object} options Options.
 * @param {object} options.client A Supabase client.
 * @param {object} options.settings See `settings.js`.
 * @param {string} options.url The page's address.
 * @returns {object} `getState` gives `{view, busy, error, email, allowance}`. The views are `loading`, `signup`,
 * `login`, `check-email` and `signed-in`.
 */
const createAccount = ({client, settings, url}) => {
    const listeners = new Set();
    let state = {view: 'loading', busy: false, error: null, email: '', allowance: null};
    const set = changes => {
        state = {...state, ...changes};
        listeners.forEach(listener => listener());
    };

    const signedIn = async () => {
        let allowance = null;
        try {
            const {data, error} = await client.rpc('my_allowance');
            allowance = error ? null : data;
        } catch {
            allowance = null;
        }
        set({view: 'signed-in', busy: false, allowance, error: allowance ? null : 'allowance'});
    };
    const signedOut = () => set({view: 'login', busy: false, allowance: null, error: null});

    // Sends a form, saying why if the service refuses.
    const send = async (request, reason, done) => {
        set({busy: true, error: null});
        try {
            const {data, error} = await request();
            if (error) set({busy: false, error: reason(error)});
            else await done(data);
        } catch {
            set({busy: false, error: reason({})});
        }
    };
    const why = ({code}) => REASONS[code] || 'failed';

    return {
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        emailAllowed: settings.email,
        start: async () => {
            const refused = sentBackWithError(url);
            client.auth.onAuthStateChange((event, session) => {
                // The client must not be called from inside this notice.
                setTimeout(() => {
                    if (session && state.view !== 'signed-in') signedIn();
                    if (event === 'SIGNED_OUT' && state.view === 'signed-in') signedOut();
                }, 0);
            });
            const {data} = await client.auth.getSession().catch(() => ({data: null}));
            if (data?.session) await signedIn();
            else set({view: 'signup', error: refused ? 'google' : null});
        },
        show: view => set({view, error: null}),
        // The browser leaves for Google, so the page stays busy.
        google: () => send(
            () => client.auth.signInWithOAuth({provider: 'google', options: {redirectTo: pageOf(url)}}),
            () => 'google',
            () => {}),
        submit: async ({email = '', name = '', password = ''}) => {
            if (!settings.email || state.busy) return;
            const creating = state.view === 'signup';
            const address = email.trim();
            let missing = null;
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) missing = 'email';
            else if (creating && !name.trim()) missing = 'name';
            else if (password.length < (creating ? SHORTEST_PASSWORD : 1)) missing = 'password';
            if (missing) {
                set({error: missing});
                return;
            }
            if (creating) {
                await send(
                    () => client.auth.signUp({email: address,
                        password,
                        options: {data: {full_name: name.trim()}, emailRedirectTo: pageOf(url)}}),
                    why,
                    data => (data?.session ? signedIn() : set({view: 'check-email', email: address, busy: false})));
                return;
            }
            await send(() => client.auth.signInWithPassword({email: address, password}), why, signedIn);
        },
        signOut: async () => {
            await client.auth.signOut().catch(() => {});
            signedOut();
        }
    };
};

export {
    SHORTEST_PASSWORD,
    createAccount
};
