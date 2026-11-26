import debounce from 'lodash.debounce';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';

import {getApp} from '../actions/app.js';
import {VIEW_TOGGLE} from '../actions/shortcuts.js';
import useKeptState from '../use-kept-state.js';
import createDefinitionSource from './block-definitions.js';
import BlockPicker from './block-picker.jsx';
import {CreateDataDialog, RenameDataDialog} from './data-dialogs.jsx';
import diffOutlines from './diff.js';
import {blockOf} from './editing.js';
import {buildWords, messages} from './messages.js';
import {findPath, keepPlace, navigate, reveal} from './navigation.js';
import OutlineItem from './outline-item.jsx';
import buildOutline from './tree.js';
import useEditing from './use-editing.js';
import ValueEditor from './value-editor.jsx';

import styles from './outline.css';

// Anything that can change the program, its labels or which sprite is selected.
const VM_EVENTS = [
    'workspaceUpdate',
    'targetsUpdate',
    'PROJECT_CHANGED',
    'EXTENSION_ADDED',
    'BLOCKSINFO_UPDATE'
];
// A running project reports changes continuously, so rebuild at a limited rate.
const REBUILD_DELAY_MS = 150;
const REBUILD_MAX_WAIT_MS = 600;

// The palette lists variables only when told to, which a redraw of the workspace does not do.
const refreshPalette = () => {
    require('scratch-blocks').getMainWorkspace()
        ?.getToolbox()
        ?.forceRerender();
};

const readProgram = (vm, intl) => {
    const target = vm.editingTarget;
    if (!target) return null;
    // Loaded on first use: the editor has configured this module by then.
    const ScratchBlocks = require('scratch-blocks');
    return {
        targetId: target.id,
        name: target.getName(),
        // Differs between languages, so that translating every label is not announced as a change.
        language: `${intl.locale} ${ScratchBlocks.Msg.CONTROL_REPEAT}`,
        nodes: buildOutline({
            blocks: target.blocks._blocks,
            scripts: target.blocks.getScripts(),
            getDefinition: createDefinitionSource(ScratchBlocks),
            words: buildWords(intl)
        })
    };
};

const describeChange = (previous, next, active, intl) => {
    if (!previous) return null;
    if (previous.targetId !== next.targetId) {
        // Selecting a sprite is only worth announcing to someone reading the outline.
        return active ?
            intl.formatMessage(messages.switched, {name: next.name, count: next.nodes.length}) :
            null;
    }
    if (previous.language !== next.language) return null;
    const changes = diffOutlines(previous.nodes, next.nodes);
    return ['added', 'removed', 'moved', 'changed']
        .filter(kind => changes[kind])
        .map(kind => intl.formatMessage(messages[kind], changes[kind]))
        .join('. ') || null;
};

/**
 * Tree of the selected sprite's program, edited from the keyboard. It stays mounted while hidden, so that it keeps the
 * user's place and announces changes made in the Blocks view.
 * @param {object} props Props.
 * @param {object} props.vm The virtual machine.
 * @param {boolean} props.active Whether the outline is the view being shown.
 * @returns {React.ReactElement} The view and its dialogs.
 */
