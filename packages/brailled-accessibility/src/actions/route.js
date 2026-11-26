// Where a command in the student's own words goes: a local action first, otherwise the AI helper.
import {parseAnswer} from '../proposals/answers.js';
import proposalMessages from '../proposals/messages.js';
import {hasOpenDialog} from './dom.js';
import {speech} from './messages.js';
import parseCommand from './parser.js';
import {TALK_KEYS} from './shortcuts.js';

// Long enough for a window to close and focus to return.
const CLOSING_MS = 50;

/**
 * Act on what was said or typed.
 * @param {object} app The app.
 * @param {string} text The words.
 * @param {string} source Where they came from, such as `voice`, `wake` for words that followed the wake words, or
 * `conversation` for words said after them, hands-free.
 * @returns {string} `action`, `gate`, `assistant`, `unknown` or `blocked`.
 */
const routeCommand = (app, text, source) => {
    // While a suggestion waits, what is said answers it, apart from stopping. Only the student's words come this
    // way. Words that followed the wake words never answer it: anyone nearby could have said them.
    const gate = app.gate();
    if (gate?.isOpen()) {
        const command = parseCommand(text, app.actionNames(), app.assistantName());
        if (command === 'project.stop' || command === 'voice.stopListening') {
            app.perform(command);
        } else if (source === 'conversation') {
            gate.handsFree(text);
        } else if (source === 'wake') {
            app.announce(app.say(speech.wakeCannotAnswer, {key: TALK_KEYS[app.settings.get().talkKey].name}));
        } else {
            gate.hear(text);
        }
        return 'gate';
    }
    // While the student is being guided, "next" and "repeat" are about the guide.
    if (app.guide()?.hear(text)) {
        app.assistant()?.dismiss();
        return 'guide';
    }
    // While the AI helper's reply is open, what is said is about it, apart from stopping the project.
    const assistant = app.assistant();
    if (assistant?.isOpen()) {
        const command = parseCommand(text, app.actionNames(), app.assistantName());
        if (command === 'project.stop') {
            app.perform(command);
        } else if (command && assistant.isExplaining()) {
            // An explanation asks nothing, so a command closes it and is carried out once focus is back.
            assistant.dismiss();
            setTimeout(() => app.perform(command), CLOSING_MS);
            return 'action';
        } else {
            assistant.respond(text);
        }
        return 'assistant';
    }
    if (hasOpenDialog(globalThis.document)) {
        app.announce(app.say(speech.closeDialog));
        return 'blocked';
    }
    const id = parseCommand(text, app.actionNames(), app.assistantName());
    if (id) {
        app.perform(id);
        return 'action';
    }
    // A yes or no that comes too late is about a suggestion that has gone; it is not a request.
    if (assistant && ['approve', 'all', 'reject'].includes(parseAnswer(text, app.answerWords())?.type)) {
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
