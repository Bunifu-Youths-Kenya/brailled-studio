/*
 * Every action the editor offers. Keys, typed commands and, later, voice and AI all go through this list.
 *
 * An action has an id, a spoken name and description, shortcuts, the place its shortcuts work (`global` or
 * `outline`), an availability check and a handler. Both take the app (see `app.js`). `available` returns true
 * or the key of a message saying why not. `run` may return a sentence to announce, or false if it did nothing
 * and the key should keep its usual meaning.
 */
import {SCRIPTS_VIEWS} from '../views.js';
import {descriptions, names, speech} from './messages.js';
import {altShift, control, plain, shift, VIEW_TOGGLE} from './shortcuts.js';
import {describeAbilities, describePlace} from './snapshot.js';

const always = () => true;
const withSprite = app => (app.vm.editingTarget ? true : 'needsSprite');
const inOutline = app => (app.outlineIsShown() && app.outline() ? true : 'needsOutline');
const whileMoving = app => (inOutline(app) === true && !app.outline().isMoving() ? 'needsMoving' : inOutline(app));
const withGui = app => (app.gui() ? true : 'notReady');

const define = (id, options) => {
    const key = id.replace(/\./g, '_');
    return {
        id,
        name: names[key],
        description: descriptions[key],
        shortcuts: [],
        scope: 'global',
        available: always,
        ...options
    };
};

// Actions whose shortcuts work while focus is in the Outline.
const inTree = (id, shortcuts, run, available = inOutline) =>
    define(id, {scope: 'outline', shortcuts, run, available});

const goTo = (id, zone, available = withGui) => define(id, {
    available,
    run: app => app.goTo(zone)
});

const ACTIONS = [
    define('help.whereAmI', {
        shortcuts: [altShift('W')],
        run: app => describePlace(app.snapshot(), app.intl())
    }),
    define('help.whatCanIDo', {
        shortcuts: [altShift('H')],
        run: app => describeAbilities(app.snapshot(), app.intl())
    }),
    define('help.commandBox', {
        shortcuts: [altShift('K')],
        available: withGui,
        run: app => app.gui().openCommandBox()
    }),

    goTo('go.menu', 'menu'),
    goTo('go.stage', 'stage'),
    goTo('go.devices', 'devices'),
    goTo('go.sprites', 'sprites'),
    goTo('go.background', 'background'),
    goTo('go.palette', 'palette'),
    goTo('go.scripts', 'scripts'),

    define('view.blocks', {available: withGui, run: app => app.showView(SCRIPTS_VIEWS.blocks)}),
    define('view.outline', {available: withGui, run: app => app.showView(SCRIPTS_VIEWS.outline)}),
    define('view.python', {available: () => 'pythonSoon', run: () => false}),
    define('view.toggle', {
        shortcuts: [VIEW_TOGGLE],
        available: withGui,
        // From the Costumes or Sounds tab this opens the outline.
        run: app => {
            const view = app.outlineIsShown() ? SCRIPTS_VIEWS.blocks : SCRIPTS_VIEWS.outline;
            app.showView(view);
        }
    }),

    define('move.next', {run: app => app.step(1)}),
    define('move.previous', {run: app => app.step(-1)}),

    inTree('program.describe', [plain('d', 'D')], app => {
        app.editor.run({op: 'describe'});
    }, withSprite),
    inTree('program.describeScript', [shift('d', 'Shift+D')], app => {
        const script = app.outline()?.currentBlock();
        app.editor.run({op: 'describe', ...(script ? {script} : {})});
    }, withSprite),

    inTree('edit.insert', [plain('i', 'I')], app => app.outline().insert(false)),
    inTree('edit.insertBefore', [shift('i', 'Shift+I')], app => app.outline().insert(true)),
    inTree('edit.delete', [plain('Delete'), plain('Backspace')], app => app.outline().remove()),
    inTree('edit.values', [plain('Enter')], app => app.outline().editValues()),
    inTree('edit.move', [plain('m', 'M')], app => app.outline().move(false)),
    inTree('edit.moveBefore', [shift('m', 'Shift+M')], app => app.outline().move(true)),
    inTree('edit.moveNewScript', [plain('n', 'N')], app => app.outline().moveToNewScript(), whileMoving),
    inTree('edit.cancelMove', [plain('Escape')], app => app.outline().cancelMove(), whileMoving),
    inTree('edit.wrap', [plain('w', 'W')], app => app.outline().wrap(false)),
    inTree('edit.wrapFollowing', [shift('w', 'Shift+W')], app => app.outline().wrap(true)),
    inTree('edit.createData', [plain('v', 'V')], app => app.outline().createData()),
    inTree('edit.renameData', [shift('v', 'Shift+V')], app => app.outline().renameData()),
    inTree('edit.undo', [control('z', 'Control+Z')], app => {
        app.editor.run({op: 'undo'});
    }, withSprite),
    inTree('edit.redo', [control('y', 'Control+Y'),
        {key: 'z', ctrl: true, shift: true, label: 'Control+Shift+Z'}], app => {
        app.editor.run({op: 'redo'});
    }, withSprite),

    define('project.run', {
        available: withSprite,
        run: app => {
            app.vm.start();
            app.vm.greenFlag();
            return app.say(speech.started);
        }
    }),
    define('project.stop', {
        run: app => {
            app.vm.stopAll();
            return app.say(speech.stopped);
        }
    }),
    define('sprite.library', {
        available: app => (app.sprites() ? true : 'notReady'),
        run: app => {
            app.sprites().openLibrary();
            return app.say(speech.libraryOpened);
        }
    })
];

const findAction = id => ACTIONS.find(action => action.id === id) || null;

const shortcutLabel = id => findAction(id)?.shortcuts[0]?.label || null;

export {
    ACTIONS,
    findAction,
    shortcutLabel
};
