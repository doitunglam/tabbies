import type { Message, SignalPayload, Surface } from '@/shared/messages'
import { sendMessage } from '@/shared/messages'
import { identifySourceTab } from './identifySource'

interface Capture {
  stream: MediaStream
  video: HTMLVideoElement
}

/** Streams live here and nowhere else - a MediaStream cannot cross contexts. */
const captures = new Map<string, Capture>()
/** One peer connection per (cast, viewer tab). */
const peers = new Map<string, RTCPeerConnection>()
/** Viewers that asked for an offer before the capture was ready. */
const pendingViewers = new Map<string, Set<number>>()

const peerKey = (castId: string, tabId: number) => `${castId}|${tabId}`

/* ----------------------------------------------------------------- capture */

/**
 * Raises Chrome's share dialog and keeps the resulting stream.
 *
 * This has to happen *here*, not in the service worker: a stream id from
 * `chrome.desktopCapture.chooseDesktopMedia` cannot be redeemed inside an
 * offscreen document (unsupported in Chrome - it fails with "Error starting tab
 * capture"). `getDisplayMedia` is the supported path, and it needs no user
 * activation in a document opened with the DISPLAY_MEDIA reason.
 */
async function startCapture(castId: string): Promise<Surface> {
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

  captures.set(castId, { stream, video })

  // Viewers that raced ahead of the capture.
  const waiting = pendingViewers.get(castId)
  pendingViewers.delete(castId)
  for (const tabId of waiting ?? [])
    await createOffer(castId, tabId)

  // "Stop sharing" in Chrome's capture bar, or the source tab closing.
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    stopCapture(castId)
    void sendMessage({ to: 'sw', type: 'CAST_ENDED', castId })
  })

  const track = stream.getVideoTracks()[0]
  const surface = (track?.getSettings().displaySurface ?? 'unknown') as Surface

  // Only a shared *tab* can be the tab we must not draw the bubble in, so the
  // probe (and its colour flash) is skipped for window and screen shares.
  if (surface === 'browser')
    void probeSource(castId, video)

  return surface
}

async function probeSource(castId: string, video: HTMLVideoElement): Promise<void> {
  await waitForFrames(video)
  if (!captures.has(castId))
    return
  const sourceTabId = await identifySourceTab(video)
  await sendMessage({ to: 'sw', type: 'PROBE_DONE', castId, sourceTabId })
}

function stopCapture(castId: string): void {
  pendingViewers.delete(castId)
  const capture = captures.get(castId)
  if (capture) {
    capture.stream.getTracks().forEach(t => t.stop())
    capture.video.srcObject = null
    capture.video.remove()
    captures.delete(castId)
  }
  for (const [key, pc] of peers) {
    if (key.startsWith(`${castId}|`)) {
      pc.close()
      peers.delete(key)
    }
  }
}

function dropViewer(tabId: number): void {
  for (const [key, pc] of peers) {
    if (key.endsWith(`|${tabId}`)) {
      pc.close()
      peers.delete(key)
    }
  }
  for (const waiting of pendingViewers.values())
    waiting.delete(tabId)
}

function dropPeer(castId: string, viewerTabId: number): void {
  const key = peerKey(castId, viewerTabId)
  peers.get(key)?.close()
  peers.delete(key)
  pendingViewers.get(castId)?.delete(viewerTabId)
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

/* --------------------------------------------------------------- fan-out */

async function createOffer(castId: string, viewerTabId: number): Promise<void> {
  const capture = captures.get(castId)
  if (!capture) {
    // Capture is still starting up; replay once the stream exists.
    const waiting = pendingViewers.get(castId) ?? new Set<number>()
    waiting.add(viewerTabId)
    pendingViewers.set(castId, waiting)
    return
  }

  peers.get(peerKey(castId, viewerTabId))?.close()

  const pc = new RTCPeerConnection({ iceServers: [] })
  peers.set(peerKey(castId, viewerTabId), pc)

  capture.stream.getTracks().forEach(track => pc.addTrack(track, capture.stream))

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      void signal(castId, viewerTabId, { kind: 'ice', candidate: event.candidate.toJSON() })
    }
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      pc.close()
      peers.delete(peerKey(castId, viewerTabId))
    }
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await signal(castId, viewerTabId, { kind: 'offer', sdp: { type: offer.type, sdp: offer.sdp } })
}

async function handleSignal(castId: string, viewerTabId: number, payload: SignalPayload): Promise<void> {
  const pc = peers.get(peerKey(castId, viewerTabId))
  if (!pc)
    return
  if (payload.kind === 'answer')
    await pc.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit)
  else if (payload.kind === 'ice')
    await pc.addIceCandidate(payload.candidate).catch(() => {})
}

function signal(castId: string, viewerTabId: number, payload: SignalPayload): Promise<unknown> {
  return sendMessage({ to: 'sw', type: 'SIGNAL', castId, viewerTabId, payload })
}

/* ------------------------------------------------------------- messaging */

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message?.to !== 'offscreen')
    return undefined

  void (async () => {
    switch (message.type) {
      case 'PICK_AND_CAPTURE':
        try {
          const surface = await startCapture(message.castId)
          sendResponse({ ok: true, surface })
        }
        catch (error) {
          const { name, message: reason } = error as DOMException
          // NotAllowedError is the user dismissing the share dialog.
          if (name !== 'NotAllowedError')
            console.error(`[tabbies] capture failed: ${name}: ${reason}`, error)
          sendResponse({ ok: false, error: name })
        }
        return
      case 'STOP_CAPTURE':
        stopCapture(message.castId)
        break
      case 'VIEWER_GONE':
        dropViewer(message.tabId)
        break
      case 'CREATE_OFFER':
        await createOffer(message.castId, message.viewerTabId)
        break
      case 'DROP_PEER':
        dropPeer(message.castId, message.viewerTabId)
        break
      case 'SIGNAL':
        await handleSignal(message.castId, message.viewerTabId, message.payload)
        break
    }
    sendResponse({ ok: true })
  })()

  return true
})
