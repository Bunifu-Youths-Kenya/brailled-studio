import debounce from 'lodash.debounce';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';

import useKeptState from '../use-kept-state.js';
import {VIEW_SHORTCUT_LABEL} from '../view-shortcut.js';
import createDefinitionSource from './block-definitions.js';
import diffOutlines from './diff.js';
import {buildWords, messages} from './messages.js';
import {keepPlace, navigate, reveal} from './navigation.js';
import OutlineItem from './outline-item.jsx';
import buildOutline from './tree.js';

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
 * Read-only tree of the selected sprite's program. It stays mounted while hidden, so that it keeps the
 * user's place and announces changes made in the Blocks view.
 * @param {object} props Props.
 * @param {object} props.vm The virtual machine.
 * @param {boolean} props.active Whether the outline is the view being shown.
 * @returns {React.ReactElement} The view and its live region.
 */
const OutlineView = ({vm, active}) => {
    const intl = useIntl();
    const [keptPlaces, setKeptPlaces] = useKeptState(vm, 'outlinePlaces', {});
    const [state, setState] = useState({program: null, places: keptPlaces, notice: {text: '', serial: 0}});
    const containerRef = useRef(null);
    const programRef = useRef(null);
    const activeRef = useRef(active);
    const focusCurrentRef = useRef(false);
    activeRef.current = active;

    useEffect(() => {
        const rebuild = () => {
            const next = readProgram(vm, intl);
            const previous = programRef.current;
            if (!next || JSON.stringify(next) === JSON.stringify(previous)) return;
            programRef.current = next;
            const announcement = describeChange(previous, next, activeRef.current, intl);
            // Rebuilding can remove the focused element, which would drop the user out of the tree.
            if (containerRef.current.contains(document.activeElement)) focusCurrentRef.current = true;
            setState(({places, notice}) => {
                const place = places[next.targetId] || {currentId: null, collapsed: new Set(), nodes: []};
                const currentId = keepPlace(place.nodes, next.nodes, place.currentId);
                return {
                    program: next,
                    places: {...places,
                        [next.targetId]: {
                            collapsed: reveal(next.nodes, place.collapsed, currentId),
                            currentId,
                            nodes: next.nodes
                        }},
                    notice: announcement ? {text: announcement, serial: notice.serial + 1} : notice
                };
            });
        };
        const schedule = debounce(rebuild, REBUILD_DELAY_MS, {maxWait: REBUILD_MAX_WAIT_MS});
        VM_EVENTS.forEach(event => vm.on(event, schedule));
        schedule();
        return () => {
            schedule.cancel();
            VM_EVENTS.forEach(event => vm.removeListener(event, schedule));
        };
    }, [vm, intl]);

    useLayoutEffect(() => {
        if (!focusCurrentRef.current) return;
        focusCurrentRef.current = false;
        containerRef.current.querySelector('[tabindex="0"]')?.focus();
    }, [state.program, state.places]);

    const {program, places, notice} = state;
    const place = program && places[program.targetId];

    useEffect(() => {
        setKeptPlaces(places);
    }, [places, setKeptPlaces]);

    const updatePlace = useCallback(change => setState(current => {
        const {targetId} = current.program;
        return {...current, places: {...current.places, [targetId]: {...current.places[targetId], ...change}}};
    }), []);

    const handleSelect = useCallback(currentId => updatePlace({currentId}), [updatePlace]);

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

    const handleKeyDown = useCallback(event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const result = navigate(program.nodes, place, event.key);
        if (!result) return;
        event.preventDefault();
        event.stopPropagation();
        focusCurrentRef.current = true;
        updatePlace(result);
    }, [program, place, updatePlace]);

    return (
        <React.Fragment>
            <section
                aria-labelledby="brailled-outline-heading"
                className={styles.outline}
                data-brailled-outline
                hidden={!active}
                ref={containerRef}
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
                            {intl.formatMessage(messages.hint, {shortcut: VIEW_SHORTCUT_LABEL})}
                        </p>
                        {program.nodes.length > 0 ? (
                            <ul
                                aria-describedby="brailled-outline-hint"
                                aria-label={intl.formatMessage(messages.treeLabel, {name: program.name})}
                                className={styles.tree}
                                role="tree"
                                onKeyDown={handleKeyDown}
                            >
                                {program.nodes.map(node => (
                                    <OutlineItem
                                        collapsed={place.collapsed}
                                        currentId={place.currentId}
                                        key={node.id}
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
            <div
                aria-atomic="true"
                aria-live="polite"
                className={styles.announcer}
                data-brailled-announcer
            >
                {/* A new element each time, so that a repeated message is announced again. */}
                <span key={notice.serial}>{notice.text}</span>
            </div>
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
