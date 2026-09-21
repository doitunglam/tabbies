import type { SignalPayload } from '@/shared/messages'
import { sdpInit, sendMessage } from '@/shared/messages'
import { getCapture } from './captures'

/**
 * One peer connection per (cast, viewer tab). A MediaStream cannot be messaged
 * across contexts, so every viewer gets its own WebRTC loopback connection -
 * host candidates only, which connect in a few milliseconds.
 */
const peers = new Map<string, RTCPeerConnection>()
/** Viewers that asked for an offer before the capture was ready. */
const pending = new Map<string, Set<number>>()

const key = (castId: string, tabId: number) => `${castId}|${tabId}`

export async function createOffer(castId: string, viewerTabId: number): Promise<void> {
  const capture = getCapture(castId)
  if (!capture) {
    // Capture is still starting up; replay once the stream exists.
    const waiting = pending.get(castId) ?? new Set<number>()
    waiting.add(viewerTabId)
    pending.set(castId, waiting)
    return
  }

  peers.get(key(castId, viewerTabId))?.close()

  const pc = new RTCPeerConnection({ iceServers: [] })
  peers.set(key(castId, viewerTabId), pc)
  capture.stream.getTracks().forEach(track => pc.addTrack(track, capture.stream))

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
  await signal(castId, viewerTabId, { kind: 'offer', sdp: sdpInit(offer) })
}

/** Serve the viewers that raced ahead of the capture. */
export async function flushPending(castId: string): Promise<void> {
  const waiting = pending.get(castId)
  pending.delete(castId)
  for (const tabId of waiting ?? [])
    await createOffer(castId, tabId)
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
  pending.get(castId)?.delete(viewerTabId)
}

/** Every viewer of one cast, e.g. when the cast stops. */
export function dropCast(castId: string): void {
  pending.delete(castId)
  for (const [entry, pc] of peers) {
    if (entry.startsWith(`${castId}|`)) {
      pc.close()
      peers.delete(entry)
    }
  }
}

/** Every cast shown in one tab, e.g. when that tab closes. */
export function dropViewer(tabId: number): void {
  for (const [entry, pc] of peers) {
    if (entry.endsWith(`|${tabId}`)) {
      pc.close()
      peers.delete(entry)
    }
  }
  for (const waiting of pending.values())
    waiting.delete(tabId)
}

function signal(castId: string, viewerTabId: number, payload: SignalPayload): Promise<unknown> {
  return sendMessage({ to: 'sw', type: 'SIGNAL', castId, viewerTabId, payload })
}
