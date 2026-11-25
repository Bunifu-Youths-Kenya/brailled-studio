// English wording for the parts of the outline that no block label covers. The view passes translations.
const DEFAULT_WORDS = {
    blank: 'empty',
    emptyBranch: 'no blocks inside',
    then: 'then',
    else: 'else',
    otherBranch: number => `part ${number}`,
    script: (number, total, firstSentence) => `Script ${number} of ${total}: ${firstSentence}`,
    // Words for the pictures inside some block labels, by opcode.
    images: {
        event_whenflagclicked: 'green flag',
        motion_turnleft: 'counterclockwise',
        motion_turnright: 'clockwise'
    }
};

export default DEFAULT_WORDS;
