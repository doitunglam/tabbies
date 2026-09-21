<div align="center">
  <img src="icons/icon128.png" width="72" alt="" />
  <h1>Tabbies</h1>
  <p>Watch one tab as a floating bubble inside every <em>other</em> tab.</p>
</div>

Cast a tab and it follows you around the browser — Messenger-style: edge-docked, draggable,
resizable, and stacked like a pile of cards when several streams are running. No share dialog, no
"Sharing this tab to…" infobar, no server: the video never leaves your machine.

- **MIT licensed**, Manifest V3, no runtime dependency beyond Vue.
- **No network access.** No remote code, no analytics, no servers. WebRTC is used purely as local
  plumbing between extension contexts, with an empty ICE server list.
- **Only what's on screen is encoded.** Each bubble is scaled to the size it is actually drawn at,
  and background tabs drop their connections entirely.

## Install

Not on the Web Store yet — load it unpacked:

```bash
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and pick the
`dist` folder. Click the toolbar icon on any tab and hit **Cast this tab**.

## How it works

A `MediaStream` cannot cross process boundaries: it can't be sent through `chrome.runtime`
messaging or handed to a content script. So exactly one context owns each stream and fans it out
over WebRTC loopback.

```
popup ──"cast this tab"──▶ service worker
                        ├─ tabCapture.getMediaStreamId({ targetTabId })
                        ├─ ensure offscreen document (reason: USER_MEDIA)
                        └──START_CAPTURE──▶ offscreen hub
                                          │ getUserMedia(chromeMediaSource: 'tab')
                                          │ owns the MediaStream
                                          │
                        ┌─────────────────┴──── RTCPeerConnection per (cast × viewer tab) ────┐
                        ▼                                                                      ▼
              content script, tab B                                                content script, tab C
```

| Context | Entry point | Role |
| --- | --- | --- |
| Service worker | `src/background/service-worker.ts` | Cast registry, offscreen lifecycle, WebRTC signalling relay, state broadcast |
| Offscreen document | `src/offscreen/main.ts` | Owns every stream, one peer connection per viewer, never renders anything |
| Content script | `src/content/main.ts` | Shadow-DOM overlay, one `<video>` per cast, owns no media |
| Popup | `src/popup/App.vue` | Cast the current tab, list and stop active casts |

State (cast list + bubble layout) lives in `chrome.storage.session` and is broadcast on every
change, so a tab opened mid-cast rebuilds the same bubbles in the same place. Session storage is
wiped when the browser closes; nothing is written to disk.

### Why `chrome.tabCapture`, not `getDisplayMedia`

Only browser tabs are ever cast here, so the share picker is pure friction — and a picked surface
also leaves Chrome's "Sharing this tab to…" infobar pinned over the page. `chrome.tabCapture`
starts from the extension alone: no dialog, no infobar, just Chrome's small per-tab capture
indicator.

The split exists because neither context can do the whole job. `chrome.tabCapture` is only exposed
to the service worker, which cannot hold a `MediaStream`; the offscreen document can hold one but
has no access to the API. So the worker mints a stream id and the hub redeems it through the legacy
`chromeMediaSource: 'tab'` constraints — the only way to turn a capture stream id into a stream —
which needs no user activation in a document opened with the `USER_MEDIA` reason.

`chrome.desktopCapture` is not an option either: its stream ids [cannot be redeemed inside an
offscreen document at
all](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/3RanHldyp9c).

### Which tab am I looking at?

Known outright: the capture is minted for a specific `targetTabId`, so the cast records its source
tab and that tab's overlay skips it.

The permission comes from the popup click, which grants the extension access to the tab underneath
it — so a cast always starts from the tab the user is currently looking at. Pages Chrome refuses to
capture (`chrome://`, the Web Store) are rejected up front, with the reason shown in the popup.

### Only the tab you are looking at gets frames

One peer connection per (cast × tab) means the hub encodes a separate copy of the video for every
open tab, most of which are behind whatever the user is reading. So a tab drops its connections once
another tab has been in front for 1.5 s — long enough to flick past a tab without tearing anything
down — and reopens them the moment it comes back.

Each surviving connection is then scaled to the bubble's real size: a 320 px-wide tile has no use
for a 1280-wide frame, and those pixels cost the same to encode, send and decode whether or not
anything can see them.

### No hall of mirrors

