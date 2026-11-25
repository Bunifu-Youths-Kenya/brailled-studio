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

const StageTabs = ({devices, sprites, background, vm, onOpenSpriteLibrary}) => {
    const intl = useIntl();

    useEffect(
        () => getApp(vm).register('sprites', {
            // The editor's handler expects the click that asked for the library.
            openLibrary: () => onOpenSpriteLibrary({preventDefault: () => {}})
        }),
        [vm, onOpenSpriteLibrary]
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
    vm: PropTypes.shape({on: PropTypes.func}).isRequired,
    onOpenSpriteLibrary: PropTypes.func.isRequired
};

export default StageTabs;
