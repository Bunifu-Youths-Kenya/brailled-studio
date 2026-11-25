// Why a command was rejected: a message key from `messages.js` and the values that fill it in.
class CommandError extends Error {
    constructor (key, values = {}) {
        super(`${key} ${JSON.stringify(values)}`);
        this.name = 'CommandError';
        this.key = key;
        this.values = values;
    }
}

export default CommandError;
