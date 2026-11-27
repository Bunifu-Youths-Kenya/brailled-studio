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
import earconMessages from '../earcons/messages.js';
import orientationMessages from '../orientation/messages.js';
import signInMessages from '../account/editor-messages.js';
import {summarize} from '../orientation/place.js';
import {SPEECH_RATES, VERBOSITIES} from '../settings.js';
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
const withAccounts = app => (app.account().getState().enabled ? true : 'noAccounts');
const whileSignedIn = app => {
    if (withAccounts(app) !== true) return 'noAccounts';
    return app.account().getState().signedIn ? true : 'notSignedIn';
};

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
    define('help.about', {
        run: app => app.say(speech.about)
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
    define('go.voice', {
        shortcuts: [altShift('Q')],
        available: withGui,
        run: app => app.goTo('voice')
    }),

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

    // Orientation, see `orientation/place.js`: what the program is, at a glance or in full.
    define('program.summary', {
        shortcuts: [altShift('P')],
        available: withSprite,
        run: app => summarize(app.editor.outline(), app.say)
    }),
    define('program.moreDetail', {
        available: withSprite,
        run: app => summarize(app.editor.outline(), app.say, {limit: Infinity})
    }),
    define('project.narrate', {
        shortcuts: [altShift('R')],
        proposable: false,
        available: withSprite,
        run: app => app.narrator().start() || null
    }),
    // Short sounds for what happens, see `earcons/earcons.js`.
    ...[['sound.toggle', null, [altShift('E')]], ['sound.on', true, []], ['sound.off', false, []]]
        .map(([id, wanted, shortcuts]) => define(id, {
            shortcuts,
            proposable: false,
            run: app => {
                const on = wanted ?? !app.earconsOn();
                app.settings.set({earcons: on});
                return app.say(on ? earconMessages.on : earconMessages.off);
            }
        })),
    // Accounts, in an editor that has them, see `account/sign-in.js`.
    define('account.open', {
        shortcuts: [altShift('A')],
        proposable: false,
        available: withAccounts,
        run: app => app.say(app.account().open() ? signInMessages.opened : signInMessages.notOpened)
    }),
    define('account.signOut', {
        proposable: false,
        available: whileSignedIn,
        // Signing out is said when it is noticed.
        run: app => {
            app.account().signOut();
        }
    }),
    // How things are said.
    define('speech.repeat', {
        proposable: false,
        run: app => app.lastSaid() || app.say(orientationMessages.nothingToRepeat)
    }),
    ...[['speech.slower', -1], ['speech.faster', 1]].map(([id, step]) => define(id, {
        proposable: false,
        run: app => {
            const at = SPEECH_RATES.indexOf(app.settings.get().speechRate);
            const next = SPEECH_RATES[at + step];
            if (!next) return app.say(step < 0 ? orientationMessages.slowest : orientationMessages.fastest);
            app.settings.set({speechRate: next});
            return app.say(step < 0 ? orientationMessages.slower : orientationMessages.faster);
        }
    })),
    ...[['speech.shorter', -1], ['speech.longer', 1]].map(([id, step]) => define(id, {
        proposable: false,
        run: app => {
            const at = VERBOSITIES.indexOf(app.settings.get().verbosity);
            const level = VERBOSITIES[Math.min(Math.max(at + step, 0), VERBOSITIES.length - 1)];
            app.settings.set({verbosity: level});
            return app.say(orientationMessages.verbosity, {level});
        }
    })),
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
