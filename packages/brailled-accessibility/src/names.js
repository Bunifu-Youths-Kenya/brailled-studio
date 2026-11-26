// Names that are said and shown: the assistant's, from the school's configuration, and the student's first name.
const DEFAULT_ASSISTANT_NAME = 'Mboni';

// Letters, with spaces, hyphens or apostrophes between them: a name, not a sentence or an instruction.
const NAME = /^\p{L}(?:[\p{L}\p{M} '’-]{0,28}[\p{L}\p{M}])?$/u;

// The name without surrounding space, or null if it is not one.
const cleanName = value => (typeof value === 'string' && NAME.test(value.trim()) ? value.trim() : null);

export {
    DEFAULT_ASSISTANT_NAME,
    cleanName
};
