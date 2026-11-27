// Keeping the student oriented: summaries, where they are after an edit, cues on entering and leaving loops,
// previews of suggestions, the narrated run and pace controls. No real service.
import {createIntl} from 'react-intl';
import {describePlace} from '../src/actions/snapshot.js';
import {createNarrator} from '../src/orientation/narrator.js';
import {blocksOf, nestingCue, placeOf, placeSentence, previewOf, summarize} from '../src/orientation/place.js';
import {setUp} from './proposal-setup.js';

const intl = createIntl({locale: 'en', defaultLocale: 'en', onError: () => {}});
const say = (message, values) => intl.formatMessage(message, values);

// The sample program, with a repeat holding a turn and an if-else whose else says something:
// when green flag clicked, move 10 steps, repeat 10 [turn, if-else [then: nothing; else: say]], wait 2 seconds.
const nested = () => {
    const parts = setUp();
    const {editor} = parts.app;
    const top = () => editor.outline()[0].children;
    const move = top().find(node => node.opcode === 'motion_movesteps').id;
    const repeat = editor.run({op: 'insert', block: 'control_repeat', after: move}).focusId;
    const turn = editor.run({op: 'insert', block: 'motion_turnright', inside: {block: repeat}}).focusId;
    const choice = editor.run({op: 'insert', block: 'control_if_else', after: turn}).focusId;
    const speech = editor.run({op: 'insert', block: 'looks_say', inside: {block: choice, branch: 'SUBSTACK2'}}).focusId;
    const wait = top().find(node => node.opcode === 'control_wait').id;
    return {...parts, ids: {move, repeat, turn, choice, speech, wait}, nodes: () => editor.outline()};
};

describe('the program summary', () => {
    test('says the counts, then each block in order, with what each loop and condition holds', () => {
        const {nodes} = nested();
        expect(summarize(nodes(), say)).toBe('One script, 7 blocks. Script 1: when green flag clicked; ' +
            'move 10 steps; repeat 10, which holds 2 blocks: turn clockwise 15 degrees, ' +
            'if empty then: then: nothing; else, one block: say Hello!, end of repeat 10; wait 2 seconds.');
    });

    test('names a few blocks and counts the rest, offering more detail', () => {
        const {nodes} = nested();
        expect(summarize(nodes(), say, {limit: 3})).toBe('One script, 7 blocks. Script 1: when green flag clicked; ' +
            'move 10 steps; repeat 10, which holds 2 blocks. And 4 more blocks. Say more detail to hear everything.');
    });

    test('says when there are no blocks, and numbers several scripts', () => {
        const {app, nodes} = nested();
        expect(summarize([], say)).toBe('This sprite has no blocks yet.');
        app.editor.run({op: 'insert', block: 'looks_hide'});
        expect(summarize(nodes(), say)).toMatch(/^2 scripts, 8 blocks\. Script 1: .* Script 2: looks: hide\.$/);
    });

    test('is what "what\'s my program" and "more detail" say', () => {
        const {app, heard, nodes} = nested();
        jest.useFakeTimers();
        app.perform('program.summary');
        jest.advanceTimersByTime(300);
        expect(heard.at(-1)).toBe(summarize(nodes(), say));
        app.perform('program.moreDetail');
        jest.advanceTimersByTime(300);
        jest.useRealTimers();
        expect(heard.at(-1)).toBe(summarize(nodes(), say, {limit: Infinity}));
    });
});

describe('where the student is', () => {
    test('is the block\'s number among all of them, what holds it and its neighbours', () => {
        const {ids, nodes} = nested();
        expect(placeOf(nodes(), ids.turn)).toEqual({index: 4,
            total: 7,
            script: 1,
            scripts: 1,
            holder: 'repeat 10',
            previous: null,
            next: 'if empty then'});
        expect(placeOf(nodes(), ids.speech).holder).toBe('if empty then, else');
    });

    test.each([
        ['brief', ''],
        ['normal', 'Block 4 of 7, inside repeat 10.'],
        ['detailed', 'Block 4 of 7, inside repeat 10. First, before if empty then.']
    ])('is said at the %s detail', (verbosity, sentence) => {
        const {ids, nodes} = nested();
        expect(placeSentence({nodes: nodes(), id: ids.turn, verbosity, say})).toBe(sentence);
    });

    test('says a lone block is alone, and the script among several', () => {
        const {app, ids, nodes} = nested();
        expect(placeSentence({nodes: nodes(), id: ids.speech, verbosity: 'detailed', say}))
            .toBe('Block 6 of 7, inside if empty then, else. It is the only block there.');
        const hide = app.editor.run({op: 'insert', block: 'looks_hide'}).focusId;
        expect(placeSentence({nodes: nodes(), id: hide, verbosity: 'normal', say}))
            .toBe('Block 8 of 8, in script 2 of 2.');
    });

    test('"where am I" names the block, its number, its holder and its neighbours', () => {
        const {ids, nodes} = nested();
        const snapshot = {view: {tab: 'code', scripts: 'outline'},
            focus: {zone: 'scripts', control: null},
            sprite: {name: 'Sprite1', isStage: false},
            outline: {
                item: 'turn clockwise 15 degrees',
                level: 3,
                position: 1,
                count: 2,
                script: 1,
                scripts: 1,
                block: placeOf(nodes(), ids.turn)
            },
            moving: null,
            project: {running: false}};
        expect(describePlace(snapshot, intl)).toContain('In the outline, on turn clockwise 15 degrees. ' +
            'Block 4 of 7, inside repeat 10. First, before if empty then.');
    });
});

