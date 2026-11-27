// What a student says or types about a proposal. Anything not clearly a yes is not a yes.
const APPROVE = ['yes', 'yes please', 'go ahead', 'yes go ahead', 'approve', 'yes do it', 'do it'];
const APPROVE_ALL = ['yes to all', 'yes do all', 'do all', 'do them all', 'approve all', 'all', 'add all', 'add them',
    'add them all', 'yes add all', 'yes add them', 'yes add them all'];
// To be taken through the steps and do them oneself.
const GUIDE = ['guide me', 'teach me', 'guide me through it', 'let me do it', 'i will do it'];
const STEPS = ['step by step', 'go step by step', 'one step at a time', 'one at a time'];
// To hear every step and what changes, before answering.
const MORE = ['more detail', 'more details', 'tell me more', 'what changes', 'read the steps', 'details'];
const REJECT = ['no', 'no thanks', 'no thank you', 'reject', 'cancel', 'stop here', 'no stop here'];
// "change it: three seconds", or the same without the colon.
const CHANGE = /^\s*(?:please\s+)?change\s+(?:it|that)\b[\s:,.-]*(.*)$/i;

// Common Swahili answers. "Sawa" is left out, as "okay" is: it is said without meaning yes.
const SWAHILI = Object.freeze({
    yes: Object.freeze(['ndiyo', 'ndio', 'naam', 'ndiyo endelea', 'ndio endelea', 'endelea', 'fanya hivyo']),
    no: Object.freeze(['hapana', 'hapana asante', 'la', 'usifanye', 'acha']),
    change: Object.freeze(['badilisha', 'badili'])
});

const plain = text => text.toLowerCase().replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// What follows one of the ways of asking for a change, or null.
const changeAsked = (text, openings) => {
    const english = CHANGE.exec(text);
    if (english) return english[1].trim();
    const said = text.trim();
    const opening = openings.find(word => {
        const start = said.slice(0, word.length).toLowerCase();
        return start === word && !/\p{L}/u.test(said.charAt(word.length));
    });
    return opening ? said.slice(opening.length).replace(/^[\s:,.-]+/, '')
        .trim() : null;
};

/**
 * @param {string} text The words.
 * @param {{yes: string[], no: string[], change: string[]}} [more] Ways of answering besides the English ones.
 * @returns {?{type: 'approve'|'all'|'steps'|'guide'|'more'|'reject'|'change', text: ?string}} What they ask for, or
 * null.
 */
const parseAnswer = (text, more = SWAHILI) => {
    const change = changeAsked(text, more.change);
    if (change !== null) return {type: 'change', text: change};
    const words = plain(text);
    if (APPROVE.includes(words) || more.yes.includes(words)) return {type: 'approve'};
    if (APPROVE_ALL.includes(words)) return {type: 'all'};
    if (STEPS.includes(words)) return {type: 'steps'};
    if (GUIDE.includes(words)) return {type: 'guide'};
    if (MORE.includes(words)) return {type: 'more'};
    return REJECT.includes(words) || more.no.includes(words) ? {type: 'reject'} : null;
};

// What may approve a suggestion in a conversation, hands-free: only words that say plainly to add it. A bare "yes"
// is too easily said by someone nearby.
const ADD_BY_VOICE = ['add all', 'add them', 'add them all', 'yes add all', 'yes add them', 'yes add them all',
    'add it', 'yes add it'];
const asksToAdd = text => ADD_BY_VOICE.includes(plain(text));

export {
    SWAHILI,
    asksToAdd,
    parseAnswer
};
