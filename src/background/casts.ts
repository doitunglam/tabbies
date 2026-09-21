import type { CaptureReply, StartResult } from '@/shared/messages'
import type { Cast } from '@/shared/types'
import { sendMessage } from '@/shared/messages'
import { closeOffscreenIfIdle, ensureOffscreen } from './offscreen'
import { getState, mutate } from './state'

/** Pages Chrome refuses to capture, so the failure can be explained up front. */
const BLOCKED = /^(?:chrome|edge|about|devtools|chrome-extension|chrome-untrusted):|^https:\/\/chromewebstore\.google\.com\//

/**
 * Casts the tab the user is looking at.
 *
 * `chrome.tabCapture` needs no share dialog and raises no "Sharing this tab
 * to..." infobar - only Chrome's small per-tab capture indicator - and it hands
 * back the tab id, so the source tab is known outright instead of having to be
 * guessed from the pixels. The stream id has to be minted here: the API is only
 * available to the service worker, and it is only granted for a tab the
 * extension has just been invoked on, which is what the popup click does.
 */
export async function startCast(): Promise<StartResult> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab?.id)
    return { ok: false, error: 'no-tab' }
  if (tab.url && BLOCKED.test(tab.url))
    return { ok: false, error: 'blocked-page' }

  const { casts } = await getState()
  if (casts.some(c => c.sourceTabId === tab.id))
    return { ok: false, error: 'already-casting' }

  let streamId: string
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id })
  }
  catch (error) {
    return { ok: false, error: (error as Error).message || 'stream-id-failed' }
  }

  const cast: Cast = {
    id: `cast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: tab.title || tab.url || 'Shared tab',
    sourceTabId: tab.id,
    createdAt: Date.now(),
  }

  await ensureOffscreen()
  // Resolves once frames are really flowing, so the cast only enters the state
  // if there is something to show.
  const started = await sendMessage<CaptureReply>({ to: 'offscreen', type: 'START_CAPTURE', castId: cast.id, streamId })
  if (!started?.ok) {
    await closeOffscreenIfIdle()
    return { ok: false, error: started?.error ?? 'capture-failed' }
  }

  await mutate((state) => {
    state.casts.push(cast)
    state.layout.activeCastId = cast.id
  })
  return { ok: true, cast }
}

/** Follow the source tab's title, so a bubble never shows a stale page name. */
export async function renameCast(sourceTabId: number, label: string): Promise<void> {
  const { casts } = await getState()
  if (!casts.some(c => c.sourceTabId === sourceTabId && c.label !== label))
    return
  await mutate((state) => {
    for (const cast of state.casts) {
      if (cast.sourceTabId === sourceTabId)
        cast.label = label
    }
  })
}

export async function removeCast(castId: string): Promise<void> {
  await mutate((state) => {
    state.casts = state.casts.filter(c => c.id !== castId)
  })
  await closeOffscreenIfIdle()
}
