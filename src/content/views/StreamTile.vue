<script setup lang="ts">
import type { Cast, DockSide } from '@/shared/types'
import { computed, ref, watchEffect } from 'vue'
import { useTileInk } from '../composables/useTileInk'

const props = withDefaults(
  defineProps<{ cast: Cast, stream?: MediaStream, side: DockSide, closable?: boolean }>(),
  { closable: true },
)

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
    <!-- The buttons hug whichever edge the bubble is docked to. -->
    <div class="tb-controls" :class="{ 'tb-controls--left': side === 'left' }">
      <span class="tb-label">{{ cast.label }}</span>
      <button
        v-if="closable"
        class="tb-btn tb-close"
        title="Stop casting"
        @pointerdown.stop
        @click.stop="$emit('close')"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      </button>
    </div>
    <slot />
  </div>
</template>
