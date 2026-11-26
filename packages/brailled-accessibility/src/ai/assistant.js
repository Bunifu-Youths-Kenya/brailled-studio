/*
 * The AI helper. It asks the server and checks the form of the whole reply. It cannot change anything: it is
 * given only `ports` (see `proposals/ai-ports.js`), and puts suggestions in the proposal queue.
 */
import aiMessages from './messages.js';
import {withBlockIds} from './refs.js';
import {parseReply} from './reply.js';
import {buildRequest} from './request.js';

const TIMEOUT_MS = 45000;
// A reply is never shown sooner than this, so that "Asking" is not said over it.
const MIN_REPLY_MS = 300;
const CLOSE_WORDS = ['close', 'cancel', 'dismiss', 'never mind', 'nevermind'];
// Ways of saying a number from a list, in English.
const NUMBERS = ['one', 'two', 'three', 'four', 'five'];

// The server's address for spoken turns, beside the one for typed requests.
const voiceAddress = endpoint => (/\/assistant(?=$|\?)/.test(endpoint) ?
    endpoint.replace(/\/assistant(?=$|\?)/, '/voice-turn') :
    `${endpoint.replace(/\/+$/, '')}/voice-turn`);

// Why a spoken turn failed, as a word the voice controller knows.
const spokenProblem = (status, error) => {
    if (error === 'no_endpoint') return 'no_endpoint';
    if (error === 'invalid_output' || status === 400) return 'invalid';
    if (status === 413) return 'too_big';
    return status === 429 ? 'too_many' : 'unreachable';
};

const PROBLEMS = {
    400: aiMessages.failed,
    413: aiMessages.tooBig,
    429: aiMessages.tooMany,
    503: aiMessages.notReady
};

const plain = text => text.toLowerCase().replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// The choice that "2", "two" or "number two" picks, or the words as given.
const picked = (text, choices) => {
    const word = plain(text).replace(/^number /, '');
    const number = /^[0-9]+$/.test(word) ? Number(word) : NUMBERS.indexOf(word) + 1;
    return choices[number - 1] ?? text;
};

/**
 * @param {object} options Options.
 * @param {object} options.ports Everything the helper may use.
 * @param {string} options.endpoint Address of the server's assistant.
 * @param {Function} options.fetch Like the browser's `fetch`.
 * @returns {object} The helper. `getState` gives `{busy, reply}`, a question or explanation to show.
 */
