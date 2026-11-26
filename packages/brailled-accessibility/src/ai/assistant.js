/*
 * The AI helper. It asks the server, checks the whole reply and shows it. It never changes anything: a
 * proposal is only described.
 */
import aiMessages from './messages.js';
import {checkProposal} from './proposal.js';
import {parseReply} from './reply.js';
import {buildRequest} from './request.js';

const TIMEOUT_MS = 45000;
// A reply is never shown sooner than this, so that "Asking" is not said over it.
const MIN_REPLY_MS = 300;
const CLOSE_WORDS = ['close', 'cancel', 'dismiss', 'never mind', 'nevermind'];

const PROBLEMS = {
    400: aiMessages.failed,
    413: aiMessages.tooBig,
    429: aiMessages.tooMany,
    503: aiMessages.notReady
};

const plain = text => text.toLowerCase().replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * @param {object} options Options.
 * @param {object} options.app The app.
 * @param {string} options.endpoint Address of the server's assistant.
 * @param {Function} options.fetch Like the browser's `fetch`.
 * @returns {object} The helper. `getState` gives `{busy, reply}`.
 */
const createAssistant = ({app, endpoint, fetch}) => {
    const listeners = new Set();
    let state = {busy: false, reply: null};
    let request = null;
    let disposed = false;

    const set = changes => {
        state = {...state, ...changes};
        listeners.forEach(listener => listener());
    };

    // The words of a reply, for reading aloud. A screen reader reads them from the dialog.
    const wordsOf = reply => {
        if (reply.type === 'explanation') return `${app.say(aiMessages.explanationTitle)}. ${reply.text}`;
        if (reply.type === 'question') {
            const choices = reply.choices.map((choice, index) => `${index + 1}. ${choice}.`);
            return [`${app.say(aiMessages.questionTitle)}.`, reply.question, ...choices].join(' ');
        }
        return [
            app.say(aiMessages.proposalTitle),
            app.say(aiMessages.summary, {summary: reply.summary}),
            app.say(aiMessages.stepsHeading),
            ...reply.steps.map((step, index) => `${index + 1}. ${step.sentence}.`),
            app.say(aiMessages.cannotApprove)
        ].join(' ');
    };

    // Wait until the microphone is closed, so that the reply is not heard as speech.
    const whenQuiet = task => {
        const voice = app.voice();
        if (!voice || voice.getState().phase === 'idle') {
            task();
            return;
        }
        const stop = voice.subscribe(() => {
            if (voice.getState().phase !== 'idle') return;
            stop();
            task();
        });
    };

    const fail = (message, reason) => {
        // Why, for whoever is looking into it. It is not shown to the student.
        // eslint-disable-next-line no-console
        if (reason) console.warn(`assistant: ${reason}`);
        set({busy: false});
        app.announce(app.say(message));
    };

    // Check a reply against what was sent. Returns what to show, or null.
    const accept = (raw, sent) => {
        const reply = parseReply(raw);
        if (!reply) return {reason: 'the reply has the wrong form'};
        if (reply.type !== 'proposal') return {reply};
        if (app.vm.editingTarget?.id !== sent.targetId) return {reason: 'another sprite has been selected'};
        const checked = checkProposal({
            editor: app.editor,
            steps: reply.steps,
            refs: sent.refs,
            actions: sent.actions,
            actionSentence: name => app.say(aiMessages.action, {name})
        });
        return checked.ok ? {reply: {...reply, steps: checked.steps}} : {reason: checked.reason};
    };

    const ask = async (transcript, previous = null) => {
        if (state.busy) {
            app.announce(app.say(aiMessages.busy));
            return;
        }
        if (!app.vm.editingTarget) {
            app.announce(app.say(aiMessages.noSprite));
            return;
        }
        set({busy: true, reply: null});
        app.announce(app.say(aiMessages.asking));
        const controller = new AbortController();
        request = controller;
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const shortest = new Promise(resolve => setTimeout(resolve, MIN_REPLY_MS));
        try {
            const sent = buildRequest({app, transcript, previous});
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
            await new Promise(whenQuiet);
            if (disposed) return;
            const {reply, reason} = accept(body?.reply, sent);
            if (!reply) {
                fail(aiMessages.failed, reason);
                return;
            }
            set({busy: false, reply});
            app.speak(wordsOf(reply));
        } catch (error) {
            // Whatever went wrong, nothing has changed and the helper can be asked again.
            // eslint-disable-next-line no-console
            console.error('assistant: failed', error);
            fail(aiMessages.failed);
        } finally {
            clearTimeout(timer);
            request = null;
        }
    };

    const dismiss = () => {
        if (!state.reply) return;
        app.silence();
        set({reply: null});
        app.announce(app.say(aiMessages.dismissed));
    };

    // Answer the question being shown.
    const answer = text => {
        const {reply} = state;
        if (reply?.type !== 'question') return;
        app.silence();
        const {question, choices} = reply;
        set({reply: null});
        // The dialog closes, and focus returns, before the program is described.
        setTimeout(() => ask(text, {question, choices}), 50);
    };

    return {
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        // Words that are not a local command.
        handle: text => ask(text),
        // Whether a reply is on screen, so that what is said next is about it.
        isOpen: () => !!state.reply,
        // What was said while a reply is on screen.
        respond: text => {
            if (CLOSE_WORDS.includes(plain(text))) dismiss();
            else if (state.reply?.type === 'question') answer(text);
            else app.speak(app.say(aiMessages.closeFirst));
        },
        answer,
        dismiss,
        dispose: () => {
            disposed = true;
            request?.abort();
        }
    };
};

export {
    CLOSE_WORDS,
    TIMEOUT_MS,
    createAssistant
};
