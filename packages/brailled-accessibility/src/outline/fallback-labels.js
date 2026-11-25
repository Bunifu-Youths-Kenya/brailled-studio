/*
 * Labels used when scratch-blocks has no definition for an opcode. `[NAME]` stands for the input or field of
 * that name. These are English only; the editor normally reads translated labels from scratch-blocks.
 */
const FALLBACK_LABELS = {
    control_forever: 'forever',
    control_if: 'if [CONDITION] then',
    control_if_else: 'if [CONDITION] then',
    control_repeat: 'repeat [TIMES]',
    control_repeat_until: 'repeat until [CONDITION]',
    control_stop: 'stop [STOP_OPTION]',
    control_wait: 'wait [DURATION] seconds',
    control_wait_until: 'wait until [CONDITION]',
    data_changevariableby: 'change [VARIABLE] by [VALUE]',
    data_setvariableto: 'set [VARIABLE] to [VALUE]',
    data_variable: '[VARIABLE]',
    event_whenflagclicked: 'when green flag clicked',
    event_whenthisspriteclicked: 'when this sprite clicked',
    event_whenkeypressed: 'when [KEY_OPTION] key pressed',
    looks_say: 'say [MESSAGE]',
    looks_sayforsecs: 'say [MESSAGE] for [SECS] seconds',
    motion_changexby: 'change x by [DX]',
    motion_movesteps: 'move [STEPS] steps',
    motion_turnleft: 'turn counterclockwise [DEGREES] degrees',
    motion_turnright: 'turn clockwise [DEGREES] degrees',
    motion_xposition: 'x position',
    operator_add: '[NUM1] + [NUM2]',
    operator_equals: '[OPERAND1] = [OPERAND2]',
    operator_gt: '[OPERAND1] > [OPERAND2]',
    operator_lt: '[OPERAND1] < [OPERAND2]'
};

// How many nested stacks a block holds. The VM data omits a stack that is empty.
const FALLBACK_BRANCHES = {
    control_all_at_once: ['SUBSTACK'],
    control_for_each: ['SUBSTACK'],
    control_forever: ['SUBSTACK'],
    control_if: ['SUBSTACK'],
    control_if_else: ['SUBSTACK', 'SUBSTACK2'],
    control_repeat: ['SUBSTACK'],
    control_repeat_until: ['SUBSTACK'],
    control_while: ['SUBSTACK']
};

export {
    FALLBACK_BRANCHES,
    FALLBACK_LABELS
};