const createAssistant = ({ports, endpoint, fetch}) => {
    const listeners = new Set();
    let state = {busy: false, reply: null};
    let request = null;
    let listening = null;
    let disposed = false;

    const set = changes => {
        state = {...state, ...changes};
        listeners.forEach(listener => listener());
    };

    // The words of a reply, for reading aloud. A screen reader reads them from the dialog.
    const wordsOf = reply => {
        if (reply.type === 'explanation') return `${ports.say(aiMessages.explanationTitle)}. ${reply.text}`;
        const choices = reply.choices.map((choice, index) => `${index + 1}. ${choice}.`);
        const hint = reply.spritesFrom ? [ports.say(aiMessages.sayName)] : [];
        return [`${ports.say(aiMessages.questionTitle)}.`, reply.question, ...choices, ...hint].join(' ');
    };

    const fail = (message, reason) => {
        // Why, for whoever is looking into it. It is not shown to the student.
        // eslint-disable-next-line no-console
        if (reason) console.warn(`assistant: ${reason}`);
        set({busy: false});
        ports.announce(ports.say(message));
    };

    const show = reply => {
        const choices = reply.choices?.length ? ` Choices: ${reply.choices.join(', ')}.` : '';
        ports.remember('assistant', reply.type === 'question' ? `${reply.question}${choices}` : reply.text);
        set({busy: false, reply});
        ports.speak(wordsOf(reply));
    };

    // Use a reply, checked against what was sent. Returns why it cannot be used, or null.
    const useReply = async (raw, sent) => {
        const reply = parseReply(raw);
        if (!reply) return 'the reply has the wrong form';
        if (reply.type === 'explanation') {
            show(reply);
            return null;
        }
        if (reply.type === 'question') {
            if (reply.spritesFrom) {
                reply.choices = ports.spriteNames(reply.spritesFrom, reply.page);
                if (reply.choices.length === 0) return `no sprites of the kind "${reply.spritesFrom}" there`;
            }
            if (reply.steps) {
                const {steps, ...question} = reply;
                const taken = await ports.submit({steps, immediateOnly: true});
                if (!taken.accepted) return taken.reason;
                show(question);
            } else {
                show(reply);
            }
            return null;
        }
        // The gate refuses changes in guide mode too.
        if (sent.body.mode === 'guide') return 'a proposal in guide mode';
        if (ports.targetId() !== sent.targetId) return 'another sprite has been selected';
        const steps = withBlockIds(reply.steps, sent.refs);
        if (!steps) return 'it uses a block that was not listed';
        // The gate may ask about it for a long time, and may come back for a change.
        set({busy: false});
        ports.remember('assistant', `I suggested: ${reply.summary}`);
        const taken = await ports.submit({summary: reply.summary, steps});
        return taken.accepted ? null : taken.reason;
    };

    const ask = async (transcript, {previous = null, revises = null} = {}) => {
        if (state.busy) {
            ports.announce(ports.say(aiMessages.busy));
            return;
        }
        if (!ports.targetId()) {
            ports.announce(ports.say(aiMessages.noSprite));
            return;
        }
        set({busy: true, reply: null});
        ports.announce(ports.say(aiMessages.asking));
        const controller = new AbortController();
        request = controller;
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const shortest = new Promise(resolve => setTimeout(resolve, MIN_REPLY_MS));
        try {
            const sent = buildRequest({ports, transcript, previous, revises});
            // After the request is built, so that it is not in its own history.
            ports.remember('student', transcript);
            let response;
            try {
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(sent.body),
                    credentials: 'omit',
                    referrerPolicy: 'no-referrer',
                    signal: controller.signal
                });
            } catch (error) {
                if (!disposed) fail(aiMessages.unreachable, error.message);
                return;
            }
            const body = await response.json().catch(() => null);
            await shortest;
            if (disposed) return;
            if (!response.ok) {
                const message = PROBLEMS[response.status] ||
                    (body?.error === 'invalid_output' ? aiMessages.failed : aiMessages.unreachable);
                fail(message, `the server answered ${response.status}`);
                return;
            }
            await ports.whenQuiet();
            if (disposed) return;
            const problem = await useReply(body?.reply, sent);
            if (problem) fail(aiMessages.failed, problem);
        } catch (error) {
            // Whatever went wrong, the helper can be asked again.
            // eslint-disable-next-line no-console
            console.error('assistant: failed', error);
            fail(aiMessages.failed);
        } finally {
            clearTimeout(timer);
            if (request === controller) request = null;
        }
    };

    /**
     * Have a recording heard. The reply is used only if the caller asks for it, after deciding what the words
     * mean.
     * @param {object} turn The turn.
     * @param {{data: string, format: string}} turn.audio The recording.
     * @param {boolean} turn.pending Whether something waits for an answer: then only the words are asked for.
     * @param {string} turn.model The model to ask.
     * @returns {Promise<object>} `{transcript, clear, use}` or `{error}`. `use` is null when there is no reply.
     */
    const hear = async ({audio, pending, model}) => {
        // Only the newest recording matters.
        listening?.abort();
        const controller = new AbortController();
        listening = controller;
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const transcribe = pending || !ports.targetId();
            const sent = transcribe ? null : buildRequest({ports, transcript: ''});
            const {transcript: _, ...context} = sent?.body ?? {};
            const response = await fetch(voiceAddress(endpoint), {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    audio,
                    pending: transcribe,
                    language: ports.language(),
                    model,
                    ...(sent ? {request: context} : {})
                }),
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                signal: controller.signal
            });
            const body = await response.json().catch(() => null);
            if (disposed || listening !== controller) return {error: 'stale'};
            if (!response.ok) return {error: spokenProblem(response.status, body?.error)};
            const {transcript, clear, result} = body ?? {};
            if (typeof transcript !== 'string' || transcript.length > 500 || typeof clear !== 'boolean') {
                return {error: 'invalid'};
            }
            const use = async () => {
                ports.remember('student', transcript);
                await ports.whenQuiet();
                if (disposed) return;
                const problem = await useReply(result, sent);
                if (problem) fail(aiMessages.failed, problem);
            };
            return {transcript, clear, use: sent && result ? use : null};
        } catch (error) {
            if (disposed || listening !== controller) return {error: 'stale'};
            // eslint-disable-next-line no-console
            console.warn(`assistant: ${error.message}`);
            return {error: 'unreachable'};
        } finally {
            clearTimeout(timer);
        }
    };

    const dismiss = () => {
        if (!state.reply) return;
        ports.silence();
        set({reply: null});
        ports.announce(ports.say(aiMessages.dismissed));
    };

    // Close the reply being shown, then ask. For words that follow an explanation.
    const followUp = text => {
        ports.silence();
        set({reply: null});
        // The dialog closes, and focus returns, before the program is described.
        setTimeout(() => ask(text), 50);
    };

    // Answer the question being shown.
    const answer = text => {
        const {reply} = state;
        if (reply?.type !== 'question') return;
        ports.silence();
        const {question, choices} = reply;
        set({reply: null});
        // The dialog closes, and focus returns, before the program is described.
        setTimeout(() => ask(picked(text, choices), {previous: {question, choices}}), 50);
    };

    return {
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        // Words that are not a local command.
        handle: text => ask(text),
        // The student asks for a suggestion to be changed.
        revise: ({change, previous}) => ask(change, {revises: previous}),
        // Whether a reply is on screen, so that what is said next is about it.
        isOpen: () => !!state.reply,
        // What was said while a reply is on screen: it answers a question, or carries on after an explanation.
        respond: text => {
            if (CLOSE_WORDS.includes(plain(text))) dismiss();
            else if (state.reply?.type === 'question') answer(text);
            else followUp(text);
        },
        // Whether the reply on screen asks for nothing.
        isExplaining: () => state.reply?.type === 'explanation',
        answer,
        hear,
        dismiss,
        dispose: () => {
            disposed = true;
            request?.abort();
            listening?.abort();
        }
    };
};

export {
    CLOSE_WORDS,
    TIMEOUT_MS,
    createAssistant
};
