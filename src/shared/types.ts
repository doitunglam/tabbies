export type DockSide = 'left' | 'right'
export type DisplayMode = 'stacked' | 'expanded'

export interface Cast {
  id: string
  label: string
  /** Tab the stream comes from, resolved by the colour probe. `null` when unknown. */
  sourceTabId: number | null
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
}

export const DEFAULT_LAYOUT: LayoutState = {
  mode: 'stacked',
  side: 'right',
  offsetY: 96,
  tileW: 320,
  tileH: 180,
  activeCastId: null,
}
