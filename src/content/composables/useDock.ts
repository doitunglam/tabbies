import type { DockSide } from '@/shared/types'
import { onBeforeUnmount, onMounted, reactive } from 'vue'

/** Gap kept between a docked bubble and the viewport edge. */
export const EDGE_MARGIN = 16

export function useViewport() {
  const viewport = reactive({ width: window.innerWidth, height: window.innerHeight })
  const sync = () => {
    viewport.width = window.innerWidth
    viewport.height = window.innerHeight
  }
  onMounted(() => window.addEventListener('resize', sync))
  onBeforeUnmount(() => window.removeEventListener('resize', sync))
  return viewport
}

export function dockedLeft(side: DockSide, width: number, viewportWidth: number): number {
  return side === 'left'
    ? EDGE_MARGIN
    : Math.max(EDGE_MARGIN, viewportWidth - width - EDGE_MARGIN)
}

export function clampTop(top: number, height: number, viewportHeight: number): number {
  const max = Math.max(EDGE_MARGIN, viewportHeight - height - EDGE_MARGIN)
  return Math.min(Math.max(top, EDGE_MARGIN), max)
}

/** Messenger-style snap: whichever edge the bubble's centre is closer to. */
export function nearestSide(left: number, width: number, viewportWidth: number): DockSide {
  return left + width / 2 < viewportWidth / 2 ? 'left' : 'right'
}
