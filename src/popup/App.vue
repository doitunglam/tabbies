<script setup lang="ts">
import type { HelloReply, Message } from '@/shared/messages'
import type { AppState } from '@/shared/types'
import { onMounted, ref } from 'vue'
import { sendMessage } from '@/shared/messages'
import { DEFAULT_LAYOUT } from '@/shared/types'
import type { StartResult } from '@/background/casts'

const state = ref<AppState>({ casts: [], layout: { ...DEFAULT_LAYOUT } })
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
  <button class="start" :disabled="starting" @click="startCast">
    Cast this tab
  </button>

  <p v-if="error" class="error">{{ error }}</p>

  <p v-if="state.casts.length === 0" class="empty">
    Nothing is casting yet. Cast a tab and it will follow you around as a bubble.
  </p>

  <ul v-else class="casts">
    <li v-for="cast in state.casts" :key="cast.id">
      <span class="label" :title="cast.label">{{ cast.label }}</span>
      <button class="stop" title="Stop" @click="stopCast(cast.id)">Stop</button>
    </li>
  </ul>
</template>

<style scoped>
.start {
  width: 100%;
  padding: 10px;
  font: inherit;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  background: #2f6df6;
  border: none;
  border-radius: 8px;
}

.start:hover {
  background: #1f5ae0;
}

.start:disabled {
  opacity: 0.6;
  cursor: default;
}

.error {
  margin: 10px 0 0;
  font-size: 12px;
  color: #ffb4b4;
}

.empty {
  margin: 12px 0 0;
  font-size: 12px;
  color: #9aa1ad;
}

.casts {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.casts li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 6px;
  background: #22252b;
  border-radius: 8px;
}

.label {
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stop {
  padding: 4px 8px;
  font: inherit;
  font-size: 11px;
  color: #ffb4b4;
  cursor: pointer;
  background: rgb(255 90 90 / 0.15);
  border: none;
  border-radius: 6px;
}

.stop:hover {
  background: rgb(255 90 90 / 0.28);
}
</style>
