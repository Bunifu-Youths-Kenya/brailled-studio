// Checks the online project from outside, as a signed-in person would. It asks the model for real, which costs a
// little credit.
//
// First, in the Supabase dashboard: add a user under Authentication (confirmed), who must not be an admin. Their
// limit must leave exactly two requests today: for a new user, set that profile's daily_requests to 2. The script
// says what to set where it differs, before asking the model anything. Then, from the repository root:
//
//   node supabase/tests/hosted.mjs <publishable key> <the user's email>
//
// It asks for the password without showing it. Remove the user afterwards.
import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';

const PROJECT = 'https://rwevlhclrbwwdgahfwpk.supabase.co';
const SITE = 'http://localhost:8601';
const [key, email] = process.argv.slice(2);
if (!key?.startsWith('sb_publishable_') || !email) {
    console.error('usage: node supabase/tests/hosted.mjs <publishable key, never the secret one> <email>');
    process.exit(2);
}

const password = await new Promise(resolve => {
    let hidden = false;
    const output = new Writable({write: (chunk, _, done) => {
        if (!hidden) process.stdout.write(chunk);
        done();
    }});
    const ask = createInterface({input: process.stdin, output, terminal: true});
    ask.question('Password of the test user: ', answer => {
        ask.close();
        process.stdout.write('\n');
        resolve(answer);
    });
    hidden = true;
});

let failed = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  [${detail}]` : ''}`);
};

const request = {transcript: 'add a move block', mode: 'build', history: [], language: 'en', assistantName: 'Mboni',
    context: {view: {tab: 'code', scripts: 'outline'}, sprite: {name: 'Sprite1', isStage: false}},
    program: ['script 1', '  b1 event_whenflagclicked: when green flag clicked'], data: [], names: ['sprites: Sprite1'],
    blocks: ['motion_movesteps (stack) "move 10 steps" STEPS=number'],
    actions: [{id: 'project.run', name: 'run', description: 'Starts the project.'}], spriteCategories: ['animals']};
const assist = async (token, origin = SITE) => {
    const response = await fetch(`${PROJECT}/functions/v1/ai/assistant`, {method: 'POST', body: JSON.stringify(request),
        headers: {'Content-Type': 'application/json', 'Origin': origin, 'apikey': key,
            ...(token ? {Authorization: `Bearer ${token}`} : {})}});
    const body = await response.json().catch(() => null);
    return {status: response.status, body, said: `${response.status} ${body?.error ?? body?.reply?.type ?? ''}`};
};
const rest = async (token, path, options = {}) => {
    const response = await fetch(`${PROJECT}/rest/v1/${path}`, {...options,
        headers: {'apikey': key, 'Content-Type': 'application/json', 'Prefer': 'return=representation',
            ...(token ? {Authorization: `Bearer ${token}`} : {}), ...options.headers}});
    return {status: response.status, body: await response.json().catch(() => null)};
};
const allowance = token => rest(token, 'rpc/my_allowance', {method: 'POST', body: '{}'}).then(r => r.body);

let reply = await assist(null);
check('without signing in, the AI is refused', reply.status === 401, reply.said);
reply = await assist('made-up-token');
check('so is a made-up token', reply.status === 401, reply.said);

const signIn = await fetch(`${PROJECT}/auth/v1/token?grant_type=password`, {method: 'POST',
    headers: {'apikey': key, 'Content-Type': 'application/json'}, body: JSON.stringify({email, password})});
const session = await signIn.json();
if (!session.access_token) {
    console.error(`Could not sign in: ${session.error_code ?? signIn.status}`);
    process.exit(1);
}
const token = session.access_token;
reply = await assist(token, 'https://elsewhere.example');
check('another web page is refused', reply.status === 403, reply.said);

const before = await allowance(token);
check('the allowance can be read', Number.isInteger(before?.requests_used),
    `${before?.requests_used} of ${before?.requests_limit ?? 'no limit'}`);
if (before.admin || before.requests_limit - before.requests_used !== 2) {
    console.log(before.admin ?
        '\nThis user is an admin, who has no limit. Set their role to "user" and run again.' :
        `\nSet this user's daily_requests to ${before.requests_used + 2} in the profiles table, save, and run ` +
        'again. No request has been spent.');
    process.exit(2);
}
for (let number = 1; number <= 2; number++) {
    reply = await assist(token);
    check(`request ${number} of 2 is answered`, reply.status === 200, reply.said);
}
reply = await assist(token);
check('the third is refused for the day', reply.status === 429 && reply.body?.error === 'daily_limit', reply.said);
const after = await allowance(token);
check('two are counted', after?.requests_used === before.requests_used + 2, `${after?.requests_used}`);

// Each change names its row, as the database refuses any change that does not, whoever asks.
let change = await rest(token, `profiles?id=eq.${session.user.id}`, {method: 'PATCH', body: '{"role":"admin"}'});
check('a person cannot make themselves an admin', (change.status === 401 || change.status === 403) &&
    (await allowance(token))?.admin === false, `${change.status}`);
change = await rest(token, `profiles?id=eq.${session.user.id}`, {method: 'PATCH', body: '{"daily_requests":1000}'});
check('nor raise their own limit', change.status === 401 || change.status === 403, `${change.status}`);
change = await rest(token, 'usage_daily?requests=gte.0', {method: 'PATCH', body: '{"requests":0}'});
check('nor reset their usage', change.status === 401 || change.status === 403, `${change.status}`);
change = await rest(token, 'rpc/return_quota', {method: 'POST',
    body: JSON.stringify({p_user: session.user.id, p_requests: 100})});
check('nor give themselves more', change.status >= 400, `${change.status}`);

console.log(failed ? `\n${failed} checks failed` : '\nAll checks passed');
process.exitCode = failed ? 1 : 0;
