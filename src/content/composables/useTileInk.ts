import type { Ref } from 'vue'
import { onBeforeUnmount, ref, watchEffect } from 'vue'

/**
 * Picks readable ink for the controls painted over a stream.
 *
 * The bands the controls and the grip sit in are read straight out of the video
 * frame, so a white page gets black text and a dark one keeps white text.
 */

/** Height of the band a control strip covers, in tile pixels. */
const BAND_H = 34
/** How often each band is re-read. */
const SAMPLE_MS = 600
/** Relative luminance of the tile's own background, behind letterbox bars. */
const BACKDROP = 0.06
/** Ink flips at these luminances; the gap in between stops it flickering. */
export const TO_DARK = 0.6
export const TO_LIGHT = 0.45

export type Ink = 'light' | 'dark'

/** One canvas for every tile: the reads are sequential and tiny. */
const canvas = document.createElement('canvas')
canvas.width = 12
canvas.height = 3
const ctx = canvas.getContext('2d', { willReadFrequently: true })

export function useTileInk(video: Ref<HTMLVideoElement | null>, active: Ref<boolean>) {
  const top = ref<Ink>('light')
  const middle = ref<Ink>('light')
  const bottom = ref<Ink>('light')
  let timer: ReturnType<typeof setInterval> | null = null

  function read() {
    const el = video.value
    if (!el)
      return
    for (const [band, ink] of [['top', top], ['middle', middle], ['bottom', bottom]] as const) {
      const luma = bandLuma(el, band)
      if (luma != null)
        ink.value = nextInk(ink.value, luma)
    }
  }

  watchEffect(() => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (!active.value) {
      top.value = 'light'
      middle.value = 'light'
      bottom.value = 'light'
      return
    }
    read()
    timer = setInterval(read, SAMPLE_MS)
  })

  onBeforeUnmount(() => {
    if (timer)
      clearInterval(timer)
  })

  return { top, middle, bottom }
}

/** Mean luminance (0-1) of one control band, or `null` if it cannot be read. */
function bandLuma(video: HTMLVideoElement, band: 'top' | 'middle' | 'bottom'): number | null {
  const { videoWidth: vw, videoHeight: vh } = video
  const box = video.getBoundingClientRect()
  if (!ctx || !vw || !vh || !box.width || !box.height)
    return null

  // The video is `object-fit: contain`, so the frame is centred and may not
  // reach the band at all.
  const scale = Math.min(box.width / vw, box.height / vh)
  const shownH = vh * scale
  const padY = (box.height - shownH) / 2

  const bandH = Math.min(BAND_H, box.height)
  const bandTop = band === 'top'
    ? 0
    : band === 'bottom' ? box.height - bandH : (box.height - bandH) / 2
  const covered = Math.max(0, Math.min(bandTop + bandH, padY + shownH) - Math.max(bandTop, padY))
  const coverage = (covered / bandH) * Math.min(1, (vw * scale) / box.width)
  if (coverage <= 0)
    return BACKDROP

  try {
    ctx.drawImage(video, 0, (Math.max(bandTop, padY) - padY) / scale, vw, covered / scale, 0, 0, canvas.width, canvas.height)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let sum = 0
    for (let i = 0; i < data.length; i += 4)
      sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    const luma = sum / (data.length / 4)
    // Whatever the frame does not cover is the tile's own dark background.
    return luma * coverage + BACKDROP * (1 - coverage)
  }
  catch {
    // A tainted canvas; keep whatever ink is already in use.
    return null
  }
}

export function nextInk(current: Ink, luma: number): Ink {
  if (current === 'light')
    return luma > TO_DARK ? 'dark' : 'light'
  return luma < TO_LIGHT ? 'light' : 'dark'
}
