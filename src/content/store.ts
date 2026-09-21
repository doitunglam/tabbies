import type { HelloReply, Rgb, SignalPayload } from '@/shared/messages'
import type { AppState, Cast, LayoutState } from '@/shared/types'
import { computed, markRaw, reactive, ref } from 'vue'
import { sendMessage } from '@/shared/messages'
import { DEFAULT_LAYOUT } from '@/shared/types'

export const state = reactive({
  casts: [] as Cast[],
  layout: { ...DEFAULT_LAYOUT } as LayoutState,
  tabId: null as number | null,
  probeColor: null as Rgb | null,
})

/** Remote streams, kept raw - Vue proxies are rejected by `video.srcObject`. */
export const streams = ref<Record<string, MediaStream>>({})

/** Every cast except the one originating from this very tab. */
export const visibleCasts = computed(() => state.casts.filter(c => c.sourceTabId == null || c.sourceTabId !== state.tabId))

export const activeCast = computed(() => {
  const list = visibleCasts.value
  return list.find(c => c.id === state.layout.activeCastId) ?? list[0] ?? null
})

/* --------------------------------------------------------------- actions */

export function updateLayout(patch: Partial<LayoutState>): void {
  Object.assign(state.layout, patch)
  void sendMessage({ to: 'sw', type: 'UPDATE_LAYOUT', patch })
}

export function stopCast(castId: string): void {
  void sendMessage({ to: 'sw', type: 'STOP_CAST', castId })
}

/* ------------------------------------------------------------------ rtc */

interface Peer {
  pc: RTCPeerConnection
  pendingIce: RTCIceCandidateInit[]
  remoteReady: boolean
}

const peers = new Map<string, Peer>()

function setStream(castId: string, stream: MediaStream): void {
  streams.value = { ...streams.value, [castId]: markRaw(stream) }
}

function dropPeer(castId: string): void {
  if (!peers.has(castId))
    return
  peers.get(castId)?.pc.close()
  peers.delete(castId)
  // Let the hub tear down its half (this tab turned out to be the source, or
  // the cast is gone).
  void sendMessage({ to: 'sw', type: 'DROP_PEER', castId })
  if (castId in streams.value) {
    const next = { ...streams.value }
    delete next[castId]
    streams.value = next
  }
}

function ensurePeer(castId: string): void {
  if (peers.has(castId))
    return

  const pc = new RTCPeerConnection({ iceServers: [] })
  const peer: Peer = { pc, pendingIce: [], remoteReady: false }
  peers.set(castId, peer)

  pc.ontrack = (event) => {
    const stream = event.streams[0] ?? new MediaStream([event.track])
    setStream(castId, stream)
  }
  pc.onicecandidate = (event) => {
    if (event.candidate)
      void sendMessage({ to: 'sw', type: 'SIGNAL', castId, payload: { kind: 'ice', candidate: event.candidate.toJSON() } })
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed')
      dropPeer(castId)
  }

  void sendMessage({ to: 'sw', type: 'REQUEST_OFFER', castId })
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
    void sendMessage({ to: 'sw', type: 'SIGNAL', castId, payload: { kind: 'answer', sdp: { type: answer.type, sdp: answer.sdp } } })
  }
  else if (payload.kind === 'ice') {
    if (peer.remoteReady)
      await peer.pc.addIceCandidate(payload.candidate).catch(() => {})
    else
      peer.pendingIce.push(payload.candidate)
  }
}

/** Reconcile peer connections with the casts we are meant to be showing. */
export function applyState(next: AppState): void {
  state.casts = next.casts
  state.layout = next.layout

  const wanted = new Set(visibleCasts.value.map(c => c.id))
  for (const castId of peers.keys()) {
    if (!wanted.has(castId))
      dropPeer(castId)
  }
  for (const castId of wanted)
    ensurePeer(castId)
}

export async function hello(): Promise<void> {
  const reply = await sendMessage<HelloReply>({ to: 'sw', type: 'HELLO' })
  if (!reply)
    return
  state.tabId = reply.tabId
  applyState(reply.state)
}
