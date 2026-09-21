import type { HelloReply, Message } from '@/shared/messages'
import type { LayoutState } from '@/shared/types'
import { sendMessage, sendToTab } from '@/shared/messages'
import { removeCast, renameCast, startCast } from './casts'
import { clearState, getState, mutate } from './state'

/**
 * Control plane. Owns no media and draws nothing: it routes between the popup,
 * the content scripts and the offscreen hub, which cannot address each other
 * directly, and keeps the shared state in step.
 */
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
    }
  })()

  return true
})

// A tab renames itself on navigation, and single-page apps do it as you browse.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.title)
    void renameCast(tabId, changeInfo.title)
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void sendMessage({ to: 'offscreen', type: 'VIEWER_GONE', tabId })
})

chrome.runtime.onStartup.addListener(() => {
  void clearState()
})
