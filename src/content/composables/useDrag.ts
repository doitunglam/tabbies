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

  function handleMove(event: PointerEvent) {
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD)
      return
    moved = true
    dragging.value = true
    onMove(dx, dy)
  }

  function handleUp() {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    dragging.value = false
    onEnd?.(moved)
  }

  function start(event: PointerEvent) {
    if (event.button !== 0)
      return
    event.preventDefault()
    startX = event.clientX
    startY = event.clientY
    moved = false
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return { dragging, start }
}
