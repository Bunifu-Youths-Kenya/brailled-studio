import {makeProject} from './helpers.js';

import simple from './fixtures/simple-sequence.json';

const messagesOf = project => Object.values(project.stage.variables)
    .filter(variable => variable.type === 'broadcast_msg');
const named = (target, name) => Object.values(target.variables).find(variable => variable.name === name);
// Fields that refer to variables, lists or messages, across the whole project.
const references = project => project.vm.runtime.targets.flatMap(target => Object.values(target.blocks._blocks)
    .flatMap(block => Object.values(block.fields).filter(field => field.id)
        .map(field => field.value)));

describe('creating variables, lists and messages', () => {
    test.each([
        [{kind: 'variable', name: 'score'}, 'Created variable score, for all sprites', 'stage', ''],
        [{kind: 'variable', name: 'lives', scope: 'sprite'},
            'Created variable lives, for this sprite only', 'target', ''],
        [{kind: 'list', name: ' food '}, 'Created list food, for all sprites', 'stage', 'list'],
        [{kind: 'list', name: 'bag', scope: 'sprite'}, 'Created list bag, for this sprite only', 'target', 'list'],
        [{kind: 'message', name: 'game over'},
            'Created message game over. It is saved with the project once a block uses it.',
            'stage', 'broadcast_msg']
    ])('%j, then undo and redo', (options, sentence, owner, type) => {
        const project = makeProject();
        const before = project.everything();
        const result = project.editor.run({op: 'create', ...options});
        expect(result).toMatchObject({ok: true, changed: true, message: sentence});
        expect(named(project[owner], options.name.trim())).toMatchObject({type});
        const created = project.everything();

        expect(project.editor.run({op: 'undo'}).message).toBe(`Undone. ${sentence}`);
        expect(project.everything()).toEqual(before);
        expect(project.editor.run({op: 'redo'}).message).toBe(`Redone. ${sentence}`);
        expect(project.everything()).toEqual(created);
    });

    test('results say when variables, lists or messages changed', () => {
        const {editor} = makeProject();
        expect(editor.run({op: 'create', kind: 'variable', name: 'a'}).dataChanged).toBe(true);
        expect(editor.run({op: 'undo'}).dataChanged).toBe(true);
        expect(editor.run({op: 'insert', block: 'looks_show'}).dataChanged).toBe(false);
    });

    test('variables and lists redraw the workspace; a new message does not', () => {
        const project = makeProject();
        project.editor.run({op: 'create', kind: 'message', name: 'go'});
        expect(project.vm.emitWorkspaceUpdate).not.toHaveBeenCalled();
        project.editor.run({op: 'create', kind: 'variable', name: 'score'});
        expect(project.vm.emitWorkspaceUpdate).toHaveBeenCalledTimes(1);
    });

    test('the same name may be used for different kinds', () => {
        const project = makeProject();
        for (const kind of ['variable', 'list', 'message']) {
            expect(project.editor.run({op: 'create', kind, name: 'thing'}).ok).toBe(true);
        }
    });

    test.each([
        ['an empty name', {kind: 'variable', name: '  '}, 'A variable needs a name.'],
        ['an empty message', {kind: 'message', name: ''}, 'A message needs a name.'],
        ['a name in use, whatever its case', {kind: 'variable', name: 'My Variable'},
            'There is already a variable called "My Variable".'],
        ['a list name in use', {kind: 'list', name: 'fruit', scope: 'sprite'},
            'There is already a list called "fruit".'],
        ['a message for one sprite', {kind: 'message', name: 'go', scope: 'sprite'},
            'Messages are always for all sprites.']
    ])('refuses %s', (title, options, reason) => {
        const project = makeProject();
        const before = project.everything();
        const command = {op: 'create', ...options};
        expect(project.editor.validate(command)).toEqual({ok: false, reason});
        expect(project.editor.run(command)).toMatchObject({ok: false, reason});
        expect(project.everything()).toEqual(before);
    });

    test('checking a command creates nothing', () => {
        const project = makeProject();
        const before = project.everything();
        expect(project.editor.validate({op: 'create', kind: 'variable', name: 'x'})).toEqual({ok: true});
        expect(project.everything()).toEqual(before);
    });

    test('a name for all sprites cannot hide behind a sprite\'s own', () => {
        const project = makeProject();
        project.editor.run({op: 'create', kind: 'variable', name: 'lives', scope: 'sprite'});
        project.vm.editingTarget = project.other;
        expect(project.editor.run({op: 'create', kind: 'variable', name: 'lives'}).reason)
            .toBe('A sprite already has its own variable called "lives".');
        // Another sprite may have its own with that name.
        expect(project.editor.run({op: 'create', kind: 'variable', name: 'lives', scope: 'sprite'}).ok)
            .toBe(true);
    });

    test('the stage has none of its own', () => {
        const project = makeProject({isStage: true});
        expect(project.editor.run({op: 'create', kind: 'list', name: 'x', scope: 'sprite'}).reason)
            .toBe('The stage\'s variables and lists are for all sprites.');
    });

    test('cannot be undone while blocks use it, even in another sprite', () => {
        const project = makeProject();
        project.editor.run({op: 'create', kind: 'variable', name: 'score'});
        project.vm.editingTarget = project.other;
        project.editor.run({op: 'insert', block: 'data_setvariableto', args: {VARIABLE: 'score'}});
        project.vm.editingTarget = project.target;
        expect(project.editor.run({op: 'undo'}).reason).toMatch(/Blocks use "score"/);
        expect(named(project.stage, 'score')).toBeDefined();
    });

    test('a new message stays on offer after the project drops it, and can be used', () => {
        const project = makeProject();
        project.editor.run({op: 'create', kind: 'message', name: 'go'});
        // What the editor does when it redraws and no block uses the message.
        messagesOf(project).forEach(message => delete project.stage.variables[message.id]);
        expect(project.editor.listData().items).toContainEqual({kind: 'message', name: 'go', scope: 'all'});
        expect(project.editor.run({op: 'create', kind: 'message', name: 'Go'}).reason)
            .toBe('There is already a message called "Go".');

        const result = project.editor.run({op: 'insert', block: 'event_broadcast', args: {BROADCAST_INPUT: 'go'}});
        expect(result.ok).toBe(true);
        expect(messagesOf(project)).toEqual([expect.objectContaining({name: 'go', value: 'go'})]);
        expect(project.editor.valuesOf(result.focusId)[0].options).toEqual([{value: 'go', label: 'go'}]);
    });

    test('lists what a sprite can use', () => {
        const project = makeProject();
        project.editor.run({op: 'create', kind: 'variable', name: 'lives', scope: 'sprite'});
        expect(project.editor.listData()).toEqual({isStage: false,
            items: [
                {kind: 'variable', name: 'lives', scope: 'sprite'},
                {kind: 'variable', name: 'my variable', scope: 'all'},
                {kind: 'list', name: 'fruit', scope: 'all'}
            ]});
        project.vm.editingTarget = project.other;
        expect(project.editor.listData().items.map(item => item.name)).toEqual(['my variable', 'fruit']);
    });
});

