/*
 * "Run and tell me": the project runs while each block of the selected sprite is said as it is reached. The
 * project waits between frames until what was said has had time to be heard, at the student's chosen speed, so
 * that the words keep up with what happens. Escape, or stopping the project, ends it.
 *
 * The virtual machine says nothing about single blocks, so after each frame the narrator looks at where each of the
 * sprite's scripts has got to (`thread.peekStack()`). Blocks that finish within one frame, without waiting, may be
 * passed over: what is said is where the scripts are.
 */
import orientationMessages from './messages.js';
import {blocksOf} from './place.js';

// How long each thing said holds the project: a pause, and time for each letter.
const PACES = {
    slow: {pause: 1400, perLetter: 70},
    normal: {pause: 700, perLetter: 45},
    fast: {pause: 250, perLetter: 25}
};

/**
 * @param {object} options Options.
 * @param {object} options.app The app.
 * @param {object} options.vm The virtual machine.
 * @param {function(): number} [options.now] The time in milliseconds.
 * @returns {object} The narrator.
 */
const createNarrator = ({app, vm, now = Date.now}) => {
    let running = false;
    let original = null;
    let names = new Map();
    let reached = new Map();
    let heldUntil = 0;
    // Told when the project stops by itself, every script having ended.
    let finished = null;

    const sequencer = () => vm.runtime.sequencer;

    // Say something and hold the project while it is heard.
    const tell = text => {
        const pace = PACES[app.settings.get().narrationSpeed] ?? PACES.normal;
        heldUntil = now() + pace.pause + (text.length * pace.perLetter / app.settings.get().speechRate);
        app.announce(text);
    };

    // Where each of the sprite's scripts has got to since the last frame.
    const look = () => {
        const said = [];
        for (const thread of vm.runtime.threads) {
            if (thread.target !== vm.editingTarget) continue;
            const id = thread.peekStack();
            if (!id || reached.get(thread) === id || !names.has(id)) continue;
            reached.set(thread, id);
            said.push(names.get(id));
        }
        if (said.length) tell(said.join('. '));
    };

    const restore = () => {
        if (original) sequencer().stepThreads = original;
        if (finished) vm.runtime.removeListener('PROJECT_RUN_STOP', finished);
        [original, finished, running] = [null, null, false];
    };

    return {
        running: () => running,
        // Run the project, saying each block. Returns what to say if there is nothing to run.
        start: () => {
            if (running) return null;
            const blocks = blocksOf(app.editor.outline());
            if (!blocks.length) return app.say(orientationMessages.narrateNothing);
            names = new Map(blocks.map(node => [node.id, node.text]));
            reached = new Map();
            running = true;
            const steps = sequencer();
            original = steps.stepThreads;
            steps.stepThreads = function () {
                // Held while what was said is heard: no script moves on, and the project waits.
                if (now() < heldUntil) return [];
                const done = original.call(this);
                look();
                return done;
            };
            finished = () => {
                restore();
                app.announce(app.say(orientationMessages.narrateEnd));
            };
            vm.runtime.on('PROJECT_RUN_STOP', finished);
            tell(app.say(orientationMessages.narrateStart));
            vm.greenFlag();
            return null;
        },
        // Stop it, and the project with it.
        stop: () => {
            if (!running) return;
            restore();
            vm.stopAll();
            app.silence();
            app.announce(app.say(orientationMessages.narrateStopped));
        }
    };
};

export {
    PACES,
    createNarrator
};
