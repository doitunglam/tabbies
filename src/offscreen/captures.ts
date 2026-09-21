import type { Surface } from '@/shared/messages'
import { sendMessage } from '@/shared/messages'
import { identifySourceTab } from './identifySource'

export interface Capture {
  stream: MediaStream
  video: HTMLVideoElement
  surface: Surface
}

/** Streams live here and nowhere else - a MediaStream cannot cross contexts. */
const captures = new Map<string, Capture>()

export const getCapture = (castId: string) => captures.get(castId)

/**
 * Raises Chrome's share dialog and keeps the resulting stream.
 *
 * This has to happen here rather than in the service worker: a stream id from
 * `chrome.desktopCapture.chooseDesktopMedia` cannot be redeemed inside an
 * offscreen document (unsupported in Chrome - it fails with "Error starting tab
 * capture"). `getDisplayMedia` is the supported path, and it needs no user
 * activation in a document opened with the DISPLAY_MEDIA reason.
 */
export async function startCapture(castId: string, onEnded: () => void): Promise<Capture> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
    // Let the user re-point the share from Chrome's own sharing bar.
    surfaceSwitching: 'include',
  } as DisplayMediaStreamOptions)

  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.autoplay = true
  document.body.appendChild(video)
  await video.play().catch(() => {})

  const track = stream.getVideoTracks()[0]
  const capture: Capture = {
    stream,
    video,
    surface: (track?.getSettings().displaySurface ?? 'unknown') as Surface,
  }
  captures.set(castId, capture)

  // "Stop sharing" in Chrome's capture bar, or the source tab closing.
  track?.addEventListener('ended', onEnded)

  return capture
}

export function stopCapture(castId: string): void {
  const capture = captures.get(castId)
  if (!capture)
    return
  capture.stream.getTracks().forEach(t => t.stop())
  capture.video.srcObject = null
  capture.video.remove()
  captures.delete(castId)
}

/**
 * Find out which tab we are looking at, once the stream has real frames.
 * Only a shared *tab* can be the tab we must not draw the bubble in, so window
 * and screen shares skip the probe - and its colour flash - entirely.
 */
export async function probeSource(castId: string): Promise<void> {
  const capture = captures.get(castId)
  if (!capture || capture.surface !== 'browser')
    return

  await waitForFrames(capture.video)
  // The user may have stopped sharing while we waited.
  if (!captures.has(castId))
    return

  const sourceTabId = await identifySourceTab(capture.video)
  await sendMessage({ to: 'sw', type: 'PROBE_DONE', castId, sourceTabId })
}

function waitForFrames(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    if (video.readyState >= 2)
      done()
    else
      video.addEventListener('loadeddata', done, { once: true })
  })
}
