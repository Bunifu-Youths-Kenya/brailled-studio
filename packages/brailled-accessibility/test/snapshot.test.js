/**
 * @jest-environment jsdom
 */
import {createApp} from '../src/actions/app.js';
import {accessibleName, roleOf, zoneOf} from '../src/actions/dom.js';
import {describeAbilities, describePlace, snapshotToText} from '../src/actions/snapshot.js';

const PAGE = `
<header aria-label="Menu topbar"><select aria-label="Language"></select>
    <button><img alt="" src="x"><span>File</span></button></header>
<aside id="stage" aria-label="Stage and target">
    <ul role="tablist">
        <li role="tab" aria-selected="true" tabindex="0" data-brailled-stage-tab="devices">Devices</li></ul>
    <div data-brailled-device-mode="upload">
        <button title="Add a device"><span aria-hidden="true">+</span></button></div>
</aside>
<main aria-label="Editor"><section aria-label="Code editor panel">
    <ul role="tree"><li role="treeitem" tabindex="0" aria-labelledby="label"><span id="label">move 10 steps</span>
        <ul><li>hidden child text</li></ul></li></ul>
    <div tabindex="0" role="navigation" data-brailled-zone="palette" aria-label="Block categories"></div>
</section></main>
<label for="name">Name</label><input id="name">`;

beforeEach(() => {
    document.body.innerHTML = PAGE;
});

const element = selector => document.querySelector(selector);

describe('reading the page', () => {
    test.each([
        ['select', 'Language', 'combobox', 'menu'],
        ['header button', 'File', 'button', 'menu'],
        ['aside button', 'Add a device', 'button', 'stage'],
        ['[role="treeitem"]', 'move 10 steps', 'treeitem', 'scripts'],
        ['[data-brailled-zone]', 'Block categories', 'navigation', 'palette'],
        ['input', 'Name', 'textbox', null]
    ])('%s', (selector, name, role, zone) => {
        expect(accessibleName(element(selector))).toBe(name);
        expect(roleOf(element(selector))).toBe(role);
        expect(zoneOf(element(selector))).toBe(zone);
    });
});

const setUp = ({view = 'outline', tab = 0, threads = []} = {}) => {
    const app = createApp({
        runtime: {threads},
        editingTarget: {isStage: false, getName: () => 'Sprite1'}
    });
    app.register('gui', {tab, view});
    app.register('outline', {
        isMoving: () => false,
        movingText: () => null,
        position: () => ({item: 'move 10 steps', level: 2, position: 1, count: 3, script: 1, scripts: 2})
    });
    return app;
};

describe('the context snapshot', () => {
    test('records the view, focus, sprite, outline place, device, project and actions', () => {
        element('[role="treeitem"]').focus();
        const snapshot = setUp().snapshot();
        expect(snapshot).toMatchObject({
            view: {tab: 'code', scripts: 'outline'},
            focus: {zone: 'scripts', area: 'Code editor panel', control: {name: 'move 10 steps', role: 'tree item'}},
            sprite: {name: 'Sprite1', isStage: false},
            outline: {item: 'move 10 steps', level: 2, position: 1, count: 3},
            stageTab: 'devices',
            device: {name: null, connected: false, mode: 'upload'},
            project: {running: false}
        });
        expect(snapshot.actions).toContainEqual(
            {id: 'edit.insert', name: 'add block', shortcut: 'I', here: true});
        expect(snapshot.actions.map(action => action.id)).not.toContain('view.python');
        expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    });

    test('is a few short lines as text', () => {
        element('[role="treeitem"]').focus();
        const lines = snapshotToText(setUp().snapshot()).split('\n');
        expect(lines.slice(0, 7)).toEqual([
            'view: code tab, outline',
            'focus: scripts > Code editor panel; control: tree item "move 10 steps"',
            'sprite: Sprite1',
            'outline: "move 10 steps" level 2, 1/3, script 1/2',
            'stage tab: devices',
            'device: none, not connected, upload mode',
            'project: stopped'
        ]);
        expect(lines).toHaveLength(8);
        expect(lines[7]).toMatch(/^actions: help\.whereAmI /);
    });

    test('ignores monitors when deciding whether the project runs', () => {
        const running = threads => setUp({threads}).snapshot().project.running;
        expect(running([{updateMonitor: true, status: 0}, {status: 4}])).toBe(false);
        expect(running([{status: 0}])).toBe(true);
    });

    test('answers where am I', () => {
        element('[role="treeitem"]').focus();
        const app = setUp({threads: [{status: 0}]});
        expect(describePlace(app.snapshot(), app.intl())).toBe(
            'You are in the scripts area, on move 10 steps, tree item. Sprite Sprite1 is selected. ' +
            'Outline view. In the outline: move 10 steps, level 2, 1 of 3, in script 1 of 2. ' +
            'The project is running.');
    });

    test('answers where am I for the devices tab and another editor tab', () => {
        element('[role="tab"]').focus();
        const app = setUp({tab: 1});
        expect(describePlace(app.snapshot(), app.intl())).toBe(
            'You are in the stage area, on Devices, tab. Sprite Sprite1 is selected. Costumes tab. ' +
            'Upload mode. No device connected. The project is stopped.');
    });

    test('answers what can I do, offering outline keys only in the outline', () => {
        const app = setUp();
        element('[role="treeitem"]').focus();
        expect(describeAbilities(app.snapshot(), app.intl()))
            .toMatch(/^Here you can: .*add block \(I\).*Anywhere you can: .*where am I \(Alt\+Shift\+W\)/);
        element('select').focus();
        const elsewhere = describeAbilities(app.snapshot(), app.intl());
        expect(elsewhere).toMatch(/^Anywhere you can: /);
        expect(elsewhere).toContain('add block,');
        expect(elsewhere).not.toContain('add block (I)');
    });
});
