/**
 * The overlay's root in the host page.
 *
 * The shadow root is **closed** on purpose. An open one is reachable from the
 * page as `document.getElementById('tabbies-host').shadowRoot`, and from there
 * the page could read `video.srcObject` - a live MediaStream of a completely
 * different tab. A closed root is only reachable through the handle
 * `attachShadow` returned, which never leaves this module's isolated world.
 */
export const HOST_ID = 'tabbies-host'

let root: ShadowRoot | null = null

/** Creates the host element and its shadow root, once. */
export function createHost(css: string): { host: HTMLElement, mountPoint: HTMLElement } {
  const host = document.createElement('div')
  host.id = HOST_ID
  // The host takes no space and inherits nothing; the overlay inside is
  // fixed-positioned. The z-index is the highest a page can name, so nothing
  // the page stacks normally can cover the bubble.
  host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;'

  // A shadow root also keeps the host page's CSS out and ours in.
  root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = css
  root.appendChild(style)

  const mountPoint = document.createElement('div')
  root.appendChild(mountPoint)

  return { host, mountPoint }
}

/** For the stats console, which measures the drawn `<video>` elements. */
export function hostShadowRoot(): ShadowRoot | null {
  return root
}
