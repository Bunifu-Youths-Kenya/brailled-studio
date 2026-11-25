import {useCallback, useState} from 'react';

import {moveCommand, pickUp} from './editing.js';
import {dialogMessages as messages} from './messages.js';
import {findPath} from './navigation.js';

/**
 * Moving by picking a block up with M, going to the destination, and putting it down.
 * @param {object} options Options.
 * @param {?object} options.program The outline being shown.
 * @param {object} options.editor The editing engine.
 * @param {function(string)} options.announce Says something through the live region.
 * @param {object} options.intl A react-intl object.
 * @returns {{movingId: ?string, handleMoveKey: function(string, boolean, ?object): boolean}} The item picked
 * up, if any, and a handler taking a lower case key, whether Shift is held and the current item. It returns
 * whether it used the key.
 */
const useMoving = ({program, editor, announce, intl}) => {
    const [picked, setPicked] = useState(null);
    // A block that has since been deleted, or belongs to another sprite, is no longer being moved.
    const moving = picked && program && picked.targetId === program.targetId &&
        findPath(program.nodes, picked.block) ? picked : null;

    const handleMoveKey = useCallback((key, shift, node) => {
        const say = (message, values) => announce(intl.formatMessage(message, values));
        const cancel = () => {
            setPicked(null);
            say(messages.moveCancelled);
        };
        const putDown = options => {
            // A refusal is announced by the editor, and leaves the block picked up.
            if (editor.run(moveCommand(moving, node, options)).ok) setPicked(null);
        };

        if (key === 'm' && !moving) {
            const found = pickUp(node);
            if (found) {
                setPicked({...found, targetId: program.targetId});
                say(messages.moving, {block: node.text});
            } else {
                say(messages.chooseBlockToMove);
            }
        } else if (key === 'm' && node?.id === moving.nodeId) {
            cancel();
        } else if (key === 'm') {
            putDown({before: shift});
        } else if (key === 'n' && moving) {
            putDown({newScript: true});
        } else if (key === 'escape' && moving) {
            cancel();
        } else {
            return false;
        }
        return true;
    }, [moving, program, editor, announce, intl]);

    return {movingId: moving ? moving.nodeId : null, handleMoveKey};
};

export default useMoving;
