<script setup lang="ts">
import type { HelloReply, Message } from '@/shared/messages'
import type { AppState } from '@/shared/types'
import { onMounted, ref } from 'vue'
import { sendMessage } from '@/shared/messages'
import { DEFAULT_LAYOUT } from '@/shared/types'
import type { StartResult } from '@/background/casts'

const state = ref<AppState>({ casts: [], layout: { ...DEFAULT_LAYOUT }, activeTabId: null })
const starting = ref(false)
const error = ref<string | null>(null)

const REASONS: Record<string, string> = {
  'no-tab': 'No tab to cast.',
  'blocked-page': 'Chrome will not let extensions capture this page.',
  'already-casting': 'This tab is already casting.',
}

onMounted(async () => {
  const reply = await sendMessage<HelloReply>({ to: 'sw', type: 'HELLO' })
  if (reply)
    state.value = reply.state
})

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message?.to === 'popup' && message.type === 'STATE')
    state.value = message.state
})

/**
 * Casts the tab behind the popup. The capture permission comes from this very
 * click, so the request has to go out while the popup is open.
 */
async function startCast() {
  starting.value = true
  error.value = null
  const result = await sendMessage<StartResult>({ to: 'sw', type: 'START_CAST' })
  if (!result?.ok)
    error.value = REASONS[result?.error ?? ''] ?? 'Could not start casting this tab.'
  starting.value = false
}

function stopCast(castId: string) {
  void sendMessage({ to: 'sw', type: 'STOP_CAST', castId })
  state.value.casts = state.value.casts.filter(c => c.id !== castId)
}
</script>

<template>
  <button class="cast" :disabled="starting" @click="startCast">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.2" y="3" width="11.6" height="8.4" rx="1.8" />
      <path d="M5.8 13.6h4.4" />
    </svg>
    Cast this tab
  </button>

  <p v-if="error" class="error">
    {{ error }}
  </p>

  <ul v-if="state.casts.length > 0" class="casts">
    <li v-for="cast in state.casts" :key="cast.id">
      <span class="live" />
      <span class="label" :title="cast.label">{{ cast.label }}</span>
      <button class="stop" title="Stop casting" @click="stopCast(cast.id)">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </svg>
      </button>
    </li>
  </ul>

  <p v-else class="empty">
    Nothing is casting. Cast a tab and it follows you around as a bubble.
  </p>
</template>

<style scoped>
.cast {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 36px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  background: #2f6df6;
  border: none;
  border-radius: 10px;
}

.cast:hover:not(:disabled) {
  background: #3d78ff;
}

.cast:disabled {
  cursor: default;
  opacity: 0.55;
}

.cast svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.error {
  margin: 10px 0 0;
  font-size: 12px;
  color: #ff9b9b;
}

.casts {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.casts li {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid rgb(255 255 255 / 0.07);
}

.casts li:first-child {
  border-top: none;
}

/* Something is live in that tab right now. */
.live {
  flex: none;
  width: 6px;
  height: 6px;
  background: #43d17f;
  border-radius: 50%;
}

.label {
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  color: #c9ced8;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stop {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: #8b929e;
  cursor: pointer;
  background: none;
  border: none;
}

.stop:hover {
  color: #ff9b9b;
}

.stop svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.7;
  stroke-linecap: round;
}

.empty {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #79808c;
}
</style>
