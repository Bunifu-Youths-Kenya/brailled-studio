/*
 * How much care each step needs. The editor decides this from what the step would do; nothing the AI says
 * changes it.
 *
 *   safe  moving about and reading: done at once
 *   edit  a change that can be taken back: asked about, unless the school's configuration says to ask about big
 *         ones only
 *   big   hard to undo, or unknown: always asked about
 *
 * Deleting a sprite, uploading to a device and running a robot do not exist yet. When they are added they must
 * always be asked about: never list them in `SAFE_ACTIONS` or `EDITS`, and give none of them a lower risk.
 */
const SAFE_ACTIONS = new Set([
    'help.whereAmI', 'help.whatCanIDo',
    'go.menu', 'go.stage', 'go.devices', 'go.sprites', 'go.background', 'go.palette', 'go.scripts', 'go.voice',
    'view.blocks', 'view.outline', 'view.toggle',
    'move.next', 'move.previous',
    'program.describe', 'program.describeScript',
    'project.stop', 'sprite.library'
]);

const EDITS = new Set(['insert', 'delete', 'set-value', 'move', 'wrap', 'create', 'rename', 'undo', 'redo']);

// More changes than this at once are a big change, however small each one is.
const MANY_CHANGES = 3;

// A project run with a device attached, or in Upload mode, can move a real robot or overwrite its program.
const usesDevice = device => !!device && (device.connected || device.mode === 'upload');

/**
 * @param {object} options Options.
 * @param {object} options.step `{command}`, `{action}` or `{sprite}`.
 * @param {?object} options.detail For a deletion, what the validator found it would remove.
 * @param {?object} options.device From the context snapshot.
 * @returns {'safe'|'edit'|'big'} The step's risk.
 */
const stepRisk = ({step, detail, device}) => {
    if (step.sprite) return 'edit';
    if (step.action) {
        if (SAFE_ACTIONS.has(step.action)) return 'safe';
        if (step.action === 'project.run') return usesDevice(device) ? 'big' : 'edit';
        // Anything not listed, such as a future upload to a device, is treated with the most care.
        return 'big';
    }
    const {op} = step.command;
    if (op === 'describe') return 'safe';
    // Deleting a whole script, or more than one block at once, is hard to take back by hand.
    if (op === 'delete') return !detail || detail.wholeScript || detail.instructions > 1 ? 'big' : 'edit';
    return EDITS.has(op) ? 'edit' : 'big';
};

const proposalRisk = risks => {
    if (risks.includes('big') || risks.filter(risk => risk === 'edit').length > MANY_CHANGES) return 'big';
    return risks.includes('edit') ? 'edit' : 'safe';
};

// Whether "undo" takes a step back. Running a project cannot be undone, and an undo or redo is taken back by its
// opposite, not by "undo".
const undoable = step => !!step.sprite ||
    (!!step.command && EDITS.has(step.command.op) && !['undo', 'redo'].includes(step.command.op));

/**
 * @param {object} options Options.
 * @param {object[]} options.steps The steps.
 * @param {string[]} options.risks Each step's risk.
 * @param {string} options.level From the configuration: `every` change is asked about, or only `big` ones.
 * @returns {boolean} Whether the student must approve. Whatever the level, a change that "undo" cannot take back
 * is asked about.
 */
const needsApproval = ({steps, risks, level}) => {
    const risk = proposalRisk(risks);
    if (risk === 'safe') return false;
    if (risk !== 'edit' || level !== 'big') return true;
    return steps.some((step, index) => risks[index] !== 'safe' && !undoable(step));
};

export {
    MANY_CHANGES,
    SAFE_ACTIONS,
    needsApproval,
    proposalRisk,
    stepRisk,
    undoable
};
