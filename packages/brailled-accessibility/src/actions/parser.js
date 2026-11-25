// Understands typed (later spoken) commands that need no AI.

// Extra ways of saying an action, in English. Each action's own name is understood too.
const PHRASES = {
    'help.whereAmI': ['where am i', 'where is this', 'location'],
    'help.whatCanIDo': ['what can i do here', 'what can i do', 'help', 'options'],
    'program.describe': ['read program', 'read the program', 'read my program', 'describe program',
        'describe the program'],
    'program.describeScript': ['read script', 'read this script', 'describe script'],
    'move.next': ['next', 'next item', 'next block', 'forward'],
    'move.previous': ['previous', 'previous item', 'previous block', 'back'],
    'edit.undo': ['undo', 'undo that'],
    'edit.redo': ['redo', 'redo that'],
    'project.stop': ['stop', 'stop project', 'stop the project', 'stop all'],
    'project.run': ['run', 'start', 'run project', 'run the project', 'green flag', 'start project'],
    'sprite.library': ['open sprite library', 'sprite library', 'add sprite', 'choose a sprite'],
    'view.blocks': ['blocks', 'blocks view'],
    'view.outline': ['outline', 'outline view'],
    'view.python': ['python', 'python view']
};

// What can follow "go to".
const PLACES = {
    'go.menu': ['menu', 'menu bar', 'top menu'],
    'go.stage': ['stage', 'stage area'],
    'go.devices': ['devices', 'device'],
    'go.sprites': ['sprites', 'sprite list'],
    'go.background': ['background', 'backgrounds', 'backdrop', 'backdrops'],
    'go.palette': ['palette', 'block palette', 'blocks palette', 'categories', 'block categories'],
    'go.scripts': ['scripts', 'script area', 'scripts area', 'code', 'editor', 'workspace'],
    'view.blocks': ['blocks', 'blocks view'],
    'view.outline': ['outline', 'outline view'],
    'view.python': ['python', 'python view']
};

const GO = /^(?:go to|goto|go|open|show|switch to|move to|take me to) (?:the )?(.+?)(?: tab| panel| zone)?$/;

const normalise = text => String(text).toLowerCase()
    .replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^please | please$/g, '');

const findIn = (table, phrase) => Object.keys(table).find(id => table[id].includes(phrase)) || null;

/**
 * Work out which action a command asks for.
 * @param {string} text What was typed.
 * @param {Array<{id: string, name: string}>} [actionNames] Actions with their names in the user's language.
 * @returns {?string} The action's id, or null if the command is not understood.
 */
const parseCommand = (text, actionNames = []) => {
    const command = normalise(text);
    if (!command) return null;
    const exact = findIn(PHRASES, command) ||
        actionNames.find(action => normalise(action.name) === command)?.id;
    if (exact) return exact;
    const place = GO.exec(command)?.[1];
    return place ? findIn(PLACES, place) : null;
};

export default parseCommand;
