/*
 * OpenAI's live voice, for the `openai-live` provider: the student talks and the live model answers in its own
 * voice, over one WebRTC connection. The AI server makes a short-lived key for it; the OpenAI key stays there.
 *
 * The live model can only look things up and suggest, as every model here. Every turn passes through the editor
 * first: the editor hears what was said (from the transcription), matches answers to its questions itself, and
 * only then lets the model reply. A suggestion goes to the approval gate, and the gate's words are said by the live
 * voice, so that the student hears one voice.
 */
import signInMessages from '../account/editor-messages.js';
import parseCommand from '../actions/parser.js';
import aiMessages from '../ai/messages.js';
import {refusalMessage} from '../ai/refusals.js';
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
// How long after the live voice stops the room is given to fall quiet before the microphone opens again.
const ECHO_MS = 300;
// The microphone opens again after this long even if the end of the speech was never reported.
const MOST_SPEECH_MS = 60 * 1000;
// For a turn that only says what the editor says.
// The words go in the instructions for that one turn, so there is no label for the model to read out.
const sayOnly = text => 'Say this to the student, warmly, word for word, and nothing else. Add no question, no ' +
    `explanation and nothing about what you will do:\n${text}`;
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
    // Whether the live voice can be heard now, and which of the student's turns began while it could.
    let playing = false;
    const overVoice = new Set();
    let played = null;

    const set = changes => {
        state = {...state, ...changes};
        listeners.forEach(listener => listener());
    };
    const say = message => app.announce(app.say(message, {assistant: app.assistantName(), key: 'F4'}));
    const send = event => {
        if (channel?.readyState === 'open') channel.send(JSON.stringify(event));
    };

    // The microphone is closed while the live voice speaks, so that it cannot hear itself and take that for the
    // student. It stays open for a student who wears headphones and wants to talk over it, and while the talk key is
    // held.
    const microphone = () => {
        const open = !playing || holding || app.settings.get().liveInterrupt;
        stream?.getTracks().forEach(track => {
            track.enabled = open;
        });
    };
    const speechEnded = () => {
        clearTimeout(played);
        playing = false;
        microphone();
    };
    const tell = text => send({type: 'conversation.item.create',
        item: {type: 'message', role: 'system', content: [{type: 'input_text', text}]}});

    const close = () => {
        clearTimeout(idle);
        clearTimeout(warning);
        clearTimeout(longest);
        clearTimeout(waitingFor);
        clearTimeout(gathering);
        clearTimeout(played);
        gathering = null;
        [playing, holding] = [false, false];
        overVoice.clear();
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

    // The model replies once nothing else is being said, and the student is not holding the talk key.
    const reply = () => {
        if (responding || holding) {
            replyWanted = true;
            return;
        }
        responding = true;
        replyWanted = false;
        send({type: 'response.create'});
    };

    // The live voice says what the editor says, calling no tool. What it says joins the conversation, so that the
    // model knows what the student has been told.
    const sayNow = text => {
        responding = true;
        send({type: 'response.create', response: {tool_choice: 'none', instructions: sayOnly(text)}});
    };

    // What the editor says goes through the live voice, gathered for a moment so that what follows at once is said
    // together, and anything a later sentence already says is left out.
    const flush = () => {
        if (!toSay.length || responding || gathering || holding) return;
        gathering = setTimeout(() => {
            gathering = null;
            if (!toSay.length || responding || holding) return;
            const said = toSay.filter((text, at) => !toSay.slice(at + 1).some(later => later.includes(
                text.replace(/[.!?]+$/, ''))));
            toSay = [];
            sayNow(said.join(' '));
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
        const to = address(endpoint, path);
        const response = await scope.fetch(to, await app.authorised(to, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        }));
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
                sayNow(working);
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
    const heard = (text, turn) => {
        const begunOverVoice = overVoice.delete(turn);
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
            // Words begun while the voice was asking could be its own, so they approve nothing.
            else app.gate().handsFree(words, {mayApprove: !begunOverVoice});
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
            if (playing) overVoice.add(event.item_id);
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
        case 'output_audio_buffer.started':
            clearTimeout(played);
            playing = true;
            microphone();
            played = setTimeout(speechEnded, MOST_SPEECH_MS);
            break;
        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.cleared':
            clearTimeout(played);
            played = setTimeout(speechEnded, ECHO_MS);
            break;
        case 'conversation.item.input_audio_transcription.completed':
            heard(event.transcript ?? '', event.item_id);
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
    const fail = (reason, message = voiceMessages.liveFailed) => {
        // eslint-disable-next-line no-console
        console.warn(`live: ${reason}`);
        close();
        set({phase: 'off'});
        say(message);
    };

    const start = async () => {
        if (state.phase !== 'off') return;
        if (!app.config.get().aiEndpoint || !assistant.snapshot) {
            say(voiceMessages.liveFailed);
            return;
        }
        if (app.account().required()) {
            say(aiMessages.signInNeeded);
            return;
        }
        set({phase: 'connecting'});
        app.silence();
        try {
            const minted = await post('/live-session', assistant.snapshot().body);
            if (state.phase !== 'connecting') return;
            if (!minted.ok || typeof minted.body?.secret !== 'string') {
                const refusal = minted.body?.error;
                fail(`the server answered ${minted.status}`, refusal === 'daily_limit' ?
                    signInMessages.liveLimit :
                    refusalMessage(refusal) ?? voiceMessages.liveFailed);
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
            microphone();
            channel.onopen = () => {
                tell(`EDITOR: The project and the editor, as data: ${minted.body.context}`);
                set({phase: 'on'});
                quiet();
                longest = setTimeout(() => stop({message: voiceMessages.liveEnded}), LONGEST_MS);
                // The greeting first, then anything said while connecting.
                toSay.unshift(app.say(voiceMessages.liveGreeting));
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

    // A new choice about talking over the voice applies at once.
    const unsubscribe = app.settings.subscribe(microphone);

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
            if (state.phase === 'off') return;
            toSay.push(text);
            // While connecting it waits for the greeting.
            if (state.phase === 'on') flush();
        },
        // Whether what the editor says should go to the live voice: from the moment it starts connecting, so that
        // nothing is read by another voice over its greeting.
        takesSpeech: () => state.phase !== 'off',
        // Stop the voice because the student asked: nothing queued is said, and the microphone opens. Returns false,
        // having done nothing, where the voice cannot be heard.
        interrupt: () => {
            if (!playing) return false;
            if (responding) send({type: 'response.cancel'});
            send({type: 'output_audio_buffer.clear'});
            clearTimeout(gathering);
            gathering = null;
            [toSay, replyWanted, playing] = [[], false, false];
            clearTimeout(played);
            played = setTimeout(microphone, ECHO_MS);
            quiet();
            return true;
        },
        // The talk key, held while the student answers. The voice stops, so that the microphone hears only them.
        holdToAnswer: held => {
            if (held === holding) return;
            holding = held;
            if (held) {
                clearTimeout(gathering);
                gathering = null;
                if (responding) send({type: 'response.cancel'});
                if (playing) send({type: 'output_audio_buffer.clear'});
                speechEnded();
                return;
            }
            heldUntil = Date.now() + HELD_MS;
            microphone();
            if (replyWanted) reply();
            flush();
        },
        dispose: () => {
            unsubscribe();
            stop({quietly: true});
        }
    };
};

export {
    createLiveSession
};
