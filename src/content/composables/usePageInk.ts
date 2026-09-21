import type { Ref } from 'vue'
import type { Ink } from './useTileInk'
import { onBeforeUnmount, ref, watchEffect } from 'vue'
import { traced } from '@/shared/perf'
import { HOST_ID } from '../host'
import { HEADER_H } from './useBubbleLayout'
import { nextInk } from './useTileInk'

/**
 * Picks readable ink for the bar above the bubble.
 *
 * That bar hangs over the page rather than over a stream, and page pixels
 * cannot be read back - drawing the page to a canvas is not something a content
 * script can do. What can be read is what the page says it is painted with, so
 * the topmost element under the bar that declares an opaque background colour
 * decides the ink. A page that paints with an image or a gradient reports
 * nothing usable, and the white default is the safer guess for those.
 */
const SAMPLE_MS = 700
/** Sampled across the bar, so a page split down the middle still averages out. */
const POINTS = [0.2, 0.5, 0.8]

export function usePageInk(root: Ref<HTMLElement | null>, active: Ref<boolean>) {
  const ink = ref<Ink>('light')
  let timer: ReturnType<typeof setInterval> | null = null

  function read() {
    const el = root.value
    if (!el)
      return
    const box = el.getBoundingClientRect()
    if (!box.width)
      return

    traced('page-ink', () => {
      const y = box.top + HEADER_H / 2
      let sum = 0
      for (const at of POINTS)
        sum += backdropLuma(box.left + box.width * at, y)
      ink.value = nextInk(ink.value, sum / POINTS.length)
    })
  }

  watchEffect(() => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (!active.value) {
      ink.value = 'light'
      return
    }
    read()
    timer = setInterval(read, SAMPLE_MS)
  })

  onBeforeUnmount(() => {
    if (timer)
      clearInterval(timer)
  })

  return { ink, read }
}

/** Luminance (0-1) of whatever the page paints at one point. */
function backdropLuma(x: number, y: number): number {
  for (const el of document.elementsFromPoint(x, y)) {
    // Our own host is in the way of every sample.
    if (el.id === HOST_ID)
      continue
    const colour = parseRgb(getComputedStyle(el).backgroundColor)
    // Anything see-through lets the element behind it decide instead.
    if (colour && colour[3] > 0.5)
      return luminance(colour)
  }
  // Nothing opaque all the way down: that is the browser's white page.
  return 1
}

function parseRgb(value: string): [number, number, number, number] | null {
  const parts = value.match(/[\d.]+/g)
  if (!parts || parts.length < 3)
    return null
  return [Number(parts[0]), Number(parts[1]), Number(parts[2]), parts.length > 3 ? Number(parts[3]) : 1]
}

function luminance([r, g, b]: [number, number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}
