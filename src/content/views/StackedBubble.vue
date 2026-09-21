<script setup lang="ts">
import type { Cast, DockSide } from '@/shared/types'
import { streams } from '../viewer'
import StreamTile from './StreamTile.vue'

const props = defineProps<{
  /** Back to front, so the active cast paints last. */
  cards: Cast[]
  activeId: string | null
  side: DockSide
}>()

defineEmits<{
  dragStart: [event: PointerEvent]
  resizeStart: [event: PointerEvent]
  cardClick: [cast: Cast]
  flip: []
  expand: []
  close: [cast: Cast]
}>()

/**
 * Cards behind the active one show the pile they came from.
 *
 * The steps are listed rather than multiplied out: a stack of real cards is
 * never evenly spaced, and each one lands at its own angle, so a constant
 * offset per card reads as a machine-made fan instead of a pile. Index is
 * depth, so `LAYERS[0]` is the card in front.
 */
const LAYERS = [
  { x: 0, y: 0, tilt: 0, scale: 1 },
  { x: 13, y: 7, tilt: 3.5, scale: 0.95 },
  { x: 20, y: 14, tilt: -2.5, scale: 0.9 },
]

function cardStyle(index: number) {
  const depth = props.cards.length - 1 - index
  const layer = LAYERS[Math.min(depth, LAYERS.length - 1)]
  // Behind cards lean towards the middle of the screen, never off the edge.
  const direction = props.side === 'left' ? 1 : -1
  return {
    zIndex: String(index),
    transform: [
      `translate(${layer.x * direction}px, ${layer.y}px)`,
      `rotate(${layer.tilt * direction}deg)`,
      `scale(${layer.scale})`,
    ].join(' '),
  }
}
</script>

<template>
  <div class="tb-group">
    <!-- The bubble's own bar, above the pile rather than painted over it: open
         it out, and the handle it moves by. Ending a cast belongs to the card
         it ends, so that button stays on the card. -->
    <div class="tb-header" :class="{ 'tb-header--left': side === 'left' }">
      <div class="tb-cluster">
        <button
          class="tb-btn"
          title="Show every stream"
          @pointerdown.stop
          @click.stop="$emit('expand')"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <!-- Corners hugging the outside: opening out, not folding in. -->
            <path d="M6.2 2.8H2.8v3.4M9.8 2.8h3.4v3.4M13.2 9.8v3.4H9.8M2.8 9.8v3.4h3.4" />
          </svg>
        </button>
        <button
          class="tb-btn tb-handle"
          title="Move"
          @pointerdown.stop="$emit('dragStart', $event)"
          @click.stop
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="6" cy="4" r="1.15" />
            <circle cx="10" cy="4" r="1.15" />
            <circle cx="6" cy="8" r="1.15" />
            <circle cx="10" cy="8" r="1.15" />
            <circle cx="6" cy="12" r="1.15" />
            <circle cx="10" cy="12" r="1.15" />
          </svg>
        </button>
      </div>
    </div>

    <div class="tb-stack">
      <div
        v-for="(cast, index) in cards"
        :key="cast.id"
        class="tb-card"
        :class="{ 'tb-card--behind': cast.id !== activeId }"
        :style="cardStyle(index)"
        @click="$emit('cardClick', cast)"
      >
        <StreamTile
          :cast="cast"
          :stream="streams[cast.id]"
          :side="side"
          @close="$emit('close', cast)"
        >
          <!-- Flip through the pile. -->
          <div v-if="cast.id === activeId && cards.length > 1" class="tb-actions tb-actions--centre">
            <button
              class="tb-action"
              title="Next stream"
              @pointerdown.stop
              @click.stop="$emit('flip')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M13.2 8a5.2 5.2 0 1 1-1.9-4" />
                <path d="M13.4 2.4v3h-3" />
              </svg>
            </button>
          </div>

          <!-- The grip hugs the edge the bubble is docked away from. -->
          <div
            v-if="cast.id === activeId"
            class="tb-grip"
            :class="{ 'tb-grip--left': side === 'right' }"
            @pointerdown.stop="$emit('resizeStart', $event)"
            @click.stop
          />
        </StreamTile>
      </div>
    </div>
  </div>
</template>
