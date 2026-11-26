import layout, {STAGE_DISPLAY_SCALES, STAGE_DISPLAY_SIZES, STAGE_SIZE_MODES} from '../../../src/lib/layout-constants';
import {getStageDimensions, resolveStageSize} from '../../../src/lib/screen-utils';

describe('the stage size', () => {
    test.each([
        [true, false, STAGE_DISPLAY_SIZES.large],
        [false, false, STAGE_DISPLAY_SIZES.largeConstrained],
        [true, true, STAGE_DISPLAY_SIZES.largeShort],
        [false, true, STAGE_DISPLAY_SIZES.largeShort]
    ])('large, wide %s and short %s, is %s', (isFullSize, isShort, size) => {
        expect(resolveStageSize(STAGE_SIZE_MODES.large, isFullSize, isShort)).toBe(size);
    });

    test('stays small when the small stage is chosen, however short the window', () => {
        expect(resolveStageSize(STAGE_SIZE_MODES.small, true, true)).toBe(STAGE_DISPLAY_SIZES.small);
    });

    test('on a short window is smaller than a narrow one, and larger than the small stage', () => {
        const {height} = getStageDimensions(STAGE_DISPLAY_SIZES.largeShort, false);
        expect(height).toBe(Math.round(layout.standardStageHeight *
            STAGE_DISPLAY_SCALES[STAGE_DISPLAY_SIZES.largeShort]));
        expect(height).toBeLessThan(getStageDimensions(STAGE_DISPLAY_SIZES.largeConstrained, false).height);
        expect(height).toBeGreaterThan(getStageDimensions(STAGE_DISPLAY_SIZES.small, false).height);
    });
});
