// Short sounds for what happens, with the Web Audio API stood in for: what each event plays, that they are silent
// when off, wait for a key press or click, come before the words and stop when interrupted. No real sound.
import {createEarcons, CUES, EVENTS, earconsFrom, lengthOf} from '../src/earcons/earcons.js';
import {setUp} from './proposal-setup.js';

// An audio context that notes every tone it is asked for.
const audio = () => {
    const made = [];
    const contexts = [];
    class Context {
        constructor () {
            this.currentTime = 0;
            this.destination = {};
            contexts.push(this);
        }
        resume () {}
        createOscillator () {
            const tone = {pitches: [], glides: [], stopped: false, type: null};
            const oscillator = {
                frequency: {
                    setValueAtTime: value => tone.pitches.push(value),
                    linearRampToValueAtTime: value => tone.glides.push(value)
                },
                connect: node => node,
                start: () => made.push(tone),
                // Stopped now, rather than at the end it was given.
                stop: (...when) => {
                    if (when.length === 0) tone.stopped = true;
                }
            };
            Object.defineProperty(oscillator, 'type', {set: type => {
                tone.type = type;
            }});
            return oscillator;
        }
        createGain () {
            return {gain: {setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}}, connect: node => node};
        }
    }
    // A page that the student has pressed a key in, or not yet.
    const handlers = {};
    const document = {addEventListener: (name, handler) => {
        handlers[name] = handler;
    }};
    const scope = {AudioContext: Context, document};
    return {scope, made, contexts, press: () => handlers.keydown?.(), click: () => handlers.pointerdown?.()};
};

const on = (changes = {}) => () => ({...earconsFrom({enabled: true}), ...changes});

describe('earcons', () => {
    test.each(EVENTS)('%s plays its own sound, 100 to 300 milliseconds long', name => {
        const sound = audio();
        const earcons = createEarcons({scope: sound.scope, choices: on()});
        sound.press();
        expect(earcons.play(name)).toBe(lengthOf(name));
        expect(lengthOf(name)).toBeGreaterThanOrEqual(100);
        expect(lengthOf(name)).toBeLessThanOrEqual(300);
        expect(sound.made.map(tone => tone.pitches[0])).toEqual(CUES[name].map(note => note.from));
    });

    test('each sound has the shape it is named for', () => {
        const heard = name => {
            const sound = audio();
            const earcons = createEarcons({scope: sound.scope, choices: on()});
            sound.press();
            earcons.play(name);
            return sound.made;
        };
        const [added] = heard('blockAdded');
        expect(added.glides[0]).toBeGreaterThan(added.pitches[0]);
        const [removed] = heard('blockRemoved');
        expect(removed.glides[0]).toBeLessThan(removed.pitches[0]);
        expect(heard('blockMoved')[0].type).toBe('triangle');
        const [into, deeper] = heard('enterNesting');
        expect(deeper.pitches[0]).toBeGreaterThan(into.pitches[0]);
        const [out, back] = heard('exitNesting');
        expect(back.pitches[0]).toBeLessThan(out.pitches[0]);
        const [buzz] = heard('error');
        expect(buzz.type).toBe('square');
        expect(buzz.pitches[0]).toBeLessThan(200);
        expect(heard('success')).toHaveLength(2);
        const [ask, higher] = heard('approvalNeeded');
        expect(higher.pitches[0]).toBeGreaterThan(ask.pitches[0]);
    });

    test('a block\'s sound is pitched by its category, unless the school says not to', () => {
        const pitch = (opcode, changes) => {
            const sound = audio();
            const earcons = createEarcons({scope: sound.scope, choices: on(changes)});
            sound.press();
            earcons.play('blockAdded', {opcode});
            return sound.made[0].pitches[0];
        };
        expect(pitch('looks_say')).toBeGreaterThan(pitch('motion_movesteps'));
        expect(pitch('control_wait')).toBeLessThan(pitch('motion_movesteps'));
        expect(pitch('looks_say', {pitchByCategory: false})).toBe(pitch('motion_movesteps'));
    });

    test.each([
        ['when off', {enabled: false}],
        ['when one event is off', {events: {...earconsFrom(null).events, blockAdded: {enabled: false, volume: 0.15}}}],
        ['at no volume', {events: {...earconsFrom(null).events, blockAdded: {enabled: true, volume: 0}}}]
    ])('is silent %s', (_, changes) => {
        const sound = audio();
        const earcons = createEarcons({scope: sound.scope, choices: on(changes)});
        sound.press();
        expect(earcons.play('blockAdded')).toBe(0);
        expect(sound.made).toEqual([]);
    });

    test('makes no sound, and no audio context, before a key press or click', () => {
        const sound = audio();
        const earcons = createEarcons({scope: sound.scope, choices: on()});
        expect(earcons.play('success')).toBe(0);
        expect(sound.contexts).toHaveLength(0);
        sound.click();
        expect(earcons.play('success')).toBeGreaterThan(0);
        expect(sound.contexts).toHaveLength(1);
    });

    test('plays nothing over the live voice, and stops at once when interrupted', () => {
        const sound = audio();
        let speaking = true;
        const earcons = createEarcons({scope: sound.scope, choices: on(), busy: () => speaking});
        sound.press();
        expect(earcons.play('blockAdded')).toBe(0);
        speaking = false;
        earcons.play('success');
        earcons.stop();
        expect(sound.made.every(tone => tone.stopped)).toBe(true);
    });

    test('reads the school\'s choices, quiet unless turned up, and keeps volumes between 0 and 1', () => {
        expect(earconsFrom(null)).toMatchObject({enabled: false, volume: 0.15, pitchByCategory: true});
        expect(earconsFrom({enabled: 'yes'}).enabled).toBe(false);
        const given = earconsFrom({enabled: true, volume: 3, events: {error: {volume: -1}, success: {enabled: false}}});
        expect(given.volume).toBe(1);
        expect(given.events.error.volume).toBe(0);
        expect(given.events.success.enabled).toBe(false);
        expect(given.events.blockAdded).toEqual({enabled: true, volume: 1});
    });
});

