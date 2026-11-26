// What a student says or types about a proposal. Anything not clearly a yes is not a yes.
const APPROVE = ['yes', 'yes please', 'go ahead', 'yes go ahead', 'approve', 'yes do it', 'do it'];
const APPROVE_ALL = ['yes to all', 'yes do all', 'do all', 'do them all', 'approve all', 'all'];
const STEPS = ['step by step', 'go step by step', 'one step at a time', 'one at a time'];
const REJECT = ['no', 'no thanks', 'no thank you', 'reject', 'cancel', 'stop here', 'no stop here'];
// "change it: three seconds", or the same without the colon.
const CHANGE = /^\s*(?:please\s+)?change\s+(?:it|that)\b[\s:,.-]*(.*)$/i;

const plain = text => text.toLowerCase().replace(/[.,!?;:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * @param {string} text The words.
 * @returns {?{type: 'approve'|'all'|'steps'|'reject'|'change', text: ?string}} What they ask for, or null.
 */
const parseAnswer = text => {
    const change = CHANGE.exec(text);
    if (change) return {type: 'change', text: change[1].trim()};
    const words = plain(text);
    if (APPROVE.includes(words)) return {type: 'approve'};
    if (APPROVE_ALL.includes(words)) return {type: 'all'};
    if (STEPS.includes(words)) return {type: 'steps'};
    return REJECT.includes(words) ? {type: 'reject'} : null;
};

export {
    parseAnswer
};
