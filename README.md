# Tabbies

Cast one tab and watch it as a floating bubble inside every *other* tab — Messenger-style:
edge-docked, draggable, resizable, and stackable when several streams are running.

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

| Context | File | Role |
| --- | --- | --- |
| Service worker | `src/background/service-worker.ts` | Cast registry, offscreen lifecycle, WebRTC signalling relay, state broadcast |
| Offscreen document | `src/offscreen/main.ts` | Owns every stream, one peer connection per viewer, never renders anything |
| Content script | `src/content/main.ts` | Shadow-DOM overlay, one `<video>` per cast, owns no media |
| Popup | `src/popup/App.vue` | Cast the current tab, list and stop active casts |

State (cast list + bubble layout) lives in `chrome.storage.session` and is broadcast on every
change, so a tab opened mid-cast rebuilds the same bubbles in the same place.

### Why `chrome.tabCapture`, not `getDisplayMedia`

Only browser tabs are ever cast here, so the share picker is pure friction — and a picked surface
also leaves Chrome's "Sharing this tab to..." infobar pinned over the page. `chrome.tabCapture`
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
open tab, most of which are in the background and painting nothing. So a tab drops its connections
once it has been hidden for 1.5s — long enough to flick past a tab without tearing anything down —
and reopens them the moment it comes back. In practice only the visible tab is ever being encoded
for.

### No hall of mirrors

A cast keeps running after you leave its tab, so a bubble drawn in a casting tab is captured right
back into its own stream - and two tabs casting each other nest that forever. So a tab that is
itself being cast draws no bubbles at all unless it is the tab in front of the user. At most one tab
per window is visible, so the cycle cannot close. (Two windows side by side, each showing a tab that
casts the other, is the one arrangement this does not cover.)

### Staying on top

The overlay host sits at the maximum z-index, and is also lifted into the top layer as a manual
popover, so a page's own modal dialogs and popovers cannot cover the bubble either. The popover is
only kept if it opened: a closed one is hidden by a UA rule that inline styles cannot override.

## Development

```bash
npm install
npm run dev     # then load the `dist` folder at chrome://extensions (Developer mode → Load unpacked)
npm run build   # type-check + production build + release zip
```

Debug the hub from `chrome://extensions` → **Inspect views: offscreen.html**.