describe('earcons in the editor', () => {
    // The editor, with sound on and a key already pressed.
    const editor = () => {
        const sound = audio();
        Object.assign(globalThis, {AudioContext: sound.scope.AudioContext, document: sound.scope.document});
        const parts = setUp({school: {earcons: earconsFrom({enabled: true})}});
        sound.press();
        return {...parts, sound};
    };
    afterEach(() => {
        delete globalThis.AudioContext;
        delete globalThis.document;
        jest.useRealTimers();
    });

    test('marks adding, removing, moving and undoing, pitched by the block', () => {
        const {app, sound} = editor();
        const top = () => app.editor.outline()[0].children;
        const move = top().find(node => node.opcode === 'motion_movesteps').id;
        const added = app.editor.run({op: 'insert', block: 'looks_show', after: move}).focusId;
        expect(sound.made.at(-1).glides[0]).toBeGreaterThan(sound.made.at(-1).pitches[0]);
        app.editor.run({op: 'move', block: added, before: move});
        expect(sound.made.at(-1).type).toBe('triangle');
        app.editor.run({op: 'undo'});
        app.editor.run({op: 'undo'});
        // Undoing the addition takes the block away.
        expect(sound.made.at(-1).glides[0]).toBeLessThan(sound.made.at(-1).pitches[0]);
        app.editor.run({op: 'delete', block: 'nothing-here'});
        expect(sound.made.at(-1).type).toBe('square');
    });

    test('comes before the words, which wait until it ends, and stops what was being read', () => {
        const {app, heard, reader, settings} = editor();
        settings.set({readAloud: true});
        jest.useFakeTimers();
        app.cue('success');
        app.announce('Done.');
        jest.advanceTimersByTime(200);
        expect(heard).toEqual([]);
        expect(reader.stop).toHaveBeenCalled();
        jest.advanceTimersByTime(lengthOf('success'));
        expect(heard).toEqual(['Done.']);
    });

    test('stops when the student interrupts', () => {
        const {app, sound} = editor();
        app.cue('success');
        app.silence();
        expect(sound.made.every(tone => tone.stopped)).toBe(true);
    });

    test('marks a suggestion that needs an answer, and its success once, not each block', async () => {
        const {app, gate, settle, sound} = editor();
        jest.useFakeTimers();
        const move = app.editor.outline()[0].children.find(node => node.opcode === 'motion_movesteps').id;
        gate.take({steps: [{command: {op: 'insert', block: 'control_wait', after: move}},
            {command: {op: 'insert', block: 'looks_show', after: move}}]});
        await settle();
        const asked = sound.made.length;
        expect(sound.made.slice(-2).map(tone => tone.pitches[0])).toEqual(CUES.approvalNeeded.map(note => note.from));
        gate.approve({all: true});
        await settle();
        expect(sound.made.slice(asked).map(tone => tone.pitches[0])).toEqual(CUES.success.map(note => note.from));
    });

    test('Alt+Shift+E and "sounds off" turn them off, for this student', () => {
        const {app, sound} = editor();
        app.perform('sound.toggle');
        expect(app.earconsOn()).toBe(false);
        const before = sound.made.length;
        app.cue('success');
        expect(sound.made).toHaveLength(before);
        app.perform('sound.on');
        expect(app.earconsOn()).toBe(true);
        app.perform('sound.off');
        expect(app.settings.get().earcons).toBe(false);
    });
});
