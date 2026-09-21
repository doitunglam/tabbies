<script setup lang="ts">
import type { Cast } from '@/shared/types'
import { streams } from '../viewer'
import StreamTile from './StreamTile.vue'

defineProps<{ casts: Cast[], rows: number }>()

defineEmits<{
  dragStart: [event: PointerEvent]
  resizeStart: [event: PointerEvent]
  collapse: []
  close: [cast: Cast]
}>()
</script>

<template>
  <div class="tb-group">
    <div class="tb-header" @pointerdown="$emit('dragStart', $event)">
      <span class="tb-header-title">
        {{ casts.length }} stream{{ casts.length === 1 ? '' : 's' }}
      </span>
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
      />
    </div>

    <div class="tb-grip" @pointerdown.stop="$emit('resizeStart', $event)" @click.stop />
  </div>
</template>
