// What a command needs to know about the project around the program it edits.

const ID_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ID_LENGTH = 20;

const randomId = () => Array.from(
    crypto.getRandomValues(new Uint8Array(ID_LENGTH)),
    byte => ID_CHARACTERS[byte % ID_CHARACTERS.length]
).join('');

const variablesOfType = (targets, type) => targets
    .flatMap(target => Object.values(target.variables))
    .filter(item => item.type === type)
    .map(({id, name}) => ({id, name}));

const EXTENSION_SHAPES = {
    command: 'stack',
    reporter: 'reporter',
    Boolean: 'boolean',
    hat: 'hat',
    event: 'hat',
    conditional: 'c',
    loop: 'c'
};

const extensionShapeOf = (runtime, opcode) => {
    for (const category of runtime._blockInfo) {
        const found = category.blocks.find(block => `${category.id}_${block.info?.opcode}` === opcode);
        if (found) return found.info.isTerminal ? 'cap' : EXTENSION_SHAPES[found.info.blockType] || null;
    }
    return null;
};

/**
 * Describe the surroundings of the selected sprite for the planner.
 * @param {object} options Options.
 * @param {object} options.vm The virtual machine.
 * @param {function(object, string): string} options.name Names a block of a program.
 * @param {function(object): ?object} options.getDefinition Label definitions of blocks.
 * @param {function(): string} [options.newId] Makes block and message ids.
 * @param {Array<{id: string, name: string}>} [options.unusedMessages] Messages that no block uses yet.
 * @returns {object} The context.
 */
const createContext = ({vm, name, getDefinition, newId = randomId, unusedMessages = []}) => {
    const target = vm.editingTarget;
    const stage = vm.runtime.getTargetForStage();
    const inScope = target.isStage ? [stage] : [target, stage];
    const broadcasts = variablesOfType([stage], 'broadcast_msg');
    broadcasts.push(...unusedMessages
        .filter(message => !broadcasts.some(known => known.id === message.id || known.name === message.name)));
    const spriteNames = () => vm.runtime.targets
        .filter(other => other.isOriginal && !other.isStage && other !== target)
        .map(other => other.sprite.name);
    const named = {
        sprites: spriteNames,
        costumes: () => target.sprite.costumes.map(costume => costume.name),
        sounds: () => target.sprite.sounds.map(sound => sound.name),
        backdrops: () => stage.sprite.costumes.map(costume => costume.name)
    };

    return {
        isStage: target.isStage,
        position: {x: target.x || 0, y: target.y || 0},
        name,
        newId,
        extensionShape: opcode => extensionShapeOf(vm.runtime, opcode),
        names: source => named[source](),
        // What "( ) of ( )" can ask about a sprite or the stage.
        properties: object => {
            const asked = object === '_stage_' ?
                stage :
                vm.runtime.targets.find(other => other.isOriginal && other.sprite.name === object);
            const builtIn = object === '_stage_' ?
                ['backdrop #', 'backdrop name', 'volume'] :
                ['x position', 'y position', 'direction', 'costume #', 'costume name', 'size', 'volume'];
            return [...builtIn, ...(asked ? variablesOfType([asked], '').map(item => item.name) : [])];
        },
        menuLabels: (block, field) => {
            const argument = getDefinition(block)?.lines
                .flatMap(line => line.args)
                .find(arg => arg.name === field && arg.options);
            if (!argument) return [];
            return typeof argument.options === 'function' ? argument.options() : argument.options;
        },
        variables: variablesOfType(inScope, ''),
        lists: variablesOfType(inScope, 'list'),
        broadcasts,
        createBroadcast: messageName => {
            const message = {id: newId(), name: messageName};
            broadcasts.push(message);
            return message;
        }
    };
};

export {
    createContext,
    randomId
};
