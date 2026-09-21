import type { HelloReply, ContentMessage } from '@/shared/messages'
import { createApp } from 'vue'
import { fromThisExtension, sendMessage } from '@/shared/messages'
import { createHost } from './host'
import css from './overlay.css?inline'
import { installStatsConsole } from './stats'
import { applyState, state } from './state'
import { handleSignal, pauseWhileInactive, syncPeers, trackTileSize } from './viewer'
import Overlay from './views/Overlay.vue'

// Overlays belong to the top-level document only.
if (window.top === window)
  mount()

function mount() {
  const { host, mountPoint } = createHost(css)
  document.documentElement.appendChild(host)
  raiseToTopLayer(host)

  createApp(Overlay).mount(mountPoint)
  pauseWhileInactive()
  trackTileSize()
  installStatsConsole()

  chrome.runtime.onMessage.addListener((message: ContentMessage, sender, sendResponse) => {
    if (!fromThisExtension(sender) || message?.to !== 'content')
      return false

    switch (message.type) {
      case 'STATE':
        applyState(message.state)
        syncPeers()
        break
      case 'SIGNAL':
        void handleSignal(message.castId, message.payload)
        break
    }
    // Answered synchronously, so the channel closes with this return.
    sendResponse({ ok: true })
    return false
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
