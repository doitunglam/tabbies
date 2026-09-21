import type { Rgb } from '@/shared/messages'
import type { AppState, Cast, LayoutState } from '@/shared/types'
import { computed, reactive } from 'vue'
import { sendMessage } from '@/shared/messages'
import { DEFAULT_LAYOUT } from '@/shared/types'

/** This tab's mirror of the service worker's state. */
export const state = reactive({
  casts: [] as Cast[],
  layout: { ...DEFAULT_LAYOUT } as LayoutState,
  tabId: null as number | null,
  /** Set while the source probe paints; the overlay hides itself meanwhile. */
  probeColor: null as Rgb | null,
})

/** Every cast except one originating from this very tab. */
export const visibleCasts = computed(() =>
  state.casts.filter(c => c.sourceTabId == null || c.sourceTabId !== state.tabId),
)

export const activeCast = computed(() => {
  const list = visibleCasts.value
  return list.find(c => c.id === state.layout.activeCastId) ?? list[0] ?? null
})

export function applyState(next: AppState): void {
  state.casts = next.casts
  state.layout = next.layout
}

/** Applied locally at once so dragging stays smooth, then shared with every tab. */
export function updateLayout(patch: Partial<LayoutState>): void {
  Object.assign(state.layout, patch)
  void sendMessage({ to: 'sw', type: 'UPDATE_LAYOUT', patch })
}

export function stopCast(castId: string): void {
  void sendMessage({ to: 'sw', type: 'STOP_CAST', castId })
}
