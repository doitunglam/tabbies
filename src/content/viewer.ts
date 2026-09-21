import type { SignalPayload } from '@/shared/messages'
import { markRaw, ref, watch } from 'vue'
import { sdpInit, sendMessage } from '@/shared/messages'
import { isActive, state, visibleCasts } from './state'

interface Peer {
  pc: RTCPeerConnection
  /** Candidates that arrived before the offer they belong to. */
  pendingIce: RTCIceCandidateInit[]
  remoteReady: boolean
}

const peers = new Map<string, Peer>()

/** Remote streams, kept raw - Vue proxies are rejected by `video.srcObject`. */
export const streams = ref<Record<string, MediaStream>>({})

/** For the stats console; nothing in the media path reads this. */
export const peerConnections = (): [string, RTCPeerConnection][] =>
  [...peers.entries()].map(([castId, peer]) => [castId, peer.pc])

/**
 * How long a tab may stay in the background before its streams are dropped.
 * Flicking through tabs should not tear down and rebuild connections on the
 * way past.
 */
const LEAVE_GRACE_MS = 1500
let leaveTimer: ReturnType<typeof setTimeout> | null = null

/** A tab nobody is looking at draws nothing, so it is not worth encoding for. */
const paused = () => !isActive.value && leaveTimer === null

/**
 * Drop this tab's streams while another tab is in front and pick them up again
 * when it comes back. Every open tab holds a peer connection per cast
 * otherwise, and the hub encodes a separate copy of the video for each one.
 */
export function pauseWhileInactive(): void {
  watch(isActive, (active) => {
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = null
    }
    if (active) {
      syncPeers()
    }
    else {
      leaveTimer = setTimeout(() => {
        leaveTimer = null
        syncPeers()
      }, LEAVE_GRACE_MS)
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
  void sendMessage({ to: 'sw', type: 'REQUEST_OFFER', castId, width: tileWidth() })
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

/** The bubble's width in the pixels a screen actually has. */
function tileWidth(): number {
  return Math.round(state.layout.tileW * (window.devicePixelRatio || 1))
}

/** Follow a resize: the hub scales what it sends to whatever is on screen. */
export function trackTileSize(): void {
  watch(() => state.layout.tileW, () => {
    for (const castId of peers.keys())
      void sendMessage({ to: 'sw', type: 'VIEWER_SIZE', castId, width: tileWidth() })
  })
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
