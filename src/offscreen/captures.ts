export interface Capture {
  stream: MediaStream
  video: HTMLVideoElement
}

/** Streams live here and nowhere else - a MediaStream cannot cross contexts. */
const captures = new Map<string, Capture>()

export const getCapture = (castId: string) => captures.get(castId)

/**
 * Redeems a `chrome.tabCapture` stream id and keeps the resulting stream.
 *
 * The service worker cannot hold a MediaStream, so it mints the id and this
 * document redeems it through the legacy `chromeMediaSource` constraints - the
 * only way to turn a capture stream id into a stream. The document is opened
 * with the USER_MEDIA reason, so no user activation is needed here.
 */
export async function startCapture(castId: string, streamId: string, onEnded: () => void): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
  } as MediaStreamConstraints)

  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.autoplay = true
  document.body.appendChild(video)
  await video.play().catch(() => {})

  const capture: Capture = { stream, video }
  captures.set(castId, capture)

  // The source tab closing, or Chrome ending the capture from its tab indicator.
  stream.getVideoTracks()[0]?.addEventListener('ended', onEnded)

  return capture
}

export function stopCapture(castId: string): void {
  const capture = captures.get(castId)
  if (!capture)
    return
  capture.stream.getTracks().forEach(t => t.stop())
  capture.video.srcObject = null
  capture.video.remove()
  captures.delete(castId)
}
