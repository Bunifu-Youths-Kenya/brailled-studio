/*
 * VM data holds only opcodes and values. The label text lives in scratch-blocks: each block's `init` passes
 * `jsonInit` a definition holding translated messages ("wait %1 seconds") and what fills each placeholder.
 * Running `init` against a stand-in that records the definition reads it without creating a block.
 */

const readLines = json => {
    const lines = [];
    for (let i = 0; typeof json[`message${i}`] === 'string'; i++) {
        lines.push({message: json[`message${i}`], args: json[`args${i}`] || []});
    }
    return lines;
};

const readDefinition = (ScratchBlocks, block) => {
    // Custom block definitions are assembled in code, so only their wording is available as a message.
    if (block.opcode === 'procedures_definition') {
        return {lines: [{
            message: ScratchBlocks.Msg.PROCEDURES_DEFINITION,
            args: [{type: 'input_value', name: 'custom_block'}]
        }]};
    }
    const registered = ScratchBlocks.Blocks[block.opcode];
    if (!registered || !registered.init) return null;

    let json = null;
    const standIn = {
        id: block.id,
        type: block.opcode,
        workspace: {options: {pathToMedia: ''}},
        jsonInit: value => {
            json = value;
        }
    };
    try {
        registered.init.call(standIn);
    } catch {
        // Some definitions go on to configure the new block, which the stand-in does not support. That is
        // expected once the definition has been recorded; without one, the caller uses a fallback label.
    }
    return json && {lines: readLines(json)};
};

/**
 * Create a definition lookup for one pass over a program. Make a new one for each pass, because translations
 * and menu contents change.
 * @param {object} ScratchBlocks The scratch-blocks module that the editor has configured.
 * @returns {function(object): ?object} Looks up the definition for a VM block.
 */
const createDefinitionSource = ScratchBlocks => {
    const cache = new Map();
    return block => {
        if (!cache.has(block.id)) cache.set(block.id, readDefinition(ScratchBlocks, block));
        return cache.get(block.id);
    };
};

export default createDefinitionSource;
