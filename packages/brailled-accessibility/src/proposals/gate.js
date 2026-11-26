/*
 * The approval gate. Proposals arrive through the queue. Nothing that changes the project is carried out until
 * the student approves it, except where the school's configuration says to ask about big changes only. Whatever
 * is carried out is said, with how to take it back.
 *
 * Only the student's own input reaches `approve`: the dialog's buttons and what they say or type.
 */
import {TALK_KEYS} from '../actions/shortcuts.js';
import {asksToAdd, parseAnswer} from './answers.js';
import {checkSteps} from './check.js';
import {fingerprint as fingerprintOf} from './fingerprint.js';
import {createMachine} from './machine.js';
import proposalMessages, {timeLimit} from './messages.js';
import {needsApproval, proposalRisk, stepRisk} from './risk.js';

const CHECK_MS = 1000;
// The interface redraws after a change; where the student is cannot be recorded until it has.
const SETTLE_MS = 500;

// What puts something new into a project, and takes nothing away.
const ADDING = ['insert', 'wrap', 'create'];

/**
 * @param {object} options Options.
 * @param {object} options.app The app.
 * @param {object} options.executor See `executor.js`.
 * @param {function({change: string, previous: object})} options.revise Asks the AI for a changed proposal.
 * @param {function(string[])} [options.highlight] Marks changed blocks for those who look at them.
 * @param {function(): boolean} [options.windowOpen] Whether another window is open, which would keep what is
 * said from being heard.
 * @returns {object} The gate. `getState` gives `{status, proposal}`.
 */
