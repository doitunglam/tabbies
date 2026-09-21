<script setup lang="ts">
import type { DockSide } from '@/shared/types'

/**
 * The bar above the bubble, shared by both modes.
 *
 * It carries the same pair in each: one button that switches mode - the slot,
 * because stacking up and opening out are different actions - and the handle
 * the whole bubble moves by, which is identical either way.
 */
defineProps<{ side: DockSide }>()

defineEmits<{ dragStart: [event: PointerEvent] }>()
</script>

<template>
  <div class="tb-header" :class="{ 'tb-header--left': side === 'left' }">
    <div class="tb-cluster">
      <slot />
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
</template>
