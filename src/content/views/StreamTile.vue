<script setup lang="ts">
import type { Cast } from '@/shared/types'
import { ref, watchEffect } from 'vue'

const props = defineProps<{ cast: Cast, stream?: MediaStream }>()

defineEmits<{ close: [] }>()

const video = ref<HTMLVideoElement | null>(null)

// `srcObject` is not an attribute, so it has to be assigned imperatively.
watchEffect(() => {
  if (video.value)
    video.value.srcObject = props.stream ?? null
})
</script>

<template>
  <!-- Sized by --tb-tile-w / --tb-tile-h, inherited from .tb-root. -->
  <div class="tb-tile">
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
