// The online editor with accounts: who is signed in, where the login token goes, and what is said. Supabase, the
// AI server and OpenAI are all stood in for.
import {createSignIn} from '../src/account/sign-in.js';
import {routeCommand} from '../src/actions/route.js';
import {createAssistant} from '../src/ai/assistant.js';
import {createLiveSession} from '../src/live/session.js';
import {createAiPorts} from '../src/proposals/ai-ports.js';
import {createProposalQueue} from '../src/proposals/queue.js';
import {createConfig} from '../src/config.js';
import {createOnlineVoice} from '../src/voice/online.js';
import {failure, setUp} from './proposal-setup.js';

const AI = 'https://abc.supabase.co/functions/v1/ai/assistant';
const TOKEN = 'login-token';
const settings = {supabaseUrl: 'https://abc.supabase.co', publishableKey: 'sb_publishable_abc', email: false};
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

// A sign-in with a stood-in Supabase. `change(token)` signs in, or out with null.
const signInWith = ({token = null, load = () => Promise.resolve(settings), open = () => ({})} = {}) => {
    let current = token;
    let listener = () => {};
    const session = () => (current ? {access_token: current} : null);
    const client = {auth: {
        getSession: jest.fn(() => Promise.resolve({data: {session: session()}})),
        onAuthStateChange: given => {
            listener = given;
        },
        signOut: jest.fn(() => {
            current = null;
            listener('SIGNED_OUT', null);
            return Promise.resolve({});
        })
    }};
    const scope = {open: jest.fn(open)};
    const signIn = createSignIn({scope, load, connect: jest.fn(() => Promise.resolve(client))});
    const change = next => {
        current = next;
        listener(next ? 'SIGNED_IN' : 'SIGNED_OUT', session());
    };
    return {signIn, client, change, scope};
};

