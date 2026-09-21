import type { AppState, Cast, LayoutState } from '@/shared/types'
import { computed, reactive } from 'vue'
import { sendMessage } from '@/shared/messages'
import { defaultLayout } from '@/shared/types'

/** This tab's mirror of the service worker's state. */
export const state = reactive({
  casts: [] as Cast[],
  layout: defaultLayout(),
  tabId: null as number | null,
  /** The tab the user is looking at, as reported by the service worker. */
  activeTabId: null as number | null,
})

/** This tab is the one in front of the user. */
export const isActive = computed(() => state.tabId != null && state.tabId === state.activeTabId)

/** This tab is itself one of the tabs being cast. */
const casting = computed(() => state.casts.some(c => c.sourceTabId === state.tabId))

/**
 * Every cast except the one captured from this very tab - and nothing at all
 * while a casting tab is not the one in front of the user.
 *
 * A tab keeps being captured after you leave it, so any bubble drawn there
 * reappears inside the other tabs' streams. With two tabs casting each other
 * that nests forever, a hall of mirrors. Exactly one tab in the browser counts
 * as active, so the cycle can never close.
 *
 * The test cannot be `document.visibilityState`: Chrome reports a captured tab
 * as visible for as long as it is being captured, wherever it actually is.
 */
export const visibleCasts = computed(() => {
  if (casting.value && !isActive.value)
    return []
  return state.casts.filter(c => c.sourceTabId !== state.tabId)
})

export const activeCast = computed(() => {
  const list = visibleCasts.value
  return list.find(c => c.id === state.layout.activeCastId) ?? list[0] ?? null
})

export function applyState(next: AppState): void {
  state.casts = next.casts
  state.layout = next.layout
  state.activeTabId = next.activeTabId
}

/** Applied locally at once so dragging stays smooth, then shared with every tab. */
export function updateLayout(patch: Partial<LayoutState>): void {
  Object.assign(state.layout, patch)
  void sendMessage({ to: 'sw', type: 'UPDATE_LAYOUT', patch })
}

export function stopCast(castId: string): void {
  void sendMessage({ to: 'sw', type: 'STOP_CAST', castId })
}