describe('read-back after an edit matches the program as it is', () => {
    test.each([
        ['an insert', parts => parts.app.editor.run({op: 'insert', block: 'looks_show', after: parts.ids.wait})],
        ['a move', parts => parts.app.editor.run({op: 'move',
            block: parts.ids.wait,
            inside: {block: parts.ids.repeat}})],
        ['a delete', parts => parts.app.editor.run({op: 'delete', block: parts.ids.turn})],
        ['an undo', parts => {
            parts.app.editor.run({op: 'delete', block: parts.ids.turn});
            return parts.app.editor.run({op: 'undo'});
        }]
    ])('after %s', (_, edit) => {
        const parts = nested();
        const result = edit(parts);
        expect(result.ok).toBe(true);
        const all = blocksOf(parts.nodes());
        const index = all.findIndex(node => node.id === result.focusId);
        const sentence = parts.app.placeOf(result.focusId);
        // The number and the total are those of the program as it is now; with no block in focus, the count.
        expect(sentence).toEqual(result.focusId ?
            expect.stringMatching(new RegExp(`^Block ${index + 1} of ${all.length}[,.]`)) :
            `${all.length} blocks now.`);
        expect(all).toHaveLength(parts.program().length);
    });

    test('a change the gate carries out is said once, with where the student is, before how to undo it', async () => {
        const parts = setUp({respond: () => null});
        const subscriber = jest.fn();
        parts.app.editor.subscribe(subscriber);
        jest.useFakeTimers();
        const move = parts.app.editor.outline()[0].children.find(node => node.opcode === 'motion_movesteps').id;
        parts.gate.take({steps: [{command: {op: 'insert', block: 'control_wait', after: move}}]});
        await parts.settle();
        parts.gate.approve();
        await parts.settle();
        jest.useRealTimers();
        // The editor's own subscribers are told the gate says it.
        expect(subscriber.mock.calls.at(-1)[0].quiet).toBe(true);
        const done = parts.heard.filter(line => /Added: wait/.test(line));
        expect(done).toEqual(['Done. Added: wait 1 second, after move 10 steps. Block 3 of 4. To take it back, ' +
            'say undo.']);
    });
});

describe('cues on entering and leaving', () => {
    test('say entering a loop, and leaving one or several at once', () => {
        const {ids, nodes} = nested();
        expect(nestingCue(nodes(), ids.move, ids.turn, say)).toBe('Inside repeat 10.');
        expect(nestingCue(nodes(), ids.turn, ids.speech, say)).toBe('Inside if empty then, else.');
        expect(nestingCue(nodes(), ids.speech, ids.wait, say)).toBe('Out of if empty then, else and repeat 10.');
        expect(nestingCue(nodes(), ids.speech, ids.turn, say)).toBe('Out of if empty then, else, back in repeat 10.');
        expect(nestingCue(nodes(), ids.move, ids.wait, say)).toBe('');
    });
});

describe('previews of a suggestion', () => {
    test.each([
        ['an addition', parts => [{op: 'insert', block: 'looks_show', after: parts.ids.move}],
            'Now: when green flag clicked, move 10 steps, repeat 10. After: when green flag clicked, move 10 steps, ' +
            'looks: show, repeat 10, wait 2 seconds.'],
        ['a removal', parts => [{op: 'delete', block: parts.ids.turn}],
            'Inside repeat 10, now: turn clockwise 15 degrees, if empty then. After: if empty then.'],
        ['a change inside a loop', parts => [{op: 'set-value', block: parts.ids.turn, name: 'DEGREES', value: 90}],
            'Inside repeat 10, now: turn clockwise 15 degrees, if empty then. After: turn clockwise 90 degrees, ' +
            'if empty then.']
    ])('say before and after, for %s', (_, commands, preview) => {
        const parts = nested();
        const result = parts.app.editor.preview(commands(parts));
        expect(result.ok).toBe(true);
        expect(previewOf({before: result.before, after: result.after, id: result.touched, say})).toBe(preview);
    });
});

