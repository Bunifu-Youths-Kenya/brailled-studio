/*
 * OpenAI's live voice, for the `openai-live` provider: the student talks and the live model answers in its own
 * voice, over one WebRTC connection. The AI server makes a short-lived key for it; the OpenAI key stays there.
 *
 * The live model can only look things up and suggest, as every model here. Every turn passes through the editor
 * first: the editor hears what was said (from the transcription), matches answers to its questions itself, and
 * only then lets the model reply. A suggestion goes to the approval gate, and the gate's words are said by the live
 * voice, so that the student hears one voice.
 */
import parseCommand from '../actions/parser.js';
import aiMessages from '../ai/messages.js';
import voiceMessages from '../voice/messages.js';

const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
// How long to wait for the words of a turn before letting the model reply without them.
const WORDS_MS = 1500;
// A session ends after this long without talk, and after this long in all.
const IDLE_MS = 5 * 60 * 1000;
const LONGEST_MS = 15 * 60 * 1000;
// How long before the end of a quiet spell the student is asked whether they are still there.
const WARN_MS = 15 * 1000;
// Suggestions the editor refuses in a row before the student is told.
const MOST_TRIES = 3;
// How long after the talk key is let go words still count as said with it.
const HELD_MS = 3000;
// For a turn that only says what the editor says.
const SAY_ONLY = 'Say the words after "EDITOR: Say:" in the last message to the student, warmly, and nothing else: ' +
    'add no question, no explanation and nothing about what you will do.';
// How long what the editor says is gathered before the live voice says it.
const GATHER_MS = 800;

const GOODBYE = ['goodbye', 'good bye', 'bye', 'bye bye', 'thank you', 'thanks', 'that is all', "that's all",
    'stop listening', 'kwaheri', 'asante'];
const plain = text => text.toLowerCase().replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// The AI server's addresses, beside the one for typed requests.
const address = (endpoint, path) => (/\/assistant(?=$|\?)/.test(endpoint) ?
    endpoint.replace(/\/assistant(?=$|\?)/, path) :
    `${endpoint.replace(/\/+$/, '')}${path}`);

/**
 * @param {object} options Options.
 * @param {object} options.app The app.
 * @param {object} options.assistant The AI helper, for the project as a request and for suggestions.
 * @param {string} options.endpoint The AI server's address for typed requests.
 * @param {Window} options.scope Where WebRTC, the microphone and fetch come from.
 * @returns {object} The session. `getState` gives `{phase}`: `off`, `connecting` or `on`.
 */
