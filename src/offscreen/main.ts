import type { Message, OffscreenMessage } from '@/shared/messages'
import { sendMessage } from '@/shared/messages'
import { startCapture, stopCapture } from './captures'
import { createOffer, dropCast, dropPeer, dropViewer, flushPending, handleSignal } from './fanout'

/**
 * Media plane. Owns every captured stream and one peer connection per viewer,
 * and renders nothing - the visible bubbles are drawn by the content scripts.
 */
async function beginCast(castId: string, streamId: string): Promise<{ ok: true }> {
  await startCapture(castId, streamId, () => {
    // The capture ended on Chrome's side (source tab closed or stopped), so the
    // service worker has to hear about it.
    endCast(castId)
    void sendMessage({ to: 'sw', type: 'CAST_ENDED', castId })
  })
  await flushPending(castId)
  return { ok: true }
}

function endCast(castId: string): void {
  stopCapture(castId)
  dropCast(castId)
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message?.to !== 'offscreen')
    return undefined

  void (async () => {
    try {
      await handle(message, sendResponse)
    }
    catch (error) {
      const { name, message: reason } = error as DOMException
      console.error(`[tabbies] ${message.type} failed: ${name}: ${reason}`, error)
      sendResponse({ ok: false, error: name })
    }
  })()

  return true
})

async function handle(message: OffscreenMessage, sendResponse: (response: unknown) => void): Promise<void> {
  switch (message.type) {
    case 'START_CAPTURE':
      sendResponse(await beginCast(message.castId, message.streamId))
      return
    case 'STOP_CAPTURE':
      endCast(message.castId)
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
}
