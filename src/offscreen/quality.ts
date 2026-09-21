/**
 * How much picture a bubble is worth.
 *
 * A tab hands over its own full resolution - 1920x1200 for a bubble 320px wide
 * - and every pixel above what is drawn is encoded, sent and decoded only to be
 * thrown away by the scaler. The ceiling caps the capture itself; the scaling
 * in `fanout.ts` then takes each viewer down to the size it really draws.
 */
export const CEILING = { width: 1280, height: 800, frameRate: 15 }

/** Frames per second sent to a bubble; it is a thumbnail, not a screening. */
export const MAX_FPS = CEILING.frameRate

/** Below this the picture is unreadable, so there is no point scaling further. */
export const MAX_SCALE = 8
