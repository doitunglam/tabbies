<script setup lang="ts">
import type { Cast } from '@/shared/types'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { GAP, HEADER_H, MAX_TILE, MIN_TILE, useBubbleLayout } from '../composables/useBubbleLayout'
import { clampTop, EDGE_MARGIN, nearestSide } from '../composables/useDock'
import { useDrag } from '../composables/useDrag'
import { usePageInk } from '../composables/usePageInk'
import { activeCast, state, stopCast, updateLayout, visibleCasts } from '../state'
import ExpandedGrid from './ExpandedGrid.vue'
import StackedBubble from './StackedBubble.vue'

/** How many cards peek out from behind the active one. */
const PEEK = 2

const { viewport, layout, rows, cols, size, restLeft, restTop, cssVars } = useBubbleLayout()

/* The bar hangs over the page, so its icons take their colour from it. */
const root = ref<HTMLElement | null>(null)
const { ink: headerInk, read: readPageInk } = usePageInk(root, computed(() => visibleCasts.value.length > 0))

/* ----------------------------------------------------------------- moving */

const dragLeft = ref(0)
const dragTop = ref(0)
let baseLeft = 0
let baseTop = 0
/** Set on pointerup so the click that follows a drag does not also fire. */
let justDragged = false

const drag = useDrag({
  onMove(dx, dy) {
    dragLeft.value = baseLeft + dx
    dragTop.value = baseTop + dy
  },
  onEnd(moved) {
    justDragged = moved
    if (!moved)
      return
    updateLayout({
      side: nearestSide(dragLeft.value, size.value.w, viewport.width),
      offsetY: clampTop(dragTop.value, size.value.h, viewport.height),
    })
    // The bar is over something else now.
    requestAnimationFrame(readPageInk)
  },
})

function startDrag(event: PointerEvent) {
  baseLeft = restLeft.value
  baseTop = restTop.value
  dragLeft.value = baseLeft
  dragTop.value = baseTop
  drag.start(event)
}

const rootStyle = computed(() => ({
  ...cssVars.value,
  left: `${drag.dragging.value ? dragLeft.value : restLeft.value}px`,
  top: `${drag.dragging.value ? dragTop.value : restTop.value}px`,
  width: `${size.value.w}px`,
  height: `${size.value.h}px`,
  // Dragging has to track the pointer exactly; letting go animates the dock.
  transition: drag.dragging.value
    ? 'none'
    : 'left 0.28s cubic-bezier(0.2, 0.9, 0.25, 1), top 0.28s cubic-bezier(0.2, 0.9, 0.25, 1)',
}))

/* --------------------------------------------------------------- resizing */

let baseW = 0
let baseH = 0
let baseRatio = 1
/** Distance from the top of the viewport the bubble is pinned to while resizing. */
let anchorTop = 0

const resize = useDrag({
  // Written straight to local state for live feedback, shared once on release.
  onMove(dx, dy) {
    // The grip sits on the bubble's inner corner, so a right-docked bubble
    // grows as the pointer moves *away* from the edge it is docked to.
    const grow = layout.value.side === 'right' ? -dx : dx
    const size = keepRatio(baseW + grow, baseH + dy)
    state.layout.tileW = size.w
    state.layout.tileH = size.h
  },
  onEnd(moved) {
    justDragged = moved
    if (moved)
      updateLayout({ tileW: layout.value.tileW, tileH: layout.value.tileH, offsetY: anchorTop })
  },
})

function startResize(event: PointerEvent) {
  baseW = layout.value.tileW
  baseH = layout.value.tileH
  // The shape the tile had when the drag started is the shape it keeps.
  baseRatio = baseW / baseH
  // Pin the docked corner for the whole drag: `offsetY` is only a request, and
  // a bubble that grew past the bottom edge would be pushed up by `clampTop`
  // mid-drag, sliding out from under the pointer.
  anchorTop = restTop.value
  state.layout.offsetY = anchorTop
  resize.start(event)
}

