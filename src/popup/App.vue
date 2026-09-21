<script setup lang="ts">
import type { HelloReply, Message } from '@/shared/messages'
import type { AppState } from '@/shared/types'
import { onMounted, ref } from 'vue'
import { sendMessage } from '@/shared/messages'
import { DEFAULT_LAYOUT } from '@/shared/types'

const state = ref<AppState>({ casts: [], layout: { ...DEFAULT_LAYOUT } })
const starting = ref(false)

onMounted(async () => {
  const reply = await sendMessage<HelloReply>({ to: 'sw', type: 'HELLO' })
  if (reply)
    state.value = reply.state
})

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message?.to === 'popup' && message.type === 'STATE')
    state.value = message.state
})

async function startCast() {
  starting.value = true
  // The picker steals focus, which closes this popup - the service worker owns
  // the rest of the flow from here.
  await sendMessage({ to: 'sw', type: 'START_CAST' })
  starting.value = false
}

function stopCast(castId: string) {
  void sendMessage({ to: 'sw', type: 'STOP_CAST', castId })
  state.value.casts = state.value.casts.filter(c => c.id !== castId)
}
</script>

<template>
  <button class="start" :disabled="starting" @click="startCast">
    Start casting
  </button>

  <p v-if="state.casts.length === 0" class="empty">
    Nothing is casting yet. Pick a tab and it will follow you around as a bubble.
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
