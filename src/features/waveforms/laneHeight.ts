/**
 * Height of one trace's lane in pixels.
 *
 * Its own module so the panel can size its container without importing the
 * chart, which would pull Chart.js into the main bundle and undo the lazy
 * load it is being sized for.
 */
export const LANE_HEIGHT = 92
