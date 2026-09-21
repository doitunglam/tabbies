import type { Message } from '@/shared/messages'
import { sendMessage } from '@/shared/messages'
import { probeSource, startCapture, stopCapture } from './captures'
import { createOffer, dropCast, dropPeer, dropViewer, flushPending, handleSignal } from './fanout'

/**
 * Media plane. Owns every captured stream and one peer connection per viewer,
 * and renders nothing - the visible bubbles are drawn by the content scripts.
 */
async function beginCast(castId: string): Promise<{ ok: true, surface: string }> {
  const capture = await startCapture(castId, () => {
    // Chrome stopped the share ("Stop sharing", or the source tab closing), so
    // the service worker has to hear about it.
    endCast(castId)
    void sendMessage({ to: 'sw', type: 'CAST_ENDED', castId })
  })
  await flushPending(castId)
  // Detached: the caller only waits for the capture itself.
  void probeSource(castId)
  return { ok: true, surface: capture.surface }
}

function endCast(castId: string): void {
  stopCapture(castId)
  dropCast(castId)
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message?.to !== 'offscreen')
    return undefined

  void (async () => {
    switch (message.type) {
      case 'PICK_AND_CAPTURE':
        try {
          sendResponse(await beginCast(message.castId))
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
  })()

  return true
})
