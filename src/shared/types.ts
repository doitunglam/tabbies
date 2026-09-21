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

export const DEFAULT_LAYOUT: LayoutState = {
  mode: 'stacked',
  side: 'right',
  offsetY: 96,
  tileW: 320,
  tileH: 180,
  activeCastId: null,
}
