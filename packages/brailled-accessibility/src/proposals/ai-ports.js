/*
 * Everything the AI helper is given. It can look at the editor, speak, and submit steps to the proposal queue. It
 * is given nothing that changes the project: no editor engine, no actions to perform and no virtual machine.
 */
const copy = value => JSON.parse(JSON.stringify(value));

const createAiPorts = (app, submitter) => Object.freeze({
    // Where the student is, without the list of actions.
    snapshot: () => {
        const {actions: _, ...context} = app.snapshot();
        return copy(context);
    },
    outline: () => copy(app.editor.outline()),
    data: () => copy(app.editor.listData().items),
    names: () => copy(app.editor.projectNames()),
    blockSpecs: () => copy(app.editor.blockSpecs()),
    actions: () => app.proposableActions(),
    spriteCategories: () => app.library()?.categories() ?? [],
    spriteNames: (category, page) => app.library()?.names(category, page) ?? [],
    targetId: () => app.vm.editingTarget?.id ?? null,
    language: () => app.intl().locale,
    say: (message, values) => app.say(message, values),
    announce: text => app.announce(text),
    speak: text => app.speak(text),
    silence: () => app.silence(),
    // Resolves when the microphone is closed, so that a reply is not heard as speech.
    whenQuiet: () => new Promise(resolve => {
        const voice = app.voice();
        if (!voice || voice.getState().phase === 'idle') {
            resolve();
            return;
        }
        const stop = voice.subscribe(() => {
            if (voice.getState().phase !== 'idle') return;
            stop();
            resolve();
        });
    }),
    submit: proposal => submitter.submit(proposal)
});

export {
    createAiPorts
};
