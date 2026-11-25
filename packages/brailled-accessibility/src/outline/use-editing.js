import {useCallback, useState} from 'react';

import {CATALOG} from '../commands/catalog.js';
import {blockOf, deleteCommand, insertCommand, insertPosition} from './editing.js';
import {dialogMessages as messages} from './messages.js';

/**
 * The Outline's editing keys and the dialogs they open.
 * @param {object} options Options.
 * @param {object} options.editor The editing engine.
 * @param {function(): ?object} options.currentNode The item the user is on.
 * @param {function(string)} options.announce Says something through the live region.
 * @param {function()} options.refocus Returns focus to the tree once it has been redrawn.
 * @param {object} options.intl A react-intl object.
 * @returns {{dialog: ?object, handleEditKey: function(KeyboardEvent): boolean}} The open dialog, if any, and
 * a key handler that returns whether it used the key.
 */
const useEditing = ({editor, currentNode, announce, refocus, intl}) => {
    // `{type: 'picker'|'values', ...}`
    const [dialog, setDialog] = useState(null);

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

    const handleEditKey = useCallback(event => {
        const key = event.key.toLowerCase();
        if (event.altKey) return false;
        if (event.ctrlKey || event.metaKey) {
            if (key === 'z') editor.run({op: event.shiftKey ? 'redo' : 'undo'});
            else if (key === 'y') editor.run({op: 'redo'});
            else return false;
            return true;
        }
        const node = currentNode();
        if (key === 'i') {
            openInsert(event.shiftKey);
        } else if (key === 'd') {
            const script = event.shiftKey ? blockOf(node) : null;
            editor.run({op: 'describe', ...(script ? {script} : {})});
        } else if (key === 'delete' || key === 'backspace') {
            const command = deleteCommand(node);
            if (command) editor.run(command);
            else announce(intl.formatMessage(messages.chooseBlockToDelete));
        } else if (key === 'enter' && node?.type === 'block') {
            if (editor.valuesOf(node.id).length > 0) {
                openValues(node);
            } else if (node.children) {
                // Nothing to edit, so Enter opens or closes it as usual.
                return false;
            } else {
                // Custom and extension blocks have values, which the editor does not know how to change.
                const unsupported = !CATALOG[node.opcode];
                announce(intl.formatMessage(unsupported ? messages.valuesUnsupported : messages.noValues));
            }
        } else {
            return false;
        }
        return true;
    }, [editor, currentNode, openInsert, openValues, announce, intl]);

    return {dialog, handleEditKey};
};

export default useEditing;
