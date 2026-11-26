/*
 * Guiding a student through the steps of a suggestion, for them to carry out. It changes nothing: it says each step,
 * watches the project to see it done, and goes on. No model is asked, so there is no wait between steps.
 */
import proposalMessages from './messages.js';

// How often to look whether the step has been done.
const CHECK_MS = 500;

const NEXT = ['next', 'next step', 'done', 'i did it', 'i have done it', 'skip', 'skip this step', 'endelea'];
const REPEAT = ['repeat', 'repeat step', 'say that again', 'say it again', 'again', 'what next', 'what is next',
    'what do i do', 'what was that', 'rudia'];
const STOP = ['stop guiding', 'stop the guide', 'end the guide', 'stop guide'];

const plain = text => text.toLowerCase().replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// The blocks of the selected sprite, without the values inside them.
const blocksOf = app => Object.values(app.vm.editingTarget?.blocks._blocks ?? {}).filter(block => !block.shadow);

// Begin watching for a step to be done: returns whether it has been, asked later.
const watch = (app, step) => {
    const {command, sprite} = step;
    if (sprite) {
        const present = () => app.vm.runtime.targets.filter(target => target.sprite?.name === sprite.name).length;
        const before = present();
        return () => present() > before;
    }
    // Using an action, such as running, cannot be seen in the project: the student says when.
    if (!command) return () => false;
    if (command.op === 'insert' || command.op === 'wrap') {
        const opcode = command.op === 'insert' ? command.block : command.in;
        const count = () => blocksOf(app).filter(block => block.opcode === opcode).length;
        const before = count();
        return () => count() > before;
    }
    if (command.op === 'create') {
        const exists = () => app.editor.listData().items.some(item => item.name === command.name);
        return () => exists();
    }
    if (command.op === 'delete') {
        const before = blocksOf(app).length;
        return () => blocksOf(app).length < before;
    }
    const program = () => JSON.stringify(app.editor.outline());
    const before = program();
    return () => program() !== before;
};

/**
 * @param {object} app The app.
 * @returns {object} The guide: `start`, `hear`, `isActive` and `stop`.
 */
const createGuide = app => {
    let session = null;
    let timer = null;

    const say = (message, values) => app.say(message, values);
    const tell = (...parts) => app.announce(parts.filter(Boolean).join(' '), {reply: true});

    const words = () => {
        const {steps, index} = session;
        return say(proposalMessages.guideStep,
            {number: index + 1, count: steps.length, sentence: steps[index].sentence.replace(/[.\s]+$/, '')});
    };

    const stop = ({quietly = false} = {}) => {
        if (!session) return;
        clearInterval(timer);
        timer = null;
        session = null;
        if (!quietly) tell(say(proposalMessages.guideStopped));
    };

    // Say the step the student is at, and watch for it.
    const present = before => {
        session.done = watch(app, session.steps[session.index]);
        tell(before, words());
    };

    const advance = before => {
        session.index += 1;
        if (session.index < session.steps.length) {
            present(before);
            return;
        }
        stop({quietly: true});
        app.memory.add('editor', 'The student finished the guided steps.');
        tell(before, say(proposalMessages.guideFinished));
    };

    const check = () => {
        if (session?.done()) advance(say(proposalMessages.guideWellDone));
    };

    return {
        // `steps` as the approval gate checked them.
        start: steps => {
            stop({quietly: true});
            session = {steps, index: 0, done: () => false};
            timer = setInterval(check, CHECK_MS);
            present(say(proposalMessages.guideStart));
        },
        isActive: () => !!session,
        // Words said while guiding. Returns whether they were about the guide.
        hear: text => {
            if (!session) return false;
            const said = plain(text);
            if (NEXT.includes(said)) advance();
            else if (REPEAT.includes(said)) tell(words());
            else if (STOP.includes(said)) stop();
            else return false;
            return true;
        },
        stop
    };
};

export {
    CHECK_MS,
    createGuide
};
