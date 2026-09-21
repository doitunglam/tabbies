<script setup lang="ts">
import type { Cast, DockSide } from '@/shared/types'
import { streams } from '../viewer'
import StreamTile from './StreamTile.vue'

defineProps<{ casts: Cast[], rows: number, side: DockSide }>()

defineEmits<{
  dragStart: [event: PointerEvent]
  resizeStart: [event: PointerEvent]
  collapse: []
  pick: [cast: Cast]
  close: [cast: Cast]
}>()
</script>

<template>
  <div class="tb-group">
    <!-- Drag handle for the whole group; the button stacks it back up. -->
    <div class="tb-header" @pointerdown="$emit('dragStart', $event)">
      <button class="tb-btn" title="Stack" @pointerdown.stop @click.stop="$emit('collapse')">
        &#8863;
      </button>
    </div>

    <!-- Column-first flow: fills downwards, then adds columns. -->
    <div class="tb-grid" :style="{ gridTemplateRows: `repeat(${rows}, var(--tb-tile-h))` }">
      <StreamTile
        v-for="cast in casts"
        :key="cast.id"
        :cast="cast"
        :stream="streams[cast.id]"
        @close="$emit('close', cast)"
      >
        <!-- The grid is the picker: taking one stacks the bubble around it. -->
        <div class="tb-actions">
          <button
            class="tb-action"
            title="Show this one in the bubble"
            @pointerdown.stop
            @click.stop="$emit('pick', cast)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6.4 2.8v3.6H2.8M9.6 2.8v3.6h3.6M9.6 13.2V9.6h3.6M6.4 13.2V9.6H2.8" />
            </svg>
          </button>
        </div>
      </StreamTile>
    </div>

    <!-- The grip hugs the edge the bubble is docked away from. -->
    <div
      class="tb-grip"
      :class="{ 'tb-grip--left': side === 'right' }"
      @pointerdown.stop="$emit('resizeStart', $event)"
      @click.stop
    />
  </div>
</template>
