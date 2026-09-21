import type { CaptureReply, HelloReply, Message, ProbeReply, Rgb } from '@/shared/messages'
import type { AppState, Cast, LayoutState } from '@/shared/types'
import { sendMessage, sendToTab } from '@/shared/messages'
import { DEFAULT_LAYOUT } from '@/shared/types'

const OFFSCREEN_PATH = 'src/offscreen/index.html'
const STORAGE_KEY = 'tabbies:state'

/* ------------------------------------------------------------------ state */

async function getState(): Promise<AppState> {
  const stored = await chrome.storage.session.get(STORAGE_KEY)
  const state = stored[STORAGE_KEY] as AppState | undefined
  return state ?? { casts: [], layout: { ...DEFAULT_LAYOUT } }
}

async function setState(state: AppState): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: state })
  await broadcast(state)
}

async function broadcast(state: AppState): Promise<void> {
  const tabs = await chrome.tabs.query({})
  await Promise.all(tabs.map(t => t.id != null && sendToTab(t.id, { to: 'content', type: 'STATE', state })))
  await sendMessage({ to: 'popup', type: 'STATE', state })
}

async function mutate(fn: (state: AppState) => void): Promise<AppState> {
  const state = await getState()
  fn(state)
  if (!state.casts.some(c => c.id === state.layout.activeCastId))
    state.layout.activeCastId = state.casts[0]?.id ?? null
  await setState(state)
  return state
}

/* -------------------------------------------------------------- offscreen */

let creatingOffscreen: Promise<void> | null = null

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  if (contexts.length > 0)
    return
  if (creatingOffscreen) {
    await creatingOffscreen
    return
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['DISPLAY_MEDIA'],
    justification: 'Holds the captured tab streams and relays them to the page overlays.',
  })
  try {
    await creatingOffscreen
  }
  finally {
    creatingOffscreen = null
  }
}

