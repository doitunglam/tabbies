import { getState, mutate, mutateQuietly } from './state'

/**
 * Tracks the tab the user is actually looking at.
 *
 * The tabs themselves cannot work this out: Chrome keeps a captured tab
 * rendering in the background, and reports it as `visible` the whole time it is
 * being captured, so `document.visibilityState` is stuck on for exactly the
 * tabs that must not draw a bubble. The tabs API is the only honest source, and
 * it lives here.
 */
export async function refreshActiveTab(): Promise<void> {
  // The last focused window, so there is one active tab in the whole browser
  // rather than one per window.
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const activeTabId = tab?.id ?? null

  const current = await getState()
  if (current.activeTabId === activeTabId)
    return

  const write = current.casts.length > 0 ? mutate : mutateQuietly
  await write((state) => {
    state.activeTabId = activeTabId
  })
}

/** Registered at the top level, so switching tabs wakes the worker. */
export function watchActiveTab(): void {
  chrome.tabs.onActivated.addListener(() => void refreshActiveTab())
  chrome.windows.onFocusChanged.addListener(() => void refreshActiveTab())
}
