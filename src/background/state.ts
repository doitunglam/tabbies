import type { AppState } from '@/shared/types'
import { sendMessage, sendToTab } from '@/shared/messages'
import { defaultLayout } from '@/shared/types'

/**
 * The authoritative cast registry and bubble layout.
 *
 * It lives in `chrome.storage.session` rather than a module variable because
 * the service worker is torn down whenever it goes idle, and it is broadcast on
 * every change so a tab opened mid-cast rebuilds the same bubbles.
 */
const STORAGE_KEY = 'tabbies:state'

export async function getState(): Promise<AppState> {
  const stored = await chrome.storage.session.get(STORAGE_KEY)
  const state = stored[STORAGE_KEY] as AppState | undefined
  return state ?? { casts: [], layout: defaultLayout(), activeTabId: null }
}

export async function clearState(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY)
}

/** Read, change, persist and broadcast in one step. */
export function mutate(fn: (state: AppState) => void): Promise<AppState> {
  return apply(fn, true)
}

/**
 * Same as `mutate`, without the broadcast - for bookkeeping no overlay can act
 * on, which would otherwise message every open tab for nothing.
 */
export function mutateQuietly(fn: (state: AppState) => void): Promise<AppState> {
  return apply(fn, false)
}

async function apply(fn: (state: AppState) => void, announce: boolean): Promise<AppState> {
  const state = await getState()
  fn(state)
  if (!state.casts.some(c => c.id === state.layout.activeCastId))
    state.layout.activeCastId = state.casts[0]?.id ?? null

  await chrome.storage.session.set({ [STORAGE_KEY]: state })
  if (announce)
    await broadcast(state)
  return state
}

async function broadcast(state: AppState): Promise<void> {
  const tabs = await chrome.tabs.query({})
  await Promise.all(tabs.map(t => t.id != null && sendToTab(t.id, { to: 'content', type: 'STATE', state })))
  await sendMessage({ to: 'popup', type: 'STATE', state })
}
