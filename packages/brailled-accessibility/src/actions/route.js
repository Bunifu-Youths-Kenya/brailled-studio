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
    // While the AI helper's reply is open, what is said is about it, apart from stopping the project.
    const assistant = app.assistant();
    if (assistant?.isOpen()) {
        if (parseCommand(text, app.actionNames()) === 'project.stop') app.perform('project.stop');
        else assistant.respond(text);
        return 'assistant';
    }
    if (hasOpenDialog(globalThis.document)) {
        app.announce(app.say(speech.closeDialog));
        return 'blocked';
    }
    const id = parseCommand(text, app.actionNames());
    if (id) {
        app.perform(id);
        return 'action';
    }
    // The assistant only ever proposes.
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
