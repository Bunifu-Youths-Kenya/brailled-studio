/*
 * The blocks that editing commands know: each block's shape, the values it holds and their defaults, as the
 * block palette creates them. An opcode that is not here cannot be inserted or given values.
 *
 * Shapes: `hat` starts a script; `stack` is an instruction; `c` holds other blocks; `cap` ends a script;
 * `reporter` and `boolean` are values that go in slots.
 */

// Inputs: slots that hold a typed value, or another block.
const number = value => ({type: 'number', value});
// A coordinate starts at where the sprite is now.
const coordinate = axis => ({type: 'number', value: '0', from: axis});
const positive = value => ({type: 'positive', value});
const whole = value => ({type: 'whole', value});
const integer = value => ({type: 'integer', value});
const angle = value => ({type: 'angle', value});
const text = value => ({type: 'text', value});
const colour = (value = '#9966ff') => ({type: 'colour', value});
const condition = () => ({type: 'boolean'});
// A list position, which may also be a word such as "last".
const index = (words = ['last', 'random']) => ({type: 'index', value: '1', words});
// A drop-down that is a block of its own, so that another block can be dropped on it.
const menu = (opcode, field, source, special = [], value = null) =>
    ({type: 'menu', menu: opcode, field, source, special, value});
const broadcastMessage = () => ({type: 'broadcast'});

// Fields: drop-downs that belong to the block itself.
const choice = (options, value = options[0]) => ({kind: 'choice', options, value});
const variable = {kind: 'variable'};
const list = {kind: 'list'};
const broadcast = {kind: 'broadcast'};
const backdrop = {kind: 'backdrop'};
const property = {kind: 'property'};

const KEYS = [
    'space', 'up arrow', 'down arrow', 'right arrow', 'left arrow', 'any',
    ...'abcdefghijklmnopqrstuvwxyz', ...'0123456789'
];
const LOOK_EFFECTS = ['COLOR', 'FISHEYE', 'WHIRL', 'PIXELATE', 'MOSAIC', 'BRIGHTNESS', 'GHOST'];
const SOUND_EFFECTS = ['PITCH', 'PAN'];
const NUMBER_OR_NAME = ['number', 'name'];

const sound = () => menu('sound_sounds_menu', 'SOUND_MENU', 'sounds');
const place = (opcode, special) => menu(opcode, 'TO', 'sprites', special);
const binary = (type, value = '') => ({NUM1: type(value), NUM2: type(value)});
const comparison = () => ({OPERAND1: text(''), OPERAND2: text('50')});

const define = shape => (inputs = {}, fields = {}) => ({shape, inputs, fields});
const hat = (fields, inputs) => define('hat')(inputs, fields);
const stack = define('stack');
const cap = define('cap');
const reporter = define('reporter');
const boolean = define('boolean');
const holds = (branches, shape = 'c') => (inputs = {}, fields = {}) => ({shape, inputs, fields, branches});

// Blocks that only a sprite, or only the stage, can use.
const sprite = blocks => Object.fromEntries(Object.entries(blocks)
    .map(([opcode, block]) => [opcode, {...block, only: 'sprite'}]));

