/*
 * Checks the shape of a reply from the AI. Nothing from it is shown or used unless the whole of it has one of
 * these forms, with nothing extra:
 *
 *   {type: 'proposal', summary, steps: [{command} | {action}]}
 *   {type: 'question', question, choices?: [string]}
 *   {type: 'explanation', text}
 */
const LIMITS = Object.freeze({summary: 300, steps: 20, question: 300, choices: 5, choice: 120, text: 2000});

const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

const hasOnly = (value, required, optional = []) => required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));

// Control characters, and the invisible ones that reorder or hide text.
const UNWANTED = [[0, 31], [127, 159], [0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069]];

const visible = character => {
    const code = character.codePointAt(0);
    return UNWANTED.some(([from, to]) => code >= from && code <= to) ? ' ' : character;
};

// A line of text of a sensible length, or null.
const text = (value, length) => {
    if (typeof value !== 'string') return null;
    const tidy = Array.from(value, visible).join('')
        .replace(/\s+/g, ' ')
        .trim();
    return tidy && tidy.length <= length ? tidy : null;
};

const step = value => {
    if (!isObject(value) || Object.keys(value).length !== 1) return null;
    if (isObject(value.command)) return {command: value.command};
    return typeof value.action === 'string' ? {action: value.action} : null;
};

const forms = {
    proposal: reply => {
        if (!hasOnly(reply, ['type', 'summary', 'steps'])) return null;
        const summary = text(reply.summary, LIMITS.summary);
        if (!summary || !Array.isArray(reply.steps)) return null;
        if (reply.steps.length === 0 || reply.steps.length > LIMITS.steps) return null;
        const steps = reply.steps.map(step);
        return steps.every(Boolean) ? {type: 'proposal', summary, steps} : null;
    },
    question: reply => {
        if (!hasOnly(reply, ['type', 'question'], ['choices'])) return null;
        const question = text(reply.question, LIMITS.question);
        if (!question) return null;
        if (!Object.hasOwn(reply, 'choices')) return {type: 'question', question, choices: []};
        const {choices} = reply;
        if (!Array.isArray(choices) || choices.length < 2 || choices.length > LIMITS.choices) return null;
        const tidied = choices.map(choice => text(choice, LIMITS.choice));
        return tidied.every(Boolean) ? {type: 'question', question, choices: tidied} : null;
    },
    explanation: reply => {
        if (!hasOnly(reply, ['type', 'text'])) return null;
        const words = text(reply.text, LIMITS.text);
        return words ? {type: 'explanation', text: words} : null;
    }
};

/**
 * @param {*} reply What the server passed on.
 * @returns {?object} The reply in one of the forms above, or null if it is invalid.
 */
const parseReply = reply => (isObject(reply) && Object.hasOwn(forms, reply.type) ?
    forms[reply.type](reply) :
    null);

export {
    LIMITS,
    parseReply
};
