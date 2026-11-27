/*
 * Carries out checked steps. Only the approval gate uses this.
 */
import proposalMessages from './messages.js';
import {madeBy, mapBlockIds, stepRef} from './steps.js';

const SPRITE_TIMEOUT_MS = 30000;
// Commands the engine runs one at a time; the rest can be one change that is undone together.
const ALONE = ['create', 'rename', 'undo', 'redo', 'describe'];

const joins = step => !!step.command && !ALONE.includes(step.command.op);

const withTimeout = (promise, time) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), time);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
});

const createExecutor = app => {
    const addSprite = async ({name}, outcome) => {
        const sprites = app.sprites();
        const item = app.library()?.find(name);
        if (!sprites || !item) return app.say(proposalMessages.noSprite, {name});
        const {vm} = app;
        const before = vm.editingTarget?.id;
        try {
            await withTimeout(sprites.add(item), SPRITE_TIMEOUT_MS);
        } catch {
            return app.say(proposalMessages.spriteFailed, {name});
        }
        sprites.closeLibrary();
        const target = vm.editingTarget;
        const asAdded = JSON.stringify(target.blocks._blocks);
        const added = target.getName();
        app.editor.addEntry({
            sentence: app.say(proposalMessages.spriteAdded, {name: added}),
            // Removing the sprite must not take away anything made since.
            unchanged: () => vm.runtime.targets.includes(target) &&
                JSON.stringify(target.blocks._blocks) === asAdded,
            undo: () => {
                vm.deleteSprite(target.id);
                // Back to where the student was, so that "undo" goes on to what was done there.
                if (vm.runtime.targets.some(other => other.id === before)) vm.setEditingTarget(before);
            }
        });
        outcome.sentences.push(app.say(proposalMessages.spriteAdded, {name: added}));
        outcome.undos += 1;
        return null;
    };

    // Run commands as one change. `made` holds the block ids that carried-out steps made.
    const runCommands = (steps, indices, made, outcome) => {
        const commands = indices.map(index => mapBlockIds(steps[index].command, id => {
            const number = madeBy(id);
            if (!number) return id;
            // A step in the same change is named by its place in it.
            const place = indices.indexOf(number - 1);
            if (place >= 0) return stepRef(place + 1);
            return made[number - 1] ?? id;
        }));
        // The gate says what was done, with where the student is, once.
        const result = app.editor.run(commands.length > 1 ? commands : commands[0], {quiet: true});
        if (!result.ok) return result.message;
        indices.forEach((index, place) => {
            made[index] = result.made?.[place] ?? null;
        });
        outcome.sentences.push(result.message);
        const history = commands.length > 1 || !['undo', 'redo', 'describe'].includes(commands[0].op);
        if (result.changed && history) outcome.undos += 1;
        outcome.changed.push(...(result.made || []).filter(Boolean), ...(result.focusId ? [result.focusId] : []));
        return null;
    };

    const runAction = (id, outcome) => {
        const action = app.proposableActions().find(candidate => candidate.id === id);
        if (!action) return app.say(proposalMessages.actionGone);
        app.perform(id);
        outcome.actions.push(app.say(proposalMessages.usedAction, {name: action.name}));
        return null;
    };

    return {
        /**
         * @param {object[]} steps The whole proposal.
         * @param {number[]} indices Which steps to carry out now, in order.
         * @param {Array<?string>} made Ids of blocks made by steps, filled in as they are carried out.
         * @returns {Promise<object>} `ok`; `failure`, a sentence, if not; the `sentences` saying what changed
         * and the `actions` used; the `changed` block ids; and how many `undos` would take it all back.
         */
        run: async (steps, indices, made) => {
            const outcome = {ok: true, failure: null, sentences: [], actions: [], changed: [], undos: 0};
            for (let at = 0; at < indices.length && !outcome.failure; at++) {
                const step = steps[indices[at]];
                if (step.sprite) {
                    outcome.failure = await addSprite(step.sprite, outcome);
                } else if (step.action) {
                    outcome.failure = runAction(step.action, outcome);
                } else {
                    const group = [indices[at]];
                    while (joins(step) && at + 1 < indices.length && joins(steps[indices[at + 1]])) {
                        group.push(indices[++at]);
                    }
                    outcome.failure = runCommands(steps, group, made, outcome);
                }
            }
            outcome.ok = !outcome.failure;
            return outcome;
        }
    };
};

export {
    SPRITE_TIMEOUT_MS,
    createExecutor
};
