// Checks a command against `schema.json`, supporting the keywords that schema uses.
import CommandError from './error.js';
import schema from './schema.json';

const typeOf = value => {
    if (value === null) return 'null';
    return Array.isArray(value) ? 'array' : typeof value;
};

const resolve = node => (node.$ref ? schema.$defs[node.$ref.split('/').pop()] : node);

// The first problem found, as a CommandError, or null.
const problem = (value, rawNode, path) => {
    const node = resolve(rawNode);
    if (node.oneOf) {
        return node.oneOf.some(option => !problem(value, option, path)) ?
            null :
            new CommandError('badValue', {path});
    }
    if (Object.prototype.hasOwnProperty.call(node, 'const') && value !== node.const) {
        return new CommandError('badValue', {path});
    }
    if (node.enum && !node.enum.includes(value)) {
        return new CommandError('notOneOf', {path, options: node.enum.join(', ')});
    }
    if (node.type && typeOf(value) !== node.type) return new CommandError('badValue', {path});
    if (node.minLength && value.length < node.minLength) return new CommandError('badValue', {path});
    if (node.pattern && !new RegExp(node.pattern).test(value)) return new CommandError('badValue', {path});
    if (node.type !== 'object') return null;

    const missing = (node.required || []).find(name => !Object.prototype.hasOwnProperty.call(value, name));
    if (missing) return new CommandError('missing', {path, name: missing});
    for (const [name, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${name}` : name;
        if (node.properties && Object.prototype.hasOwnProperty.call(node.properties, name)) {
            const found = problem(child, node.properties[name], childPath);
            if (found) return found;
        } else if (node.additionalProperties === false) {
            return new CommandError('unexpected', {name: childPath});
        } else if (node.additionalProperties) {
            const found = problem(child, node.additionalProperties, childPath);
            if (found) return found;
        }
    }
    return null;
};

const OPERATIONS = schema.oneOf.map(option => resolve(option).properties.op.const);

/**
 * Check that a value is a command.
 * @param {*} command The value to check.
 * @throws {CommandError} If it does not match the schema.
 */
const checkCommand = command => {
    if (typeOf(command) !== 'object') throw new CommandError('notACommand');
    if (!OPERATIONS.includes(command.op)) {
        throw new CommandError('unknownOperation', {op: String(command.op), options: OPERATIONS.join(', ')});
    }
    const found = problem(command, schema.$defs[command.op], '');
    if (found) throw found;
};

export default checkCommand;
