import type { AppState, Cast, LayoutState } from '@/shared/types'
import { computed, reactive } from 'vue'
import { sendMessage } from '@/shared/messages'
import { DEFAULT_LAYOUT } from '@/shared/types'

/** This tab's mirror of the service worker's state. */
export const state = reactive({
  casts: [] as Cast[],
  layout: { ...DEFAULT_LAYOUT } as LayoutState,
  tabId: null as number | null,
  /** Whether the user can actually see this tab right now. */
  visible: !document.hidden,
})

/** Publish this tab's visibility; the overlay and the viewer both key off it. */
export function watchVisibility(): void {
  document.addEventListener('visibilitychange', () => {
    state.visible = !document.hidden
  })
}

/** This tab is itself one of the tabs being cast. */
const casting = computed(() => state.casts.some(c => c.sourceTabId === state.tabId))

/**
 * Every cast except the one captured from this very tab - and nothing at all
 * while a casting tab is in the background.
 *
 * A tab keeps being captured after you leave it, so any bubble drawn there
 * reappears inside the other tabs' streams. With two tabs casting each other
 * that nests forever, a hall of mirrors. Only the tab in front of the user
 * draws bubbles, so the cycle can never close.
 */
export const visibleCasts = computed(() => {
  if (casting.value && !state.visible)
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
}

/** Applied locally at once so dragging stays smooth, then shared with every tab. */
export function updateLayout(patch: Partial<LayoutState>): void {
  Object.assign(state.layout, patch)
  void sendMessage({ to: 'sw', type: 'UPDATE_LAYOUT', patch })
}

export function stopCast(castId: string): void {
  void sendMessage({ to: 'sw', type: 'STOP_CAST', castId })
}