describe('the sign-in', () => {
    test('does nothing in an editor without accounts', async () => {
        const {signIn, client} = signInWith({token: TOKEN});
        const options = {method: 'POST'};
        await expect(signIn.authorised(AI, options)).resolves.toBe(options);
        expect(signIn.required()).toBe(false);
        expect(signIn.getState()).toEqual({enabled: false, signedIn: null});
        expect(client.auth.getSession).not.toHaveBeenCalled();
    });

    test('asks a person who is not signed in to sign in', async () => {
        const {signIn} = signInWith();
        await signIn.configure({endpoint: AI});
        expect(signIn.getState()).toEqual({enabled: true, signedIn: false});
        expect(signIn.required()).toBe(true);
        await expect(signIn.authorised(AI, {headers: {a: 'b'}})).resolves.toEqual({headers: {a: 'b'}});
    });

    test.each(['assistant', 'voice-turn', 'speak', 'live-session', 'live-tool'])(
        'adds the login token to a request for %s', async name => {
            const {signIn} = signInWith({token: TOKEN});
            await signIn.configure({endpoint: AI});
            const sent = await signIn.authorised(AI.replace('assistant', name), {headers: {'Content-Type': 'x'}});
            expect(sent.headers).toEqual({'Content-Type': 'x', 'Authorization': `Bearer ${TOKEN}`});
        });

    test.each([
        'https://api.openai.com/v1/realtime/calls',
        'https://abc.supabase.co/rest/v1/profiles',
        'https://abc.supabase.co/functions/v1/ai-other/assistant',
        'https://abc.supabase.co.evil.example/functions/v1/ai/assistant',
        'https://evil.example/https://abc.supabase.co/functions/v1/ai/assistant',
        'https://abc.supabase.co/functions/v1/ai/../other',
        'static/brailled-voice/manifest.json'
    ])('never sends it to %s', async address => {
        const {signIn} = signInWith({token: TOKEN});
        await signIn.configure({endpoint: AI});
        const options = {headers: {Authorization: 'Bearer short-lived'}};
        await expect(signIn.authorised(address, options)).resolves.toBe(options);
    });

    test('waits to know who is signed in before the first request', async () => {
        const {signIn} = signInWith({token: TOKEN});
        const configured = signIn.configure({endpoint: AI});
        const sent = await signIn.authorised(AI, {});
        expect(sent.headers.Authorization).toBe(`Bearer ${TOKEN}`);
        await configured;
    });

    test('follows signing in and out, using the newest token', async () => {
        const {signIn, change} = signInWith();
        const seen = [];
        signIn.subscribe(() => seen.push(signIn.getState().signedIn));
        await signIn.configure({endpoint: AI});
        change('one');
        await settle();
        change('two');
        await settle();
        expect((await signIn.authorised(AI, {})).headers.Authorization).toBe('Bearer two');
        change(null);
        await settle();
        expect(seen).toEqual([null, false, true, false]);
    });

    test('takes a person to be signed out where the settings cannot be read', async () => {
        const {signIn} = signInWith({token: TOKEN, load: () => Promise.reject(new Error('missing'))});
        await signIn.configure({endpoint: AI});
        expect(signIn.getState()).toEqual({enabled: true, signedIn: false});
        await expect(signIn.authorised(AI, {})).resolves.toEqual({});
    });

    test('lets no request for the AI leave for someone not signed in, whatever asked for it', async () => {
        const {signIn, change} = signInWith();
        const fetch = jest.fn(() => Promise.resolve('answer'));
        const send = signIn.fetcher(fetch);
        // Even before it is known who is signed in.
        const configured = signIn.configure({endpoint: AI});
        const refused = await send(AI, {method: 'POST'});
        await configured;
        expect(fetch).not.toHaveBeenCalled();
        expect([refused.ok, refused.status, await refused.json()]).toEqual([false, 401, {error: 'sign_in_required'}]);
        await send('static/brailled-voice/manifest.json');
        expect(fetch).toHaveBeenCalledTimes(1);
        change(TOKEN);
        await settle();
        await expect(send(AI, {method: 'POST'})).resolves.toBe('answer');
        expect(fetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    test('leaves requests alone in an editor without accounts', async () => {
        const fetch = jest.fn(() => Promise.resolve('answer'));
        const options = {method: 'POST'};
        await expect(signInWith().signIn.fetcher(fetch)(AI, options)).resolves.toBe('answer');
        expect(fetch).toHaveBeenCalledWith(AI, options);
    });

    test('opens the page in a tab of its own, and says whether the browser let it', () => {
        const {signIn, scope} = signInWith();
        expect(signIn.open()).toBe(true);
        expect(scope.open).toHaveBeenCalledWith('account.html', 'brailled-account');
        expect(signInWith({open: () => null}).signIn.open()).toBe(false);
    });
});

describe('the configuration', () => {
    const read = async file => {
        const config = createConfig(() => Promise.resolve(file));
        await settle();
        return config.get();
    };

    test('has accounts only where the file says so and the AI helper is on', async () => {
        expect((await read({ai: true, aiEndpoint: AI, account: true})).account).toBe(true);
        expect((await read({ai: true, aiEndpoint: AI})).account).toBe(false);
        expect((await read({ai: true, aiEndpoint: AI, account: 'yes'})).account).toBe(false);
        expect((await read({account: true})).account).toBe(false);
    });

    test('uses the browser\'s speech while an online voice needs a sign-in', () => {
        const config = {get: () => ({voice: true, ai: true, speech: {provider: 'openai-live'}}),
            subscribe: () => () => {}};
        let signedOut = true;
        const online = createOnlineVoice(config, {signedOut: () => signedOut});
        expect([online.provider(), online.chosen()]).toEqual(['browser', 'openai-live']);
        signedOut = false;
        expect(online.provider()).toBe('openai-live');
    });
});

// The editor with accounts on, signed out unless given a token.
const editor = async ({token = null, respond} = {}) => {
    const account = signInWith({token});
    const parts = setUp({respond, account: account.signIn, school: {account: true, aiEndpoint: AI}});
    await jest.advanceTimersByTimeAsync(200);
    return {...parts, ...account};
};

describe('the editor with accounts', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('sends nothing for a person not signed in, and says how to sign in', async () => {
        const {app, fetch, heard, settle: wait} = await editor();
        expect(routeCommand(app, 'make my sprite say hello', 'typed')).toBe('sign-in');
        await wait();
        expect(fetch).not.toHaveBeenCalled();
        expect(heard.at(-1)).toBe('Sign in to use Mboni. Press Alt+Shift+A.');
    });

    test('asks nothing from the command box either', async () => {
        const {app, fetch, heard, settle: wait} = await editor();
        expect(app.ask('make my sprite say hello')).toBe(false);
        await wait();
        expect(fetch).not.toHaveBeenCalled();
        expect(heard.at(-1)).toBe('Sign in to use Mboni. Press Alt+Shift+A.');
    });

    test('still does what needs no account', async () => {
        const {app, heard, settle: wait} = await editor();
        routeCommand(app, 'what is my program', 'typed');
        await wait();
        expect(heard.at(-1)).toMatch(/^One script/);
    });

    test('asks the model for a person signed in', async () => {
        const {app, fetch, settle: wait} = await editor({token: TOKEN});
        routeCommand(app, 'what is a loop', 'typed');
        await wait();
        expect(fetch).toHaveBeenCalled();
    });

    test('says when someone signs in or out, but not what was so as it opened', async () => {
        const {change, heard, settle: wait} = await editor();
        await wait();
        expect(heard.join()).not.toMatch(/signed/i);
        change(TOKEN);
        await wait();
        expect(heard.at(-1)).toBe('You are signed in. You can ask Mboni now.');
        change(null);
        await wait();
        expect(heard.at(-1)).toBe('You are signed out.');
    });

    test('opens the sign-in page by its action, and says so', async () => {
        const {app, scope, heard, settle: wait} = await editor();
        routeCommand(app, 'sign in', 'typed');
        await wait();
        expect(scope.open).toHaveBeenCalled();
        expect(heard.at(-1)).toBe('The sign-in page is open in a new tab. Come back here when you have signed in.');
    });

    test('says what to press where the browser will not open the page', async () => {
        const {app, scope, heard, settle: wait} = await editor();
        scope.open.mockImplementation(() => null);
        app.perform('account.open');
        await wait();
        expect(heard.at(-1)).toBe('The browser did not let the page open. Press Alt+Shift+A.');
    });

    test('signs out by command', async () => {
        const {app, client, heard, settle: wait} = await editor({token: TOKEN});
        routeCommand(app, 'sign out', 'typed');
        await wait();
        expect(client.auth.signOut).toHaveBeenCalled();
        expect(heard.at(-1)).toBe('You are signed out.');
    });

    test('has no accounts to sign in to where the school has none', async () => {
        const {app} = setUp();
        expect(app.unavailable({available: () => 'noAccounts'})).toMatch(/no accounts/i);
        expect(app.snapshot).toBeDefined();
        app.perform('account.open');
        await jest.advanceTimersByTimeAsync(300);
    });

    test.each([
        [401, 'sign_in_required', 'Sign in to use Mboni. Press Alt+Shift+A.'],
        [429, 'daily_limit', 'You have used today’s requests to Mboni. They return tomorrow.'],
        [403, 'blocked', 'This account cannot use Mboni.'],
        [503, 'ai_off', 'Mboni is switched off for now.']
    ])('explains a typed request refused with %i %s', async (status, error, said) => {
        const {app, heard, settle: wait} = await editor({token: TOKEN, respond: () => failure(status, error)});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        routeCommand(app, 'what is a loop', 'typed');
        await wait(4000);
        expect(heard.at(-1)).toBe(said);
    });

    test.each([
        [401, 'sign_in_required', 'sign_in'],
        [429, 'daily_limit', 'daily_limit'],
        [403, 'blocked', 'blocked'],
        [503, 'ai_off', 'ai_off'],
        [429, 'too_many_requests', 'too_many']
    ])('knows why a spoken turn was refused with %i %s', async (status, error, problem) => {
        const {app} = await editor({token: TOKEN});
        const assistant = createAssistant({ports: createAiPorts(app, createProposalQueue().submitter),
            endpoint: AI,
            fetch: () => Promise.resolve(failure(status, error))});
        await expect(assistant.hear({audio: {data: '', format: 'wav'}, pending: true, model: 'm', provider: 'p'}))
            .resolves.toEqual({error: problem});
    });

    // The live voice, which is not started for someone who may not use it.
    const live = async ({token, reply} = {}) => {
        const parts = await editor({token});
        const fetch = jest.fn(() => Promise.resolve(reply));
        const scope = {fetch, navigator: {mediaDevices: {getUserMedia: jest.fn()}}, document: {}};
        const session = createLiveSession({app: parts.app, assistant: parts.assistant, endpoint: AI, scope});
        session.start();
        await parts.settle();
        return {...parts, fetch, scope, session};
    };

    test('does not start the live voice for a person not signed in', async () => {
        const {fetch, scope, session, heard} = await live({reply: failure(500, 'x')});
        expect(session.getState().phase).toBe('off');
        expect(fetch).not.toHaveBeenCalled();
        expect(scope.navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
        expect(heard.at(-1)).toBe('Sign in to use Mboni. Press Alt+Shift+A.');
    });

    test('sends the token to start the live voice, and says why it is refused', async () => {
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        const {fetch, heard} = await live({token: TOKEN, reply: failure(429, 'daily_limit')});
        expect(fetch.mock.calls[0][0]).toBe(AI.replace('assistant', 'live-session'));
        expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(heard.at(-1)).toBe('You have used today’s live voice sessions. Use the talk key, or type.');
    });
});
