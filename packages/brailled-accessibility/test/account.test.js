// The sign-up and sign-in page's own logic, with Supabase stood in for. No real service.
import {createAccount} from '../src/account/controller.js';
import {accountSettings} from '../src/account/settings.js';

const file = {supabaseUrl: 'https://abc.supabase.co', publishableKey: 'sb_publishable_abc'};

describe('the account settings', () => {
    test('give the project, its public key, and Google alone unless email is switched on', () => {
        expect(accountSettings(file)).toEqual({...file, email: false});
        expect(accountSettings({...file, email: true}).email).toBe(true);
        expect(accountSettings({...file, email: 'yes'}).email).toBe(false);
    });

    test('accept a project on this computer, for testing', () => {
        expect(accountSettings({...file, supabaseUrl: 'http://localhost:54331'})).not.toBeNull();
    });

    test.each([
        ['nothing', null],
        ['no address', {publishableKey: 'sb_publishable_abc'}],
        ['an address that is not encrypted', {...file, supabaseUrl: 'http://abc.supabase.co'}],
        ['no key', {supabaseUrl: file.supabaseUrl}],
        ['the secret key, which must never reach a browser', {...file, publishableKey: 'sb_secret_abc'}],
        ['an old kind of key, which may be the secret one', {...file, publishableKey: 'eyJhbGciOi.x.y'}]
    ])('are none for %s', (_, given) => {
        expect(accountSettings(given)).toBeNull();
    });
});

const allowance = {name: 'Amina',
    admin: false,
    requests_used: 2,
    requests_limit: 50,
    live_sessions_used: 0,
    live_sessions_limit: 3,
    blocked: false,
    ai_enabled: true};
const session = {user: {email: 'a@example.org'}};
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

const setUp = ({signedIn = false, settings = {...file, email: false}, url = 'https://x.org/playground/account.html',
    answers = {}} = {}) => {
    let listener = null;
    const ok = data => Promise.resolve({data, error: null});
    const client = {
        auth: {
            getSession: jest.fn(() => ok({session: signedIn ? session : null})),
            onAuthStateChange: jest.fn(given => {
                listener = given;
                return {data: {subscription: {unsubscribe: () => {}}}};
            }),
            signInWithOAuth: jest.fn(() => answers.google ?? ok({url: 'https://accounts.google.com'})),
            signUp: jest.fn(() => answers.signUp ?? ok({session: null})),
            signInWithPassword: jest.fn(() => answers.signIn ?? ok({session})),
            signOut: jest.fn(() => ok(null))
        },
        rpc: jest.fn(() => answers.allowance ?? ok(allowance))
    };
    const account = createAccount({client, settings, url});
    return {account, client, change: (event, next) => listener(event, next), state: () => account.getState()};
};

const failed = code => Promise.resolve({data: {}, error: {code, message: `internal words about ${code}`}});

describe('the account page', () => {
    test('offers to create an account to someone not signed in', async () => {
        const {account, state} = setUp();
        expect(state().view).toBe('loading');
        await account.start();
        expect(state()).toMatchObject({view: 'signup', error: null});
    });

    test('shows someone signed in what they may still use', async () => {
        const {account, client, state} = setUp({signedIn: true});
        await account.start();
        expect(state()).toMatchObject({view: 'signed-in', allowance});
        expect(client.rpc).toHaveBeenCalledWith('my_allowance');
    });

    test('still says they are signed in where the allowance cannot be read', async () => {
        const {account, state} = setUp({signedIn: true, answers: {allowance: failed('x')}});
        await account.start();
        expect(state()).toMatchObject({view: 'signed-in', allowance: null, error: 'allowance'});
    });

    test('sends the student to Google, to come back to this page', async () => {
        const {account, client, state} = setUp({url: 'https://x.org/playground/account.html?code=old#there'});
        await account.start();
        await account.google();
        expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({provider: 'google',
            options: {redirectTo: 'https://x.org/playground/account.html'}});
        expect(state().busy).toBe(true);
    });

    test('says where Google cannot be reached, and can be tried again', async () => {
        const {account, state} = setUp({answers: {google: failed('x')}});
        await account.start();
        await account.google();
        expect(state()).toMatchObject({busy: false, error: 'google'});
    });

    test.each([
        'https://x.org/account.html?error=access_denied&error_description=secret+words',
        'https://x.org/account.html#error=server_error'
    ])('says that signing in did not work where Google sends back an error', async url => {
        const {account, state} = setUp({url});
        await account.start();
        expect(state()).toMatchObject({view: 'signup', error: 'google'});
        expect(JSON.stringify(state())).not.toContain('secret');
    });

    test('notices when the sign-in arrives, and when it ends', async () => {
        const {account, change, state} = setUp();
        await account.start();
        change('SIGNED_IN', session);
        await settle();
        expect(state()).toMatchObject({view: 'signed-in', allowance});
        change('SIGNED_OUT', null);
        await settle();
        expect(state()).toMatchObject({view: 'login', allowance: null});
    });

    test('signs out', async () => {
        const {account, client, state} = setUp({signedIn: true});
        await account.start();
        await account.signOut();
        expect(client.auth.signOut).toHaveBeenCalled();
        expect(state()).toMatchObject({view: 'login', allowance: null});
    });

    test('goes between creating an account and logging in, dropping any error', async () => {
        const {account, state} = setUp({answers: {google: failed('x')}});
        await account.start();
        await account.google();
        account.show('login');
        expect(state()).toMatchObject({view: 'login', error: null});
    });

    test('takes no email address while email is off', async () => {
        const {account, client} = setUp();
        await account.start();
        await account.submit({email: 'a@example.org', name: 'A', password: 'long enough'});
        expect(client.auth.signUp).not.toHaveBeenCalled();
    });

    const email = {...file, email: true};
    const form = {email: ' a@example.org ', name: ' Amina ', password: 'long enough'};

    test.each([
        ['email', {...form, email: 'amina'}],
        ['name', {...form, name: '  '}],
        ['password', {...form, password: 'short'}]
    ])('explains a missing %s, sending nothing', async (error, given) => {
        const {account, client, state} = setUp({settings: email});
        await account.start();
        await account.submit(given);
        expect(state().error).toBe(error);
        expect(client.auth.signUp).not.toHaveBeenCalled();
    });

    test('creates an account by email, and asks the student to confirm it', async () => {
        const {account, client, state} = setUp({settings: email});
        await account.start();
        await account.submit(form);
        expect(client.auth.signUp).toHaveBeenCalledWith({email: 'a@example.org',
            password: 'long enough',
            options: {data: {full_name: 'Amina'}, emailRedirectTo: 'https://x.org/playground/account.html'}});
        expect(state()).toMatchObject({view: 'check-email', email: 'a@example.org', busy: false});
    });

    test.each([
        ['invalid_credentials', 'credentials'],
        ['email_not_confirmed', 'unconfirmed'],
        ['over_request_rate_limit', 'wait'],
        ['something_else', 'failed']
    ])('says in its own words why logging in failed: %s', async (code, error) => {
        const {account, state} = setUp({settings: email, answers: {signIn: failed(code)}});
        await account.start();
        account.show('login');
        await account.submit(form);
        expect(state()).toMatchObject({view: 'login', error, busy: false});
        expect(JSON.stringify(state())).not.toContain('internal words');
    });

    test('logs in by email', async () => {
        const {account, state} = setUp({settings: email});
        await account.start();
        account.show('login');
        await account.submit({...form, name: ''});
        await settle();
        expect(state().view).toBe('signed-in');
    });
});
