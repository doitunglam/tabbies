<script setup lang="ts">
import type { Cast } from '@/shared/types'
import { computed, ref, watchEffect } from 'vue'
import { useTileInk } from '../composables/useTileInk'

const props = defineProps<{ cast: Cast, stream?: MediaStream }>()

defineEmits<{ close: [] }>()

const video = ref<HTMLVideoElement | null>(null)

// Controls read as dark or light to suit whatever is playing behind them.
const { top: topInk, middle: middleInk, bottom: bottomInk } = useTileInk(video, computed(() => !!props.stream))

// `srcObject` is not an attribute, so it has to be assigned imperatively.
watchEffect(() => {
  if (video.value)
    video.value.srcObject = props.stream ?? null
})
</script>

<template>
  <!-- Sized by --tb-tile-w / --tb-tile-h, inherited from .tb-root. -->
  <div
    class="tb-tile"
    :class="{
      'tb-tile--ink-dark': topInk === 'dark',
      'tb-tile--actions-dark': middleInk === 'dark',
      'tb-tile--grip-dark': bottomInk === 'dark',
    }"
  >
    <video ref="video" class="tb-video" autoplay muted playsinline />
    <div v-if="!stream" class="tb-placeholder">
      Connecting...
    </div>
    <div class="tb-controls">
      <span class="tb-label">{{ cast.label }}</span>
      <button
        class="tb-btn"
        title="Stop casting"
        @pointerdown.stop
        @click.stop="$emit('close')"
      >
        &#10005;
      </button>
    </div>
    <slot />
  </div>
</template>