async function closeOffscreenIfIdle(): Promise<void> {
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

/* ---------------------------------------------------------------- casting */

/**
 * The share dialog is raised by the offscreen hub, not from here.
 * `chrome.desktopCapture` stream ids cannot be redeemed in an offscreen
 * document, and the hub is the only context that can hold the resulting stream,
 * so it calls `getDisplayMedia` itself.
 */
async function startCast(): Promise<{ ok: boolean, error?: string, cast?: Cast }> {
  const cast: Cast = {
    id: `cast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: 'Casting...',
    sourceTabId: null,
    createdAt: Date.now(),
  }

  await ensureOffscreen()
  // Resolves once the user has picked a surface, so the cast only enters the
  // state if there is really something to show.
  const started = await sendMessage<CaptureReply>({ to: 'offscreen', type: 'PICK_AND_CAPTURE', castId: cast.id })
  if (!started?.ok) {
    await closeOffscreenIfIdle()
    return { ok: false, error: started?.error ?? 'capture-failed' }
  }

  if (started.surface && started.surface !== 'browser')
    cast.label = started.surface === 'monitor' ? 'Shared screen' : 'Shared window'

  await mutate((state) => {
    state.casts.push(cast)
    state.layout.activeCastId = cast.id
  })
  return { ok: true, cast }
}

async function removeCast(castId: string): Promise<void> {
  await mutate((state) => {
    state.casts = state.casts.filter(c => c.id !== castId)
  })
  await closeOffscreenIfIdle()
}

/* ----------------------------------------------------------- source probe */

/**
 * Paint a uniquely coloured swatch in the top-left corner of every tab that has
 * a content script, so the offscreen hub can read the captured frame and work
 * out which tab it is looking at.
 */
async function runProbe(): Promise<ProbeReply> {
  const tabs = await chrome.tabs.query({})
  const ids = tabs.map(t => t.id).filter((id): id is number => id != null)
  const palette = buildPalette(ids.length)
  const colors: Record<number, Rgb> = {}

  await Promise.all(ids.map(async (id, i) => {
    const color = palette[i]
    const ack = await sendToTab(id, { to: 'content', type: 'PROBE_PAINT', color })
    if (ack)
      colors[id] = color
  }))

  return { colors }
}

async function clearProbe(): Promise<void> {
  const tabs = await chrome.tabs.query({})
  await Promise.all(tabs.map(t => t.id != null && sendToTab(t.id, { to: 'content', type: 'PROBE_PAINT', color: null })))
}

/** Evenly spread hues, alternating lightness so many tabs stay distinguishable. */
function buildPalette(count: number): Rgb[] {
  const out: Rgb[] = []
  for (let i = 0; i < count; i++) {
    const hue = (i * 360) / Math.max(count, 1)
    const light = i % 2 === 0 ? 0.5 : 0.32
    out.push(hslToRgb(hue / 360, 1, light))
  }
  return out
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

async function finishProbe(castId: string, sourceTabId: number | null): Promise<void> {
  await clearProbe()
  let label: string | null = null
  if (sourceTabId != null) {
    try {
      const tab = await chrome.tabs.get(sourceTabId)
      label = tab.title || tab.url || null
    }
    catch {
      label = null
    }
  }
  await mutate((state) => {
    const cast = state.casts.find(c => c.id === castId)
    if (!cast)
      return
    cast.sourceTabId = sourceTabId
    // No match means the probe could not place the tab; keep a neutral label.
    cast.label = label ?? 'Shared tab'
  })
}

/* ------------------------------------------------------------- messaging */

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (message?.to !== 'sw')
    return undefined

  const senderTabId = sender.tab?.id ?? null

  void (async () => {
    switch (message.type) {
      case 'HELLO': {
        const state = await getState()
        sendResponse({ state, tabId: senderTabId } satisfies HelloReply)
        return
      }
      case 'START_CAST': {
        sendResponse(await startCast())
        return
      }
      case 'STOP_CAST': {
        await sendMessage({ to: 'offscreen', type: 'STOP_CAPTURE', castId: message.castId })
        await removeCast(message.castId)
        sendResponse({ ok: true })
        return
      }
      case 'CAST_ENDED': {
        await removeCast(message.castId)
        sendResponse({ ok: true })
        return
      }
      case 'UPDATE_LAYOUT': {
        await mutate((state) => {
          Object.assign(state.layout, message.patch as Partial<LayoutState>)
        })
        sendResponse({ ok: true })
        return
      }
      case 'REQUEST_OFFER': {
        if (senderTabId != null)
          await sendMessage({ to: 'offscreen', type: 'CREATE_OFFER', castId: message.castId, viewerTabId: senderTabId })
        sendResponse({ ok: true })
        return
      }
      case 'DROP_PEER': {
        if (senderTabId != null)
          await sendMessage({ to: 'offscreen', type: 'DROP_PEER', castId: message.castId, viewerTabId: senderTabId })
        sendResponse({ ok: true })
        return
      }
      case 'SIGNAL': {
        if (senderTabId != null) {
          // Viewer -> hub.
          await sendMessage({ to: 'offscreen', type: 'SIGNAL', castId: message.castId, viewerTabId: senderTabId, payload: message.payload })
        }
        else if (message.viewerTabId != null) {
          // Hub -> viewer.
          await sendToTab(message.viewerTabId, { to: 'content', type: 'SIGNAL', castId: message.castId, payload: message.payload })
        }
        sendResponse({ ok: true })
        return
      }
      case 'RUN_PROBE': {
        sendResponse(await runProbe())
        return
      }
      case 'PROBE_DONE': {
        await finishProbe(message.castId, message.sourceTabId)
        sendResponse({ ok: true })
      }
    }
  })()

  return true
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void sendMessage({ to: 'offscreen', type: 'VIEWER_GONE', tabId })
})

chrome.runtime.onStartup.addListener(() => {
  void chrome.storage.session.remove(STORAGE_KEY)
})
