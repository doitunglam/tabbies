import type { CaptureReply } from '@/shared/messages'
import type { Cast } from '@/shared/types'
import { sendMessage } from '@/shared/messages'
import { closeOffscreenIfIdle, ensureOffscreen } from './offscreen'
import { mutate } from './state'

export interface StartResult {
  ok: boolean
  error?: string
  cast?: Cast
}

/**
 * The share dialog is raised by the offscreen hub, not from here.
 * `chrome.desktopCapture` stream ids cannot be redeemed inside an offscreen
 * document, and the hub is the only context that can hold the resulting stream,
 * so it calls `getDisplayMedia` itself.
 */
export async function startCast(): Promise<StartResult> {
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

  // Only a shared tab goes through the probe; the rest can be labelled now.
  if (started.surface && started.surface !== 'browser')
    cast.label = started.surface === 'monitor' ? 'Shared screen' : 'Shared window'

  await mutate((state) => {
    state.casts.push(cast)
    state.layout.activeCastId = cast.id
  })
  return { ok: true, cast }
}

export async function removeCast(castId: string): Promise<void> {
  await mutate((state) => {
    state.casts = state.casts.filter(c => c.id !== castId)
  })
  await closeOffscreenIfIdle()
}
