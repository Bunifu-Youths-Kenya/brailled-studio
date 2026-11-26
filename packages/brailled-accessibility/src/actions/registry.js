/*
 * Every action the editor offers. Keys, typed commands and, later, voice and AI all go through this list.
 *
 * An action has an id, a spoken name and description, shortcuts, the place its shortcuts work (`global` or
 * `outline`), an availability check and a handler. Shortcuts that can be chosen come from `shortcutsFor`.
 * Both functions take the app (see `app.js`). `available` returns true or the key of a message saying why not.
 * `run` may return a sentence to announce, or false if it did nothing and the key should keep its usual meaning.
 * The AI helper may propose any action that is not marked `proposable: false`.
 */
import {SCRIPTS_VIEWS} from '../views.js';
import {descriptions, names, speech} from './messages.js';
import {altShift, control, plain, shift, TALK_KEYS, VIEW_TOGGLE, WAKE_KEY} from './shortcuts.js';
import {describeAbilities, describePlace} from './snapshot.js';

const always = () => true;
const withSprite = app => (app.vm.editingTarget ? true : 'needsSprite');
const inOutline = app => (app.outlineIsShown() && app.outline() ? true : 'needsOutline');
const whileMoving = app => (inOutline(app) === true && !app.outline().isMoving() ? 'needsMoving' : inOutline(app));
const withGui = app => (app.gui() ? true : 'notReady');
const withVoice = app => (app.config.get().voice ? true : 'voiceOff');
const withWake = app => {
    const {voice, wakeWord} = app.config.get();
    if (!voice || !wakeWord?.enabled) return 'wakeOff';
    return app.wake() ? true : 'notReady';
};
const withAi = app => (app.config.get().ai ? true : 'noAi');

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
const inTree = (id, shortcuts, run, available = inOutline, options = {}) =>
    define(id, {scope: 'outline', shortcuts, run, available, ...options});
// An edit made by hand, at the focused block. The AI helper proposes edit commands instead, which are checked.
const byHand = (id, shortcuts, run, available = inOutline) =>
    inTree(id, shortcuts, run, available, {proposable: false});

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
    define('help.introduce', {
        proposable: false,
        run: app => app.introduction.ask()
    }),
    define('help.commandBox', {
        proposable: false,
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
    goTo('go.voice', 'voice'),

    define('voice.talk', {
        proposable: false,
        shortcutsFor: app => [TALK_KEYS[app.settings.get().talkKey]],
        available: app => {
            if (withVoice(app) !== true) return 'voiceOff';
            if (!app.voice()) return 'notReady';
            return app.voice().isSupported() ? true : 'voiceUnsupported';
        },
        run: app => app.voice().toggle()
    }),
    ...['build', 'guide'].map(mode => define(`mode.${mode}`, {
        proposable: false,
        available: withAi,
        run: app => {
            app.setMode(mode);
            return app.say(mode === 'guide' ? speech.guideMode : speech.buildMode);
        }
    })),
    define('memory.forget', {
        proposable: false,
        available: withAi,
        run: app => {
            app.memory.clear();
            return app.say(speech.forgotten);
        }
    }),

    define('voice.wake', {
        proposable: false,
        shortcuts: [WAKE_KEY],
        available: withWake,
        run: app => {
            if (app.wake().getState().on) app.wake().stop();
            else app.wake().start();
        }
    }),
    define('voice.stopListening', {
        proposable: false,
        available: withWake,
        run: app => app.wake().stop()
    }),

    define('voice.settings', {
        proposable: false,
        available: app => (withVoice(app) === true ? withGui(app) : 'voiceOff'),
        run: app => app.gui().openSettings()
    }),

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

    byHand('edit.insert', [plain('i', 'I')], app => app.outline().insert(false)),
    byHand('edit.insertBefore', [shift('i', 'Shift+I')], app => app.outline().insert(true)),
    byHand('edit.delete', [plain('Delete'), plain('Backspace')], app => app.outline().remove()),
    byHand('edit.values', [plain('Enter')], app => app.outline().editValues()),
    byHand('edit.move', [plain('m', 'M')], app => app.outline().move(false)),
    byHand('edit.moveBefore', [shift('m', 'Shift+M')], app => app.outline().move(true)),
    byHand('edit.moveNewScript', [plain('n', 'N')], app => app.outline().moveToNewScript(), whileMoving),
    byHand('edit.cancelMove', [plain('Escape')], app => app.outline().cancelMove(), whileMoving),
    byHand('edit.wrap', [plain('w', 'W')], app => app.outline().wrap(false)),
    byHand('edit.wrapFollowing', [shift('w', 'Shift+W')], app => app.outline().wrap(true)),
    byHand('edit.createData', [plain('v', 'V')], app => app.outline().createData()),
    byHand('edit.renameData', [shift('v', 'Shift+V')], app => app.outline().renameData()),
    byHand('edit.undo', [control('z', 'Control+Z')], app => {
        app.editor.run({op: 'undo'});
    }, withSprite),
    byHand('edit.redo', [control('y', 'Control+Y'),
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
