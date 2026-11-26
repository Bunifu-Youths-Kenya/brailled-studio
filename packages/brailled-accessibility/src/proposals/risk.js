/*
 * How much care each step needs. The editor decides this from what the step would do; nothing the AI says
 * changes it.
 *
 *   safe  moving about and reading: done at once
 *   edit  a change that undo can take back: asked about, unless the student chose to be asked about big ones only
 *   big   hard to undo, or unknown: always asked about
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

// `level` is the student's setting: `every` change is asked about, or only `big` ones.
const needsApproval = (risk, level) => risk === 'big' || (risk === 'edit' && level !== 'big');

export {
    MANY_CHANGES,
    SAFE_ACTIONS,
    needsApproval,
    proposalRisk,
    stepRisk
};