const createGate = ({
    app, executor, revise, highlight = () => {},
    windowOpen = () => !!globalThis.document?.querySelector('dialog[open]')
}) => {
    const machine = createMachine();
    const listeners = new Set();
    let state = {status: 'idle', proposal: null};
    // The proposal being considered, with what only the gate needs to know.
    let current = null;
    let timer = null;
    let disposed = false;

    const set = proposal => {
        state = {status: machine.state(), proposal};
        listeners.forEach(listener => listener());
    };

    const say = (message, values) => app.say(message, values);

    // Tell the conversation's memory what became of a suggestion.
    const remember = text => app.memory.add('editor', text);

    const talkKey = () => TALK_KEYS[app.settings.get().talkKey].name;

    const adds = ({command, sprite}) => !!sprite || ADDING.includes(command?.op);

    // Whether words said in a conversation may approve what is asked: only where the school allows it, and only
    // adding things. Deleting, changing what is there, running and anything hard to undo need a key or a button.
    const voiceMayApprove = () => {
        const waitingSteps = current.steps.map((step, at) => ({step, risk: current.risks[at]}))
            .slice(current.mode === 'steps' ? current.index : 0);
        return app.config.get().conversation?.voiceApproval === true &&
            proposalRisk(current.risks) !== 'big' &&
            waitingSteps.every(({step, risk}) => risk === 'safe' || adds(step));
    };

    // How to answer in a conversation, where there is no time to read all the ways.
    const howInConversation = () => {
        if (voiceMayApprove()) return say(proposalMessages.sayInConversation);
        const allowed = app.config.get().conversation?.voiceApproval === true;
        return say(allowed ? proposalMessages.sayInConversationKey : proposalMessages.sayInConversationNoVoice,
            {key: talkKey()});
    };

    // The words of what is being asked, for reading aloud. A screen reader reads them from the dialog.
    const wordsOf = view => {
        const list = view.steps.map((step, index) => `${index + 1}. ${step.sentence}${
            step.risk === 'big' ? `, ${say(proposalMessages.hardToUndo)}` : ''}.`);
        return [
            say(view.title, view.values),
            view.risk === 'big' ? say(proposalMessages.warning) : null,
            view.summary ? say(proposalMessages.summary, {summary: view.summary}) : null,
            ...(view.mode === 'steps' ? [`${view.steps[view.index].sentence}.`] : list),
            ...(app.conversing() ?
                [howInConversation()] :
                [say(view.mode === 'steps' || view.steps.length === 1 ?
                    proposalMessages.howToAnswer :
                    proposalMessages.howToAnswerMany), say(...timeLimit(view.seconds))])
        ].filter(Boolean).join(' ');
    };

    const viewOf = () => {
        const {summary, steps, risks, mode, index, askingChange, note, serial, seconds} = current;
        const many = steps.length > 1;
        const risk = mode === 'steps' ? risks[index] : proposalRisk(risks);
        let title = many ? proposalMessages.titleMany : proposalMessages.title;
        if (mode === 'steps') title = proposalMessages.titleStep;
        return {
            title,
            values: {number: index + 1, count: steps.length},
            summary,
            steps: steps.map((step, at) => ({sentence: step.sentence, risk: risks[at]})),
            risk,
            mode,
            index,
            askingChange,
            note,
            // How long there is to answer.
            seconds,
            // Changes when something new is asked, so that the dialog starts afresh.
            serial,
            // Said and shown beside the editor. What is hard to undo always stops the student in a window.
            docked: app.voiceFirst() && proposalRisk(risks) !== 'big'
        };
    };

    const show = (changes = {}) => {
        Object.assign(current, changes);
        set(viewOf());
    };

    // Ask about the proposal, or its next step, and start its time.
    const ask = changes => {
        Object.assign(current, changes, {
            note: null,
            askingChange: false,
            serial: current.serial + 1,
            // Going step by step, each step gets the whole time.
            deadline: Date.now() + (current.seconds * 1000),
            fingerprint: fingerprintOf(app)
        });
        show();
        if (state.proposal.docked) app.present(wordsOf(state.proposal));
        else app.speak(wordsOf(state.proposal), {reply: true});
    };

    const stopClock = () => {
        clearInterval(timer);
        timer = null;
    };

    // The proposal is over.
    const end = (message, values) => {
        stopClock();
        current = null;
        app.silence();
        set(null);
        if (message) app.announce(say(message, values));
    };

    const expire = reason => {
        machine.send('expire');
        remember(reason === 'timeout' ?
            'The suggestion expired unanswered.' :
            'The suggestion was cancelled because the project or the student\'s place changed.');
        end(reason === 'timeout' ? proposalMessages.expired : proposalMessages.stale);
    };

    // Cancel if time is up, or what it was about has changed.
    const stillGood = () => {
        if (Date.now() >= current.deadline) {
            expire('timeout');
            return false;
        }
        if (fingerprintOf(app) !== current.fingerprint) {
            expire('stale');
            return false;
        }
        return true;
    };

    // Watch for the time running out, or a change, while an answer is awaited.
    const startClock = () => {
        stopClock();
        timer = setInterval(() => {
            if (current && machine.state() === 'proposed') stillGood();
        }, CHECK_MS);
    };

    // Say what was done, and how to take it back.
    const readBack = (outcome, done) => {
        const parts = [...done.sentences, ...done.actions];
        if (!outcome.ok) parts.push(say(proposalMessages.failed, {reason: outcome.failure}));
        else if (parts.length > 0) parts.unshift(say(proposalMessages.done));
        if (done.undos > 0) parts.push(say(proposalMessages.undoHint, {count: done.undos}));
        return parts.map(part => part.replace(/[.\s]+$/, ''))
            .map(part => `${part}.`)
            .join(' ');
    };

    // Carry out steps, then either ask about the next or finish.
    const carryOut = async indices => {
        const job = current;
        stopClock();
        app.silence();
        set(null);
        let outcome;
        try {
            outcome = await executor.run(job.steps, indices, job.made);
        } catch (error) {
            // A bug somewhere in carrying it out: say so, and be ready for the next proposal.
            // eslint-disable-next-line no-console
            console.error('proposal: could not be carried out', error);
            outcome = {ok: false,
                failure: say(proposalMessages.unexpected),
                sentences: [],
                actions: [],
                changed: [],
                undos: 0};
        }
        await new Promise(resolve => setTimeout(resolve, SETTLE_MS));
        if (disposed) return;
        const {done} = job;
        done.sentences.push(...outcome.sentences);
        done.actions.push(...outcome.actions);
        done.changed.push(...outcome.changed);
        done.undos += outcome.undos;
        const next = indices[indices.length - 1] + 1;
        const more = outcome.ok && next < job.steps.length;
        if (outcome.changed.length > 0) highlight(done.changed);
        if (more) {
            machine.send('next');
            // The rest must still work on what the program has become.
            const checked = checkSteps({app, steps: job.steps, made: job.made, from: next});
            if (!checked.ok) {
                expire('stale');
                return;
            }
            app.announce(readBack(outcome, outcome));
            startClock();
            ask({index: next});
            return;
        }
        machine.send('finish');
        // Moving about says what happened itself.
        const quiet = outcome.ok && done.sentences.length === 0 && job.risks.every(risk => risk === 'safe');
        if (!quiet) {
            const how = job.asked ? 'The student approved it.' : 'It was made without asking, as the school allows.';
            remember(`${how} ${readBack(outcome, done)}`);
        }
        end();
        if (!quiet) app.announce(readBack(outcome, done));
    };

    // Take a proposal from the queue.
    const take = async ({summary = null, steps, immediateOnly = false}) => {
        const refuse = reason => ({accepted: false, reason});
        if (current) return refuse('another proposal is waiting');
        if (!Array.isArray(steps) || steps.length === 0) return refuse('there are no steps');
        const checked = checkSteps({app, steps});
        if (!checked.ok) return refuse(checked.reason);
        // Something new to answer ends any guiding.
        if (!immediateOnly) app.guide()?.stop({quietly: true});
        const {device} = app.snapshot();
        const risks = checked.steps.map(step => stepRisk({step, detail: step.detail, device}));
        const risk = proposalRisk(risks);
        if (immediateOnly && risk !== 'safe') return refuse('only moving about may come with a question');
        // A student learning to do it makes the changes.
        if (risk !== 'safe' && app.mode() === 'guide') return refuse('nothing is changed in guide mode');
        const {approval, proposalExpirySeconds} = app.config.get();
        // A change made under another window might not be heard, so then it is asked about instead.
        const asks = needsApproval({steps: checked.steps, risks, level: approval}) ||
            (risk !== 'safe' && windowOpen());
        machine.send('propose', {needsApproval: asks});
        current = {
            summary,
            steps: checked.steps,
            risks,
            made: [],
            done: {sentences: [], actions: [], changed: [], undos: 0},
            mode: null,
            index: 0,
            serial: 0,
            askingChange: false,
            note: null,
            seconds: proposalExpirySeconds,
            asked: asks
        };
        if (!asks) {
            machine.send('proceed');
            await carryOut(current.steps.map((_, index) => index));
            return {accepted: true, asked: false};
        }
        startClock();
        ask();
        return {accepted: true, asked: true};
    };

    const waiting = () => !!current && machine.state() === 'proposed';

    // The student says yes: to the whole proposal, or going step by step to this step or all that remain.
    const approve = async ({all = false} = {}) => {
        if (!waiting() || !stillGood()) return;
        const {steps, made, mode, index} = current;
        const from = mode === 'steps' ? index : 0;
        if (!checkSteps({app, steps, made, from}).ok) {
            expire('stale');
            return;
        }
        const indices = mode === 'steps' && !all ?
            [index] :
            steps.map((_, at) => at).slice(from);
        machine.send('approve');
        machine.send('execute');
        await carryOut(indices);
    };

    const stepByStep = () => {
        if (!waiting() || !stillGood() || current.steps.length < 2 || current.mode === 'steps') return;
        ask({mode: 'steps', index: 0});
    };

    const reject = () => {
        if (!waiting()) return;
        const {done} = current;
        machine.send('reject');
        remember(done.undos > 0 ? 'The student stopped part way.' : 'The student rejected the suggestion.');
        if (done.undos > 0) end(proposalMessages.stopped, {count: done.undos});
        else end(proposalMessages.rejected);
    };

    const change = text => {
        if (!waiting() || !stillGood()) return;
        const words = text.trim();
        if (!words) {
            show({askingChange: true, note: say(proposalMessages.sayChange)});
            if (state.proposal.docked) app.present(say(proposalMessages.sayChange));
            else app.speak(say(proposalMessages.sayChange));
            return;
        }
        const previous = {
            summary: current.summary ?? '',
            steps: current.steps.slice(current.index).map(step => step.sentence)
        };
        machine.send('revise');
        remember('The student asked for the suggestion to be changed.');
        end(proposalMessages.revising);
        revise({change: words, previous});
    };

    // The student would rather do it themselves: nothing is changed here, and they are taken through the steps.
    const guide = () => {
        if (!waiting() || !stillGood() || !app.guide()) return;
        const steps = current.steps.slice(current.mode === 'steps' ? current.index : 0);
        machine.send('reject');
        remember('The student chose to be guided through the steps.');
        end();
        app.guide().start(steps);
    };

    // Say something about the question, and show it.
    const prompt = text => {
        show({note: text});
        if (state.proposal.docked) app.present(text);
        else app.speak(text, {reply: true});
    };

    // Words from a conversation, which anyone nearby could say. They may always turn it down or ask to be guided;
    // they approve only where `voiceMayApprove` says so, and only with words that say to add it.
    const handsFree = text => {
        if (!waiting()) return;
        const answer = parseAnswer(text, app.answerWords());
        if (answer?.type === 'reject') reject();
        else if (answer?.type === 'guide') guide();
        else if (asksToAdd(text) && voiceMayApprove()) approve({all: true});
        else prompt(howInConversation());
    };

    // What the student said or typed while being asked.
    const hear = text => {
        if (!waiting()) return;
        const answer = parseAnswer(text, app.answerWords());
        if (answer?.type === 'approve') {
            approve();
        } else if (answer?.type === 'all') {
            approve({all: true});
        } else if (answer?.type === 'steps' && current.steps.length > 1) {
            stepByStep();
        } else if (answer?.type === 'guide') {
            guide();
        } else if (answer?.type === 'reject') {
            reject();
        } else if (answer?.type === 'change') {
            change(answer.text);
        } else if (current.askingChange) {
            change(text);
        } else {
            const note = say(proposalMessages.notAnswer, {text});
            show({note});
            app.speak(note);
        }
    };

    return {
        take,
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        // Whether the student is being asked.
        isOpen: () => waiting() && !!state.proposal,
        isAnswer: text => !!parseAnswer(text, app.answerWords()),
        hear,
        handsFree,
        guide,
        approve,
        stepByStep,
        reject,
        change,
        dispose: () => {
            disposed = true;
            stopClock();
            current = null;
        }
    };
};

export {
    CHECK_MS,
    SETTLE_MS,
    createGate
};
