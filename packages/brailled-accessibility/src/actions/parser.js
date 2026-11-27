// Understands typed (later spoken) commands that need no AI.

// Extra ways of saying an action, in English. Each action's own name is understood too.
const PHRASES = {
    'help.introduce': ['introduce yourself', 'who are you', 'what is your name', 'what\'s your name'],
    'help.about': ['what is this platform', 'what does this platform do', 'what is brailled', 'what does brailled do',
        'what can you do', 'what is this editor'],
    'help.whereAmI': ['where am i', 'where is this', 'location'],
    'help.whatCanIDo': ['what can i do here', 'what can i do', 'help', 'options'],
    'program.describe': ['read program', 'read the program', 'read my program', 'describe program',
        'describe the program'],
    'program.describeScript': ['read script', 'read this script', 'describe script'],
    'program.summary': ['what is my program', 'whats my program', 'program summary', 'summarise my program',
        'summarize my program', 'sum up my program'],
    'program.moreDetail': ['more detail', 'more details', 'tell me everything', 'the whole program'],
    'project.narrate': ['narrate', 'narrate the program', 'run and narrate', 'tell me as it runs',
        'run slowly and tell me'],
    'speech.repeat': ['say that again', 'say again', 'repeat what you said', 'pardon', 'what did you say'],
    'speech.slower': ['speak slower', 'talk slower', 'slow down', 'more slowly'],
    'speech.faster': ['speak faster', 'talk faster', 'speed up', 'more quickly'],
    'speech.shorter': ['say less', 'be brief', 'shorter replies', 'less detail'],
    'speech.longer': ['say more', 'longer replies'],
    'move.next': ['next', 'next item', 'next block', 'forward'],
    'move.previous': ['previous', 'previous item', 'previous block', 'back'],
    'edit.undo': ['undo', 'undo that'],
    'edit.redo': ['redo', 'redo that'],
    'project.stop': ['stop', 'stop project', 'stop the project', 'stop all'],
    'project.run': ['run', 'start', 'run project', 'run the project', 'green flag', 'start project'],
    'voice.stopListening': ['stop the wake word', 'stop wake word'],
    'voice.settings': ['open voice settings', 'voice setup'],
    'mode.guide': ['guide me', 'teach me', 'switch to guide mode'],
    'mode.build': ['switch to build mode'],
    'memory.forget': ['forget the conversation', 'forget everything'],
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
    'go.voice': ['voice', 'voice bar', 'microphone'],
    'view.blocks': ['blocks', 'blocks view'],
    'view.outline': ['outline', 'outline view'],
    'view.python': ['python', 'python view']
};

const GO = /^(?:go to|goto|go|open|show|switch to|move to|take me to) (?:the )?(.+?)(?: tab| panel| zone)?$/;

// Words people start with that ask for nothing, such as "Hey, where am I?".
const OPENINGS = /^(?:(?:please|hey|hi|hello|ok|okay|um|uh|so|brailled) )+/;

const normalise = text => String(text).toLowerCase()
    .replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(OPENINGS, '')
    .replace(/(?: please)+$/, '');

const findIn = (table, phrase) => Object.keys(table).find(id => table[id].includes(phrase)) || null;

/**
 * Work out which action a command asks for.
 * @param {string} text What was typed.
 * @param {Array<{id: string, name: string}>} [actionNames] Actions with their names in the user's language.
 * @param {string} [assistantName] What the assistant is called. Calling it asks who it is; before a command it is
 * left out.
 * @returns {?string} The action's id, or null if the command is not understood.
 */
const parseCommand = (text, actionNames = [], assistantName = '') => {
    let command = normalise(text);
    const name = normalise(assistantName);
    if (name && command === name) return 'help.introduce';
    if (name && command.startsWith(`${name} `)) command = normalise(command.slice(name.length + 1));
    if (!command) return null;
    const exact = findIn(PHRASES, command) ||
        actionNames.find(action => normalise(action.name) === command)?.id;
    if (exact) return exact;
    const place = GO.exec(command)?.[1];
    return place ? findIn(PLACES, place) : null;
};

export default parseCommand;
