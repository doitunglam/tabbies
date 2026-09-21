import type { ProbeReply, Rgb } from '@/shared/messages'
import { sendToTab } from '@/shared/messages'
import { mutate } from './state'

/**
 * Chrome's share dialog says *what kind* of surface was picked, never *which
 * tab*, so the source tab is identified by painting a unique colour in the
 * top-left corner of every tab and letting the hub read that corner out of the
 * captured frame. See `src/offscreen/identifySource.ts` for the other half.
 */
export async function paintSwatches(): Promise<ProbeReply> {
  const ids = await contentScriptTabs()
  const palette = buildPalette(ids.length)
  const colors: Record<number, Rgb> = {}

  await Promise.all(ids.map(async (id, i) => {
    const color = palette[i]
    // A reply means the tab really has a content script painting the swatch.
    const ack = await sendToTab(id, { to: 'content', type: 'PROBE_PAINT', color })
    if (ack)
      colors[id] = color
  }))

  return { colors }
}

async function clearSwatches(): Promise<void> {
  const ids = await contentScriptTabs()
  await Promise.all(ids.map(id => sendToTab(id, { to: 'content', type: 'PROBE_PAINT', color: null })))
}

async function contentScriptTabs(): Promise<number[]> {
  const tabs = await chrome.tabs.query({})
  return tabs.map(t => t.id).filter((id): id is number => id != null)
}

/** Record the result and label the cast with the source tab's title. */
export async function finishProbe(castId: string, sourceTabId: number | null): Promise<void> {
  await clearSwatches()

  let label: string | null = null
  if (sourceTabId != null) {
    try {
      const tab = await chrome.tabs.get(sourceTabId)
      label = tab.title || tab.url || null
    }
    catch {
      label = null
    }
  }

  await mutate((state) => {
    const cast = state.casts.find(c => c.id === castId)
    if (!cast)
      return
    cast.sourceTabId = sourceTabId
    // No match means the probe could not place the tab; keep a neutral label.
    cast.label = label ?? 'Shared tab'
  })
}

/** Evenly spread hues, alternating lightness so many tabs stay distinguishable. */
function buildPalette(count: number): Rgb[] {
  const out: Rgb[] = []
  for (let i = 0; i < count; i++) {
    const hue = (i * 360) / Math.max(count, 1)
    const light = i % 2 === 0 ? 0.5 : 0.32
    out.push(hslToRgb(hue / 360, 1, light))
  }
  return out
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}
