import type { Message } from '@/shared/messages'
import { createApp } from 'vue'
import css from './overlay.css?inline'
import { applyState, handleSignal, hello, state } from './store'
import Overlay from './views/Overlay.vue'

// Overlays belong to the top-level document only.
if (window.top === window)
  mount()

function mount() {
  const host = document.createElement('div')
  host.id = 'tabbies-host'
  // The host takes no space and inherits nothing; the overlay inside is fixed-positioned.
  host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0;'

  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  shadow.appendChild(style)

  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)
  document.documentElement.appendChild(host)

  createApp(Overlay).mount(mountPoint)

  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    if (message?.to !== 'content')
      return undefined

    switch (message.type) {
      case 'STATE':
        applyState(message.state)
        break
      case 'SIGNAL':
        void handleSignal(message.castId, message.payload)
        break
      case 'PROBE_PAINT':
        state.probeColor = message.color
        break
    }
    // Acking tells the service worker this tab has a live content script.
    sendResponse({ ok: true })
    return true
  })

  void hello()
}