describe('renaming', () => {
    // Both sprites use the shared variable, and one asks the other about its own variable.
    const setUp = () => {
        const project = makeProject({program: simple});
        const {editor, vm, other, target} = project;
        editor.run({op: 'create', kind: 'message', name: 'go'});
        editor.run({op: 'insert', block: 'data_setvariableto', after: 'wait', args: {VARIABLE: 'my variable'}});
        editor.run({op: 'insert', block: 'data_addtolist', after: 'wait'});
        editor.run({op: 'insert', block: 'event_broadcast', after: 'wait', args: {BROADCAST_INPUT: 'go'}});
        vm.editingTarget = other;
        editor.run({op: 'create', kind: 'variable', name: 'size here', scope: 'sprite'});
        editor.run({op: 'insert', block: 'data_changevariableby', args: {VARIABLE: 'my variable'}});
        editor.run({op: 'insert', block: 'event_whenbroadcastreceived', args: {BROADCAST_OPTION: 'go'}});
        vm.editingTarget = target;
        editor.run({op: 'insert',
            block: 'looks_say',
            after: 'wait',
            args: {MESSAGE: {block: 'sensing_of', args: {OBJECT: 'Apple', PROPERTY: 'size here'}}}});
        return project;
    };

    test.each([
        ['variable', 'my variable', 'points'],
        ['list', 'fruit', 'food'],
        ['message', 'go', 'the end']
    ])('a shared %s changes every block that uses it, and undo restores everything', (kind, from, to) => {
        const project = setUp();
        const before = project.everything();
        const uses = references(project).filter(value => value === from).length;
        expect(uses).toBeGreaterThan(0);

        expect(project.editor.run({op: 'rename', kind, name: from, to}))
            .toMatchObject({ok: true, message: `Renamed ${kind} ${from} to ${to}`});
        expect(references(project).filter(value => value === to)).toHaveLength(uses);
        expect(references(project)).not.toContain(from);
        expect(named(project.stage, to)).toBeDefined();
        // A message is saved by its value.
        if (kind === 'message') expect(named(project.stage, to).value).toBe(to);
        const renamed = project.everything();

        expect(project.editor.run({op: 'undo'}).ok).toBe(true);
        expect(project.everything()).toEqual(before);
        expect(project.editor.run({op: 'redo'}).ok).toBe(true);
        expect(project.everything()).toEqual(renamed);
    });

    test('a sprite\'s own variable also renames what asks about it', () => {
        const project = setUp();
        const before = project.everything();
        project.vm.editingTarget = project.other;
        expect(project.editor.run({op: 'rename', kind: 'variable', name: 'size here', to: 'height'}).ok).toBe(true);
        const asked = Object.values(project.target.blocks._blocks).find(block => block.opcode === 'sensing_of');
        expect(asked.fields.PROPERTY.value).toBe('height');
        project.editor.run({op: 'undo'});
        expect(project.everything()).toEqual(before);
    });

    test('earlier edits can still be undone and redone, with the new name', () => {
        const project = makeProject({program: simple});
        const {editor, vm, other, target} = project;
        editor.run({op: 'insert', block: 'data_setvariableto', after: 'wait'});
        vm.editingTarget = other;
        editor.run({op: 'rename', kind: 'variable', name: 'my variable', to: 'points'});
        vm.editingTarget = target;
        expect(editor.run({op: 'undo'}).ok).toBe(true);
        expect(editor.run({op: 'redo'}).ok).toBe(true);
        expect(references(project)).toEqual(['points']);
    });

    test('a deleted block comes back with the new name', () => {
        const project = makeProject({program: simple});
        const {editor, vm, other, target} = project;
        const set = editor.run({op: 'insert', block: 'data_setvariableto', after: 'wait'}).focusId;
        editor.run({op: 'delete', block: set});
        vm.editingTarget = other;
        editor.run({op: 'rename', kind: 'variable', name: 'my variable', to: 'points'});
        vm.editingTarget = target;
        expect(editor.run({op: 'undo'}).ok).toBe(true);
        expect(references(project)).toEqual(['points']);
    });

    test('a message no block uses can be renamed', () => {
        const project = makeProject();
        project.editor.run({op: 'create', kind: 'message', name: 'go'});
        messagesOf(project).forEach(message => delete project.stage.variables[message.id]);
        expect(project.editor.run({op: 'rename', kind: 'message', name: 'go', to: 'stop'}).ok).toBe(true);
        expect(project.editor.listData().items.map(item => item.name)).toContain('stop');
        expect(project.editor.run({op: 'undo'}).ok).toBe(true);
        expect(project.editor.listData().items.map(item => item.name)).toContain('go');
    });

    test('may change only the case of a name', () => {
        const project = makeProject();
        expect(project.editor.run({op: 'rename', kind: 'list', name: 'fruit', to: 'Fruit'}).ok).toBe(true);
    });

    test('says when nothing changes', () => {
        const project = makeProject();
        expect(project.editor.run({op: 'rename', kind: 'list', name: 'fruit', to: 'fruit'}))
            .toMatchObject({ok: true, changed: false, message: 'No change.'});
    });

    test.each([
        ['an unknown item', {kind: 'variable', name: 'nope', to: 'x'}, 'There is no variable called "nope".'],
        ['an empty new name', {kind: 'list', name: 'fruit', to: ' '}, 'A list needs a name.'],
        ['a name in use', {kind: 'variable', name: 'my variable', to: 'other'},
            'There is already a variable called "other".']
    ])('refuses %s', (title, options, reason) => {
        const project = makeProject();
        project.editor.run({op: 'create', kind: 'variable', name: 'other'});
        const before = project.everything();
        expect(project.editor.run({op: 'rename', ...options})).toMatchObject({ok: false, reason});
        expect(project.everything()).toEqual(before);
    });

    test('refuses cloud variables', () => {
        const project = makeProject();
        named(project.stage, 'my variable').isCloud = true;
        expect(project.editor.run({op: 'rename', kind: 'variable', name: 'my variable', to: 'x'}).reason)
            .toBe('Cloud variables cannot be renamed here.');
    });

    test('is not reversed if the name has since been changed another way', () => {
        const project = makeProject();
        project.editor.run({op: 'rename', kind: 'list', name: 'fruit', to: 'food'});
        project.stage.renameVariable('names', 'snacks');
        expect(project.editor.run({op: 'undo'}).reason).toMatch(/changed in another way/);
    });
});
