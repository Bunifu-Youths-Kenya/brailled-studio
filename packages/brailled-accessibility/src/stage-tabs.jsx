import PropTypes from 'prop-types';
import React, {useEffect} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';

import {getApp} from './actions/app.js';

import styles from './stage-tabs.css';

const messages = defineMessages({
    tabList: {
        id: 'brailled.stageTabs.label',
        defaultMessage: 'Devices, sprites and background',
        description: 'Accessible name of the tab list under the stage'
    }
});

const SPRITES_TAB_INDEX = 1;

const StageTabs = ({
    devices, sprites, background, vm, spriteLibrary, onOpenSpriteLibrary, onCloseSpriteLibrary, onPlaceSprite
}) => {
    const intl = useIntl();

    useEffect(
        () => getApp(vm).register('sprites', {
            items: spriteLibrary,
            // The editor's handler expects the click that asked for the library.
            openLibrary: () => onOpenSpriteLibrary({preventDefault: () => {}}),
            closeLibrary: () => onCloseSpriteLibrary(),
            // Add a sprite from the library, which selects it, as choosing it there does.
            add: item => {
                const sprite = JSON.parse(JSON.stringify(item));
                onPlaceSprite(sprite);
                return vm.addSprite(JSON.stringify(sprite));
            }
        }),
        [vm, spriteLibrary, onOpenSpriteLibrary, onCloseSpriteLibrary, onPlaceSprite]
    );
    return (
        <Tabs
            className={styles.tabs}
            defaultIndex={SPRITES_TAB_INDEX}
            forceRenderTabPanel
            selectedTabClassName={styles.selectedTab}
            selectedTabPanelClassName={styles.selectedPanel}
        >
            <TabList
                aria-label={intl.formatMessage(messages.tabList)}
                className={styles.tabList}
            >
                <Tab
                    className={styles.tab}
                    data-brailled-stage-tab="devices"
                >
                    <FormattedMessage
                        defaultMessage="Devices"
                        description="Tab showing hardware devices"
                        id="brailled.stageTabs.devices"
                    />
                </Tab>
                <Tab
                    className={styles.tab}
                    data-brailled-stage-tab="sprites"
                >
                    <FormattedMessage
                        defaultMessage="Sprites"
                        description="Tab showing the list of sprites"
                        id="brailled.stageTabs.sprites"
                    />
                </Tab>
                <Tab
                    className={styles.tab}
                    data-brailled-stage-tab="background"
                >
                    <FormattedMessage
                        defaultMessage="Background"
                        description="Tab showing the stage background selector"
                        id="brailled.stageTabs.background"
                    />
                </Tab>
            </TabList>
            <TabPanel className={styles.panel}>{devices}</TabPanel>
            <TabPanel className={styles.panel}>{sprites}</TabPanel>
            <TabPanel className={styles.panel}>{background}</TabPanel>
        </Tabs>
    );
};

StageTabs.propTypes = {
    devices: PropTypes.node.isRequired,
    sprites: PropTypes.node.isRequired,
    background: PropTypes.node.isRequired,
    vm: PropTypes.shape({addSprite: PropTypes.func, on: PropTypes.func}).isRequired,
    spriteLibrary: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired,
        tags: PropTypes.arrayOf(PropTypes.string)
    })).isRequired,
    onOpenSpriteLibrary: PropTypes.func.isRequired,
    onCloseSpriteLibrary: PropTypes.func.isRequired,
    onPlaceSprite: PropTypes.func.isRequired
};

export default StageTabs;
