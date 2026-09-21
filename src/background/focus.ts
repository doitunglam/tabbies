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

  // A popup window - an SSO sign-in, a payment sheet - opens *over* the tab the
  // user was reading, not instead of it. Handing it the focus would leave that
  // tab counting as background, which drops its streams a second and a half
  // later: sign in, come back, and the bubble is showing "Connecting..." again.
  if (tab?.windowId != null && !(await isBrowsingWindow(tab.windowId)))
    return

  const activeTabId = tab?.id ?? null

  const current = await getState()
  if (current.activeTabId === activeTabId)
    return

  const write = current.casts.length > 0 ? mutate : mutateQuietly
  await write((state) => {
    state.activeTabId = activeTabId
  })
}

/**
 * A window the user browses in, as opposed to one a page opened for a single
 * job. Those have no tab strip, they are small, and what they are showing is
 * the only thing the user wants on screen while they are open - so no bubble
 * belongs there, and focus moving into one is not the user leaving their tab.
 *
 * A window that cannot be read is treated as an ordinary one: that is how the
 * overlay behaved before, and it is the harmless half of the guess.
 */
export async function isBrowsingWindow(windowId: number): Promise<boolean> {
  try {
    const win = await chrome.windows.get(windowId)
    return win.type === 'normal'
  }
  catch {
    return true
  }
}

/** Registered at the top level, so switching tabs wakes the worker. */
export function watchActiveTab(): void {
  chrome.tabs.onActivated.addListener(track)
  chrome.windows.onFocusChanged.addListener(track)
}

function track(): void {
  // An event listener has nowhere to return a rejection to.
  void refreshActiveTab().catch(error => console.error('[tabbies] active tab lookup failed', error))
}
