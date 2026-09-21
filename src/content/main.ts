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
  void start()

/**
 * Says hello first, and builds the overlay only where one belongs.
 *
 * Nothing is mounted before the worker answers, because the answer is what
 * settles whether this document should draw at all. A window a page opened for
 * one job - an SSO sign-in above all - runs this content script exactly like a
 * tab does, and a bubble parked over the sign-in form is pure obstruction:
 * small window, no tab strip, one thing to do. Skipping the mount also leaves
 * no `STATE` listener behind, so a later broadcast cannot put a bubble there
 * after the fact.
 */
async function start() {
  const reply = await sendMessage<HelloReply>({ to: 'sw', type: 'HELLO' })
  // No answer at all (a worker that could not be woken) is not a reason to go
  // dark: a missing bubble is worse than one in an odd window.
  if (reply && !reply.overlay)
    return

  mount()
  if (!reply)
    return
  state.tabId = reply.tabId
  applyState(reply.state)
  syncPeers()
}

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
