import type { SignalPayload } from '@/shared/messages'
import { markRaw, ref, watch } from 'vue'
import { sdpInit, sendMessage } from '@/shared/messages'
import { state, visibleCasts } from './state'

interface Peer {
  pc: RTCPeerConnection
  /** Candidates that arrived before the offer they belong to. */
  pendingIce: RTCIceCandidateInit[]
  remoteReady: boolean
}

const peers = new Map<string, Peer>()

/** Remote streams, kept raw - Vue proxies are rejected by `video.srcObject`. */
export const streams = ref<Record<string, MediaStream>>({})

/**
 * How long a tab may stay hidden before its streams are dropped. Flicking
 * through tabs should not tear down and rebuild connections on the way past.
 */
const HIDE_GRACE_MS = 1500
let hideTimer: ReturnType<typeof setTimeout> | null = null

/** Backgrounded tabs draw nothing, so they are not worth encoding frames for. */
const paused = () => !state.visible && hideTimer === null

/**
 * Drop this tab's streams while it is in the background and pick them up again
 * when it comes back. Every open tab holds a peer connection per cast
 * otherwise, and the hub encodes a separate copy of the video for each one.
 */
export function pauseWhileHidden(): void {
  watch(() => state.visible, (visible) => {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    if (visible) {
      syncPeers()
    }
    else {
      hideTimer = setTimeout(() => {
        hideTimer = null
        syncPeers()
      }, HIDE_GRACE_MS)
    }
  })
}

/** Open a connection for every cast this tab should show, and close the rest. */
export function syncPeers(): void {
  const wanted = new Set(paused() ? [] : visibleCasts.value.map(c => c.id))
  for (const castId of peers.keys()) {
    if (!wanted.has(castId))
      dropPeer(castId)
  }
  for (const castId of wanted)
    ensurePeer(castId)
}

function ensurePeer(castId: string): void {
  if (peers.has(castId))
    return

  const pc = new RTCPeerConnection({ iceServers: [] })
  peers.set(castId, { pc, pendingIce: [], remoteReady: false })

  pc.ontrack = (event) => {
    const stream = event.streams[0] ?? new MediaStream([event.track])
    streams.value = { ...streams.value, [castId]: markRaw(stream) }
  }
  pc.onicecandidate = (event) => {
    if (event.candidate)
      void signal(castId, { kind: 'ice', candidate: event.candidate.toJSON() })
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed')
      dropPeer(castId)
  }

  // The hub answers with an offer; it owns the media, so it leads.
  void sendMessage({ to: 'sw', type: 'REQUEST_OFFER', castId })
}

function dropPeer(castId: string): void {
  const peer = peers.get(castId)
  if (!peer)
    return
  peer.pc.close()
  peers.delete(castId)

  if (castId in streams.value) {
    const next = { ...streams.value }
    delete next[castId]
    streams.value = next
  }
  // Let the hub tear down its half (this tab turned out to be the source, or
  // the cast is gone).
  void sendMessage({ to: 'sw', type: 'DROP_PEER', castId })
}

export async function handleSignal(castId: string, payload: SignalPayload): Promise<void> {
  const peer = peers.get(castId)
  if (!peer)
    return

  if (payload.kind === 'offer') {
    await peer.pc.setRemoteDescription(payload.sdp as RTCSessionDescriptionInit)
    peer.remoteReady = true
    for (const candidate of peer.pendingIce.splice(0))
      await peer.pc.addIceCandidate(candidate).catch(() => {})

    const answer = await peer.pc.createAnswer()
    await peer.pc.setLocalDescription(answer)
    void signal(castId, { kind: 'answer', sdp: sdpInit(answer) })
  }
  else if (payload.kind === 'ice') {
    if (peer.remoteReady)
      await peer.pc.addIceCandidate(payload.candidate).catch(() => {})
    else
      peer.pendingIce.push(payload.candidate)
  }
}

function signal(castId: string, payload: SignalPayload): Promise<unknown> {
  return sendMessage({ to: 'sw', type: 'SIGNAL', castId, payload })
}
