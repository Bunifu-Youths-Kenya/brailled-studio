import parseCommand from '../src/actions/parser.js';
import {ACTIONS, findAction} from '../src/actions/registry.js';
import {matches, releases, TALK_KEYS} from '../src/actions/shortcuts.js';
import {createApp} from '../src/actions/app.js';

const names = createApp({runtime: {threads: []}}).actionNames();

describe('local commands, understood without AI', () => {
    test.each([
        ['where am I', 'help.whereAmI'],
        ['Where am I?', 'help.whereAmI'],
        ['what can I do here', 'help.whatCanIDo'],
        ['read program', 'program.describe'],
        ['next', 'move.next'],
        ['previous', 'move.previous'],
        ['undo', 'edit.undo'],
        ['  Redo. ', 'edit.redo'],
        ['stop', 'project.stop'],
        ['please run', 'project.run'],
        ['go to menu', 'go.menu'],
        ['go to the stage', 'go.stage'],
        ['go to devices', 'go.devices'],
        ['go to the sprites tab', 'go.sprites'],
        ['Go to background', 'go.background'],
        ['go to block palette', 'go.palette'],
        ['go to scripts area', 'go.scripts'],
        ['go to outline', 'view.outline'],
        ['switch to blocks', 'view.blocks'],
        ['show Python', 'view.python'],
        ['open sprite library', 'sprite.library'],
        ['delete block', 'edit.delete'],
        // As people talk.
        ['Hey where am I', 'help.whereAmI'],
        ['ok, next please', 'move.next'],
        ['Um, uh, stop.', 'project.stop'],
        ['Hey Brailled, go to the stage', 'go.stage'],
        ['hello what can I do here', 'help.whatCanIDo']
    ])('%j', (text, id) => {
        expect(parseCommand(text, names)).toBe(id);
    });

    test.each(['', '   ', 'make me a sandwich', 'go to the moon', 'stop the world please now', 'hey', 'say hello',
        'hey make me a sandwich', 'can you stop it falling'])(
        'does not guess at %j', text => {
            expect(parseCommand(text, names)).toBeNull();
        });

    test('understands every action by its name', () => {
        for (const action of names) expect(parseCommand(action.name, names)).not.toBeNull();
    });
});

describe('the action registry', () => {
    test('every action is complete, with a unique id and name', () => {
        const app = createApp({runtime: {threads: []}});
        for (const action of ACTIONS) {
            expect(action).toMatchObject({
                id: expect.stringMatching(/^[a-z]+\.[A-Za-z]+$/),
                scope: expect.stringMatching(/^(global|outline)$/),
                available: expect.any(Function),
                run: expect.any(Function)
            });
            expect(app.say(action.name)).toEqual(expect.any(String));
            expect(app.say(action.description)).toMatch(/\.$/);
        }
        expect(new Set(ACTIONS.map(action => action.id)).size).toBe(ACTIONS.length);
        expect(new Set(names.map(action => action.name)).size).toBe(ACTIONS.length);
    });

    test('no two actions share a shortcut', () => {
        const labels = ACTIONS.flatMap(action => action.shortcuts.map(shortcut => shortcut.label));
        labels.push(...Object.values(TALK_KEYS).map(shortcut => shortcut.label));
        expect(new Set(labels).size).toBe(labels.length);
    });

    test('covers navigation, editing, history, the project and the sprite library', () => {
        for (const id of ['go.palette', 'go.stage', 'go.devices', 'go.sprites', 'go.background', 'go.scripts',
            'view.blocks', 'view.outline', 'view.python', 'edit.insert', 'edit.delete', 'edit.values', 'edit.move',
            'edit.wrap', 'edit.createData', 'edit.undo', 'edit.redo', 'project.run', 'project.stop',
            'sprite.library', 'help.whereAmI', 'help.whatCanIDo']) {
            expect(findAction(id)).not.toBeNull();
        }
    });

    const press = (key, modifiers = {}) =>
        ({key, code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers});

    test('shortcuts need exactly their modifiers', () => {
        const [undo] = findAction('edit.undo').shortcuts;
        expect(matches(undo, press('z', {ctrlKey: true}))).toBe(true);
        expect(matches(undo, press('z', {metaKey: true}))).toBe(true);
        expect(matches(undo, press('Z', {ctrlKey: true, shiftKey: true}))).toBe(false);
        expect(matches(undo, press('z'))).toBe(false);
        const [where] = findAction('help.whereAmI').shortcuts;
        // Matched by the physical key: Alt changes the character on some keyboards.
        expect(matches(where, press('∑', {code: 'KeyW', altKey: true, shiftKey: true}))).toBe(true);
        expect(matches(where, press('w', {code: 'KeyW'}))).toBe(false);
    });

    test('a held shortcut ends when any of its keys is let go', () => {
        const {f2, altShiftV} = TALK_KEYS;
        expect(releases(f2, press('F2'))).toBe(true);
        expect(releases(f2, press('Shift'))).toBe(false);
        for (const up of [press('v', {code: 'KeyV'}), press('Alt'), press('Shift')]) {
            expect(releases(altShiftV, up)).toBe(true);
        }
        expect(releases(altShiftV, press('Control'))).toBe(false);
        expect(matches(altShiftV, press('V', {code: 'KeyV', altKey: true, shiftKey: true}))).toBe(true);
        expect(matches(f2, press('F2', {altKey: true}))).toBe(false);
    });

    describe('using an action', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        const setUp = () => {
            const vm = {runtime: {threads: []}, editingTarget: null, start: jest.fn(), stopAll: jest.fn()};
            const app = createApp(vm);
            const heard = [];
            app.subscribe(text => heard.push(text));
            const perform = (...args) => {
                const used = app.perform(...args);
                jest.runAllTimers();
                return used;
            };
            return {vm, app, heard, perform};
        };

        test('stop stops the project and says so', () => {
            const {vm, heard, perform} = setUp();
            expect(perform('project.stop')).toBe(true);
            expect(vm.stopAll).toHaveBeenCalled();
            expect(heard).toEqual(['Project stopped.']);
        });

        test('an unavailable action explains why when asked for by command', () => {
            const {heard, perform} = setUp();
            perform('view.python');
            perform('edit.insert');
            perform('project.run');
            expect(heard).toEqual([
                'The Python view is coming soon.',
                'Switch to the Outline view first. Say "show outline", or press Alt+Shift+O.',
                'No sprite is selected.'
            ]);
        });

        test('an unavailable action leaves its key alone', () => {
            const {heard, perform} = setUp();
            expect(perform('edit.insert', {fromKey: true})).toBe(false);
            expect(heard).toEqual([]);
        });

        test('outline actions reach the outline that registers', () => {
            const {app, perform} = setUp();
            app.register('gui', {tab: 0, view: 'outline'});
            const outline = {insert: jest.fn(), isMoving: () => false, editValues: () => false};
            const leave = app.register('outline', outline);
            perform('edit.insertBefore');
            expect(outline.insert).toHaveBeenCalledWith(true);
            // Enter on an item with nothing to edit keeps its usual meaning.
            expect(perform('edit.values', {fromKey: true})).toBe(false);
            expect(perform('edit.cancelMove', {fromKey: true})).toBe(false);
            leave();
            expect(perform('edit.insert', {fromKey: true})).toBe(false);
        });

        test('a newer announcement replaces one not yet said', () => {
            const {app, heard} = setUp();
            app.announce('first');
            app.announce('second');
            jest.runAllTimers();
            expect(heard).toEqual(['second']);
        });
    });
});

