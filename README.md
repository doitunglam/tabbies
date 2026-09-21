# Tabbies

Cast one tab and watch it as a floating bubble inside every *other* tab — Messenger-style:
edge-docked, draggable, resizable, and stackable when several streams are running.

## How it works

A `MediaStream` cannot cross process boundaries: it can't be sent through `chrome.runtime`
messaging or handed to a content script. So exactly one context owns each stream and fans it out
over WebRTC loopback.

```
popup ──"start"──▶ service worker
                        ├─ ensure offscreen document (reason: DISPLAY_MEDIA)
                        └──PICK_AND_CAPTURE──▶ offscreen hub
                                          │ getDisplayMedia() → Chrome's share dialog
                                          │ owns the MediaStream, runs the source-tab probe
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
| Popup | `src/popup/App.vue` | Start casting, list and stop active casts |

State (cast list + bubble layout) lives in `chrome.storage.session` and is broadcast on every
change, so a tab opened mid-cast rebuilds the same bubbles in the same place.

### Why the hub raises the share dialog

`chrome.desktopCapture.chooseDesktopMedia` looks like the natural fit, but it is a dead end here:
from a service worker it demands a `targetTab` (which binds the stream to that tab's origin), and
its stream ids [cannot be redeemed inside an offscreen document at
all](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/3RanHldyp9c) — they fail with
`AbortError: Error starting tab capture`. Chrome's own recommendation is `getDisplayMedia`, which
needs no user activation in a document opened with the `DISPLAY_MEDIA` reason and raises the same
native dialog.

### Which tab am I looking at?

The share dialog reports *what kind* of surface was picked but not *which tab*, so the bubble cannot
know which tab to skip. `src/offscreen/identifySource.ts` resolves it heuristically: every tab paints a unique
colour in its top-left corner for ~450 ms, the hub reads that corner out of the captured frame, and
the nearest match wins. For a tab capture the video frame *is* the tab viewport, so the corner maps
regardless of zoom or DPR.

It is best-effort by design, and only runs when `displaySurface` is `browser` — window and screen
shares skip it (and its colour flash) entirely. Tabs without a content script (`chrome://`, the Web
Store) and ambiguous readings resolve to `null`, in which case the source tab shows its own bubble
too — close it by hand.

## Development

```bash
npm install
npm run dev     # then load the `dist` folder at chrome://extensions (Developer mode → Load unpacked)
npm run build   # type-check + production build + release zip
```

Debug the hub from `chrome://extensions` → **Inspect views: offscreen.html**.
