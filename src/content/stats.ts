import { rates, setTracing, traceReport, videoStat } from '@/shared/perf'
import { hostShadowRoot } from './host'
import { state, visibleCasts } from './state'
import { peerConnections, streams } from './viewer'

/**
 * What this tab is doing, on demand.
 *
 * A viewer pays for decoding one stream per bubble, plus the samplers that keep
 * the chrome readable. Published on `globalThis` of the content script's own
 * world - in DevTools, pick "tabbies" in the console's context dropdown.
 */
interface Row {
  cast: string
  /** What arrives, against the size it is drawn at: the two should match. */
  received: string
  shown: string
  decodeMsPerFrame?: number
  state: RTCPeerConnectionState
}

/** The handful of `inbound-rtp` fields worth reading; the report is untyped. */
interface InboundStat {
  type: string
  kind?: string
  framesPerSecond?: number
  frameWidth?: number
  frameHeight?: number
  framesDecoded?: number
  totalDecodeTime?: number
}

const counters = rates()

async function snapshot(): Promise<Row[]> {
  const rows: Row[] = []

  for (const [castId, pc] of peerConnections()) {
    const stat = await videoStat<InboundStat>(pc, 'inbound-rtp')
    if (!stat)
      continue

    const since = counters.since(castId, {
      decode: stat.totalDecodeTime ?? 0,
      frames: stat.framesDecoded ?? 0,
    })

    rows.push({
      cast: castId.slice(5, 13),
      received: `${stat.frameWidth}x${stat.frameHeight}@${stat.framesPerSecond ?? '-'}`,
      shown: drawnSize(castId),
      decodeMsPerFrame: since && since.delta.frames > 0
        ? Math.round((since.delta.decode / since.delta.frames) * 10000) / 10
        : undefined,
      state: pc.connectionState,
    })
  }

  return rows
}

/** The bubble's own video element, measured on screen. */
function drawnSize(castId: string): string {
  const videos = Array.from(hostShadowRoot()?.querySelectorAll('video') ?? [])
  const video = videos.find(el => el.srcObject === streams.value[castId])
  if (!video)
    return '-'
  const { width, height } = video.getBoundingClientRect()
  return `${Math.round(width)}x${Math.round(height)}`
}

/** Prints a table a second until the returned function is called. */
function watch(everyMs = 1000): () => void {
  const timer = setInterval(async () => console.table(await snapshot()), everyMs)
  return () => {
    clearInterval(timer)
    counters.reset()
  }
}

/** Turn the sampler stopwatch on, wait, then call it again to read it. */
function trace(on?: boolean) {
  if (on === undefined)
    return traceReport()
  setTracing(on)
  return on ? 'tracing; call tabbies.trace() to read it' : 'stopped'
}

export function installStatsConsole(): void {
  Object.assign(globalThis, {
    tabbies: {
      snapshot,
      watch,
      trace,
      tab: () => ({ tabId: state.tabId, activeTabId: state.activeTabId, bubbles: visibleCasts.value.length }),
      peers: () => peerConnections().map(([castId, pc]) => `${castId} ${pc.connectionState}`),
    },
  })
}
