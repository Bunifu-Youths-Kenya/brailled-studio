// Where a command in the student's own words goes: a local action first, otherwise the AI helper.
import {hasOpenDialog} from './dom.js';
import {speech} from './messages.js';
import parseCommand from './parser.js';

/**
 * Act on what was said or typed.
 * @param {object} app The app.
 * @param {string} text The words.
 * @param {string} source Where they came from, such as `voice`.
 * @returns {string} `action`, `assistant`, `unknown` or `blocked`.
 */
const routeCommand = (app, text, source) => {
    if (hasOpenDialog(globalThis.document)) {
        app.announce(app.say(speech.closeDialog));
        return 'blocked';
    }
    const id = parseCommand(text, app.actionNames());
    if (id) {
        app.perform(id);
        return 'action';
    }
    // The assistant only ever proposes; see its own part.
    const assistant = app.assistant();
    if (assistant) {
        assistant.handle(text, {source});
        return 'assistant';
    }
    app.announce(app.say(speech.noAssistant));
    return 'unknown';
};

export {
    routeCommand
};
