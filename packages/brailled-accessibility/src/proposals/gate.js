/*
 * The approval gate. Proposals arrive through the queue. Nothing that changes the project is carried out until
 * the student approves it, except where the school's configuration says to ask about big changes only. Whatever
 * is carried out is said, with how to take it back.
 *
 * Only the student's own input reaches `approve`: the dialog's buttons and what they say or type.
 */
import {TALK_KEYS} from '../actions/shortcuts.js';
import {asksToAdd, parseAnswer} from './answers.js';
import {previewOf} from '../orientation/place.js';
import {checkSteps} from './check.js';
import {fingerprint as fingerprintOf} from './fingerprint.js';
import {createMachine} from './machine.js';
import proposalMessages from './messages.js';
import {adds, answerRisk, needsApproval, proposalRisk, stepRisk, undoable} from './risk.js';

const CHECK_MS = 1000;
// The interface redraws after a change; where the student is cannot be recorded until it has.
const SETTLE_MS = 500;

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

    // The steps still to be answered for, each with its risk.
    const waitingSteps = () => current.steps.map((step, at) => ({step, risk: current.risks[at]}))
        .slice(current.mode === 'steps' ? current.index : 0);

    // Whether everything waiting only adds things, none of it hard to undo.
    const onlyAdds = () => answerRisk(current.steps, current.risks) !== 'big' &&
        waitingSteps().every(({step, risk}) => risk === 'safe' || adds(step));

    // Whether a plain yes said in a conversation may approve what is asked: only where the school allows voice
    // approval, and only for adding things.
    const voiceMayApprove = () => app.config.get().conversation?.voiceApproval === true && onlyAdds();

    // What a yes must name to approve what an answer would now carry out: `delete` if anything is deleted, `change`
    // if anything else there is altered, or null if nothing needs naming.
    const named = () => {
        const answered = waitingSteps().slice(0, current.mode === 'steps' ? 1 : current.steps.length);
        if (answered.some(({step}) => step.command?.op === 'delete')) return 'delete';
        return answered.some(({step, risk}) => risk !== 'safe' && !adds(step)) ? 'change' : null;
    };

    // The phrase that may approve a change or deletion hands-free, or null: only where the school allows voice
    // approval, and "undo" takes all of it back. Running, and anything hard to undo, need a key or a button.
    const voicePhrase = () => (app.config.get().conversation?.voiceApproval === true &&
        proposalRisk(current.risks) !== 'big' &&
        waitingSteps().every(({step, risk}) => risk === 'safe' || undoable(step)) ? named() : null);

    // How to answer in a conversation, where there is no time to read all the ways.
    const howInConversation = () => {
        if (voiceMayApprove()) return say(proposalMessages.sayInConversation);
        const phrase = voicePhrase();
        if (phrase) return say(proposalMessages.sayInConversationPhrase, {phrase});
        const allowed = app.config.get().conversation?.voiceApproval === true;
        return say(allowed ? proposalMessages.sayInConversationKey : proposalMessages.sayInConversationNoVoice,
            {key: talkKey()});
    };

    const risky = step => (step.risk === 'big' ? `, ${say(proposalMessages.hardToUndo)}` : '');
    const sentenceOf = step => `${step.sentence}${risky(step)}.`;
    const summaryOf = view => view.summary?.trim().replace(/([^.!?])$/, '$1.') || null;

    // How to answer, in a few words: yes or no, unless a yes alone may not approve it here.
    const yesOrNo = () => {
        if (!app.conversing() || voiceMayApprove()) return say(proposalMessages.yesOrNo);
        const phrase = voicePhrase();
        return phrase ?
            say(proposalMessages.phraseToApprove, {phrase}) :
            say(proposalMessages.holdToApprove, {key: talkKey()});
    };

    // Everything that is asked: each step, what changes, and the ways to answer.
    const fullWordsOf = view => {
        const many = view.steps.length > 1;
        const sentence = sentenceOf;
        const list = many ?
            view.steps.map((step, index) => `${index + 1}. ${sentence(step)}`) :
            [sentence(view.steps[0])];
        const summary = summaryOf(view);
        let ask = many ? say(proposalMessages.askMany, {count: view.steps.length}) : say(proposalMessages.ask);
        if (view.mode === 'steps') ask = say(proposalMessages.askStep, view.values);
        return [
            view.risk === 'big' ? say(proposalMessages.warning) : null,
            summary || null,
            ...(view.mode === 'steps' ? [sentence(view.steps[view.index])] : list),
            view.mode === 'steps' ? null : current.preview,
            ask,
            app.conversing() ? howInConversation() : say(view.mode === 'steps' || !many ?
                proposalMessages.howToAnswer :
                proposalMessages.howToAnswerMany)
        ].filter(Boolean).join(' ');
    };

    // What is asked, said briefly, as one person asks another: what it does and how many changes, then yes or no.
    // Every step and what changes are said on "more detail", and at the detailed level. The panel or dialog on
    // screen shows all of it.
    const wordsOf = view => {
        if (app.settings.get().verbosity === 'detailed') return fullWordsOf(view);
        const many = view.steps.length > 1;
        const stepping = view.mode === 'steps';
        let what = summaryOf(view) ?? sentenceOf(view.steps[0]);
        if (stepping) {
            what = `${say(proposalMessages.titleStepShort, view.values)} ${sentenceOf(view.steps[view.index])}`;
        }
        return [
            view.risk === 'big' ? say(proposalMessages.warning) : null,
            what,
            many && !stepping ? say(proposalMessages.changes, {count: view.steps.length}) : null,
            yesOrNo()
        ].filter(Boolean).join(' ');
    };

    const viewOf = () => {
        const {summary, steps, risks, mode, index, askingChange, note, serial, seconds} = current;
        const many = steps.length > 1;
        const care = answerRisk(steps, risks);
        const risk = mode === 'steps' ? risks[index] : care;
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
            docked: app.voiceFirst() && care !== 'big'
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
            askingHow: false,
            serial: current.serial + 1,
            // Going step by step, each step gets the whole time.
            deadline: Date.now() + (current.seconds * 1000),
            fingerprint: fingerprintOf(app)
        });
        show();
        app.cue('approvalNeeded');
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
    // What was done, then where the student is (`place`), then how to take it back.
    const readBack = (outcome, done, place = '') => {
        const parts = [...done.sentences, ...done.actions];
        if (!outcome.ok) parts.push(say(proposalMessages.failed, {reason: outcome.failure}));
        else if (parts.length > 0) parts.unshift(say(proposalMessages.done));
        if (place) parts.push(place);
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
        // What was done, and where the student now is.
        // Where the student is, where blocks changed.
        const place = outcome.ok && outcome.changed.length > 0 ? app.placeOf(outcome.changed.at(-1)) : '';
        if (!quiet) app.cue(outcome.ok ? 'success' : 'error');
        if (!quiet) app.announce(readBack(outcome, done, place));
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
            // What changes, before and after, said before it is approved.
            preview: checked.preview ? previewOf({...checked.preview, id: checked.preview.touched, say}) : '',
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

    // Words from a conversation, which anyone nearby could say. They may always turn it down or ask to be guided.
    // They approve additions where `voiceMayApprove` says so, and a change or deletion only with the phrase that
    // `voicePhrase` gives.
    // A yes to several changes is asked once more: all at once, or one at a time. A yes to that, or to one change,
    // approves it.
    const yes = () => {
        if (current.steps.length > 1 && current.mode !== 'steps' && !current.askingHow) {
            current.askingHow = true;
            prompt(say(proposalMessages.howMany));
        } else {
            approve({all: current.mode !== 'steps'});
        }
    };

    // With `mayApprove` false the words can turn it down or ask about it, and nothing more.
    const handsFree = (text, {mayApprove = true} = {}) => {
        if (!waiting()) return;
        const answer = parseAnswer(text, app.answerWords());
        if (answer?.type === 'reject') reject();
        else if (answer?.type === 'guide') guide();
        else if (answer?.type === 'more') prompt(fullWordsOf(state.proposal));
        else if (!mayApprove) prompt(yesOrNo());
        else if (answer?.type === 'named' && answer.text === voicePhrase()) {
            approve({all: current.mode !== 'steps'});
        } else if (voiceMayApprove() && ['approve', 'casual'].includes(answer?.type)) yes();
        // A bare "all" approves only as the answer to "add all, or step by step".
        else if (voiceMayApprove() && (asksToAdd(text) || (answer?.type === 'all' && current.askingHow))) {
            approve({all: true});
        } else if (voiceMayApprove() && answer?.type === 'steps' && current.steps.length > 1) stepByStep();
        else prompt(yesOrNo());
    };

    // What the student said or typed while being asked.
    const hear = text => {
        if (!waiting()) return;
        const answer = parseAnswer(text, app.answerWords());
        if (answer?.type === 'approve' || (answer?.type === 'casual' && onlyAdds())) {
            yes();
        } else if (answer?.type === 'named' && answer.text === named()) {
            approve({all: current.mode !== 'steps'});
        } else if (answer?.type === 'more') {
            prompt(fullWordsOf(state.proposal));
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
