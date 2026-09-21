<script setup lang="ts">
import type { Cast } from '@/shared/types'
import { computed, ref } from 'vue'
import { clampTop, dockedLeft, EDGE_MARGIN, nearestSide, useViewport } from '../composables/useDock'
import { useDrag } from '../composables/useDrag'
import { activeCast, state, stopCast, streams, updateLayout, visibleCasts } from '../store'
import StreamTile from './StreamTile.vue'

const GAP = 10
const HEADER_H = 28
const MIN_W = 160
const MIN_H = 90
const MAX_W = 900
const MAX_H = 700
/** How many cards peek out from behind the active one. */
const PEEK = 2

const viewport = useViewport()
const layout = computed(() => state.layout)

/* --------------------------------------------------------------- layout */

/** Expanded grid fills a column downwards first, then adds columns. */
const rows = computed(() => {
  const available = viewport.height - 2 * EDGE_MARGIN - HEADER_H + GAP
  return Math.max(1, Math.floor(available / (layout.value.tileH + GAP)))
})
const usedRows = computed(() => Math.max(1, Math.min(rows.value, visibleCasts.value.length)))
const cols = computed(() => Math.max(1, Math.ceil(visibleCasts.value.length / rows.value)))

const size = computed(() => {
  if (layout.value.mode === 'stacked')
    return { w: layout.value.tileW, h: layout.value.tileH }
  return {
    w: cols.value * layout.value.tileW + (cols.value - 1) * GAP,
    h: HEADER_H + usedRows.value * layout.value.tileH + (usedRows.value - 1) * GAP,
  }
})

const restLeft = computed(() => dockedLeft(layout.value.side, size.value.w, viewport.width))
const restTop = computed(() => clampTop(layout.value.offsetY, size.value.h, viewport.height))

/* ----------------------------------------------------------- dragging */

const dragLeft = ref(0)
const dragTop = ref(0)
let baseLeft = 0
let baseTop = 0
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
  left: `${drag.dragging.value ? dragLeft.value : restLeft.value}px`,
  top: `${drag.dragging.value ? dragTop.value : restTop.value}px`,
  width: `${size.value.w}px`,
  height: `${size.value.h}px`,
  transition: drag.dragging.value
    ? 'none'
    : 'left 0.28s cubic-bezier(0.2, 0.9, 0.25, 1), top 0.28s cubic-bezier(0.2, 0.9, 0.25, 1)',
}))

/* ----------------------------------------------------------- resizing */

let baseW = 0
let baseH = 0

const resize = useDrag({
  onMove(dx, dy) {
    state.layout.tileW = clamp(baseW + dx, MIN_W, MAX_W)
    state.layout.tileH = clamp(baseH + dy, MIN_H, MAX_H)
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

/* -------------------------------------------------------------- stack */

/** Back to front, so the active cast paints last. */
const stackCards = computed(() => {
  const list = visibleCasts.value
  const active = activeCast.value
  const behind = list.filter(c => c.id !== active?.id).slice(0, PEEK).reverse()
  return active ? [...behind, active] : behind
})

function cardStyle(index: number) {
  const depth = stackCards.value.length - 1 - index
  const direction = layout.value.side === 'left' ? 1 : -1
  return {
    zIndex: String(index),
    transform: `translate(${depth * 10 * direction}px, ${depth * -8}px) scale(${1 - depth * 0.05})`,
  }
}

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

function collapse() {
  updateLayout({ mode: 'stacked' })
}

const probeStyle = computed(() => {
  const c = state.probeColor
  return c ? { background: `rgb(${c[0]}, ${c[1]}, ${c[2]})` } : {}
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
    <div v-if="layout.mode === 'stacked'" class="tb-stack">
      <div
        v-for="(cast, index) in stackCards"
        :key="cast.id"
        class="tb-card"
        :class="{ 'tb-card--behind': cast.id !== activeCast?.id }"
        :style="cardStyle(index)"
        @pointerdown="cast.id === activeCast?.id ? startDrag($event) : null"
        @click="onCardClick(cast)"
      >
        <StreamTile
          :cast="cast"
          :stream="streams[cast.id]"
          :width="layout.tileW"
          :height="layout.tileH"
          @close="stopCast(cast.id)"
        >
          <div
            v-if="cast.id === activeCast?.id"
            class="tb-grip"
            @pointerdown.stop="startResize"
            @click.stop
          />
        </StreamTile>
      </div>
    </div>

    <div v-else class="tb-group">
      <div class="tb-header" @pointerdown="startDrag">
        <span class="tb-header-title">{{ visibleCasts.length }} stream{{ visibleCasts.length === 1 ? '' : 's' }}</span>
        <button class="tb-btn" title="Stack" @pointerdown.stop @click.stop="collapse">
          &#8863;
        </button>
      </div>
      <div
        class="tb-grid"
        :style="{ gridTemplateRows: `repeat(${usedRows}, ${layout.tileH}px)`, gap: `${GAP}px` }"
      >
        <StreamTile
          v-for="cast in visibleCasts"
          :key="cast.id"
          :cast="cast"
          :stream="streams[cast.id]"
          :width="layout.tileW"
          :height="layout.tileH"
          @close="stopCast(cast.id)"
        />
      </div>
      <div class="tb-grip" @pointerdown.stop="startResize" @click.stop />
    </div>
  </div>

  <!-- Source-tab probe swatch. -->
  <div v-if="state.probeColor" class="tb-probe" :style="probeStyle" />
</template>
