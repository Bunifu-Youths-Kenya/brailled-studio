import PropTypes from 'prop-types';
import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';

import {dialogMessages} from './messages.js';

import styles from './outline.css';

const OutlineItem = ({node, currentId, movingId, collapsed, onSelect, onToggle}) => {
    const intl = useIntl();
    const moving = node.id === movingId;
    const expandable = !!node.children;
    const expanded = expandable && !collapsed.has(node.id);
    const labelId = `brailled-outline-label-${node.id}`;

    const handleFocus = useCallback(event => {
        if (event.target === event.currentTarget) onSelect(node.id);
    }, [node.id, onSelect]);

    const handleClick = useCallback(event => {
        event.stopPropagation();
        if (expandable && event.target.dataset.toggle) {
            onToggle(node.id);
        } else {
            event.currentTarget.focus();
        }
    }, [expandable, node.id, onToggle]);

    return (
        <li
            aria-expanded={expandable ? expanded : null}
            aria-labelledby={labelId}
            aria-level={node.level}
            aria-posinset={node.posinset}
            aria-setsize={node.setsize}
            className={styles.item}
            data-node-id={node.id}
            role="treeitem"
            tabIndex={node.id === currentId ? 0 : -1}
            onClick={handleClick}
            onFocus={handleFocus}
        >
            <span className={styles.row}>
                <span
                    aria-hidden="true"
                    className={styles.toggle}
                    data-toggle={expandable ? 'true' : null}
                >
                    {expandable && (expanded ? '▾' : '▸')}
                </span>
                <span
                    className={moving ? `${styles[node.type] || ''} ${styles.moving}` : styles[node.type]}
                    id={labelId}
                >
                    {moving ? intl.formatMessage(dialogMessages.beingMoved, {block: node.text}) : node.text}
                </span>
            </span>
            {expanded ? (
                <ul
                    className={styles.group}
                    role="group"
                >
                    {node.children.map(child => (
                        <OutlineItem
                            collapsed={collapsed}
                            currentId={currentId}
                            key={child.id}
                            movingId={movingId}
                            node={child}
                            onSelect={onSelect}
                            onToggle={onToggle}
                        />
                    ))}
                </ul>
            ) : null}
        </li>
    );
};

OutlineItem.propTypes = {
    node: PropTypes.shape({
        id: PropTypes.string.isRequired,
        type: PropTypes.string.isRequired,
        text: PropTypes.string.isRequired,
        level: PropTypes.number.isRequired,
        setsize: PropTypes.number.isRequired,
        posinset: PropTypes.number.isRequired,
        children: PropTypes.arrayOf(PropTypes.shape({id: PropTypes.string}))
    }).isRequired,
    currentId: PropTypes.string,
    movingId: PropTypes.string,
    collapsed: PropTypes.instanceOf(Set).isRequired,
    onSelect: PropTypes.func.isRequired,
    onToggle: PropTypes.func.isRequired
};

export default OutlineItem;
