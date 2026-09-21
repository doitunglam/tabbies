import { getState } from './state'

/**
 * The offscreen document is the only context that can hold a MediaStream for
 * the life of a cast, so it is created on demand and torn down once the last
 * cast ends.
 */
const OFFSCREEN_PATH = 'src/offscreen/index.html'

let creating: Promise<void> | null = null

export async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  if (contexts.length > 0)
    return
  if (creating) {
    await creating
    return
  }
  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    // USER_MEDIA lets the document redeem a tabCapture stream id through
    // getUserMedia() without user activation.
    reasons: ['USER_MEDIA'],
    justification: 'Holds the captured tab streams and relays them to the page overlays.',
  })
  try {
    await creating
  }
  finally {
    creating = null
  }
}

export async function closeOffscreenIfIdle(): Promise<void> {
  const { casts } = await getState()
  if (casts.length > 0)
    return
  try {
    await chrome.offscreen.closeDocument()
  }
  catch {
    // Already closed.
  }
}