const CATALOG = {
    ...sprite({
        motion_movesteps: stack({STEPS: number('10')}),
        motion_turnright: stack({DEGREES: number('15')}),
        motion_turnleft: stack({DEGREES: number('15')}),
        motion_goto: stack({TO: place('motion_goto_menu', ['_random_', '_mouse_'], '_random_')}),
        motion_gotoxy: stack({X: coordinate('x'), Y: coordinate('y')}),
        motion_glideto: stack({
            SECS: number('1'),
            TO: place('motion_glideto_menu', ['_random_', '_mouse_'])
        }),
        motion_glidesecstoxy: stack({SECS: number('1'), X: coordinate('x'), Y: coordinate('y')}),
        motion_pointindirection: stack({DIRECTION: angle('90')}),
        motion_pointtowards: stack({
            TOWARDS: menu('motion_pointtowards_menu', 'TOWARDS', 'sprites', ['_mouse_'])
        }),
        motion_changexby: stack({DX: number('10')}),
        motion_setx: stack({X: coordinate('x')}),
        motion_changeyby: stack({DY: number('10')}),
        motion_sety: stack({Y: coordinate('y')}),
        motion_ifonedgebounce: stack(),
        motion_setrotationstyle: stack({}, {STYLE: choice(['left-right', 'don\'t rotate', 'all around'])}),
        motion_xposition: reporter(),
        motion_yposition: reporter(),
        motion_direction: reporter(),

        looks_sayforsecs: stack({MESSAGE: text('Hello!'), SECS: number('2')}),
        looks_say: stack({MESSAGE: text('Hello!')}),
        looks_thinkforsecs: stack({MESSAGE: text('Hmm...'), SECS: number('2')}),
        looks_think: stack({MESSAGE: text('Hmm...')}),
        looks_switchcostumeto: stack({COSTUME: menu('looks_costume', 'COSTUME', 'costumes')}),
        looks_nextcostume: stack(),
        looks_changesizeby: stack({CHANGE: number('10')}),
        looks_setsizeto: stack({SIZE: number('100')}),
        looks_show: stack(),
        looks_hide: stack(),
        looks_gotofrontback: stack({}, {FRONT_BACK: choice(['front', 'back'])}),
        looks_goforwardbackwardlayers: stack(
            {NUM: integer('1')}, {FORWARD_BACKWARD: choice(['forward', 'backward'])}),
        looks_costumenumbername: reporter({}, {NUMBER_NAME: choice(NUMBER_OR_NAME)}),
        looks_size: reporter(),

        event_whenthisspriteclicked: hat(),

        control_start_as_clone: hat(),
        control_delete_this_clone: cap(),

        sensing_touchingobject: boolean({
            TOUCHINGOBJECTMENU: menu(
                'sensing_touchingobjectmenu', 'TOUCHINGOBJECTMENU', 'sprites', ['_mouse_', '_edge_'])
        }),
        sensing_touchingcolor: boolean({COLOR: colour()}),
        sensing_coloristouchingcolor: boolean({COLOR: colour(), COLOR2: colour('#4c97ff')}),
        sensing_distanceto: reporter({
            DISTANCETOMENU: menu('sensing_distancetomenu', 'DISTANCETOMENU', 'sprites', ['_mouse_'])
        }),
        sensing_setdragmode: stack({}, {DRAG_MODE: choice(['draggable', 'not draggable'])})
    }),

    looks_switchbackdropto: stack({BACKDROP: menu('looks_backdrops', 'BACKDROP', 'backdrops',
        ['next backdrop', 'previous backdrop', 'random backdrop'])}),
    looks_switchbackdroptoandwait: stack({BACKDROP: menu('looks_backdrops', 'BACKDROP', 'backdrops',
        ['next backdrop', 'previous backdrop', 'random backdrop'])}),
    looks_nextbackdrop: stack(),
    looks_changeeffectby: stack({CHANGE: number('25')}, {EFFECT: choice(LOOK_EFFECTS)}),
    looks_seteffectto: stack({VALUE: number('0')}, {EFFECT: choice(LOOK_EFFECTS)}),
    looks_cleargraphiceffects: stack(),
    looks_backdropnumbername: reporter({}, {NUMBER_NAME: choice(NUMBER_OR_NAME)}),

    sound_playuntildone: stack({SOUND_MENU: sound()}),
    sound_play: stack({SOUND_MENU: sound()}),
    sound_stopallsounds: stack(),
    sound_changeeffectby: stack({VALUE: number('10')}, {EFFECT: choice(SOUND_EFFECTS)}),
    sound_seteffectto: stack({VALUE: number('100')}, {EFFECT: choice(SOUND_EFFECTS)}),
    sound_cleareffects: stack(),
    sound_changevolumeby: stack({VOLUME: number('-10')}),
    sound_setvolumeto: stack({VOLUME: number('100')}),
    sound_volume: reporter(),

    event_whenflagclicked: hat(),
    event_whenkeypressed: hat({KEY_OPTION: choice(KEYS)}),
    event_whenstageclicked: {...hat(), only: 'stage'},
    event_whenbackdropswitchesto: hat({BACKDROP: backdrop}),
    event_whengreaterthan: hat(
        {WHENGREATERTHANMENU: choice(['LOUDNESS', 'TIMER'])}, {VALUE: number('10')}),
    event_whenbroadcastreceived: hat({BROADCAST_OPTION: broadcast}),
    event_broadcast: stack({BROADCAST_INPUT: broadcastMessage()}),
    event_broadcastandwait: stack({BROADCAST_INPUT: broadcastMessage()}),

    control_wait: stack({DURATION: positive('1')}),
    control_repeat: holds(['SUBSTACK'])({TIMES: whole('10')}),
    control_forever: holds(['SUBSTACK'], 'cap')(),
    control_if: holds(['SUBSTACK'])({CONDITION: condition()}),
    control_if_else: holds(['SUBSTACK', 'SUBSTACK2'])({CONDITION: condition()}),
    control_wait_until: stack({CONDITION: condition()}),
    control_repeat_until: holds(['SUBSTACK'])({CONDITION: condition()}),
    // "other scripts" lets the script carry on; see `shapeOf`.
    control_stop: cap({}, {STOP_OPTION: choice(['all', 'this script', 'other scripts in sprite'])}),
    control_create_clone_of: stack({
        CLONE_OPTION: menu('control_create_clone_of_menu', 'CLONE_OPTION', 'sprites', ['_myself_'])
    }),

    sensing_askandwait: stack({QUESTION: text('What\'s your name?')}),
    sensing_answer: reporter(),
    sensing_keypressed: boolean({
        KEY_OPTION: menu('sensing_keyoptions', 'KEY_OPTION', null, KEYS, 'space')
    }),
    sensing_mousedown: boolean(),
    sensing_mousex: reporter(),
    sensing_mousey: reporter(),
    sensing_loudness: reporter(),
    sensing_timer: reporter(),
    sensing_resettimer: stack(),
    sensing_of: reporter(
        {OBJECT: menu('sensing_of_object_menu', 'OBJECT', 'sprites', ['_stage_'], '_stage_')},
        {PROPERTY: property}),
    sensing_current: reporter({}, {CURRENTMENU: choice(
        ['YEAR', 'MONTH', 'DATE', 'DAYOFWEEK', 'HOUR', 'MINUTE', 'SECOND'])}),
    sensing_dayssince2000: reporter(),
    sensing_online: boolean(),
    sensing_username: reporter(),

    operator_add: reporter(binary(number)),
    operator_subtract: reporter(binary(number)),
    operator_multiply: reporter(binary(number)),
    operator_divide: reporter(binary(number)),
    operator_random: reporter({FROM: number('1'), TO: number('10')}),
    operator_gt: boolean(comparison()),
    operator_lt: boolean(comparison()),
    operator_equals: boolean(comparison()),
    operator_and: boolean({OPERAND1: condition(), OPERAND2: condition()}),
    operator_or: boolean({OPERAND1: condition(), OPERAND2: condition()}),
    operator_not: boolean({OPERAND: condition()}),
    operator_join: reporter({STRING1: text('apple '), STRING2: text('banana')}),
    operator_letter_of: reporter({LETTER: whole('1'), STRING: text('apple')}),
    operator_length: reporter({STRING: text('apple')}),
    operator_contains: boolean({STRING1: text('apple'), STRING2: text('a')}),
    operator_mod: reporter(binary(number)),
    operator_round: reporter({NUM: number('')}),
    operator_mathop: reporter({NUM: number('')}, {OPERATOR: choice([
        'abs', 'floor', 'ceiling', 'sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log',
        'e ^', '10 ^'
    ])}),

    data_variable: reporter({}, {VARIABLE: variable}),
    data_setvariableto: stack({VALUE: text('0')}, {VARIABLE: variable}),
    data_changevariableby: stack({VALUE: number('1')}, {VARIABLE: variable}),
    data_showvariable: stack({}, {VARIABLE: variable}),
    data_hidevariable: stack({}, {VARIABLE: variable}),
    data_listcontents: reporter({}, {LIST: list}),
    data_addtolist: stack({ITEM: text('thing')}, {LIST: list}),
    data_deleteoflist: stack({INDEX: index(['last', 'random', 'all'])}, {LIST: list}),
    data_deletealloflist: stack({}, {LIST: list}),
    data_insertatlist: stack({ITEM: text('thing'), INDEX: index()}, {LIST: list}),
    data_replaceitemoflist: stack({INDEX: index(), ITEM: text('thing')}, {LIST: list}),
    data_itemoflist: reporter({INDEX: index()}, {LIST: list}),
    data_itemnumoflist: reporter({ITEM: text('thing')}, {LIST: list}),
    data_lengthoflist: reporter({}, {LIST: list}),
    data_listcontainsitem: boolean({ITEM: text('thing')}, {LIST: list}),
    data_showlist: stack({}, {LIST: list}),
    data_hidelist: stack({}, {LIST: list})
};

// The shadow block that holds a typed value, and its field.
const SHADOWS = {
    number: ['math_number', 'NUM'],
    positive: ['math_positive_number', 'NUM'],
    whole: ['math_whole_number', 'NUM'],
    integer: ['math_integer', 'NUM'],
    index: ['math_integer', 'NUM'],
    angle: ['math_angle', 'NUM'],
    text: ['text', 'TEXT'],
    colour: ['colour_picker', 'COLOUR']
};

// Blocks that may already be in a project, which can be moved and deleted but not created here.
const EXISTING_ONLY = {
    procedures_definition: {shape: 'hat'},
    procedures_call: {shape: 'stack'},
    argument_reporter_string_number: {shape: 'reporter'},
    argument_reporter_boolean: {shape: 'boolean'},
    control_while: {shape: 'c', branches: ['SUBSTACK']},
    control_for_each: {shape: 'c', branches: ['SUBSTACK']},
    control_all_at_once: {shape: 'c', branches: ['SUBSTACK']}
};

const lookup = (table, key) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null);

export {
    CATALOG,
    EXISTING_ONLY,
    SHADOWS,
    lookup
};
