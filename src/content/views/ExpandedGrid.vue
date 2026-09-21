<script setup lang="ts">
import type { Cast, DockSide } from '@/shared/types'
import { streams } from '../viewer'
import StreamTile from './StreamTile.vue'

defineProps<{ casts: Cast[], rows: number, side: DockSide }>()

defineEmits<{
  dragStart: [event: PointerEvent]
  resizeStart: [event: PointerEvent]
  collapse: []
  close: [cast: Cast]
}>()
</script>

<template>
  <div class="tb-group">
    <!-- Same pair as the stack carries: stack them back up, and the handle the
         group moves by. -->
    <div class="tb-header" :class="{ 'tb-header--left': side === 'left' }">
      <div class="tb-cluster">
        <button class="tb-btn" title="Stack them back up" @pointerdown.stop @click.stop="$emit('collapse')">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2.2 2.2 5.3 8 8.4l5.8-3.1L8 2.2Z" />
            <path d="M2.2 10.4 8 13.5l5.8-3.1" />
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

    <!-- Column-first flow: fills downwards, then adds columns. -->
    <div class="tb-grid" :style="{ gridTemplateRows: `repeat(${rows}, var(--tb-tile-h))` }">
      <StreamTile
        v-for="cast in casts"
        :key="cast.id"
        :cast="cast"
        :stream="streams[cast.id]"
        :side="side"
        @close="$emit('close', cast)"
      />
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
