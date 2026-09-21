/**
 * Stopwatch for the recurring samplers.
 *
 * Off by default and effectively free when off - the point is to be able to
 * turn it on from a console in a running extension, not to pay for it always.
 */
let tracing = false

interface Total {
  calls: number
  ms: number
  worst: number
}

const totals = new Map<string, Total>()

export function setTracing(on: boolean): void {
  tracing = on
  if (!on)
    totals.clear()
}

export function traced<T>(name: string, fn: () => T): T {
  if (!tracing)
    return fn()

  const started = performance.now()
  try {
    return fn()
  }
  finally {
    const ms = performance.now() - started
    const total = totals.get(name) ?? { calls: 0, ms: 0, worst: 0 }
    total.calls++
    total.ms += ms
    total.worst = Math.max(total.worst, ms)
    totals.set(name, total)
  }
}

/** Per sampler: how often it ran, and what it cost. */
export function traceReport(): Record<string, { calls: number, totalMs: number, avgMs: number, worstMs: number }> {
  const out: Record<string, { calls: number, totalMs: number, avgMs: number, worstMs: number }> = {}
  for (const [name, { calls, ms, worst }] of totals) {
    out[name] = {
      calls,
      totalMs: round(ms),
      avgMs: round(ms / calls),
      worstMs: round(worst),
    }
  }
  return out
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * First video entry of one kind in a peer connection's report.
 *
 * `RTCStatsReport` is a map-like with no `find`, and the entries are untyped,
 * so both stats consoles need the same walk to reach the one row they read.
 */
export async function videoStat<T>(pc: RTCPeerConnection, type: 'inbound-rtp' | 'outbound-rtp'): Promise<T | null> {
  const report = await pc.getStats()
  let found: T | null = null
  report.forEach((stat) => {
    if (found == null && stat.type === type && stat.kind === 'video')
      found = stat as T
  })
  return found
}

/**
 * Turns the running counters WebRTC reports into per-second rates.
 *
 * Every `getStats` figure is a total since the connection opened, so a table
 * can only show a rate by remembering the last reading - and dividing by the
 * time that really passed, not by the interval the poller asked for.
 */
export function rates() {
  const last = new Map<string, { at: number, counters: Record<string, number> }>()

  return {
    /** `null` on the first reading, when there is nothing to compare against. */
    since(key: string, counters: Record<string, number>) {
      const at = performance.now()
      const previous = last.get(key)
      last.set(key, { at, counters })
      if (!previous)
        return null

      const delta: Record<string, number> = {}
      for (const name of Object.keys(counters))
        delta[name] = counters[name] - (previous.counters[name] ?? 0)
      return { seconds: (at - previous.at) / 1000, delta }
    },
    reset: () => last.clear(),
  }
}
