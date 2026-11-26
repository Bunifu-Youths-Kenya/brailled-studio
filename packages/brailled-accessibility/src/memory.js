/*
 * The recent conversation with the AI helper, so that "do that again" means something. It is held only while the
 * page is open and is never stored.
 */
const TURNS = 12;
const LENGTH = 300;

const createMemory = () => {
    let turns = [];
    return {
        // `who` is `student`, `assistant` or `editor`, which says what was done about a suggestion.
        add: (who, text) => {
            const words = String(text).trim();
            if (!words) return;
            const clipped = words.length > LENGTH ? `${words.slice(0, LENGTH - 1)}…` : words;
            turns = [...turns, {who, text: clipped}].slice(-TURNS);
        },
        turns: () => turns.map(turn => ({...turn})),
        clear: () => {
            turns = [];
        }
    };
};

export {
    LENGTH,
    TURNS,
    createMemory
};
