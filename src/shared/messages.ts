import type { AppState, Cast, LayoutState } from './types'

export type SignalPayload =
  | { kind: 'offer' | 'answer', sdp: { type: RTCSdpType, sdp?: string } }
  | { kind: 'ice', candidate: RTCIceCandidateInit }

/** Messages handled by the service worker. */
export type SwMessage =
  | { to: 'sw', type: 'HELLO' }
  | { to: 'sw', type: 'START_CAST' }
  | { to: 'sw', type: 'STOP_CAST', castId: string }
  | { to: 'sw', type: 'UPDATE_LAYOUT', patch: Partial<LayoutState> }
  | { to: 'sw', type: 'CAST_ENDED', castId: string }
  | { to: 'sw', type: 'REQUEST_OFFER', castId: string, width: number }
  | { to: 'sw', type: 'VIEWER_SIZE', castId: string, width: number }
  | { to: 'sw', type: 'DROP_PEER', castId: string }
  | { to: 'sw', type: 'SIGNAL', castId: string, viewerTabId?: number, payload: SignalPayload }

/** Messages handled by the offscreen document. */
export type OffscreenMessage =
  | { to: 'offscreen', type: 'START_CAPTURE', castId: string, streamId: string }
  | { to: 'offscreen', type: 'STOP_CAPTURE', castId: string }
  | { to: 'offscreen', type: 'VIEWER_GONE', tabId: number }
  | { to: 'offscreen', type: 'CREATE_OFFER', castId: string, viewerTabId: number, width: number }
  | { to: 'offscreen', type: 'VIEWER_SIZE', castId: string, viewerTabId: number, width: number }
  | { to: 'offscreen', type: 'DROP_PEER', castId: string, viewerTabId: number }
  | { to: 'offscreen', type: 'SIGNAL', castId: string, viewerTabId: number, payload: SignalPayload }

/** Messages handled by content scripts. */
export type ContentMessage =
  | { to: 'content', type: 'STATE', state: AppState }
  | { to: 'content', type: 'SIGNAL', castId: string, payload: SignalPayload }

/** Messages handled by the browser action popup. */
export type PopupMessage =
  | { to: 'popup', type: 'STATE', state: AppState }

export type Message = SwMessage | OffscreenMessage | ContentMessage | PopupMessage

export interface HelloReply {
  state: AppState
  tabId: number | null
}

export interface CaptureReply {
  ok: boolean
  error?: string
}

/** Reply to `START_CAST`; `error` is a key the popup turns into a sentence. */
export interface StartResult {
  ok: boolean
  error?: string
  cast?: Cast
}

/**
 * Only this extension's own contexts may be obeyed.
 *
 * Manifest V3 keeps pages out of `onMessage` (they would arrive on
 * `onMessageExternal`, which is not wired up here), but the check is one line
 * and it keeps a second extension - or a stray `externally_connectable` entry
 * added later - from driving the cast registry.
 */
export function fromThisExtension(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id
}

/** Session descriptions are not structured-cloneable; messaging needs the plain pair. */
export function sdpInit(description: RTCSessionDescriptionInit): { type: RTCSdpType, sdp?: string } {
  return { type: description.type, sdp: description.sdp }
}

/** `chrome.runtime.sendMessage` that never throws on "no receiving end". */
export async function sendMessage<T = unknown>(message: Message): Promise<T | undefined> {
  try {
    return await chrome.runtime.sendMessage(message) as T
  }
  catch {
    return undefined
  }
}

export async function sendToTab<T = unknown>(tabId: number, message: ContentMessage): Promise<T | undefined> {
  try {
    return await chrome.tabs.sendMessage(tabId, message) as T
  }
  catch {
    // Tab has no content script (chrome://, web store, still loading).
    return undefined
  }
}
