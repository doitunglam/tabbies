import { computed } from 'vue'
import { state, visibleCasts } from '../state'
import { clampTop, dockedLeft, EDGE_MARGIN, useViewport } from './useDock'

/**
 * Geometry shared by the bubble and its stylesheet. These are published to CSS
 * as custom properties on `.tb-root`, so the numbers live in one place rather
 * than being repeated in `overlay.css`.
 */
export const GAP = 10
export const HEADER_H = 28

export function useBubbleLayout() {
  const viewport = useViewport()
  const layout = computed(() => state.layout)

  /** The expanded grid fills a column downwards first, then adds columns. */
  const maxRows = computed(() => {
    const available = viewport.height - 2 * EDGE_MARGIN - HEADER_H + GAP
    return Math.max(1, Math.floor(available / (layout.value.tileH + GAP)))
  })
  const rows = computed(() => Math.max(1, Math.min(maxRows.value, visibleCasts.value.length)))
  const cols = computed(() => Math.max(1, Math.ceil(visibleCasts.value.length / maxRows.value)))

  const size = computed(() => {
    // Both modes carry the same bar above them.
    if (layout.value.mode === 'stacked')
      return { w: layout.value.tileW, h: HEADER_H + layout.value.tileH }
    return {
      w: cols.value * layout.value.tileW + (cols.value - 1) * GAP,
      h: HEADER_H + rows.value * layout.value.tileH + (rows.value - 1) * GAP,
    }
  })

  /** Where the bubble sits when it is not being dragged. */
  const restLeft = computed(() => dockedLeft(layout.value.side, size.value.w, viewport.width))
  const restTop = computed(() => clampTop(layout.value.offsetY, size.value.h, viewport.height))

  const cssVars = computed(() => ({
    '--tb-gap': `${GAP}px`,
    '--tb-header-h': `${HEADER_H}px`,
    '--tb-tile-w': `${layout.value.tileW}px`,
    '--tb-tile-h': `${layout.value.tileH}px`,
  }))

  return { viewport, layout, rows, cols, size, restLeft, restTop, cssVars }
}