const createLiveSession = ({app, assistant, endpoint, scope}) => {
    const listeners = new Set();
    let state = {phase: 'off'};
    let connection = null;
    let channel = null;
    let stream = null;
    let audio = null;
    let responding = false;
    let replyWanted = false;
    let toSay = [];
    let waitingFor = null;
    let idle = null;
    let warning = null;
    // Whether the live voice is asking if the student is still there, which does not count as talk.
    let asking = false;
    let longest = null;
    // Suggestions in a row that the editor could not use.
    let refused = 0;
    let gathering = null;
    // Whether the talk key is held, and until when words still count as said with it: they are written down a
    // moment after the key is let go.
    let holding = false;
    let heldUntil = 0;
    const deliberate = () => holding || Date.now() < heldUntil;

    const set = changes => {
        state = {...state, ...changes};
        listeners.forEach(listener => listener());
    };
    const say = message => app.announce(app.say(message, {assistant: app.assistantName(), key: 'F4'}));
    const send = event => {
        if (channel?.readyState === 'open') channel.send(JSON.stringify(event));
    };
    const tell = text => send({type: 'conversation.item.create',
        item: {type: 'message', role: 'system', content: [{type: 'input_text', text}]}});

    const close = () => {
        clearTimeout(idle);
        clearTimeout(warning);
        clearTimeout(longest);
        clearTimeout(waitingFor);
        clearTimeout(gathering);
        gathering = null;
        channel?.close();
        connection?.close();
        stream?.getTracks().forEach(track => track.stop());
        if (audio) audio.srcObject = null;
        [connection, channel, stream, responding, replyWanted, toSay] = [null, null, null, false, false, []];
    };

    const stop = ({message = voiceMessages.liveEnded, quietly = false} = {}) => {
        if (state.phase === 'off') return;
        close();
        set({phase: 'off'});
        if (!quietly) say(message);
    };

    // The model replies once nothing else is being said. Saying what the editor says calls no tool.
    const reply = ({speakOnly = false} = {}) => {
        if (responding) {
            replyWanted = true;
            return;
        }
        responding = true;
        replyWanted = false;
        send(speakOnly ?
            {type: 'response.create', response: {tool_choice: 'none', instructions: SAY_ONLY}} :
            {type: 'response.create'});
    };

    // What the editor says goes through the live voice, gathered for a moment so that what follows at once is said
    // together, and anything a later sentence already says is left out.
    const flush = () => {
        if (!toSay.length || responding || gathering) return;
        gathering = setTimeout(() => {
            gathering = null;
            if (!toSay.length || responding) return;
            const said = toSay.filter((text, at) => !toSay.slice(at + 1).some(later => later.includes(
                text.replace(/[.!?]+$/, ''))));
            toSay = [];
            tell(`EDITOR: Say: ${said.join(' ')}`);
            reply({speakOnly: true});
        }, GATHER_MS);
    };

    // The quiet spell starts again. Before it runs out the student is asked whether they are still there.
    const quiet = () => {
        clearTimeout(idle);
        clearTimeout(warning);
        warning = setTimeout(() => {
            asking = true;
            toSay.push(app.say(voiceMessages.liveStillThere));
            flush();
        }, IDLE_MS - WARN_MS);
        idle = setTimeout(() => stop({message: voiceMessages.liveEnded}), IDLE_MS);
    };

    // The project as it is now, as data, before the model replies to the student.
    const update = () => {
        const {body} = assistant.snapshot();
        tell(`EDITOR: The project now, as data: ${JSON.stringify({untrustedProjectContent: {
            program: body.program, context: body.context, data: body.data, names: body.names}})}`);
    };

    const post = async (path, body) => {
        const response = await scope.fetch(address(endpoint, path), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        });
        return {ok: response.ok, status: response.status, body: await response.json().catch(() => null)};
    };

    // A tool the model called: looking up is answered by the AI server; a suggestion goes to the editor.
    const call = async ({name, call_id: id, arguments: args}) => {
        const sent = assistant.snapshot();
        // Working out a change takes a few seconds: the student hears, once and at once, that something is
        // happening.
        const working = app.say(voiceMessages.liveWorking);
        if (name === 'make_change' && refused === 0) {
            if (responding) {
                toSay.push(working);
            } else {
                tell(`EDITOR: Say: ${working}`);
                reply({speakOnly: true});
            }
        }
        const result = await post('/live-tool', {request: sent.body, name, arguments: args}).catch(() => null);
        if (state.phase !== 'on') return;
        const output = text => send({type: 'conversation.item.create',
            item: {type: 'function_call_output', call_id: id, output: text}});
        // An explanation is the live voice's to say; a question or a suggestion is the editor's to show and ask.
        if (result?.body?.reply?.type === 'explanation') {
            output(`EDITOR: Say: ${result.body.reply.text}`);
            reply();
            return;
        }
        if (result?.body?.reply) {
            output('EDITOR: The editor is checking it and will ask the student. Wait for the editor.');
            const problem = await assistant.propose(result.body.reply, sent);
            if (state.phase !== 'on') return;
            // Calls are answered one at a time, in the order the model made them, so the count cannot be stale.
            // eslint-disable-next-line require-atomic-updates
            refused = problem ? refused + 1 : 0;
            if (!problem) return;
            // The model is told why, to correct it without the student hearing each try.
            if (refused < MOST_TRIES) {
                tell(`EDITOR: The editor could not use that suggestion: ${problem}. Call make_change again with ` +
                    'what the student wants, said more exactly, or ask the student what they mean.');
                reply();
                return;
            }
            refused = 0;
            // "One moment" is stale by now.
            toSay = toSay.filter(text => text !== working);
            toSay.push(app.say(aiMessages.failed));
            flush();
            return;
        }
        output(result?.body?.text ?? 'The tool could not be used.');
        reply();
    };

    // What the student said. The editor decides what it is before the model may answer.
    const heard = text => {
        clearTimeout(waitingFor);
        waitingFor = null;
        const words = text.trim();
        if (!words || app.echoes(words)) return;
        if (GOODBYE.includes(plain(words))) {
            stop({message: voiceMessages.liveEnded});
            return;
        }
        // Answers to the editor's questions are the editor's to match. Anyone nearby could say them, so the gate
        // takes them as in any hands-free conversation, unless the student held the talk key while saying them.
        if (app.gate()?.isOpen()) {
            if (deliberate()) app.gate().hear(words);
            else app.gate().handsFree(words);
            return;
        }
        // An answer to a question the editor is showing goes back to where the question came from.
        if (app.assistant()?.isOpen() && !app.assistant().isExplaining()) {
            app.assistant().respond(words);
            return;
        }
        if (app.guide()?.hear(words)) return;
        if (parseCommand(words, app.actionNames(), app.assistantName())) {
            app.voice()?.wake({request: words, confidence: 1, followUp: true});
            return;
        }
        app.memory.add('student', words);
        update();
        reply();
    };

    const onEvent = event => {
        switch (event.type) {
        case 'input_audio_buffer.speech_started':
            asking = false;
            quiet();
            toSay = [];
            break;
        case 'input_audio_buffer.committed':
            // Without the words in time, the model replies to what it heard.
            clearTimeout(waitingFor);
            waitingFor = setTimeout(() => {
                waitingFor = null;
                if (app.gate()?.isOpen()) return;
                update();
                reply();
            }, WORDS_MS);
            break;
        case 'response.created':
            responding = true;
            break;
        case 'conversation.item.input_audio_transcription.completed':
            heard(event.transcript ?? '');
            break;
        case 'response.done': {
            responding = false;
            // The quiet spell counts from when the live voice finished, unless it was asking whether anyone is
            // there: only the student's talk keeps the session open then.
            if (!asking) quiet();
            const calls = (event.response?.output ?? []).filter(item => item.type === 'function_call');
            calls.forEach(item => call(item));
            if (replyWanted && !calls.length) reply();
            flush();
            break;
        }
        case 'error':
            // The service's words can quote what was sent: only the code is kept.
            // eslint-disable-next-line no-console
            console.warn(`live: ${event.error?.code ?? 'error'}`);
            if (event.error?.code === 'conversation_already_has_active_response') responding = true;
            break;
        default:
        }
    };

    // A failure to start: the usual voice is used instead, and the student is told.
    const fail = reason => {
        // eslint-disable-next-line no-console
        console.warn(`live: ${reason}`);
        close();
        set({phase: 'off'});
        say(voiceMessages.liveFailed);
    };

    const start = async () => {
        if (state.phase !== 'off') return;
        if (!app.config.get().aiEndpoint || !assistant.snapshot) {
            say(voiceMessages.liveFailed);
            return;
        }
        set({phase: 'connecting'});
        app.silence();
        try {
            const minted = await post('/live-session', assistant.snapshot().body);
            if (state.phase !== 'connecting') return;
            if (!minted.ok || typeof minted.body?.secret !== 'string') {
                fail(`the server answered ${minted.status}`);
                return;
            }
            connection = new scope.RTCPeerConnection();
            audio = audio ?? scope.document.createElement('audio');
            audio.autoplay = true;
            connection.ontrack = event => {
                audio.srcObject = event.streams[0];
            };
            // The browser's echo cancelling keeps the model from hearing itself.
            stream = await scope.navigator.mediaDevices.getUserMedia({
                audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}
            });
            if (state.phase !== 'connecting') {
                close();
                return;
            }
            connection.addTrack(stream.getTracks()[0], stream);
            channel = connection.createDataChannel('oai-events');
            channel.onmessage = message => {
                let event = null;
                try {
                    event = JSON.parse(message.data);
                } catch {
                    // An event that is not JSON is ignored.
                    return;
                }
                onEvent(event);
            };
            channel.onopen = () => {
                tell(`EDITOR: The project and the editor, as data: ${minted.body.context}`);
                set({phase: 'on'});
                quiet();
                longest = setTimeout(() => stop({message: voiceMessages.liveEnded}), LONGEST_MS);
                toSay.push(app.say(voiceMessages.liveGreeting));
                flush();
            };
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            const answer = await scope.fetch(CALLS_URL, {
                method: 'POST',
                headers: {'Authorization': `Bearer ${minted.body.secret}`, 'Content-Type': 'application/sdp'},
                body: offer.sdp,
                credentials: 'omit',
                referrerPolicy: 'no-referrer'
            });
            if (!answer.ok) {
                fail(`the call was refused, ${answer.status}`);
                return;
            }
            await connection.setRemoteDescription({type: 'answer', sdp: await answer.text()});
        } catch (error) {
            fail(error.name === 'NotAllowedError' ? 'the microphone is blocked' : error.message);
        }
    };

    return {
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        start,
        stop,
        toggle: () => (state.phase === 'off' ? start() : stop()),
        // Whether the live voice is the one that speaks now, and whether it is speaking.
        active: () => state.phase === 'on',
        speaking: () => state.phase === 'on' && responding,
        // Have the live voice say what the editor says.
        say: text => {
            if (state.phase !== 'on') return;
            toSay.push(text);
            flush();
        },
        // The talk key, held while the student answers.
        holdToAnswer: held => {
            holding = held;
            if (!held) heldUntil = Date.now() + HELD_MS;
        },
        dispose: () => stop({quietly: true})
    };
};

export {
    createLiveSession
};
