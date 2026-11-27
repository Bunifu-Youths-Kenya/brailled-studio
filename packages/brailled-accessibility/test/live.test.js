// OpenAI's live voice in the editor, with WebRTC, the microphone and both servers stood in for. No real service.
import {createLiveSession} from '../src/live/session.js';
import {answer, setUp} from './proposal-setup.js';

const talk = {enabled: true, voiceApproval: true, idleSeconds: 20};
// A suggestion to wait after the move block, as the model would make it.
const waiting = body => ({
    type: 'proposal',
    summary: 'Wait a bit.',
    steps: [{command: {
        op: 'insert',
        block: 'control_wait',
        after: body.program.find(line => line.includes(' motion_movesteps:')).trim()
            .split(' ')[0]
    }}]
});

// A browser with WebRTC and a microphone, and the AI server and OpenAI behind fetch.
const browser = ({session = () => answer(null), tool = () => ({text: 'Found.'})} = {}) => {
    const sent = [];
    const track = {stop: jest.fn()};
    const channel = {
        readyState: 'open',
        send: jest.fn(text => sent.push(JSON.parse(text))),
        close: jest.fn()
    };
    class Connection {
        createDataChannel (label) {
            channel.label = label;
            return channel;
        }
        addTrack () {}
        createOffer () {
            return Promise.resolve({sdp: 'offer'});
        }
        setLocalDescription () {
            return Promise.resolve();
        }
        setRemoteDescription () {
            setTimeout(() => channel.onopen(), 0);
            return Promise.resolve();
        }
        close () {}
    }
    const asked = [];
    const json = body => Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
    const scope = {
        RTCPeerConnection: Connection,
        document: {createElement: () => ({})},
        navigator: {mediaDevices: {getUserMedia: jest.fn(() => Promise.resolve({getTracks: () => [track]}))}},
        fetch: jest.fn((url, options) => {
            asked.push({url, options});
            if (url.endsWith('/live-session')) return session(JSON.parse(options.body));
            if (url.endsWith('/live-tool')) return json(tool(JSON.parse(options.body)));
            return Promise.resolve({ok: true, status: 200, text: () => Promise.resolve('answer')});
        })
    };
    // An event from the live model.
    const event = data => channel.onmessage({data: JSON.stringify(data)});
    const said = () => sent.filter(item => item.type === 'conversation.item.create' && item.item.role === 'system')
        .map(item => item.item.content[0].text);
    const replies = () => sent.filter(item => item.type === 'response.create').length;
    return {scope, sent, said, replies, event, asked, track, json};
};

const live = (options = {}) => {
    const fake = browser(options);
    const parts = setUp({school: {conversation: talk}});
    const session = createLiveSession({app: parts.app,
        assistant: parts.assistant,
        endpoint: '/api/assistant',
        scope: fake.scope});
    parts.app.register('live', session);
    // A turn: once a screen reader would have finished what came before, the student talks, and the words arrive.
    const turn = async (words, {wait = 8000} = {}) => {
        await parts.settle(wait);
        fake.event({type: 'input_audio_buffer.committed', item_id: 'item1'});
        fake.event({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: 'item1',
            transcript: words
        });
        await parts.settle(200);
    };
    // The model finishes replying.
    const done = async (output = []) => {
        fake.event({type: 'response.done', response: {status: 'completed', output}});
        await parts.settle(1000);
    };
    // Connected, greeted (what the editor says is gathered for a moment first), and the greeting said.
    const begin = async () => {
        session.start();
        await parts.settle(1200);
        await done();
    };
    return {...parts, ...fake, session, turn, done, begin};
};

