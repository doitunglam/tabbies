import type { HelloReply, Message } from '@/shared/messages'
import { createApp } from 'vue'
import { sendMessage } from '@/shared/messages'
import css from './overlay.css?inline'
import { applyState, state, watchVisibility } from './state'
import { handleSignal, pauseWhileHidden, syncPeers } from './viewer'
import Overlay from './views/Overlay.vue'

// Overlays belong to the top-level document only.
if (window.top === window)
  mount()

function mount() {
  const host = document.createElement('div')
  host.id = 'tabbies-host'
  // The host takes no space and inherits nothing; the overlay inside is
  // fixed-positioned. The z-index is the highest a page can name, so nothing
  // the page stacks normally can cover the bubble.
  host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;'

  // A shadow root keeps the host page's CSS out and ours in.
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  shadow.appendChild(style)

  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)
  document.documentElement.appendChild(host)
  raiseToTopLayer(host)

  createApp(Overlay).mount(mountPoint)
  watchVisibility()
  pauseWhileHidden()

  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    if (message?.to !== 'content')
      return undefined

    switch (message.type) {
      case 'STATE':
        applyState(message.state)
        syncPeers()
        break
      case 'SIGNAL':
        void handleSignal(message.castId, message.payload)
        break
    }
    sendResponse({ ok: true })
    return true
  })

  void hello()
}

/**
 * Lift the host into the top layer, where it sits above every stacking context
 * on the page - including modal dialogs and popovers, which a z-index alone
 * cannot beat. A manual popover never light-dismisses, so it stays put.
 *
 * Closed popovers are hidden by a UA rule that inline styles cannot override,
 * so the attribute only goes on if opening really worked.
 */
function raiseToTopLayer(host: HTMLElement): void {
  if (typeof host.showPopover !== 'function')
    return
  try {
    host.setAttribute('popover', 'manual')
    host.showPopover()
  }
  catch {
    host.removeAttribute('popover')
  }
}

/** Announce this tab and pick up whatever is already casting. */
async function hello() {
  const reply = await sendMessage<HelloReply>({ to: 'sw', type: 'HELLO' })
  if (!reply)
    return
  state.tabId = reply.tabId
  applyState(reply.state)
  syncPeers()
}
