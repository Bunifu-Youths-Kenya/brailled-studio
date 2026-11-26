// Turns the references the AI was given, b1, b2 and so on, back into block ids.
import {mapBlockIds, stepRef} from '../proposals/steps.js';

const UNLISTED = 'unlisted';

/**
 * @param {object[]} steps From `parseReply`.
 * @param {Map<string, string>} refs Block ids by reference.
 * @returns {?object[]} The steps with ids in their commands, or null if any command uses an id it was not
 * given. Whether the commands make sense is for the approval gate's validator.
 */
const withBlockIds = (steps, refs) => {
    let unlisted = false;
    const idOf = ref => {
        // "new3" is the block that step 3 makes; the validator resolves it.
        const made = /^new([0-9]+)$/.exec(ref)?.[1];
        if (made) return stepRef(Number(made));
        if (refs.has(ref)) return refs.get(ref);
        unlisted = true;
        return UNLISTED;
    };
    const result = steps.map(step => {
        const {command} = step;
        if (!command || (command.inside && typeof command.inside !== 'object')) return step;
        return {command: mapBlockIds(command, idOf)};
    });
    return unlisted ? null : result;
};

export {
    withBlockIds
};