const OutlineView = ({vm, active}) => {
    const intl = useIntl();
    const [keptPlaces, setKeptPlaces] = useKeptState(vm, 'outlinePlaces', {});
    const [state, setState] = useState({program: null, places: keptPlaces});
    // The last thing announced, shown for sighted helpers.
    const [said, setSaid] = useState('');
    const containerRef = useRef(null);
    const programRef = useRef(null);
    const activeRef = useRef(active);
    const focusCurrentRef = useRef(false);
    activeRef.current = active;
    const rebuildRef = useRef(null);
    const app = getApp(vm);
    const {editor, announce} = app;

    useEffect(() => {
        // `silent` is for changes that the editing engine announces itself.
        const rebuild = ({silent = false} = {}) => {
            const next = readProgram(vm, intl);
            const previous = programRef.current;
            if (!next || JSON.stringify(next) === JSON.stringify(previous)) return;
            programRef.current = next;
            const announcement = silent ? null : describeChange(previous, next, activeRef.current, intl);
            // Rebuilding can remove the focused element, which would drop the user out of the tree.
            if (containerRef.current.contains(document.activeElement)) focusCurrentRef.current = true;
            setState(({places}) => {
                const place = places[next.targetId] || {currentId: null, collapsed: new Set(), nodes: []};
                const currentId = keepPlace(place.nodes, next.nodes, place.currentId);
                return {
                    program: next,
                    places: {...places,
                        [next.targetId]: {
                            collapsed: reveal(next.nodes, place.collapsed, currentId),
                            currentId,
                            nodes: next.nodes
                        }}
                };
            });
            if (announcement) announce(announcement);
        };
        rebuildRef.current = rebuild;
        // VM events carry data of their own, which `rebuild` must not take for options.
        const schedule = debounce(() => rebuild(), REBUILD_DELAY_MS, {maxWait: REBUILD_MAX_WAIT_MS});
        VM_EVENTS.forEach(event => vm.on(event, schedule));
        schedule();
        return () => {
            schedule.cancel();
            VM_EVENTS.forEach(event => vm.removeListener(event, schedule));
        };
    }, [vm, intl, announce]);

    useEffect(() => app.subscribe(setSaid), [app]);

    useEffect(() => {
        editor.setEnvironment({intl, words: buildWords(intl), scratchBlocks: require('scratch-blocks')});
        // Lets commands be tried from the browser console in development builds.
        if (process.env.NODE_ENV !== 'production') window.brailled = editor;
    }, [editor, intl]);

    // Show and say the result of every command, wherever it came from.
    useEffect(() => editor.subscribe(result => {
        if (result.dataChanged) refreshPalette();
        if (result.changed) {
            rebuildRef.current({silent: true});
            const {focusId} = result;
            if (focusId) {
                setState(current => {
                    const {targetId, nodes} = current.program;
                    const place = current.places[targetId];
                    if (!findPath(nodes, focusId)) return current;
                    return {...current,
                        places: {...current.places,
                            [targetId]: {
                                ...place, currentId: focusId, collapsed: reveal(nodes, place.collapsed, focusId)
                            }}};
                });
            }
        }
        announce(result.message);
    }), [editor, announce]);

    const {program, places} = state;
    const place = program && places[program.targetId];

    useEffect(() => {
        setKeptPlaces(places);
    }, [places, setKeptPlaces]);

    const updatePlace = useCallback(change => setState(current => {
        const {targetId} = current.program;
        return {...current, places: {...current.places, [targetId]: {...current.places[targetId], ...change}}};
    }), []);

    // Focusing the current item changes nothing. A render here would take the request to move focus that an
    // action made at the same moment, before the action's own change is drawn.
    const handleSelect = useCallback(currentId => setState(current => {
        const {targetId} = current.program;
        const selected = current.places[targetId];
        if (selected.currentId === currentId) return current;
        return {...current, places: {...current.places, [targetId]: {...selected, currentId}}};
    }), []);

    const handleToggle = useCallback(id => {
        focusCurrentRef.current = true;
        setState(current => {
            const {targetId} = current.program;
            const collapsed = new Set(current.places[targetId].collapsed);
            if (!collapsed.delete(id)) collapsed.add(id);
            return {...current,
                places: {...current.places,
                    [targetId]: {
                        ...current.places[targetId], collapsed, currentId: id
                    }}};
        });
    }, []);

    const currentPath = useCallback(
        () => (place?.currentId ? findPath(program.nodes, place.currentId) : null),
        [program, place]);

    const refocus = useCallback(() => {
        focusCurrentRef.current = true;
    }, []);

    const {dialog, movingId, operations} =
        useEditing({editor, program, currentPath, announce, refocus, intl});

    // What actions ask of the outline. Kept current on every render.
    const controller = useRef({});
    Object.assign(controller.current, operations, {
        isMoving: () => !!movingId,
        movingText: () => (movingId ? findPath(program.nodes, movingId)?.at(-1).text : null),
        currentBlock: () => blockOf(currentPath()?.at(-1)),
        // Where the user is, for the context snapshot.
        position: () => {
            const path = program && currentPath();
            if (!path) return null;
            const node = path.at(-1);
            return {
                item: node.text,
                level: node.level,
                position: node.posinset,
                count: node.setsize,
                script: path[0].posinset,
                scripts: program.nodes.length
            };
        },
        step: direction => {
            const result = place?.currentId &&
                navigate(program.nodes, place, direction > 0 ? 'ArrowDown' : 'ArrowUp');
            if (!result) return null;
            const node = findPath(program.nodes, result.currentId).at(-1);
            refocus();
            updatePlace(result);
            return {
                moved: result.currentId !== place.currentId,
                item: node.text,
                level: node.level,
                position: node.posinset,
                count: node.setsize
            };
        }
    });
    useEffect(() => app.register('outline', controller.current), [app]);

    useLayoutEffect(() => {
        if (!focusCurrentRef.current || dialog) return;
        focusCurrentRef.current = false;
        containerRef.current.querySelector('[tabindex="0"]')?.focus();
    }, [program, places, dialog]);

    const handleKeyDown = useCallback(event => {
        if (!program) return;
        const used = () => {
            event.preventDefault();
            event.stopPropagation();
        };
        // Focus returns to the tree after an edit, which may remove the focused item.
        focusCurrentRef.current = true;
        if (app.handleKey(event, 'outline')) {
            used();
            return;
        }
        focusCurrentRef.current = false;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const result = place?.currentId && navigate(program.nodes, place, event.key);
        if (!result) return;
        used();
        focusCurrentRef.current = true;
        updatePlace(result);
    }, [app, program, place, updatePlace]);

    return (
        <React.Fragment>
            <section
                aria-labelledby="brailled-outline-heading"
                className={styles.outline}
                data-brailled-outline
                hidden={!active}
                ref={containerRef}
                onKeyDown={handleKeyDown}
            >
                {program ? (
                    <React.Fragment>
                        <h2
                            className={styles.heading}
                            id="brailled-outline-heading"
                        >
                            {intl.formatMessage(messages.heading, {name: program.name})}
                        </h2>
                        <p
                            className={styles.hint}
                            id="brailled-outline-hint"
                        >
                            {intl.formatMessage(messages.hint, {shortcut: VIEW_TOGGLE.label})}
                        </p>
                        {/* For sighted helpers; screen readers hear the live region below. */}
                        <p
                            aria-hidden="true"
                            className={styles.result}
                        >
                            {said}
                        </p>
                        {program.nodes.length > 0 ? (
                            <ul
                                aria-describedby="brailled-outline-hint"
                                aria-label={intl.formatMessage(messages.treeLabel, {name: program.name})}
                                className={styles.tree}
                                role="tree"
                            >
                                {program.nodes.map(node => (
                                    <OutlineItem
                                        collapsed={place.collapsed}
                                        currentId={place.currentId}
                                        key={node.id}
                                        movingId={movingId}
                                        node={node}
                                        onSelect={handleSelect}
                                        onToggle={handleToggle}
                                    />
                                ))}
                            </ul>
                        ) : (
                            <p
                                className={styles.noBlocks}
                                tabIndex="0"
                            >
                                {intl.formatMessage(messages.noBlocks, {name: program.name})}
                            </p>
                        )}
                    </React.Fragment>
                ) : null}
            </section>
            {dialog?.type === 'picker' ? (
                <BlockPicker
                    entries={dialog.entries}
                    key={dialog.title}
                    title={dialog.title}
                    onCancel={dialog.handleCancel}
                    onChoose={dialog.handleChoose}
                />
            ) : null}
            {dialog?.type === 'create' ? (
                <CreateDataDialog
                    isStage={dialog.isStage}
                    onCancel={dialog.handleCancel}
                    onCreate={dialog.handleCreate}
                />
            ) : null}
            {dialog?.type === 'rename' ? (
                <RenameDataDialog
                    items={dialog.items}
                    onCancel={dialog.handleCancel}
                    onRename={dialog.handleRename}
                />
            ) : null}
            {dialog?.type === 'values' ? (
                <ValueEditor
                    fields={dialog.fields}
                    title={dialog.title}
                    onCancel={dialog.handleCancel}
                    onChooseBlock={dialog.handleChooseBlock}
                    onRemove={dialog.handleRemove}
                    onSave={dialog.handleSave}
                />
            ) : null}
        </React.Fragment>
    );
};

OutlineView.propTypes = {
    vm: PropTypes.shape({
        editingTarget: PropTypes.shape({id: PropTypes.string}),
        on: PropTypes.func.isRequired,
        removeListener: PropTypes.func.isRequired
    }).isRequired,
    active: PropTypes.bool.isRequired
};

export default OutlineView;
