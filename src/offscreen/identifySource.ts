import type { ProbeReply, Rgb } from '@/shared/messages'
import { sendMessage } from '@/shared/messages'

/** How long the swatches stay painted before we read a frame. */
const PAINT_SETTLE_MS = 450
/** Max RGB distance for a swatch to count as a match. */
const MATCH_THRESHOLD = 70
/** The winner must be this much closer than the runner-up. */
const MATCH_MARGIN = 0.6

/**
 * Works out which tab a captured stream is showing.
 *
 * Chrome's share picker hands back an opaque stream id with no tab identity, so
 * we ask every tab to paint a unique colour in its top-left corner and then read
 * that corner out of the captured frame. For a tab capture the video frame *is*
 * the tab viewport, so the corner maps regardless of zoom or device pixel ratio.
 *
 * Returns `null` for window/screen shares, for tabs without a content script,
 * and whenever the reading is ambiguous.
 */
export async function identifySourceTab(video: HTMLVideoElement): Promise<number | null> {
  const probe = await sendMessage<ProbeReply>({ to: 'sw', type: 'RUN_PROBE' })
  if (!probe || Object.keys(probe.colors).length === 0)
    return null

  await wait(PAINT_SETTLE_MS)
  const corner = sampleCorner(video)
  if (!corner)
    return null

  let best: { tabId: number, distance: number } | null = null
  let runnerUp = Number.POSITIVE_INFINITY

  for (const [tabId, color] of Object.entries(probe.colors)) {
    const distance = rgbDistance(corner, color)
    if (!best || distance < best.distance) {
      runnerUp = best?.distance ?? runnerUp
      best = { tabId: Number(tabId), distance }
    }
    else if (distance < runnerUp) {
      runnerUp = distance
    }
  }

  if (!best || best.distance > MATCH_THRESHOLD)
    return null
  if (best.distance > runnerUp * MATCH_MARGIN)
    return null
  return best.tabId
}

/** Average the top-left corner of the current video frame. */
function sampleCorner(video: HTMLVideoElement): Rgb | null {
  const { videoWidth: w, videoHeight: h } = video
  if (!w || !h)
    return null

  const box = Math.max(4, Math.floor(Math.min(w, h) * 0.012))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx)
    return null

  ctx.drawImage(video, 0, 0, w, h)
  const { data } = ctx.getImageData(2, 2, box, box)

  let r = 0
  let g = 0
  let b = 0
  const pixels = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
  }
  return [Math.round(r / pixels), Math.round(g / pixels), Math.round(b / pixels)]
}

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
