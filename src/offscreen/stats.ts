import { rates, videoStat } from '@/shared/perf'
import { captureEntries } from './captures'
import { peerEntries } from './fanout'

/**
 * What the hub is actually doing, on demand.
 *
 * This is where the CPU goes - the hub holds every capture and encodes one copy
 * of each stream per viewer - and it has no UI to report through, so the numbers
 * are published on `globalThis` for the offscreen document's own console
 * (chrome://extensions -> Inspect views: offscreen).
 */
interface Row {
  cast: string
  /** What the capture hands over, before any scaling. */
  captured: string
  /** What this viewer is actually sent. */
  sent: string
  scale?: number
  kbps?: number
  encodeMsPerFrame?: number
  limitedBy?: string
  viewer: number
  state: RTCPeerConnectionState
}

/** The handful of `outbound-rtp` fields worth reading; the report is untyped. */
interface OutboundStat {
  type: string
  kind?: string
  bytesSent?: number
  framesEncoded?: number
  framesPerSecond?: number
  frameWidth?: number
  frameHeight?: number
  totalEncodeTime?: number
  qualityLimitationReason?: string
}

const counters = rates()

export async function snapshot(): Promise<Row[]> {
  const rows: Row[] = []

  for (const [castId, capture] of captureEntries()) {
    const source = capture.stream.getVideoTracks()[0]?.getSettings() ?? {}

    for (const [entry, pc] of peerEntries()) {
      const [peerCastId, tabId] = entry.split('|')
      if (peerCastId !== castId)
        continue

      const sent = await outbound(entry, pc)
      const scale = pc.getSenders()[0]?.getParameters().encodings?.[0]?.scaleResolutionDownBy
      rows.push({
        cast: castId.slice(5, 13),
        captured: `${source.width}x${source.height}@${Math.round(source.frameRate ?? 0)}`,
        sent: sent ? `${sent.width}x${sent.height}@${sent.fps ?? '-'}` : '-',
        scale: scale ? Math.round(scale * 10) / 10 : undefined,
        kbps: sent?.kbps,
        encodeMsPerFrame: sent?.encodeMsPerFrame,
        limitedBy: sent?.limitedBy,
        viewer: Number(tabId),
        state: pc.connectionState,
      })
    }
  }

  return rows
}

/** The numbers that say whether encoding is the problem. */
async function outbound(entry: string, pc: RTCPeerConnection) {
  const stat = await videoStat<OutboundStat>(pc, 'outbound-rtp')
  if (!stat)
    return null

  const since = counters.since(entry, {
    bytes: stat.bytesSent ?? 0,
    encode: stat.totalEncodeTime ?? 0,
    frames: stat.framesEncoded ?? 0,
  })

  return {
    width: stat.frameWidth,
    height: stat.frameHeight,
    fps: stat.framesPerSecond,
    kbps: since ? Math.round((since.delta.bytes * 8) / 1000 / since.seconds) : undefined,
    // Encode time per frame is the honest cost of one stream to one viewer.
    encodeMsPerFrame: since && since.delta.frames > 0
      ? Math.round((since.delta.encode / since.delta.frames) * 10000) / 10
      : undefined,
    limitedBy: stat.qualityLimitationReason,
  }
}

/** Prints a table a second until the returned function is called. */
function watch(everyMs = 1000): () => void {
  const timer = setInterval(async () => console.table(await snapshot()), everyMs)
  return () => {
    clearInterval(timer)
    counters.reset()
  }
}

/** JS heap only - video buffers live outside it, in the GPU and media stacks. */
function heap() {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number, totalJSHeapSize: number } }).memory
  if (!memory)
    return null
  return { usedMB: Math.round(memory.usedJSHeapSize / 1e6), totalMB: Math.round(memory.totalJSHeapSize / 1e6) }
}

export function installStatsConsole(): void {
  Object.assign(globalThis, {
    tabbies: {
      snapshot,
      watch,
      heap,
      captures: () => captureEntries().map(([id]) => id),
      peers: () => peerEntries().map(([entry, pc]) => `${entry} ${pc.connectionState}`),
    },
  })
  console.info('[tabbies] hub stats ready: tabbies.watch() / tabbies.snapshot() / tabbies.heap()')
}