describe('the narrated run', () => {
    // A virtual machine whose sprite has one script, stepped by hand.
    const machine = ({app, positions}) => {
        const target = {};
        const thread = {target, peekStack: () => positions[0]};
        const handlers = {};
        const stepped = jest.fn(() => {
            positions.shift();
            return [];
        });
        const sequencer = {stepThreads: stepped};
        const vm = {
            editingTarget: target,
            runtime: {
                threads: [thread],
                sequencer,
                on: (name, handler) => {
                    handlers[name] = handler;
                },
                removeListener: name => delete handlers[name]
            },
            greenFlag: jest.fn(),
            stopAll: jest.fn()
        };
        let time = 0;
        const narrator = createNarrator({app, vm, now: () => time});
        return {
            vm,
            narrator,
            handlers,
            stepped,
            step: () => vm.runtime.sequencer.stepThreads(),
            pass: ms => {
                time += ms;
            }
        };
    };

    test('says each block as it is reached, holding the project while it is said, then that it finished', () => {
        const parts = nested();
        jest.useFakeTimers();
        const {ids} = parts;
        const run = machine({app: parts.app, positions: [null, ids.move, ids.move, ids.turn]});
        run.narrator.start();
        expect(run.vm.greenFlag).toHaveBeenCalled();
        // Held while "Running, and telling you each step" is heard.
        run.step();
        expect(run.stepped).not.toHaveBeenCalled();
        run.pass(10000);
        run.step();
        jest.advanceTimersByTime(200);
        expect(parts.heard.at(-1)).toBe('move 10 steps');
        run.pass(10000);
        run.step();
        run.pass(10000);
        run.step();
        jest.advanceTimersByTime(200);
        expect(parts.heard.at(-1)).toBe('turn clockwise 15 degrees');
        run.handlers.PROJECT_RUN_STOP();
        jest.advanceTimersByTime(200);
        jest.useRealTimers();
        expect(parts.heard.at(-1)).toBe('The program has finished.');
        expect(run.narrator.running()).toBe(false);
    });

    test('holds longer at the slow speed', () => {
        const parts = nested();
        const {ids} = parts;
        const timing = speed => {
            parts.settings.set({narrationSpeed: speed});
            const run = machine({app: parts.app, positions: [ids.move]});
            run.narrator.start();
            let held = 0;
            while (run.stepped.mock.calls.length === 0) {
                run.pass(100);
                held += 100;
                run.step();
            }
            run.narrator.stop();
            return held;
        };
        expect(timing('slow')).toBeGreaterThan(timing('fast'));
    });

    test('stops on Escape, with the project, and says so', () => {
        const parts = nested();
        jest.useFakeTimers();
        const run = machine({app: parts.app, positions: [parts.ids.move]});
        run.narrator.start();
        run.narrator.stop();
        jest.advanceTimersByTime(200);
        jest.useRealTimers();
        expect(run.vm.stopAll).toHaveBeenCalled();
        expect(parts.heard.at(-1)).toBe('Stopped.');
        expect(run.handlers.PROJECT_RUN_STOP).toBeUndefined();
    });

    test('says when there is nothing to run', () => {
        const parts = setUp();
        parts.app.editor.outline = () => [];
        expect(parts.app.narrator().start()).toBe('There is nothing to run here yet.');
    });
});

describe('pace controls', () => {
    const said = (parts, id) => {
        jest.useFakeTimers();
        parts.app.perform(id);
        jest.advanceTimersByTime(300);
        jest.useRealTimers();
        return parts.heard.at(-1);
    };

    test('"repeat that" says the last thing again', () => {
        const parts = setUp();
        expect(said(parts, 'speech.repeat')).toBe('There is nothing to repeat yet.');
        said(parts, 'program.summary');
        const summary = parts.heard.at(-1);
        expect(said(parts, 'speech.repeat')).toBe(summary);
    });

    test('"slower" and "faster" change the speed, within its bounds', () => {
        const parts = setUp();
        expect(said(parts, 'speech.slower')).toBe('Speaking slower.');
        expect(parts.settings.get().speechRate).toBe(0.8);
        said(parts, 'speech.slower');
        expect(said(parts, 'speech.slower')).toBe('This is the slowest speed.');
        for (let times = 0; times < 6; times++) said(parts, 'speech.faster');
        expect(parts.settings.get().speechRate).toBe(1.6);
        expect(said(parts, 'speech.faster')).toBe('This is the fastest speed.');
    });

    test('"shorter" and "longer" change how much is said after a change', () => {
        const parts = setUp();
        expect(said(parts, 'speech.shorter')).toBe('Replies are brief.');
        expect(parts.settings.get().verbosity).toBe('brief');
        said(parts, 'speech.shorter');
        expect(parts.settings.get().verbosity).toBe('brief');
        said(parts, 'speech.longer');
        expect(said(parts, 'speech.longer')).toBe('Replies are detailed.');
    });

    test('read aloud at the chosen speed', () => {
        const parts = setUp();
        parts.settings.set({readAloud: true, speechRate: 1.4});
        parts.app.speak('Hello.');
        expect(parts.reader.speak).toHaveBeenLastCalledWith('Hello.', 'en', 1.4);
    });
});