/** The biggest tile that still fits between the pinned corner and the edges. */
function tileCap(): { w: number, h: number } {
  const availW = viewport.width - 2 * EDGE_MARGIN
  const availH = viewport.height - anchorTop - EDGE_MARGIN
  const cap = layout.value.mode === 'stacked'
    ? { w: availW, h: availH - HEADER_H }
    : {
        w: (availW - (cols.value - 1) * GAP) / cols.value,
        h: (availH - HEADER_H - (rows.value - 1) * GAP) / rows.value,
      }
  return { w: Math.max(MIN_TILE.w, cap.w), h: Math.max(MIN_TILE.h, cap.h) }
}

/**
 * Resize along one axis only: whichever axis the pointer has moved furthest
 * along leads, the other follows the tile's aspect ratio, and the pair is then
 * scaled as one to stay inside the size limits - clamping them separately would
 * flatten the tile at the ends of the range.
 */
function keepRatio(w: number, h: number): { w: number, h: number } {
  // The follower is derived from the leader, never floored on its own, or a
  // hard drag past the top-left corner would square the tile off.
  const leadW = Math.abs(w - baseW) > Math.abs(h - baseH)
  const wantW = leadW ? Math.max(1, w) : Math.max(1, h) * baseRatio
  const wantH = leadW ? Math.max(1, w) / baseRatio : Math.max(1, h)

  // Growing is bounded by the viewport too, so the pinned corner stays put
  // instead of the bubble being shoved back inside the edges.
  const cap = tileCap()
  const lower = Math.max(MIN_TILE.w / wantW, MIN_TILE.h / wantH)
  const upper = Math.min(MAX_TILE.w / wantW, MAX_TILE.h / wantH, cap.w / wantW, cap.h / wantH)
  const scale = Math.min(Math.max(1, lower), upper)
  return { w: Math.round(wantW * scale), h: Math.round(wantH * scale) }
}

/* ------------------------------------------------------------------ modes */

const stackCards = computed(() => {
  const list = visibleCasts.value
  const active = activeCast.value
  const behind = list.filter(c => c.id !== active?.id).slice(0, PEEK).reverse()
  return active ? [...behind, active] : behind
})

/** A peeking card comes to the front; the front card opens the grid. */
function onCardClick(cast: Cast) {
  if (justDragged) {
    justDragged = false
    return
  }
  if (cast.id !== activeCast.value?.id)
    updateLayout({ activeCastId: cast.id })
  else
    updateLayout({ mode: 'expanded' })
}

/** Escape is the way out of the grid without choosing. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && layout.value.mode === 'expanded')
    updateLayout({ mode: 'stacked' })
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/** Bring the next stream to the front of the stack. */
function flipCard() {
  const list = visibleCasts.value
  if (list.length < 2)
    return
  const index = list.findIndex(c => c.id === activeCast.value?.id)
  updateLayout({ activeCastId: list[(index + 1) % list.length].id })
}
</script>

<template>
  <div
    v-if="visibleCasts.length > 0"
    ref="root"
    class="tb-root"
    :class="{ 'tb-root--ink-dark': headerInk === 'dark' }"
    :style="rootStyle"
  >
    <StackedBubble
      v-if="layout.mode === 'stacked'"
      :cards="stackCards"
      :active-id="activeCast?.id ?? null"
      :side="layout.side"
      @drag-start="startDrag"
      @resize-start="startResize"
      @card-click="onCardClick"
      @flip="flipCard"
      @expand="updateLayout({ mode: 'expanded' })"
      @close="stopCast($event.id)"
    />
    <ExpandedGrid
      v-else
      :casts="visibleCasts"
      :rows="rows"
      :side="layout.side"
      @drag-start="startDrag"
      @resize-start="startResize"
      @collapse="updateLayout({ mode: 'stacked' })"
      @close="stopCast($event.id)"
    />
  </div>
</template>
