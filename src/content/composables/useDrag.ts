import { ref } from 'vue'

/** Pointer travel (px) before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4

export interface DragHandlers {
  /** Called once the threshold is crossed, then on every move. */
  onMove: (dx: number, dy: number) => void
  /** `moved` is false for a plain click. */
  onEnd?: (moved: boolean) => void
}

export function useDrag({ onMove, onEnd }: DragHandlers) {
  const dragging = ref(false)
  let startX = 0
  let startY = 0
  let moved = false
  let pointerId = -1
  let target: Element | null = null

  function handleMove(event: Event) {
    const move = event as PointerEvent
    if (move.pointerId !== pointerId)
      return
    const dx = move.clientX - startX
    const dy = move.clientY - startY
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD)
      return
    moved = true
    dragging.value = true
    onMove(dx, dy)
  }

  function handleUp(event: Event) {
    if ((event as PointerEvent).pointerId !== pointerId)
      return
    stop()
  }

  function stop() {
    const el = target
    target = null
    pointerId = -1
    if (el) {
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerup', handleUp)
      el.removeEventListener('pointercancel', handleUp)
      el.removeEventListener('lostpointercapture', handleUp)
    }
    dragging.value = false
    onEnd?.(moved)
  }

  function start(event: PointerEvent) {
    if (event.button !== 0 || target)
      return
    event.preventDefault()
    startX = event.clientX
    startY = event.clientY
    moved = false
    pointerId = event.pointerId

    // Capture the pointer on the handle itself rather than watching `window`.
    // Without capture the stream dies as soon as the pointer outruns the
    // handle and lands on something that does not forward moves to us - a
    // cross-origin iframe on the page, or the world outside the window. That
    // looks exactly like the bubble ignoring a fast drag: it freezes, and the
    // `pointerup` that should end the drag never arrives either. Capture
    // bypasses hit-testing, so every move and the release come back here no
    // matter how far or how quickly the pointer travels.
    const el = (event.currentTarget ?? event.target) as Element | null
    if (!el)
      return
    target = el
    try {
      el.setPointerCapture(event.pointerId)
    }
    catch {
      // Capture can be refused if the handle is already detached; the plain
      // listeners below still cover a drag that stays over our own document.
    }
    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerup', handleUp)
    // A cancelled pointer (a gesture the browser took over) and a capture lost
    // to a re-render both have to end the drag, or the bubble sticks.
    el.addEventListener('pointercancel', handleUp)
    el.addEventListener('lostpointercapture', handleUp)
  }

  return { dragging, start }
}