describe('which actions are available', () => {
    // An editor with the parts that actions ask about, each of which can be taken away.
    const available = ({sprite = true, gui = true, view = 'outline', voice = true, ai = false,
        supported = true, moving = false, parts = true} = {}) => {
        const vm = {runtime: {threads: []}, editingTarget: sprite ? {isStage: false, getName: () => 'A'} : null};
        const config = {get: () => ({voice, ai, aiEndpoint: ai ? '/a' : null}), subscribe: () => () => {}};
        const app = createApp(vm, {config});
        if (gui) app.register('gui', {tab: 0, view});
        if (parts) {
            app.register('outline', {isMoving: () => moving});
            app.register('sprites', {});
            app.register('voice', {isSupported: () => supported, getState: () => ({phase: 'idle'})});
        }
        return ACTIONS.filter(action => !app.unavailable(action)).map(action => action.id);
    };
    const ids = ACTIONS.map(action => action.id);
    const without = (list, ...gone) => list.filter(id => !gone.some(pattern => id.startsWith(pattern)));

    // Python is not built, moving a block needs one picked up, and the AI helper is off.
    const usual = without(ids, 'view.python', 'edit.moveNewScript', 'edit.cancelMove', 'mode.', 'memory.',
        'voice.wake', 'voice.stopListening');

    test('in the outline, with everything there', () => {
        expect(available()).toEqual(usual);
    });

    test('while a block is being moved', () => {
        expect(available({moving: true})).toEqual(without(ids, 'view.python', 'mode.', 'memory.', 'voice.wake',
            'voice.stopListening'));
    });

    test('the AI helper\'s own actions only where it is on', () => {
        expect(available({ai: true})).toEqual(without(ids, 'view.python', 'edit.moveNewScript',
            'edit.cancelMove', 'voice.wake', 'voice.stopListening'));
    });

    test('outline edits only while the outline is shown', () => {
        expect(available({view: 'blocks'})).toEqual(without(usual, 'edit.insert', 'edit.delete', 'edit.values',
            'edit.move', 'edit.wrap', 'edit.createData', 'edit.renameData'));
    });

    test('with no sprite selected', () => {
        expect(available({sprite: false})).toEqual(without(usual, 'program.', 'edit.undo', 'edit.redo',
            'project.run'));
    });

    test('voice actions follow the switch and the browser', () => {
        expect(available({voice: false})).toEqual(without(usual, 'voice.'));
        // The AI helper has no settings for students.
        expect(available({voice: false, ai: true}).filter(id => id.startsWith('voice.'))).toEqual([]);
        expect(available({supported: false})).toEqual(without(usual, 'voice.talk'));
    });

    test('before the interface is ready', () => {
        const early = available({gui: false, parts: false});
        expect(early).toContain('help.whereAmI');
        expect(early).toContain('project.stop');
        for (const id of ['go.stage', 'view.outline', 'sprite.library', 'voice.talk', 'edit.insert']) {
            expect(early).not.toContain(id);
        }
    });

    test('the AI helper is offered only actions that cannot slip past the validator', () => {
        const app = createApp({runtime: {threads: []}, editingTarget: {}});
        app.register('gui', {tab: 0, view: 'outline'});
        app.register('outline', {isMoving: () => true});
        const offered = app.proposableActions().map(action => action.id);
        expect(offered.filter(id => /^(edit\.|voice\.|help\.commandBox)/.test(id))).toEqual([]);
    });
});
