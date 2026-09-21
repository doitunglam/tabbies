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
 * Cards behind the active one fan out towards the middle of the screen like a
 * pile knocked slightly out of true: each sits a little lower, a little
 * smaller and a little more turned than the one in front of it.
 */
const SHIFT_X = 7
const SHIFT_Y = 5
const TILT = 2

function cardStyle(index: number) {
  const depth = props.cards.length - 1 - index
  const direction = props.side === 'left' ? 1 : -1
  return {
    zIndex: String(index),
    transform: [
      `translate(${depth * SHIFT_X * direction}px, ${depth * SHIFT_Y}px)`,
      `rotate(${depth * TILT * direction}deg)`,
      `scale(${1 - depth * 0.04})`,
    ].join(' '),
  }
}
</script>

<template>
  <div class="tb-stack">
    <div
      v-for="(cast, index) in cards"
      :key="cast.id"
      class="tb-card"
      :class="{ 'tb-card--behind': cast.id !== activeId }"
      :style="cardStyle(index)"
      @pointerdown="cast.id === activeId && $emit('dragStart', $event)"
      @click="$emit('cardClick', cast)"
    >
      <StreamTile
        :cast="cast"
        :stream="streams[cast.id]"
        @close="$emit('close', cast)"
      >
        <!-- Centred actions on the front card: next stream, and open them all. -->
        <div v-if="cast.id === activeId" class="tb-actions">
          <button
            v-if="cards.length > 1"
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
          <button
            class="tb-action"
            title="Show every stream"
            @pointerdown.stop
            @click.stop="$emit('expand')"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6.4 2.8H2.8v3.6M9.6 2.8h3.6v3.6M13.2 9.6v3.6H9.6M2.8 9.6v3.6h3.6" />
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
</template>
