import type { SignalPayload } from '@/shared/messages'
import { sdpInit, sendMessage } from '@/shared/messages'
import { getCapture } from './captures'
import { MAX_FPS, MAX_SCALE } from './quality'

/**
 * One peer connection per (cast, viewer tab). A MediaStream cannot be messaged
 * across contexts, so every viewer gets its own WebRTC loopback connection -
 * host candidates only, which connect in a few milliseconds.
 */
const peers = new Map<string, RTCPeerConnection>()
/** Viewers that asked for an offer before the capture was ready. */
const pending = new Map<string, Map<number, number>>()
/** The sender feeding each viewer, so its scaling can be retuned later. */
const senders = new Map<string, RTCRtpSender>()

const key = (castId: string, tabId: number) => `${castId}|${tabId}`

/** For the stats console; nothing in the media path reads this. */
export const peerEntries = () => [...peers.entries()]

export async function createOffer(castId: string, viewerTabId: number, width: number): Promise<void> {
  const capture = getCapture(castId)
  if (!capture) {
    // Capture is still starting up; replay once the stream exists.
    const waiting = pending.get(castId) ?? new Map<number, number>()
    waiting.set(viewerTabId, width)
    pending.set(castId, waiting)
    return
  }

  peers.get(key(castId, viewerTabId))?.close()

  const pc = new RTCPeerConnection({ iceServers: [] })
  peers.set(key(castId, viewerTabId), pc)

  // A tab capture is video-only, and the one video sender is what gets scaled
  // per viewer - a map keyed by (cast, viewer) could not hold more than one.
  const track = capture.stream.getVideoTracks()[0]
  if (!track) {
    pc.close()
    peers.delete(key(castId, viewerTabId))
    return
  }
  senders.set(key(castId, viewerTabId), pc.addTrack(track, capture.stream))
  await setViewerSize(castId, viewerTabId, width)

  pc.onicecandidate = (event) => {
    if (event.candidate)
      void signal(castId, viewerTabId, { kind: 'ice', candidate: event.candidate.toJSON() })
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed')
      dropPeer(castId, viewerTabId)
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  // Again now the sender really has parameters: before negotiation Chrome can
  // refuse them outright.
  await setViewerSize(castId, viewerTabId, width)
  await signal(castId, viewerTabId, { kind: 'offer', sdp: sdpInit(offer) })
}

/** Serve the viewers that raced ahead of the capture. */
export async function flushPending(castId: string): Promise<void> {
  const waiting = pending.get(castId)
  pending.delete(castId)
  for (const [tabId, width] of waiting ?? [])
    await createOffer(castId, tabId, width)
}

/**
 * Encode for the size the bubble is actually drawn at.
 *
 * One sender per viewer means each can be scaled on its own, and a bubble
 * showing 320 device pixels has no use for a 1280-wide frame: the pixels cost
 * the same to encode, send and decode whether or not anything can see them.
 * `setParameters` needs no renegotiation, so this can follow a resize live.
 */
export async function setViewerSize(castId: string, viewerTabId: number, width: number): Promise<void> {
  const sender = senders.get(key(castId, viewerTabId))
  const source = sender?.track?.getSettings().width
  if (!sender || !source)
    return

  const parameters = sender.getParameters()
  // Chrome hands back an empty list until the first negotiation.
  if (!parameters.encodings?.length)
    parameters.encodings = [{}]
  // Never upscale, and never past the point where the picture is unreadable.
  parameters.encodings[0].scaleResolutionDownBy = Math.min(MAX_SCALE, Math.max(1, source / Math.max(width, 120)))
  parameters.encodings[0].maxFramerate = MAX_FPS
  await sender.setParameters(parameters).catch(() => {})
}

export async function handleSignal(castId: string, viewerTabId: number, payload: SignalPayload): Promise<void> {
  const pc = peers.get(key(castId, viewerTabId))
  if (!pc)
    return
  if (payload.kind === 'answer')
    await pc.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit)
  else if (payload.kind === 'ice')
    await pc.addIceCandidate(payload.candidate).catch(() => {})
}

export function dropPeer(castId: string, viewerTabId: number): void {
  peers.get(key(castId, viewerTabId))?.close()
  peers.delete(key(castId, viewerTabId))
  senders.delete(key(castId, viewerTabId))
  pending.get(castId)?.delete(viewerTabId)
}

/** Every viewer of one cast, e.g. when the cast stops. */
export function dropCast(castId: string): void {
  pending.delete(castId)
  for (const [entry, pc] of peers) {
    if (entry.startsWith(`${castId}|`)) {
      pc.close()
      peers.delete(entry)
      senders.delete(entry)
    }
  }
}

/** Every cast shown in one tab, e.g. when that tab closes. */
export function dropViewer(tabId: number): void {
  for (const [entry, pc] of peers) {
    if (entry.endsWith(`|${tabId}`)) {
      pc.close()
      peers.delete(entry)
      senders.delete(entry)
    }
  }
  for (const waiting of pending.values())
    waiting.delete(tabId)
}

function signal(castId: string, viewerTabId: number, payload: SignalPayload): Promise<unknown> {
  return sendMessage({ to: 'sw', type: 'SIGNAL', castId, viewerTabId, payload })
}