A cast keeps running after you leave its tab, so a bubble drawn in a casting tab is captured right
back into its own stream — and two tabs casting each other nest that forever.

So a tab that is itself being cast draws no bubbles at all unless it is the tab in front of the
user. Neither rule can ask the page itself: Chrome keeps a captured tab rendering in the background
and reports it as `visible` for as long as the capture runs, so `document.visibilityState` is pinned
on for exactly the tabs that must not draw. `src/background/focus.ts` watches `tabs.onActivated` and
`windows.onFocusChanged` instead and broadcasts the one active tab id with the rest of the state.
One active tab in the whole browser means the mirror cycle can never close, in one window or ten.

### Staying on top

The overlay host sits at the maximum z-index, and is also lifted into the top layer as a manual
popover, so a page's own modal dialogs and popovers cannot cover the bubble either. The popover is
only kept if it opened: a closed one is hidden by a UA rule that inline styles cannot override.

## Permissions & privacy

| Permission | Why |
| --- | --- |
| `tabCapture` | Capture the frames of the tab you explicitly cast |
| `offscreen` | Host the one document allowed to hold a `MediaStream` |
| `tabs` | Read tab titles for bubble labels, and track which tab is in front |
| `storage` | Keep the cast list and bubble layout in `chrome.storage.session` |
| `http://*/*`, `https://*/*` (content script) | Draw the overlay — a bubble has to be injectable into whichever page you are reading |

The content-script match pattern is the broad one — a bubble has to be injectable into whichever
page you happen to be reading — and Chrome will say so at install time. What the script does with
that reach is narrow: it mounts its own host element, and it samples the colour of whatever sits
behind the toolbar so the icons stay readable. It reads no page content and sends none anywhere.

Frames flow **only** between this extension's own contexts, over loopback WebRTC with
`iceServers: []` — no STUN, no TURN, no signalling server. Nothing is recorded, and nothing is
persisted: stop a cast, or close the browser, and there is nothing left.

Notes for reviewers:

- The overlay lives in a **closed** shadow root. An open one is reachable from the host page as
  `document.getElementById('tabbies-host').shadowRoot`, which would hand any web page a live
  `MediaStream` of a different tab via `video.srcObject`.
- Every `chrome.runtime.onMessage` listener checks `sender.id === chrome.runtime.id` before acting.
- `START_CAST` is refused from any sender that has a tab — only the extension's own UI can begin a
  capture.
- `UPDATE_LAYOUT` arrives from content scripts and is persisted and re-broadcast, so its payload is
  filtered down to known keys with clamped ranges (`sanitizeLayoutPatch` in `src/shared/types.ts`)
  rather than copied wholesale.

Found something? Please open an issue — or, for anything you'd rather not post publicly, contact the
maintainer directly before disclosing.

## Measuring it

The hub encodes one copy of every stream per viewer, so that is where the CPU goes. Both halves
publish their numbers on `globalThis` rather than logging all the time.

Hub — `chrome://extensions` → **Inspect views: offscreen.html**:

```js
const stop = tabbies.watch()   // a table a second: captured size, sent size, fps, encode ms/frame
stop()
tabbies.heap()                 // JS heap only; video buffers live outside it
```

Viewer — DevTools on any tab showing a bubble, with **tabbies** picked in the console's context
dropdown (the content script runs in its own world):

```js
tabbies.watch()                // received size vs the size it is shown at, decode ms/frame
tabbies.trace(true)            // stopwatch on the ink samplers
tabbies.trace()                // …read it back: calls, total, average, worst
tabbies.trace(false)
```

`captured` far larger than `shown` means the tab is being encoded at its own resolution and thrown
away in a 320×180 tile. `limited by: cpu` in the hub table means the encoder is already the
bottleneck.

## Development

```bash
npm install
npm run dev        # HMR; load the `dist` folder at chrome://extensions (Developer mode → Load unpacked)
npm run build      # type-check + production build + release zip in `release/`
npm run typecheck  # types only
```

Layout:

```
src/
  background/   service worker: cast registry, focus tracking, offscreen lifecycle, signalling
  offscreen/    the media hub: captures, per-viewer fan-out, encoder quality
  content/      the overlay: Vue views, layout/drag/ink composables, viewer peer connections
  popup/        toolbar UI
  shared/       message contracts, app state types, measurement helpers
```

Debug the hub from `chrome://extensions` → **Inspect views: offscreen.html**.

## License

[MIT](LICENSE).
