// Puts every step of a proposal through the editor's validator, and says what each would do in the editor's words.
import CommandError from '../commands/error.js';
import checkCommand from '../commands/schema-check.js';
import proposalMessages from './messages.js';
import {madeBy, mapBlockIds} from './steps.js';

/**
 * @param {object} options Options.
 * @param {object} options.app The app.
 * @param {object[]} options.steps Each `{command}`, `{action}` or `{sprite: {name}}`.
 * @param {Array<?string>} [options.made] Ids of the blocks made by steps already carried out.
 * @param {number} [options.from] The first step not yet carried out.
 * @returns {{ok: boolean, steps: ?object[], reason: ?string, preview: ?object}} Each step from `from` on with its
 * `sentence` and, for a deletion, its `detail`, and the program before and after its commands
 * (`{before, after, touched}`, outlines and a block they change); or why the proposal cannot be accepted.
 */
const checkSteps = ({app, steps, made = [], from = 0}) => {
    const actions = new Map(app.proposableActions().map(action => [action.id, action.name]));
    const commands = steps.map(() => null);
    const described = steps.map(() => null);
    let preview = null;
    let spriteAt = null;
    for (const [index, step] of steps.entries()) {
        if (index < from) continue;
        const refuse = reason => ({ok: false, reason: `Step ${index + 1}: ${reason}`});
        if (step.command) {
            // A new sprite's program cannot be checked before the sprite exists.
            if (spriteAt !== null) return refuse('a command cannot follow adding a sprite');
            try {
                checkCommand(step.command);
            } catch (error) {
                if (!(error instanceof CommandError)) throw error;
                return refuse(error.message);
            }
            // Blocks that carried-out steps made have their ids by now.
            commands[index] = mapBlockIds(step.command, id => {
                const number = madeBy(id);
                return number && number <= from ? made[number - 1] ?? id : id;
            });
        } else if (step.sprite) {
            const item = app.library()?.find(step.sprite.name);
            if (!item) return refuse(`there is no sprite "${step.sprite.name}" in the library`);
            spriteAt = index;
            described[index] = {sprite: {name: item.name},
                sentence: app.say(proposalMessages.addSprite, {name: item.name})};
        } else {
            if (!actions.has(step.action)) return refuse(`there is no action "${step.action}"`);
            described[index] = {action: step.action,
                sentence: app.say(proposalMessages.useAction, {name: actions.get(step.action)})};
        }
    }
    if (commands.some(Boolean)) {
        const result = app.editor.preview(commands);
        if (!result.ok) return {ok: false, reason: `Step ${result.step}: ${result.reason}`};
        preview = {before: result.before, after: result.after, touched: result.touched};
        commands.forEach((command, index) => {
            if (command) {
                described[index] = {command, sentence: result.sentences[index], detail: result.details[index]};
            }
        });
    }
    return {ok: true, steps: described.slice(from), preview};
};

export {
    checkSteps
};
