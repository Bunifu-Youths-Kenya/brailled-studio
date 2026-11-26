// The ids in a command, and references to blocks that earlier commands make.
const ID_KEYS = ['block', 'after', 'before', 'through', 'script'];

// The command with each of its block ids passed through `change`.
const mapBlockIds = (command, change) => {
    const result = {...command};
    for (const key of ID_KEYS) {
        // In "insert" the block is a kind of block, not one in the program.
        if (!Object.hasOwn(result, key) || (key === 'block' && command.op === 'insert')) continue;
        result[key] = change(result[key]);
    }
    if (result.inside) result.inside = {...result.inside, block: change(result.inside.block)};
    return result;
};

// A reference to the block that a numbered command makes. A project's own block ids can be any text, so this
// is a form that none would have.
const REFERENCE = /^brailled-step:([0-9]+)$/;

const stepRef = number => `brailled-step:${number}`;

// The number of the command that a reference names, or null if the id is not one.
const madeBy = id => {
    const number = REFERENCE.exec(id)?.[1];
    return number ? Number(number) : null;
};

export {
    madeBy,
    mapBlockIds,
    stepRef
};
