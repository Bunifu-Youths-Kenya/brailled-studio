// Puts every step of a proposal through the editor's validator before the student sees it.
import CommandError from '../commands/error.js';
import checkCommand from '../commands/schema-check.js';

const ID_KEYS = ['block', 'after', 'before', 'through', 'script'];

// The command with block references turned into block ids, or null if it uses an id it was not given.
const withBlockIds = (command, refs) => {
    // "new3" is the block that step 3 makes; the validator resolves it.
    const idOf = ref => (/^new[0-9]+$/.test(ref) ? ref : refs.get(ref) ?? null);
    const result = {...command};
    for (const key of ID_KEYS) {
        // In "insert" the block is a kind of block, not one in the program.
        if (!Object.hasOwn(result, key) || (key === 'block' && command.op === 'insert')) continue;
        result[key] = idOf(result[key]);
        if (result[key] === null) return null;
    }
    if (result.inside) {
        const block = idOf(result.inside.block);
        if (block === null) return null;
        result.inside = {...result.inside, block};
    }
    return result;
};

/**
 * @param {object} options Options.
 * @param {object} options.editor The editing engine.
 * @param {object[]} options.steps From `parseReply`.
 * @param {Map<string, string>} options.refs Block ids by reference.
 * @param {Map<string, string>} options.actions Names, by id, of the actions that may be proposed.
 * @param {function(string): string} options.actionSentence Says that an action would be done.
 * @returns {{ok: boolean, steps: ?object[], reason: ?string}} Each step with the `sentence` saying what it
 * would do, in the editor's own words, or why the proposal cannot be accepted.
 */
const checkProposal = ({editor, steps, refs, actions, actionSentence}) => {
    const commands = [];
    for (const [index, step] of steps.entries()) {
        const refuse = reason => ({ok: false, reason: `Step ${index + 1}: ${reason}`});
        if (!step.command) {
            if (!actions.has(step.action)) return refuse(`there is no action "${step.action}"`);
            commands.push(null);
            continue;
        }
        try {
            checkCommand(step.command);
        } catch (error) {
            if (!(error instanceof CommandError)) throw error;
            return refuse(error.message);
        }
        const command = withBlockIds(step.command, refs);
        if (!command) return refuse('it uses a block that was not listed');
        commands.push(command);
    }
    const result = editor.preview(commands);
    if (!result.ok) return {ok: false, reason: `Step ${result.step}: ${result.reason}`};
    return {
        ok: true,
        steps: steps.map((step, index) => (step.command ?
            {command: commands[index], sentence: result.sentences[index]} :
            {action: step.action, sentence: actionSentence(actions.get(step.action))}))
    };
};

export {
    checkProposal
};
