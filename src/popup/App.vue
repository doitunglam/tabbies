<script setup lang="ts">
import type { HelloReply, PopupMessage, StartResult } from '@/shared/messages'
import type { AppState } from '@/shared/types'
import { computed, onMounted, ref } from 'vue'
import { fromThisExtension, sendMessage } from '@/shared/messages'
import { defaultLayout } from '@/shared/types'

const state = ref<AppState>({ casts: [], layout: defaultLayout(), activeTabId: null })
const starting = ref(false)
const error = ref<string | null>(null)

const REASONS: Record<string, string> = {
  'no-tab': 'No tab to cast.',
  'blocked-page': 'Chrome will not let extensions capture this page.',
  'already-casting': 'This tab is already casting.',
}

/**
 * The tab behind the popup, and whether it is already the source of a cast.
 *
 * `activeTabId` is the worker's answer to the same question `START_CAST` asks,
 * and `HELLO` refreshes it before replying - so the button can be turned off
 * before the click rather than explaining itself after it.
 */
const castingThisTab = computed(() => {
  const tabId = state.value.activeTabId
  return tabId != null && state.value.casts.some(c => c.sourceTabId === tabId)
})

onMounted(async () => {
  const reply = await sendMessage<HelloReply>({ to: 'sw', type: 'HELLO' })
  if (reply)
    state.value = reply.state
})

chrome.runtime.onMessage.addListener((message: PopupMessage, sender) => {
  if (fromThisExtension(sender) && message?.to === 'popup' && message.type === 'STATE')
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
  <button
    class="cast"
    :class="{ 'cast--live': castingThisTab }"
    :disabled="starting || castingThisTab"
    @click="startCast"
  >
    <span v-if="castingThisTab" class="live" />
    <svg v-else viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.2" y="3" width="11.6" height="8.4" rx="1.8" />
      <path d="M5.8 13.6h4.4" />
    </svg>
    {{ castingThisTab ? 'This tab is casting' : 'Cast this tab' }}
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
/*
 * The bubble's chrome, in a panel: a white-washed plate on near-black, a
 * hairline for every edge, and bare icons that come up to full strength under
 * the pointer. Nothing here is filled with colour except what is telling you
 * something - a cast is live, or a cast failed.
 */

/* The tile's corner, not the bar's pill: this button is as wide as the panel
   it sits in, and a pill inside square edges reads as a mistake. */
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
  color: var(--ink);
  cursor: pointer;
  background: var(--plate);
  border: none;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--hairline);
  transition: background-color 0.16s var(--ease);
}

.cast:hover:not(:disabled) {
  background: var(--plate-lit);
}

.cast:disabled {
  cursor: default;
  opacity: 0.55;
}

/* Already live in this tab. That is a state, not an offer: the plate goes
   quiet, the label with it, and the same green dot the list marks a cast with
   says why the button is not asking for a click. */
.cast--live,
.cast--live:disabled {
  color: var(--ink-dim);
  background: var(--plate-quiet);
  box-shadow: inset 0 0 0 1px var(--hairline-soft);
  opacity: 1;
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
  color: var(--alarm);
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
  border-top: 1px solid var(--hairline-soft);
}

.casts li:first-child {
  border-top: none;
}

/* Something is live in that tab right now. */
.live {
  flex: none;
  width: 6px;
  height: 6px;
  background: var(--live);
  border-radius: 50%;
}

.label {
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* A bare icon, sized and weighted like every button on the bubble. */
.stop {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  color: var(--ink);
  cursor: pointer;
  background: none;
  border: none;
  opacity: 0.85;
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.stop:hover {
  opacity: 1;
  transform: scale(1.12);
}

.stop svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.empty {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-dim);
}
</style>
