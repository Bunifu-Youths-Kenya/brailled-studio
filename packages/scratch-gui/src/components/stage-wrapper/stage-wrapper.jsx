import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import VM from '@scratch/scratch-vm';

import Box from '../box/box.jsx';
import {STAGE_DISPLAY_SIZES} from '../../lib/layout-constants.js';
import StageHeader from '../../containers/stage-header.jsx';
import Stage from '../../containers/stage.jsx';
import Loader from '../loader/loader.jsx';

import styles from './stage-wrapper.css';

const StageWrapperComponent = function (props) {
    const {
        ariaLabel,
        ariaRole,
        controlsBelowStage,
        isCreating,
        isFullScreen,
        isRtl,
        isRendererSupported,
        loading,
        manuallySaveThumbnails,
        onSetManualThumbnail,
        onSetManualThumbnailButtonClick,
        onUpdateProjectThumbnail,
        username,
        userOwnsProject,
        stageSize,
        showNewFeatureCallouts,
        vm
    } = props;
    // Keyed so that changing their order moves them instead of remounting them.
    const header = (
        <Box
            className={styles.stageMenuWrapper}
            key="header"
        >
            <StageHeader
                manuallySaveThumbnails={manuallySaveThumbnails}
                onSetManualThumbnail={onSetManualThumbnail}
                onSetManualThumbnailButtonClick={onSetManualThumbnailButtonClick}
                username={username}
                userOwnsProject={userOwnsProject}
                loadingOrCreating={loading || isCreating}
                onUpdateProjectThumbnail={onUpdateProjectThumbnail}
                showNewFeatureCallouts={showNewFeatureCallouts}
                stageSize={stageSize}
                vm={vm}
            />
        </Box>
    );
    const canvas = (
        <Box
            className={styles.stageCanvasWrapper}
            key="canvas"
        >
            {
                isRendererSupported ?
                    <Stage
                        stageSize={stageSize}
                        vm={vm}
                    /> :
                    null
            }
        </Box>
    );
    return (
        <Box
            className={classNames(
                styles.stageWrapper,
                {[styles.fullScreen]: isFullScreen}
            )}
            dir={isRtl ? 'rtl' : 'ltr'}
            role={ariaRole}
            aria-label={ariaLabel}
            element="section"
        >
            {controlsBelowStage && !isFullScreen ? [canvas, header] : [header, canvas]}
            {loading ? (
                <Loader isFullScreen={isFullScreen} />
            ) : null}
        </Box>
    );
};

StageWrapperComponent.propTypes = {
    ariaLabel: PropTypes.string,
    ariaRole: PropTypes.string,
    controlsBelowStage: PropTypes.bool,
    isCreating: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isRendererSupported: PropTypes.bool.isRequired,
    isRtl: PropTypes.bool.isRequired,
    loading: PropTypes.bool,
    manuallySaveThumbnails: PropTypes.bool,
    onSetManualThumbnail: PropTypes.func,
    onSetManualThumbnailButtonClick: PropTypes.func,
    showNewFeatureCallouts: PropTypes.bool,
    username: PropTypes.string,
    userOwnsProject: PropTypes.bool,
    onUpdateProjectThumbnail: PropTypes.func,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default StageWrapperComponent;
