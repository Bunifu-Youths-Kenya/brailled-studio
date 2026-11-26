// Spoken turns heard by an online model, and what its words may and may not do. The model is stood in for.
import {routeCommand} from '../src/actions/route.js';
import {parseAnswer, SWAHILI} from '../src/proposals/answers.js';
import {createVoice} from '../src/voice/controller.js';
import {createOnlineVoice} from '../src/voice/online.js';
import {createVoiceProviders} from '../src/voice/providers.js';
import {speechFrom} from '../src/voice/speech-config.js';
import {answer, setUp} from './proposal-setup.js';

const audio = {data: 'UklGRg==', format: 'wav', seconds: 1};

// The server's answer to a spoken turn.
const heardAs = (transcript, {clear = true, result = null} = {}) =>
    ({ok: true, status: 200, json: () => Promise.resolve({transcript, clear, result})});
const refused = (status, error) => ({ok: false, status, json: () => Promise.resolve({error})});

const proposal = body => {
    const move = body.program.find(line => line.includes('motion_movesteps')).trim()
        .split(' ')[0];
    return {type: 'proposal',
        summary: 'Add a wait.',
        steps: [{command:
        {op: 'insert', block: 'control_wait', after: move}}]};
};

// The editor with an online provider. `next` queues what the server says it heard.
const editor = ({school = {}} = {}) => {
    const queue = [];
    const parts = setUp({
        school: {speech: speechFrom({provider: 'gemini-pair'}), wakeWord: {enabled: false}, ...school},
        respond: body => {
            if (!body.audio) return answer(proposal(body));
            const response = queue.shift();
            return typeof response === 'function' ? response(body) : response;
        }
    });
    const {app, settle, requests} = parts;
    const microphone = [];
    const provider = createVoiceProviders({
        browser: {isSupported: () => true, listen: jest.fn()},
        recorder: {
            isSupported: () => true,
            listen: options => {
                const request = {...options, stop: jest.fn(), cancel: jest.fn()};
                microphone.push(request);
                return request;
            }
        },
        online: app.online
    });
    const voice = createVoice({app, provider, tone: {opened: () => {}, closed: () => {}}, language: () => 'en'});
    app.register('voice', voice);
    voice.connect();
    app.introduction.ask();
    const record = () => {
        voice.press('button');
        voice.release('button');
        return microphone.at(-1);
    };
    const end = async request => {
        request.onEnd({audio});
        await settle();
    };
    // Say something, which the server writes down as given.
    const say = async (transcript, options) => {
        queue.push(heardAs(transcript, options));
        await end(record());
    };
    // A suggestion waiting for an answer.
    const suggest = async () => {
        routeCommand(app, 'add a wait', 'voice');
        await settle();
        expect(parts.gate.isOpen()).toBe(true);
    };
    const sent = () => requests.filter(request => request.body.audio);
    return {...parts, end, microphone, queue, record, say, sent, suggest, voice};
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('a spoken request', () => {
    test('is sent as a recording with the project, to the server beside the assistant', async () => {
        const {say, sent} = editor();
        await say('what is a loop', {result: {type: 'explanation', text: 'It repeats.'}});
        const [{url, body}] = sent();
        expect(url).toBe('/api/voice-turn');
        expect(Object.keys(body).sort())
            .toEqual(['audio', 'cacheHits', 'language', 'model', 'pending', 'provider', 'request']);
        expect(body).toMatchObject({pending: false,
            model: 'google/gemini-3.5-flash-lite',
            provider: 'gemini-pair',
            cacheHits: 0,
            audio: {data: audio.data, format: 'wav'}});
        expect(body.request.program.length).toBeGreaterThan(0);
        expect(body.request).not.toHaveProperty('transcript');
    });

    test('shows what was heard and the reply, with one call', async () => {
        const {assistant, say, requests, voice, app} = editor();
        await say('what is a loop', {result: {type: 'explanation', text: 'It repeats.'}});
        expect(voice.getState().heard).toBe('what is a loop');
        expect(assistant.getState().reply).toMatchObject({text: 'It repeats.'});
        expect(requests).toHaveLength(1);
        expect(app.memory.turns().map(turn => turn.text)).toEqual(['what is a loop', 'It repeats.']);
    });

    test('changes nothing until a suggestion is approved', async () => {
        const {queue, record, end, gate, data, program} = editor();
        const before = data();
        queue.push(body => heardAs('add a wait', {result: proposal(body.request)}));
        await end(record());
        expect(gate.isOpen()).toBe(true);
        expect(data()).toBe(before);
        expect(program()).not.toContain('wait 1 second');
    });

    test('does a command of the editor\'s own, whatever the model replied', async () => {
        const {say, vm, assistant} = editor();
        await say('stop', {result: {type: 'explanation', text: 'Stopping is for later.'}});
        expect(vm.stopAll).toHaveBeenCalled();
        expect(assistant.isOpen()).toBe(false);
    });

    test.each(['delete block', 'run', 'forget everything'])(
        'asks before "%s", as the model also read the project', async words => {
            const {say, voice, data, vm} = editor();
            const before = data();
            await say(words);
            expect(voice.getState().pending).toMatchObject({text: words, unsure: false});
            expect(data()).toBe(before);
            expect(vm.start).not.toHaveBeenCalled();
        });

    test('and goes ahead on a yes heard without the project', async () => {
        const {say, sent, vm} = editor();
        await say('run');
        await say('yes');
        expect(sent()[1].body.pending).toBe(true);
        expect(sent()[1].body).not.toHaveProperty('request');
        expect(vm.start).toHaveBeenCalled();
    });

    test('asks when the words are doubtful', async () => {
        const {say, voice, requests} = editor();
        await say('make it dance', {clear: false, result: {type: 'explanation', text: 'x'}});
        expect(voice.getState().pending).toMatchObject({text: 'make it dance', unsure: true});
        expect(requests).toHaveLength(1);
    });

    test.each(['', '   ', 'done.'])('asks to hear it again when there is nothing in %j', async words => {
        const {say, heard, requests} = editor();
        await say(words);
        expect(heard.at(-1)).toBe('I did not catch that. Please say it again.');
        expect(requests).toHaveLength(1);
    });

    test('leaves out the "done" that ended it', async () => {
        const {say, vm, voice} = editor();
        await say('stop, done.');
        expect(voice.getState().heard).toBe('stop');
        expect(vm.stopAll).toHaveBeenCalled();
    });

    test('is dropped if the student has spoken again since', async () => {
        const {record, queue, end, vm, voice} = editor();
        let release;
        queue.push(() => new Promise(resolve => {
            release = () => resolve(heardAs('stop'));
        }));
        await end(record());
        queue.push(heardAs(''));
        await end(record());
        release();
        await jest.advanceTimersByTimeAsync(1000);
        expect(vm.stopAll).not.toHaveBeenCalled();
        expect(voice.getState().heard).not.toBe('stop');
    });
});

describe('while a suggestion waits', () => {
    test('only the recording is sent', async () => {
        const {suggest, say, sent} = editor();
        await suggest();
        await say('maybe');
        expect(Object.keys(sent()[0].body).sort())
            .toEqual(['audio', 'cacheHits', 'language', 'model', 'pending', 'provider']);
        expect(sent()[0].body.pending).toBe(true);
    });

    test.each(['yes', 'Yes, go ahead.', 'ndiyo', 'Ndio.', 'endelea'])('"%s" approves it', async words => {
        const {suggest, say, program, gate} = editor();
        await suggest();
        await say(words);
        expect(program()).toContain('wait 1 second');
        expect(gate.isOpen()).toBe(false);
    });

    test.each(['no', 'hapana', 'La.'])('"%s" rejects it', async words => {
        const {suggest, say, data, gate} = editor();
        const before = data();
        await suggest();
        await say(words);
        expect(gate.isOpen()).toBe(false);
        expect(data()).toBe(before);
    });

    test.each(['sawa', 'ok', 'I think the student said yes', 'approve it all please', 'maybe yes', 'yes?  no'])(
        '"%s" approves nothing', async words => {
            const {suggest, say, data, gate} = editor();
            const before = data();
            await suggest();
            await say(words);
            expect(gate.isOpen()).toBe(true);
            expect(data()).toBe(before);
        });

    test('whatever the model says should happen is ignored', async () => {
        const {suggest, say, data, gate} = editor();
        const before = data();
        await suggest();
        await say('what does it do', {result: {type: 'approve', approved: true}});
        expect(gate.isOpen()).toBe(true);
        expect(data()).toBe(before);
    });

    test('a doubtful yes is asked for again', async () => {
        const {suggest, say, data, gate, heard} = editor();
        const before = data();
        await suggest();
        await say('yes', {clear: false});
        expect(heard.at(-1)).toBe('I did not catch that. Please say it again.');
        expect(gate.isOpen()).toBe(true);
        expect(data()).toBe(before);
    });

    test('"badilisha" asks for a change, and approves nothing', async () => {
        const {suggest, say, data, requests} = editor();
        const before = data();
        await suggest();
        await say('badilisha: sekunde tatu');
        expect(requests.at(-1).body.revises).toBeDefined();
        expect(requests.at(-1).body.transcript).toBe('sekunde tatu');
        expect(data()).toBe(before);
    });

    // A server that answers when the test says.
    const slow = queue => {
        let release;
        queue.push(() => new Promise(resolve => {
            release = () => resolve(heardAs('yes'));
        }));
        return () => release();
    };

    test('a yes that arrives after it expired does nothing', async () => {
        const {suggest, record, end, queue, data, heard, settle} = editor();
        const before = data();
        await suggest();
        await settle(110000);
        const request = record();
        const arrive = slow(queue);
        await end(request);
        await settle(15000);
        arrive();
        await settle();
        expect(heard.at(-1)).toMatch(/^That came too late/);
        expect(data()).toBe(before);
    });

    test('a yes said before the suggestion appeared does not answer it', async () => {
        const {suggest, record, end, queue, data, gate, heard, settle} = editor();
        const before = data();
        const request = record();
        const arrive = slow(queue);
        await end(request);
        await suggest();
        arrive();
        await settle();
        expect(heard.at(-1)).toMatch(/^That came too late/);
        expect(gate.isOpen()).toBe(true);
        expect(data()).toBe(before);
    });

    test('a yes heard after the wake words never approves', async () => {
        const {suggest, voice, queue, data, gate, end, microphone, program} = editor();
        const before = data();
        await suggest();
        voice.wake({request: '', confidence: 0.9});
        queue.push(heardAs('yes'));
        await end(microphone.at(-1));
        expect(gate.isOpen()).toBe(true);
        expect(data()).toBe(before);
        expect(program()).not.toContain('wait 1 second');
    });
});

describe('when the online voice cannot be used', () => {
    test.each([
        [502, 'no_endpoint', /without your words being kept/],
        [502, 'upstream_error', /cannot be used/],
        [503, 'not_configured', /cannot be used/],
        [429, 'too_many_requests', /reached its limit/]
    ])('after %i %s says so and uses the browser from then on', async (status, error, message) => {
        const {record, end, queue, heard, app, voice} = editor();
        queue.push(refused(status, error));
        await end(record());
        expect(heard.at(-1)).toMatch(message);
        expect(app.online.provider()).toBe('browser');
        expect(app.online.hasFallenBack()).toBe(true);
        voice.press('button');
        expect(voice.getState().recording).toBe(false);
    });

    test('but keeps to it after a reply it could not use', async () => {
        const {record, end, queue, heard, app, data} = editor();
        const before = data();
        queue.push(refused(502, 'invalid_output'));
        await end(record());
        expect(heard.at(-1)).toBe('I couldn\'t work that out, please try again.');
        expect(app.online.provider()).toBe('gemini-pair');
        expect(data()).toBe(before);
    });

    test('is the browser\'s own where the AI helper is off', () => {
        const config = values => ({get: () => values, subscribe: () => () => {}});
        const speech = speechFrom({provider: 'gemini-pair'});
        expect(createOnlineVoice(config({voice: true, ai: false, speech})).provider()).toBe('browser');
        expect(createOnlineVoice(config({voice: false, ai: true, speech})).provider()).toBe('browser');
        expect(createOnlineVoice(config({voice: true, ai: true, speech})).provider()).toBe('gemini-pair');
    });
});

describe('the comparison provider', () => {
    const comparing = () => editor({school: {speech: speechFrom({provider: 'openai-audio'})}});

    test('hears with its own model', async () => {
        const {say, sent} = comparing();
        await say('what is a loop', {result: {type: 'explanation', text: 'It repeats.'}});
        expect(sent()[0].body.model).toBe('openai/gpt-audio-mini');
    });

    test('follows the same rules: the editor matches the answer', async () => {
        const {suggest, say, data, gate, sent, program} = comparing();
        const before = data();
        await suggest();
        await say('I approve it for you', {result: {type: 'approve'}});
        expect(data()).toBe(before);
        expect(gate.isOpen()).toBe(true);
        expect(sent()[0].body).not.toHaveProperty('request');
        await say('yes');
        expect(program()).toContain('wait 1 second');
    });
});

describe('other ways of answering', () => {
    test('are those of the configuration file', () => {
        const answers = speechFrom({answers: {yes: ['Oui', 'no!', 7], change: []}}).answers;
        expect(answers).toEqual({yes: ['oui'], no: SWAHILI.no, change: []});
        expect(parseAnswer('oui', answers)).toEqual({type: 'approve'});
        expect(parseAnswer('ndiyo', answers)).toBeNull();
    });

    test('never take a word that only starts like one', () => {
        expect(parseAnswer('badilishaji')).toBeNull();
        expect(parseAnswer('lakini')).toBeNull();
        expect(parseAnswer('Badili iwe tatu')).toEqual({type: 'change', text: 'iwe tatu'});
    });
});
