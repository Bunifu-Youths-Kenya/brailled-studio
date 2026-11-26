/*
 * What the AI helper is told: the student's words, where they are, the program, and what may be proposed. Text
 * only: no pictures and nothing of the page itself.
 *
 * Blocks are given short references, b1, b2 and so on, which a proposal uses in place of block ids.
 */
// Within what the server accepts.
const LIMITS = Object.freeze(
    {transcript: 500, line: 300, program: 400, data: 200, contextText: 300, names: 2000});

const clip = (text, length) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

// Names and block text, which students write, can be of any length.
const clipAll = value => {
    if (typeof value === 'string') return clip(value, LIMITS.contextText);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clipAll(entry)]));
};

// The outline as indented lines, such as "  b2 motion_movesteps: move 10 steps".
const describeProgram = nodes => {
    const lines = [];
    const refs = new Map();
    const walk = (list, depth) => {
        for (const node of list) {
            const indent = '  '.repeat(depth);
            if (node.type === 'script') {
                lines.push(`script ${node.posinset}`);
            } else if (node.type === 'block') {
                const ref = `b${refs.size + 1}`;
                refs.set(ref, node.id);
                lines.push(clip(`${indent}${ref} ${node.opcode}: ${node.text}`, LIMITS.line));
            } else if (node.type === 'branch') {
                lines.push(clip(`${indent}part ${node.branch}: ${node.text}`, LIMITS.line));
            }
            if (node.children) walk(node.children, depth + 1);
        }
    };
    walk(nodes, 0);
    if (lines.length > LIMITS.program) {
        lines.splice(LIMITS.program - 1, lines.length, 'more blocks are not listed');
    }
    return {lines, refs};
};

const describeValue = value => {
    if (!value.choices) return `${value.name}=${value.type}`;
    // Names from the project are listed apart, as they are not the editor's own words.
    const choices = value.source ? [...value.choices, `a name from "${value.source}"`] : value.choices;
    return `${value.name}=one of ${choices.join('|')}`;
};

// One line for each kind of block, such as: motion_movesteps (stack) "move 10 steps" STEPS=number
const describeBlock = spec => clip(
    `${spec.opcode} (${spec.shape}) "${spec.name}" ${spec.values.map(describeValue).join(' ')}`.trim(), 400);

const describeItem = item => clip(
    `${item.kind} "${item.name}" ${item.scope === 'sprite' ? 'for this sprite only' : 'for all sprites'}`,
    LIMITS.line);

/**
 * @param {object} options Options.
 * @param {object} options.ports What the AI side is given, see `proposals/ai-ports.js`.
 * @param {string} options.transcript What the student said or typed.
 * @param {?{question: string, choices: string[]}} [options.previous] The AI's question that this answers.
 * @param {?{summary: string, steps: string[]}} [options.revises] The suggestion that this asks to change.
 * @returns {{body: object, refs: Map<string, string>, targetId: string}} What to send, and what is needed to read
 * the reply: block ids by reference.
 */
const buildRequest = ({ports, transcript, previous = null, revises = null}) => {
    const {lines, refs} = describeProgram(ports.outline());
    const body = {
        transcript: clip(transcript, LIMITS.transcript),
        language: ports.language(),
        context: clipAll(ports.snapshot()),
        program: lines,
        data: ports.data().slice(0, LIMITS.data)
            .map(describeItem),
        names: Object.entries(ports.names()).map(([source, names]) =>
            clip(`${source}: ${names.join(' | ')}`, LIMITS.names)),
        blocks: ports.blockSpecs().map(describeBlock),
        actions: ports.actions(),
        spriteCategories: ports.spriteCategories()
    };
    if (previous) body.previous = previous;
    if (revises) {
        body.revises = {
            summary: clip(revises.summary, LIMITS.line),
            steps: revises.steps.slice(0, 20).map(step => clip(step, LIMITS.line))
        };
    }
    return {body, refs, targetId: ports.targetId()};
};

export {
    LIMITS,
    buildRequest,
    describeProgram
};