const minted = fake => () => fake.json({
    secret: 'ek_short',
    expiresAt: 1,
    model: 'gpt-realtime-2.1-mini',
    context: '{"untrustedProjectContent":{}}'
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('the live voice', () => {
    test('starts with a short-lived key from the AI server, and greets', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body)});
        holder.fake = parts;
        await parts.begin();
        expect(parts.session.getState().phase).toBe('on');
        const [sessionCall, call] = parts.asked;
        expect(sessionCall.url).toBe('/api/live-session');
        expect(JSON.parse(sessionCall.options.body).program.length).toBeGreaterThan(0);
        expect(call.url).toBe('https://api.openai.com/v1/realtime/calls');
        expect(call.options.headers.Authorization).toBe('Bearer ek_short');
        expect(parts.said()[0]).toMatch(/^EDITOR: The project and the editor, as data/);
        expect(parts.said()[1]).toBe('EDITOR: Say: Hi! I’m listening. Just talk to me.');
    });

    test('lets the model answer a request only after the editor has looked at it, with the project as it is',
        async () => {
            const holder = {};
            const parts = live({session: body => minted(holder.fake)(body)});
            holder.fake = parts;
            await parts.begin();
            const before = parts.replies();
            await parts.turn('how do I make it wait');
            expect(parts.said().at(-1)).toMatch(/^EDITOR: The project now, as data: \{"untrustedProjectContent"/);
            expect(parts.replies()).toBe(before + 1);
        });

    test('sends a suggestion to the editor, whose question is said by the live voice', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body),
            tool: body => ({reply: waiting(body.request)})});
        holder.fake = parts;
        await parts.begin();
        await parts.done([{type: 'function_call', name: 'make_change', call_id: 'call1', arguments: '{}'}]);
        expect(parts.gate.isOpen()).toBe(true);
        const output = parts.sent.find(item => item.item?.type === 'function_call_output');
        expect(output.item).toMatchObject({call_id: 'call1', output: expect.stringMatching(/Wait for the editor/)});
        // "One moment" is said first; the editor's question follows it.
        await parts.done();
        await parts.settle(1000);
        // Said as in any hands-free conversation, where a bare "yes" approves nothing.
        expect(parts.said().at(-1)).toMatch(/^EDITOR: Say: .*Wait a bit\. Add wait 1 second.*Shall I\? Say add all/);
    });

    test('never lets the model approve: only the student\'s words, matched by the editor', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body),
            tool: body => ({reply: waiting(body.request)})});
        holder.fake = parts;
        await parts.begin();
        await parts.done([{type: 'function_call', name: 'make_change', call_id: 'call1', arguments: '{}'}]);
        const before = parts.program();
        // The model says it is done: nothing changes.
        await parts.done([{type: 'message', role: 'assistant', content: [{type: 'output_text', text: 'Done!'}]}]);
        expect(parts.program()).toEqual(before);
        // Anyone nearby could say "yes": in a hands-free conversation it approves nothing.
        const replies = parts.replies();
        await parts.turn('yes');
        expect(parts.program()).toEqual(before);
        // The editor's answer, not the model's, and the model is not asked about it.
        await parts.turn('add it');
        await parts.settle(3000);
        expect(parts.program()).toContain('wait 1 second');
        expect(parts.sent.slice(-6).some(item => item.type === 'conversation.item.create' &&
            /The project now/.test(item.item.content?.[0]?.text ?? ''))).toBe(false);
        expect(parts.replies()).toBeGreaterThanOrEqual(replies);
    });

    test('tells the model why a suggestion cannot be used, without the student hearing each try', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body),
            tool: () => ({reply: {
                type: 'proposal',
                summary: 'Fly.',
                steps: [{command: {op: 'insert', block: 'control_wait', after: 'b99'}}]
            }})});
        holder.fake = parts;
        await parts.begin();
        const call = {type: 'function_call', name: 'make_change', call_id: 'call1', arguments: '{}'};
        await parts.done([call]);
        expect(parts.gate.isOpen()).toBe(false);
        expect(parts.said().at(-1))
            .toMatch(/^EDITOR: The editor could not use that suggestion: .*make_change again/);
        expect(parts.said().some(text => /couldn't work that out/.test(text))).toBe(false);
        await parts.done([call]);
        await parts.done([call]);
        await parts.settle(1000);
        expect(parts.said().at(-1)).toBe('EDITOR: Say: I couldn\'t work that out, please try again.');
    });

    test('says a sentence once where the next one already says it', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body)});
        holder.fake = parts;
        await parts.begin();
        parts.session.say('Added: wait 2 seconds');
        parts.session.say('Done. Added: wait 2 seconds. To take it back, say undo.');
        await parts.settle(1000);
        expect(parts.said().at(-1)).toBe('EDITOR: Say: Done. Added: wait 2 seconds. To take it back, say undo.');
        expect(parts.sent.at(-1)).toMatchObject({type: 'response.create',
            response: {tool_choice: 'none', instructions: expect.stringMatching(/nothing else/)}});
    });

    test('says it is working on a change while the text model works it out', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body),
            tool: body => ({reply: waiting(body.request)})});
        holder.fake = parts;
        await parts.begin();
        parts.event({type: 'response.created'});
        await parts.done([{
            type: 'function_call',
            name: 'make_change',
            call_id: 'call1',
            arguments: '{"request":"wait after moving"}'
        }]);
        await parts.settle(1000);
        expect(parts.said().some(text => text.startsWith('EDITOR: Say: One moment, I’m putting that together.')))
            .toBe(true);
        expect(parts.gate.isOpen()).toBe(true);
    });

    test('has an explanation from the text model said by the live voice', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body),
            tool: () => ({reply: {type: 'explanation', text: 'A loop repeats blocks.'}})});
        holder.fake = parts;
        await parts.begin();
        await parts.done([{type: 'function_call', name: 'make_change', call_id: 'call1', arguments: '{}'}]);
        const output = parts.sent.find(item => item.item?.type === 'function_call_output');
        expect(output.item.output).toBe('EDITOR: Say: A loop repeats blocks.');
        expect(parts.gate.isOpen()).toBe(false);
    });

    test('asks after nearly five quiet minutes whether the student is still there, then stops', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body)});
        holder.fake = parts;
        await parts.begin();
        await parts.settle((4 * 60 * 1000) + (44 * 1000));
        expect(parts.session.getState().phase).toBe('on');
        expect(parts.said().some(text => /still there/.test(text))).toBe(false);
        await parts.settle(2000);
        expect(parts.said().at(-1)).toBe('EDITOR: Say: Are you still there? I’ll stop listening soon.');
        // Saying that is not talk: the session still ends.
        await parts.done();
        await parts.settle(16 * 1000);
        expect(parts.session.getState().phase).toBe('off');
    });

    test('goes on when the student answers "still there?"', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body)});
        holder.fake = parts;
        await parts.begin();
        await parts.settle((4 * 60 * 1000) + (50 * 1000));
        parts.event({type: 'input_audio_buffer.speech_started'});
        await parts.settle(60 * 1000);
        expect(parts.session.getState().phase).toBe('on');
    });

    test('takes a yes said while the talk key is held as deliberate, for a change that is not an addition',
        async () => {
            const holder = {};
            const parts = live({session: body => minted(holder.fake)(body),
                tool: body => ({reply: {
                    type: 'proposal',
                    summary: 'Longer.',
                    steps: [{command: {
                        op: 'set-value',
                        block: body.request.program.find(line => line.includes(' control_wait:')).trim()
                            .split(' ')[0],
                        name: 'DURATION',
                        value: 5
                    }}]
                }})});
            holder.fake = parts;
            await parts.begin();
            await parts.done([{type: 'function_call', name: 'make_change', call_id: 'call1', arguments: '{}'}]);
            await parts.done();
            await parts.settle(1000);
            expect(parts.gate.isOpen()).toBe(true);
            await parts.turn('yes');
            await parts.settle(3000);
            expect(parts.program()).toContain('wait 2 seconds');
            parts.session.holdToAnswer(true);
            await parts.turn('yes', {wait: 0});
            parts.session.holdToAnswer(false);
            await parts.settle(3000);
            expect(parts.program()).toContain('wait 5 seconds');
        });

    test('drops words that are the editor\'s own coming back', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body)});
        holder.fake = parts;
        await parts.begin();
        parts.app.announce('Say add all, guide me, or no.');
        await parts.settle(200);
        const before = parts.sent.length;
        await parts.turn('add all guide me', {wait: 0});
        expect(parts.sent.slice(before).some(item => item.type === 'response.create')).toBe(false);
    });

    test('says everything the editor says in its own voice, one thing after another', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body)});
        holder.fake = parts;
        parts.settings.set({readAloud: true});
        await parts.begin();
        parts.reader.speak.mockClear();
        parts.event({type: 'response.created'});
        parts.app.speak('First.');
        parts.app.speak('Second.');
        expect(parts.said().some(text => /First/.test(text))).toBe(false);
        await parts.done();
        await parts.settle(1000);
        expect(parts.said().at(-1)).toBe('EDITOR: Say: First. Second.');
        expect(parts.reader.speak).not.toHaveBeenCalled();
    });

    test('ends with "goodbye", letting go of the microphone', async () => {
        const holder = {};
        const parts = live({session: body => minted(holder.fake)(body)});
        holder.fake = parts;
        await parts.begin();
        await parts.turn('goodbye');
        expect(parts.session.getState().phase).toBe('off');
        expect(parts.track.stop).toHaveBeenCalled();
        expect(parts.heard.at(-1)).toMatch(/Press F4 when you want to talk again/);
    });

    test('says so where it cannot start, and leaves nothing open', async () => {
        const parts = live({session: () => Promise.resolve({ok: false, status: 503, json: () => Promise.resolve({})})});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        parts.session.start();
        await parts.settle(200);
        expect(parts.session.getState().phase).toBe('off');
        expect(parts.heard.at(-1)).toBe('The live voice could not start. Use the talk key instead.');
        expect(parts.scope.navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
        jest.restoreAllMocks();
    });
});
