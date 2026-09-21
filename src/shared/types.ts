export type DockSide = 'left' | 'right'
export type DisplayMode = 'stacked' | 'expanded'

export interface Cast {
  id: string
  label: string
  /** Tab the stream is captured from; its own overlay skips this cast. */
  sourceTabId: number
  createdAt: number
}

export interface LayoutState {
  mode: DisplayMode
  side: DockSide
  /** Distance in px from the top of the viewport. */
  offsetY: number
  tileW: number
  tileH: number
  activeCastId: string | null
}

export interface AppState {
  casts: Cast[]
  layout: LayoutState
  /** The one tab the user is looking at, or `null` if that is unknown. */
  activeTabId: number | null
}

export const DEFAULT_LAYOUT: Readonly<LayoutState> = Object.freeze({
  mode: 'stacked',
  side: 'right',
  offsetY: 96,
  tileW: 320,
  tileH: 180,
  activeCastId: null,
})

/** Tile size limits, shared by the resize grip and the layout validator. */
export const MIN_TILE = { w: 160, h: 90 }
export const MAX_TILE = { w: 900, h: 700 }

/** A layout the app starts from, safe to mutate. */
export function defaultLayout(): LayoutState {
  return { ...DEFAULT_LAYOUT }
}

/**
 * Keeps only the layout fields, with each value in range.
 *
 * `UPDATE_LAYOUT` arrives from a content script, and whatever it carries is
 * persisted to session storage and broadcast to every open tab. Copying the
 * payload wholesale would let one bad patch write unknown keys - `__proto__`
 * among them - or park every bubble off screen until the browser restarts.
 */
export function sanitizeLayoutPatch(patch: unknown): Partial<LayoutState> {
  if (typeof patch !== 'object' || patch === null)
    return {}

  const input = patch as Record<string, unknown>
  const out: Partial<LayoutState> = {}

  if (input.mode === 'stacked' || input.mode === 'expanded')
    out.mode = input.mode
  if (input.side === 'left' || input.side === 'right')
    out.side = input.side
  if (typeof input.offsetY === 'number' && Number.isFinite(input.offsetY))
    out.offsetY = clamp(input.offsetY, 0, 1e5)
  if (typeof input.tileW === 'number' && Number.isFinite(input.tileW))
    out.tileW = clamp(input.tileW, MIN_TILE.w, MAX_TILE.w)
  if (typeof input.tileH === 'number' && Number.isFinite(input.tileH))
    out.tileH = clamp(input.tileH, MIN_TILE.h, MAX_TILE.h)
  if (input.activeCastId === null || typeof input.activeCastId === 'string')
    out.activeCastId = input.activeCastId as string | null

  return out
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
