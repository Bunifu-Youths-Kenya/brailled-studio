/*
 * The two worked examples, from the student's words to the change, with the AI's replies written here. What the
 * replies would be from a real model is not tested.
 */
import {routeCommand} from '../src/actions/route.js';
import {answer, setUp, spriteLibrary} from './proposal-setup.js';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// What the AI is asked to do for "add a sprite", as its instructions describe.
const spriteReplies = body => {
    if (body.transcript === 'add a sprite') {
        return answer({type: 'question',
            question: 'Which kind of sprite?',
            choices: ['Animals', 'People', 'Things'],
            steps: [{action: 'sprite.library'}]});
    }
    if (body.spriteCategories.includes(body.transcript.toLowerCase())) {
        return answer({type: 'question', question: 'Which one?', spritesFrom: body.transcript.toLowerCase()});
    }
    if (body.transcript === 'more') {
        return answer({type: 'question', question: 'Which one?', spritesFrom: 'animals', page: 2});
    }
    const name = body.transcript;
    return answer({type: 'proposal',
        summary: `Add the ${name} sprite and select it.`,
        steps: [{sprite: {name}}]});
};

describe('add a sprite', () => {
    const animals = spriteLibrary.filter(sprite => sprite.tags.includes('animals')).map(sprite => sprite.name);

    test('open the library, ask the kind, read names, pick, approve, done, undo', async () => {
        const {app, assistant, gate, sprites, settle, requests, heard, vm, data} = setUp({respond: spriteReplies});
        const before = data();
        const sprite = vm.editingTarget;

        routeCommand(app, 'add a sprite', 'voice');
        await settle();
        // The library opens without asking, as it only moves about.
        expect(sprites.openLibrary).toHaveBeenCalledTimes(1);
        expect(assistant.getState().reply).toMatchObject(
            {question: 'Which kind of sprite?', choices: ['Animals', 'People', 'Things']});
        expect(requests[0].body.spriteCategories).toEqual(expect.arrayContaining(['animals', 'people', 'things']));

        routeCommand(app, 'one', 'voice');
        await settle();
        expect(requests[1].body).toMatchObject({transcript: 'Animals',
            previous: {question: 'Which kind of sprite?'}});
        // The editor lists names from its own library.
        expect(assistant.getState().reply.choices).toEqual(animals.slice(0, 5));

        routeCommand(app, 'more', 'voice');
        await settle();
        expect(assistant.getState().reply.choices).toEqual(animals.slice(5, 10));

        routeCommand(app, 'Dragon', 'voice');
        await settle();
        expect(gate.getState().proposal.steps).toEqual(
            [{sentence: 'Add the Dragon sprite and select it', risk: 'edit'}]);
        expect(sprites.add).not.toHaveBeenCalled();
        expect(data()).toBe(before);

        routeCommand(app, 'yes', 'voice');
        await settle();
        expect(sprites.add).toHaveBeenCalledWith(expect.objectContaining({name: 'Dragon'}));
        expect(vm.editingTarget.getName()).toBe('Dragon');
        expect(sprites.closeLibrary).toHaveBeenCalled();
        expect(gate.getState().status).toBe('done');
        expect(heard.at(-1)).toBe('Done. Added the Dragon sprite and selected it. To take it back, say undo.');

        expect(app.editor.validate({op: 'undo'}).ok).toBe(true);
        routeCommand(app, 'undo', 'voice');
        await settle();
        expect(vm.deleteSprite).toHaveBeenCalledWith('added-Dragon');
        expect(vm.editingTarget).toBe(sprite);
        expect(data()).toBe(before);
        // The Outline view, which is not part of this test, says "Undone".
    });

    test('saying no adds nothing', async () => {
        const {app, sprites, settle, data} = setUp({respond: spriteReplies});
        const before = data();
        routeCommand(app, 'Dragon', 'typed');
        await settle();
        routeCommand(app, 'no', 'typed');
        await settle();
        expect(sprites.add).not.toHaveBeenCalled();
        expect(data()).toBe(before);
    });

    test('a sprite the library does not have is refused', async () => {
        const {app, gate, heard, settle} = setUp({respond: spriteReplies});
        routeCommand(app, 'Space Wizard Deluxe', 'typed');
        await settle();
        expect(gate.getState().status).toBe('idle');
        expect(heard.at(-1)).toBe('I couldn\'t work that out, please try again.');
    });
});

describe('add a wait of 2 seconds after the move block', () => {
    const respond = (body, context) => {
        const move = body.program.find(line => line.includes(' motion_movesteps:')).trim()
            .split(' ')[0];
        const seconds = context?.seconds ?? (body.revises ? 3 : 2);
        return answer({type: 'proposal',
            summary: `Wait ${seconds} seconds after moving.`,
            steps: [
                {command: {op: 'insert', block: 'control_wait', after: move, args: {DURATION: seconds}}}]});
    };

    test('propose, approve, done, read back, highlighted, undo', async () => {
        const {app, gate, program, heard, highlight, settle, data, vm} = setUp({respond: body => respond(body)});
        const before = data();
        routeCommand(app, 'add a wait of 2 seconds after the move block', 'voice');
        await settle();
        expect(gate.getState().proposal).toMatchObject({summary: 'Wait 2 seconds after moving.',
            steps: [{sentence: 'Add wait 2 seconds, after move 10 steps'}]});
        expect(data()).toBe(before);

        routeCommand(app, 'go ahead', 'voice');
        await settle();
        // The new wait comes between the move and the wait that was already there.
        expect(program()).toEqual(['when green flag clicked', 'move 10 steps', 'wait 2 seconds', 'wait 2 seconds']);
        expect(heard.at(-1)).toBe('Done. Added: wait 2 seconds, after move 10 steps. To take it back, say undo.');
        const [[added]] = highlight.mock.calls.at(-1);
        expect(vm.editingTarget.blocks._blocks.move.next).toBe(added);
        expect(vm.editingTarget.blocks._blocks[added].next).toBe('wait');

        routeCommand(app, 'undo', 'voice');
        await settle();
        expect(data()).toBe(before);
    });

    test('"change it: three seconds" brings a new suggestion to approve', async () => {
        const {app, gate, program, requests, settle} = setUp({respond: body => respond(body)});
        routeCommand(app, 'add a wait of 2 seconds after the move block', 'voice');
        await settle();
        routeCommand(app, 'change it: three seconds', 'voice');
        await settle();
        expect(requests[1].body.revises.steps).toEqual(['Add wait 2 seconds, after move 10 steps']);
        expect(gate.getState().proposal.steps[0].sentence).toBe('Add wait 3 seconds, after move 10 steps');
        expect(program()).toHaveLength(3);
        routeCommand(app, 'yes', 'voice');
        await settle();
        expect(program()).toEqual(['when green flag clicked', 'move 10 steps', 'wait 3 seconds', 'wait 2 seconds']);
    });
});
