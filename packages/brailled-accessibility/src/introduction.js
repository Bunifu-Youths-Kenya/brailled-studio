/*
 * The assistant introducing itself, the first time it is called in a browser session. What it says it can do comes
 * from the actions the editor has and the tools the AI may use, so that it does not promise what is not there.
 */
import tools from './catalog/tools.json';
import messages from './introduction-messages.js';

const STORAGE_KEY = 'brailled.introduced';
// Longer than the introduction takes to read.
const PLAYING_MS = 25000;

// What it offers, with the actions and tools that make each one possible. `withoutAi` ones are offered only when
// there is no AI helper, which does them itself otherwise.
const OFFERS = [
    {id: 'where', actions: ['help.whereAmI']},
    {id: 'blocks', tools: ['find_blocks']},
    {id: 'build', actions: ['mode.build'], tools: ['submit_proposal']},
    {id: 'guide', actions: ['mode.guide'], tools: ['give_explanation']},
    {id: 'explain', tools: ['explain_concept']},
    {id: 'fix', tools: ['get_program', 'submit_proposal']},
    {id: 'read', actions: ['program.describe'], withoutAi: true},
    {id: 'run', actions: ['project.run'], withoutAi: true}
];

const everyTool = Array.from(new Set(Object.values(tools).flat()));

/**
 * @param {object} options What can be done.
 * @param {string[]} options.actions The ids of the editor's actions.
 * @param {boolean} options.ai Whether there is an AI helper.
 * @param {string[]} [options.toolNames] The tools the AI may use.
 * @returns {string[]} The ids of what to offer.
 */
const offers = ({actions, ai, toolNames = everyTool}) => OFFERS.filter(offer =>
    !(offer.withoutAi && ai) &&
    (offer.actions || []).every(id => actions.includes(id)) &&
    (offer.tools || []).every(name => ai && toolNames.includes(name)))
    .map(offer => offer.id);

/**
 * @param {object} options What to say.
 * @param {Function} options.say Formats a message.
 * @param {string} options.locale The language, for joining a list.
 * @param {'full'|'short'} options.length How much to say.
 * @param {string} options.student The student's first name, or empty.
 * @param {boolean} options.ai Whether there is an AI helper.
 * @param {'every'|'big'} options.approval Which changes are asked about.
 * @param {string[]} options.actions The ids of the editor's actions.
 * @param {?string} options.talkKey The key to hold to talk, or null where voice cannot be used.
 * @param {string} options.typeKey The key that opens the command box.
 * @returns {string} The introduction.
 */
const introductionText = ({say, locale, length, student, ai, approval, actions, talkKey, typeKey}) => {
    const hello = student ? say(messages.helloName, {student}) : say(messages.hello);
    const reach = talkKey ? say(messages.talk, {key: talkKey}) : say(messages.type, {key: typeKey});
    if (length === 'short') return [hello, say(messages.whoShort), reach].join(' ');
    const list = new Intl.ListFormat(locale, {type: 'conjunction'})
        .format(offers({actions, ai}).map(id => say(messages[id])));
    const asks = approval === 'big' ? messages.asksBig : messages.asksEvery;
    return [hello, say(messages.who), say(messages.can, {list}), ai ? say(asks) : null, reach]
        .filter(Boolean)
        .join(' ');
};

/**
 * @param {object} options Options.
 * @param {Function} options.compose Given `{length}`, the words to say now.
 * @param {Function} options.preference How much the student wants: `full`, `short` or `off`.
 * @param {Function} options.announce Says something.
 * @param {Function} options.silence Stops reading aloud.
 * @param {?Storage} options.session Remembers, until the browser session ends, that it has been said.
 * @returns {object} The introduction.
 */
const createIntroduction = ({compose, preference, announce, silence, session}) => {
    // Without storage it is remembered until the page closes.
    let given = false;
    let playing = null;

    const done = () => {
        if (given) return true;
        try {
            return !!session?.getItem(STORAGE_KEY);
        } catch {
            return false;
        }
    };
    const keep = value => {
        given = value;
        try {
            if (value) session?.setItem(STORAGE_KEY, 'yes');
            else session?.removeItem(STORAGE_KEY);
        } catch {
            // Blocked storage: the page remembers.
        }
    };

    const words = () => {
        keep(true);
        const text = compose({length: preference() === 'short' ? 'short' : 'full'});
        playing = {text, until: Date.now() + PLAYING_MS};
        return text;
    };

    return {
        // The first call of a session: introduce, and say that it did, so that nothing else is done.
        greet: () => {
            if (preference() === 'off' || done()) return false;
            announce(words());
            return true;
        },
        // Asked for: said whatever the preference, and returned for the caller to announce.
        ask: words,
        // Something else has been said, or reading has stopped.
        heard: text => {
            if (playing && !text?.includes(playing.text)) playing = null;
        },
        // Stop it, if it is being said. Returns whether it was.
        skip: () => {
            if (!playing || Date.now() > playing.until) return false;
            playing = null;
            silence();
            return true;
        },
        // So that the next student is introduced to it too.
        forget: () => {
            playing = null;
            keep(false);
        }
    };
};

export {
    PLAYING_MS,
    STORAGE_KEY,
    createIntroduction,
    introductionText,
    offers
};
