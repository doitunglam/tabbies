<script setup lang="ts">
import type { Cast } from '@/shared/types'
import { computed, ref } from 'vue'
import { MAX_TILE, MIN_TILE, useBubbleLayout } from '../composables/useBubbleLayout'
import { clampTop, nearestSide } from '../composables/useDock'
import { useDrag } from '../composables/useDrag'
import { activeCast, state, stopCast, updateLayout, visibleCasts } from '../state'
import ExpandedGrid from './ExpandedGrid.vue'
import StackedBubble from './StackedBubble.vue'

/** How many cards peek out from behind the active one. */
const PEEK = 2

const { viewport, layout, rows, size, restLeft, restTop, cssVars } = useBubbleLayout()

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

const resize = useDrag({
  // Written straight to local state for live feedback, shared once on release.
  onMove(dx, dy) {
    state.layout.tileW = clamp(baseW + dx, MIN_TILE.w, MAX_TILE.w)
    state.layout.tileH = clamp(baseH + dy, MIN_TILE.h, MAX_TILE.h)
  },
  onEnd(moved) {
    justDragged = moved
    if (moved)
      updateLayout({ tileW: layout.value.tileW, tileH: layout.value.tileH })
  },
})

function startResize(event: PointerEvent) {
  baseW = layout.value.tileW
  baseH = layout.value.tileH
  resize.start(event)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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

const probeStyle = computed(() => {
  const color = state.probeColor
  return color ? { background: `rgb(${color[0]}, ${color[1]}, ${color[2]})` } : {}
})
</script>

<template>
  <!-- The overlay hides itself while the source probe paints, so it can never
       be mistaken for the swatch in the captured frame. -->
  <div
    v-if="visibleCasts.length > 0 && !state.probeColor"
    class="tb-root"
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
      @close="stopCast($event.id)"
    />
    <ExpandedGrid
      v-else
      :casts="visibleCasts"
      :rows="rows"
      @drag-start="startDrag"
      @resize-start="startResize"
      @collapse="updateLayout({ mode: 'stacked' })"
      @close="stopCast($event.id)"
    />
  </div>

  <!-- Source-tab probe swatch. -->
  <div v-if="state.probeColor" class="tb-probe" :style="probeStyle" />
</template>
