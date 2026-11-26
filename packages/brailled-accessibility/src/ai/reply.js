/*
 * Checks the shape of a reply from the AI. Nothing from it is shown or used unless the whole of it has one of
 * these forms, with nothing extra:
 *
 *   {type: 'proposal', summary, steps: [{command} | {action} | {sprite: {name}}]}
 *   {type: 'question', question, choices?: [string], spritesFrom?: string, page?: number, steps?: [{action}]}
 *   {type: 'explanation', text}
 *
 * A question may open something first (`steps`, moving about only), and may have its choices filled in by the
 * editor from one kind of sprite in the library (`spritesFrom`).
 */
const LIMITS = Object.freeze(
    {summary: 300, steps: 20, question: 300, choices: 5, choice: 120, text: 2000, name: 100, opening: 3, page: 99});

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
    if (isObject(value.sprite) && hasOnly(value.sprite, ['name'])) {
        const name = text(value.sprite.name, LIMITS.name);
        return name ? {sprite: {name}} : null;
    }
    return typeof value.action === 'string' ? {action: value.action} : null;
};

// A list of 1 to `most` steps, or null.
const stepList = (value, most) => {
    if (!Array.isArray(value) || value.length === 0 || value.length > most) return null;
    const steps = value.map(step);
    return steps.every(Boolean) ? steps : null;
};

const choiceList = choices => {
    if (!Array.isArray(choices) || choices.length < 2 || choices.length > LIMITS.choices) return null;
    const tidied = choices.map(choice => text(choice, LIMITS.choice));
    return tidied.every(Boolean) ? tidied : null;
};

const forms = {
    proposal: reply => {
        if (!hasOnly(reply, ['type', 'summary', 'steps'])) return null;
        const summary = text(reply.summary, LIMITS.summary);
        const steps = stepList(reply.steps, LIMITS.steps);
        return summary && steps ? {type: 'proposal', summary, steps} : null;
    },
    question: reply => {
        if (!hasOnly(reply, ['type', 'question'], ['choices', 'spritesFrom', 'page', 'steps'])) return null;
        const given = key => Object.hasOwn(reply, key);
        const question = text(reply.question, LIMITS.question);
        const result = {type: 'question', question, choices: given('choices') ? choiceList(reply.choices) : []};
        if (!question || !result.choices || (given('choices') && given('spritesFrom'))) return null;
        if (given('spritesFrom')) {
            result.spritesFrom = text(reply.spritesFrom, LIMITS.name);
            result.page = given('page') ? reply.page : 1;
            const {page} = result;
            if (!result.spritesFrom || !Number.isInteger(page) || page < 1 || page > LIMITS.page) return null;
        } else if (given('page')) {
            return null;
        }
        if (given('steps')) {
            result.steps = stepList(reply.steps, LIMITS.opening);
            if (!result.steps?.every(item => item.action)) return null;
        }
        return result;
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
