import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';

import styles from './stage-tabs.css';

const messages = defineMessages({
    tabList: {
        id: 'brailled.stageTabs.label',
        defaultMessage: 'Devices, sprites and background',
        description: 'Accessible name of the tab list under the stage'
    }
});

const SPRITES_TAB_INDEX = 1;

const StageTabs = ({devices, sprites, background}) => {
    const intl = useIntl();
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
                <Tab className={styles.tab}>
                    <FormattedMessage
                        defaultMessage="Devices"
                        description="Tab showing hardware devices"
                        id="brailled.stageTabs.devices"
                    />
                </Tab>
                <Tab className={styles.tab}>
                    <FormattedMessage
                        defaultMessage="Sprites"
                        description="Tab showing the list of sprites"
                        id="brailled.stageTabs.sprites"
                    />
                </Tab>
                <Tab className={styles.tab}>
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
    background: PropTypes.node.isRequired
};

export default StageTabs;
