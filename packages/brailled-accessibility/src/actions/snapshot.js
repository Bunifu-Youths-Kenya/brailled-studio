// A compact account of where the user is, as data, as text for a model to read, and as speech.
import {accessibleName, roleOf, tidy, zoneOf} from './dom.js';
import orientationMessages from '../orientation/messages.js';
import {roleNames, speech, zoneNames} from './messages.js';

const EDITOR_TABS = ['code', 'costumes', 'sounds'];

const readFocus = (document, intl) => {
    const element = document.activeElement;
    if (!element || element === document.body) return {zone: null, area: null, control: null};
    const zone = zoneOf(element);
    // The nearest named part around the control, inside its zone.
    const region = element.parentElement?.closest('[aria-label], [aria-labelledby]');
    const area = region && zoneOf(region) === zone ? accessibleName(region) : '';
    const role = roleOf(element);
    // A zone itself, focused by "go to", is not a control.
    const isZone = ['banner', 'main', 'complementary', 'navigation'].includes(role);
    const label = role && roleNames[role] ? intl.formatMessage(roleNames[role]) : role;
    return {
        zone,
        area: area || null,
        control: isZone ? null : {name: accessibleName(element) || null, role: label || null}
    };
};

const readDevice = document => ({
    stageTab: document.querySelector('[data-brailled-stage-tab][aria-selected="true"]')
        ?.getAttribute('data-brailled-stage-tab') || null,
    // Nothing connects to hardware yet.
    device: {
        name: null,
        connected: false,
        mode: document.querySelector('[data-brailled-device-mode]')
            ?.getAttribute('data-brailled-device-mode') || 'live'
    }
});

const isRunning = vm => vm.runtime.threads.some(thread => !thread.updateMonitor && thread.status !== 4);

/**
 * Describe the state of the editor.
 * @param {object} options Options.
 * @param {object} options.app The app (see `app.js`).
 * @param {Document} options.document The page.
 * @param {object} options.intl A react-intl object.
 * @param {object[]} options.actions Actions usable now: `{id, name, shortcut, here}`.
 * @returns {object} Plain data that can be turned into JSON.
 */
const buildSnapshot = ({app, document, intl, actions}) => {
    const gui = app.gui();
    const outline = app.outline();
    const target = app.vm.editingTarget;
    return {
        view: {tab: EDITOR_TABS[gui?.tab ?? 0], scripts: gui?.view || null},
        focus: readFocus(document, intl),
        sprite: target ? {name: target.getName(), isStage: !!target.isStage} : null,
        outline: outline?.position() || null,
        moving: outline?.movingText() || null,
        ...readDevice(document),
        project: {running: isRunning(app.vm)},
        actions
    };
};

// A few short lines, for a model to read.
const snapshotToText = snapshot => {
    const {view, focus, sprite, outline, moving, stageTab, device, project, actions} = snapshot;
    const place = [focus.zone || 'nowhere', focus.area].filter(Boolean).join(' > ');
    const control = focus.control ?
        `${focus.control.role || 'element'} "${focus.control.name || 'unnamed'}"` :
        'none';
    return [
        `view: ${view.tab} tab${view.tab === 'code' ? `, ${view.scripts}` : ''}`,
        `focus: ${place}; control: ${control}`,
        `sprite: ${sprite ? `${sprite.name}${sprite.isStage ? ' (stage)' : ''}` : 'none'}`,
        outline ?
            `outline: "${outline.item}" level ${outline.level}, ${outline.position}/${outline.count}, ` +
                `script ${outline.script}/${outline.scripts}` :
            'outline: empty',
        ...(moving ? [`moving: "${moving}"`] : []),
        `stage tab: ${stageTab || 'none'}`,
        `device: ${device.name || 'none'}, ${device.connected ? 'connected' : 'not connected'}, ` +
            `${device.mode} mode`,
        `project: ${project.running ? 'running' : 'stopped'}`,
        `actions: ${actions.map(action => action.id).join(' ')}`
    ].join('\n');
};

// Where the student is in the outline: on a block, its number, what holds it and its neighbours.
const placeInOutline = (outline, say) => {
    const {block} = outline;
    if (!block) return say(speech.outlinePlace, outline);
    const values = {...block, holder: block.holder ?? 'none'};
    const where = say(block.scripts > 1 ? orientationMessages.placeScript : orientationMessages.place, values);
    const neighbours = block.previous || block.next ?
        say(orientationMessages.neighbours, {previous: block.previous ?? 'none', next: block.next ?? 'none'}) :
        say(orientationMessages.alone);
    return `${say(speech.onBlock, {item: outline.item})} ${where} ${neighbours}`;
};

// The answer to "where am I".
const describePlace = (snapshot, intl) => {
    const say = (message, values) => intl.formatMessage(message, values);
    const {view, focus, sprite, outline, moving, project} = snapshot;
    const zone = focus.zone && say(zoneNames[focus.zone]);
    const control = focus.control &&
        tidy([focus.control.name, focus.control.role].filter(Boolean).join(', '));

    let where = say(speech.noFocus);
    if (zone && control) where = say(speech.youAreInOn, {zone, control});
    else if (zone) where = say(speech.youAreIn, {zone});
    else if (control) where = say(speech.youAreOn, {control});

    return [
        where,
        sprite && say(speech.selected, {name: sprite.name, isStage: String(sprite.isStage)}),
        view.tab === 'code' ?
            say(speech.codeTab, {view: view.scripts}) :
            say(speech.otherTab, {tab: view.tab}),
        view.tab === 'code' && view.scripts === 'outline' && outline && placeInOutline(outline, say),
        moving && say(speech.moving, {item: moving}),
        focus.zone === 'stage' && snapshot.stageTab === 'devices' &&
            say(speech.device, {mode: snapshot.device.mode}),
        say(speech.running, {running: String(project.running)})
    ].filter(Boolean).join(' ');
};

// The answer to "what can I do here": what belongs to this place, then what works anywhere.
const describeAbilities = (snapshot, intl) => {
    const say = (message, values) => intl.formatMessage(message, values);
    const list = actions => actions
        .map(({name, shortcut}) => (shortcut ? say(speech.withShortcut, {name, shortcut}) : name))
        .join(', ');
    const here = snapshot.actions.filter(action => action.here);
    const anywhere = snapshot.actions.filter(action => !action.here);
    return [
        here.length > 0 && say(speech.canDoHere, {list: list(here)}),
        say(speech.canDoAnywhere, {list: list(anywhere)})
    ].filter(Boolean).join(' ');
};

export {
    buildSnapshot,
    describeAbilities,
    describePlace,
    snapshotToText
};
