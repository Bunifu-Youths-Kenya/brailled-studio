// Where a command in the student's own words goes: a local action first, otherwise the AI helper.
import {parseAnswer} from '../proposals/answers.js';
import proposalMessages from '../proposals/messages.js';
import {hasOpenDialog} from './dom.js';
import {speech} from './messages.js';
import parseCommand from './parser.js';

/**
 * Act on what was said or typed.
 * @param {object} app The app.
 * @param {string} text The words.
 * @param {string} source Where they came from, such as `voice`.
 * @returns {string} `action`, `gate`, `assistant`, `unknown` or `blocked`.
 */
const routeCommand = (app, text, source) => {
    // While a suggestion waits, what is said answers it, apart from stopping the project. Only the student's
    // words come this way.
    const gate = app.gate();
    if (gate?.isOpen()) {
        if (parseCommand(text, app.actionNames()) === 'project.stop') app.perform('project.stop');
        else gate.hear(text);
        return 'gate';
    }
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
    // A yes or no that comes too late is about a suggestion that has gone; it is not a request.
    if (assistant && ['approve', 'all', 'reject'].includes(parseAnswer(text)?.type)) {
        app.announce(app.say(proposalMessages.nothingWaiting));
        return 'unknown';
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
