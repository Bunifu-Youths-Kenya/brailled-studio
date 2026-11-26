import {parseReply} from '../src/ai/reply.js';

describe('the shape of a reply', () => {
    const proposal = {type: 'proposal', summary: 'Add a block.', steps: [{action: 'project.run'}]};

    test.each([
        proposal,
        {type: 'proposal', summary: 'Do both.', steps: [{command: {op: 'undo'}}, {action: 'project.run'}]},
        {type: 'question', question: 'How far?'},
        {type: 'question', question: 'How far?', choices: ['10', '20']},
        {type: 'explanation', text: 'A loop repeats blocks.'},
        {type: 'proposal', summary: 'Add it.', steps: [{sprite: {name: 'Dragon'}}]},
        {type: 'question',
            question: 'Which kind?',
            choices: ['Animals', 'People', 'Things'],
            steps: [{action: 'sprite.library'}]},
        {type: 'question', question: 'Which one?', spritesFrom: 'animals'},
        {type: 'question', question: 'Which one?', spritesFrom: 'animals', page: 2}
    ])('accepts %j', reply => {
        expect(parseReply(reply)).toMatchObject({type: reply.type});
    });

    test.each([
        null, 'proposal', [], {}, {type: 'run'}, {type: 'toString'},
        {...proposal, extra: 1},
        {...proposal, steps: []},
        {...proposal, steps: Array(21).fill({action: 'a.b'})},
        {...proposal, steps: [{action: 'a.b', command: {op: 'undo'}}]},
        {...proposal, steps: [{command: 'delete everything'}]},
        {...proposal, steps: [{}]},
        {...proposal, steps: {action: 'a.b'}},
        {...proposal, summary: ''},
        {...proposal, summary: 'a'.repeat(301)},
        {type: 'proposal', steps: proposal.steps},
        {type: 'question', question: 'Which?', choices: ['only one']},
        {type: 'question', question: 'Which?', choices: ['a', 2]},
        {type: 'question', question: 'Which?', choices: ['1', '2', '3', '4', '5', '6']},
        {type: 'question', question: 'Which?', choices: null},
        {type: 'question', question: 5},
        {type: 'explanation', text: ' '},
        {type: 'explanation', text: 'x', steps: []},
        {...proposal, steps: [{sprite: 'Dragon'}]},
        {...proposal, steps: [{sprite: {name: 'Dragon', url: 'http://x.example'}}]},
        {...proposal, steps: [{sprite: {name: ''}}]},
        {...proposal, approved: true},
        {...proposal, steps: [{action: 'a.b', approved: true}]},
        {type: 'question', question: 'Which?', spritesFrom: 'animals', choices: ['a', 'b']},
        {type: 'question', question: 'Which?', spritesFrom: 'animals', page: 0},
        {type: 'question', question: 'Which?', spritesFrom: 'animals', page: 1.5},
        {type: 'question', question: 'Which?', page: 2},
        {type: 'question', question: 'Which?', steps: [{command: {op: 'undo'}}]},
        {type: 'question', question: 'Which?', steps: []},
        {type: 'question', question: 'Which?', steps: Array(4).fill({action: 'a.b'})}
    ])('refuses %j', reply => {
        expect(parseReply(reply)).toBeNull();
    });

    test('removes characters that hide or reorder text', () => {
        const hidden = `Safe${String.fromCodePoint(0x202e)}text\n\n${String.fromCodePoint(0)}here`;
        expect(parseReply({type: 'explanation', text: hidden}).text).toBe('Safe text here');
    });
});
