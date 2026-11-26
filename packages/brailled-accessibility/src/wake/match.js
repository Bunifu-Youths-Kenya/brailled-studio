// Whether words that were heard start by calling the assistant, as in "Hey Mboni".

// What a speaker may say before the greeting without meaning anything by it.
const FILLERS = ['um', 'uh', 'erm'];

// Compared without capitals, accents, apostrophes or punctuation.
const plain = text => String(text).toLowerCase()
    .normalize('NFD')
    .replace(/[\p{M}'’-]/gu, '');

/**
 * The wake words count only at the start of a phrase, so that talk about the assistant does not call it. How like
 * the name a word must be is set by the list of variants alone: guessing further would wake it by mistake.
 * @param {string} text What was heard.
 * @param {object} phrases What calls the assistant.
 * @param {string[]} phrases.greetings The first word, such as `hey`.
 * @param {string[]} phrases.names The name and the ways it may be misheard.
 * @returns {?{request: string}} What was asked after the wake words, perhaps nothing, or null if not called.
 */
const matchWake = (text, {greetings, names}) => {
    const words = Array.from(String(text).matchAll(/[\p{L}\p{M}\p{N}'’-]+/gu), found => ({
        word: plain(found[0]),
        end: found.index + found[0].length
    }));
    let at = 0;
    while (FILLERS.includes(words[at]?.word)) at += 1;
    if (!greetings.map(plain).includes(words[at]?.word)) return null;
    at += 1;
    for (const name of names) {
        const wanted = plain(name).replace(/\s+/g, '');
        const count = name.trim().split(/\s+/).length;
        // A name that starts with an "m" sound may be heard as two words, such as "M boni" or "em boni".
        const split = ['m', 'em'].includes(words[at]?.word);
        for (const length of split ? [count + 1, count] : [count]) {
            const said = words.slice(at, at + length);
            if (said.length < length) continue;
            const joined = said.map(item => item.word).join('');
            if ((split && length > count ? joined.replace(/^em/, 'm') : joined) !== wanted) continue;
            return {request: String(text).slice(said.at(-1).end)
                .replace(/^[^\p{L}\p{N}]+/u, '')
                .trim()};
        }
    }
    return null;
};

export {
    matchWake
};
