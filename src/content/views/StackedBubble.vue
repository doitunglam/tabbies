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
  close: [cast: Cast]
}>()

/** Cards behind the active one peek out towards the middle of the screen. */
function cardStyle(index: number) {
  const depth = props.cards.length - 1 - index
  const direction = props.side === 'left' ? 1 : -1
  return {
    zIndex: String(index),
    transform: `translate(${depth * 10 * direction}px, ${depth * -8}px) scale(${1 - depth * 0.05})`,
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
        <div
          v-if="cast.id === activeId"
          class="tb-grip"
          @pointerdown.stop="$emit('resizeStart', $event)"
          @click.stop
        />
      </StreamTile>
    </div>
  </div>
</template>
