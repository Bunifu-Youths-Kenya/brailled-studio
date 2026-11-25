import {useCallback, useState} from 'react';

import {CATALOG} from '../commands/catalog.js';
import {deleteCommand, insertCommand, insertPosition, WRAPPERS, wrapRange} from './editing.js';
import {dialogMessages as messages} from './messages.js';
import useMoving from './use-moving.js';

/**
 * The Outline's editing operations and the dialogs they open.
 * @param {object} options Options.
 * @param {object} options.editor The editing engine.
 * @param {?object} options.program The outline being shown.
 * @param {function(): ?object[]} options.currentPath The nodes from the top of the outline to the item the
 * user is on.
 * @param {function(string)} options.announce Says something through the live region.
 * @param {function()} options.refocus Returns focus to the tree once it has been redrawn.
 * @param {object} options.intl A react-intl object.
 * @returns {{dialog: ?object, movingId: ?string, operations: object}} The open dialog and the item being moved,
 * if any, and the operations that actions carry out.
 */
const useEditing = ({editor, program, currentPath, announce, refocus, intl}) => {
    // `{type: 'picker'|'values'|'create'|'rename', ...}`
    const [dialog, setDialog] = useState(null);
    const {movingId, handleMoveKey} = useMoving({program, editor, announce, intl});
    const currentNode = useCallback(() => {
        const path = currentPath();
        return path ? path[path.length - 1] : null;
    }, [currentPath]);

    const close = useCallback(() => {
        refocus();
        setDialog(null);
    }, [refocus]);

    // Run a command for a dialog: close it on success, or return the reason to show in it.
    const runFromDialog = useCallback(commands => {
        const result = editor.run(commands);
        if (!result.ok) return result.message;
        close();
        return null;
    }, [editor, close]);

    const openInsert = useCallback(before => {
        const node = currentNode();
        const position = insertPosition(node, before);
        let title = messages.addNew;
        if (position.inside) title = messages.addInside;
        else if (node) title = before ? messages.addBefore : messages.addAfter;
        setDialog({
            type: 'picker',
            title: intl.formatMessage(title, {block: node?.text}),
            entries: editor.listBlocks('instruction'),
            handleChoose: opcode => runFromDialog(insertCommand(opcode, position)),
            handleCancel: close
        });
    }, [editor, currentNode, intl, runFromDialog, close]);

    const openValues = useCallback(node => {
        const fields = editor.valuesOf(node.id);
        const editorDialog = {type: 'values', title: intl.formatMessage(messages.edit, {block: node.text}), fields};
        const chooseBlock = field => setDialog({
            type: 'picker',
            title: intl.formatMessage(messages.addValue, {label: field.label}),
            entries: editor.listBlocks(field.accepts),
            handleChoose: opcode => runFromDialog(
                {op: 'set-value', block: field.blockId, name: field.name, value: {block: opcode}}),
            // Back to the values rather than all the way out.
            handleCancel: () => setDialog(editorDialog)
        });
        Object.assign(editorDialog, {
            handleSave: changes => {
                if (changes.length > 0) return runFromDialog(changes);
                close();
                announce(intl.formatMessage(messages.noChange));
                return null;
            },
            handleRemove: field => runFromDialog(
                {op: 'set-value', block: field.blockId, name: field.name, value: null}),
            handleChooseBlock: chooseBlock,
            handleCancel: close
        });
        setDialog(editorDialog);
    }, [editor, intl, announce, runFromDialog, close]);

    const openWrap = useCallback(following => {
        const range = wrapRange(currentPath(), following);
        if (!range) {
            announce(intl.formatMessage(messages.chooseBlockToWrap));
            return;
        }
        const node = currentNode();
        const many = range.through && node.type === 'block';
        setDialog({
            type: 'picker',
            title: intl.formatMessage(many ? messages.wrapFollowing : messages.wrap, {block: node.text}),
            entries: editor.listBlocks('instruction').filter(entry => WRAPPERS.includes(entry.opcode)),
            handleChoose: opcode => runFromDialog({op: 'wrap', ...range, in: opcode}),
            handleCancel: close
        });
    }, [editor, currentPath, currentNode, announce, intl, runFromDialog, close]);

    const openCreate = useCallback(() => {
        setDialog({
            type: 'create',
            isStage: editor.listData().isStage,
            handleCreate: values => runFromDialog({op: 'create', ...values}),
            handleCancel: close
        });
    }, [editor, runFromDialog, close]);

    const openRename = useCallback(() => {
        const {items} = editor.listData();
        if (items.length === 0) {
            announce(intl.formatMessage(messages.nothingToRename));
            return;
        }
        setDialog({
            type: 'rename',
            items,
            handleRename: values => runFromDialog({op: 'rename', ...values}),
            handleCancel: close
        });
    }, [editor, announce, intl, runFromDialog, close]);

    const remove = useCallback(() => {
        const command = deleteCommand(currentNode());
        if (command) editor.run(command);
        else announce(intl.formatMessage(messages.chooseBlockToDelete));
    }, [editor, currentNode, announce, intl]);

    // Returns false where Enter should open or close the item instead.
    const editValues = useCallback(() => {
        const node = currentNode();
        if (node?.type !== 'block') return false;
        if (editor.valuesOf(node.id).length > 0) {
            openValues(node);
        } else if (node.children) {
            return false;
        } else {
            // Custom and extension blocks have values, which the editor does not know how to change.
            const unsupported = !CATALOG[node.opcode];
            announce(intl.formatMessage(unsupported ? messages.valuesUnsupported : messages.noValues));
        }
        return true;
    }, [editor, currentNode, openValues, announce, intl]);

    const operations = {
        insert: openInsert,
        remove,
        editValues,
        move: before => {
            handleMoveKey('m', before, currentNode());
        },
        moveToNewScript: () => {
            handleMoveKey('n', false, currentNode());
        },
        cancelMove: () => {
            handleMoveKey('escape', false, currentNode());
        },
        wrap: openWrap,
        createData: openCreate,
        renameData: openRename
    };

    return {dialog, movingId, operations};
};

export default useEditing;
