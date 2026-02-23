import { useEffect, useRef, type RefObject } from 'react'

export function useDraggable(ref: RefObject<HTMLDivElement | null>) {
  const state = useRef({ dragging: false, offsetX: 0, offsetY: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const clamp = (x: number, y: number): [number, number] => [
      Math.max(0, Math.min(x, window.innerWidth - el.offsetWidth)),
      Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight)),
    ]

    const applyPosition = (clientX: number, clientY: number) => {
      const [x, y] = clamp(clientX - state.current.offsetX, clientY - state.current.offsetY)
      el.style.left = x + 'px'
      el.style.top = y + 'px'
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      el.style.transform = 'none'
    }

    const startDrag = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect()
      state.current = {
        dragging: true,
        offsetX: clientX - rect.left,
        offsetY: clientY - rect.top,
      }
      el.style.cursor = 'grabbing'
      el.style.opacity = '0.85'
    }

    const endDrag = () => {
      if (state.current.dragging) {
        state.current.dragging = false
        el.style.cursor = 'grab'
        el.style.opacity = '1'
      }
    }

    // Mouse
    const onMouseDown = (e: MouseEvent) => { e.preventDefault(); startDrag(e.clientX, e.clientY) }
    const onMouseMove = (e: MouseEvent) => { if (state.current.dragging) { e.preventDefault(); applyPosition(e.clientX, e.clientY) } }
    const onMouseUp = () => endDrag()

    // Touch
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      e.preventDefault()
      startDrag(e.touches[0].clientX, e.touches[0].clientY)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!state.current.dragging) return
      e.preventDefault()
      applyPosition(e.touches[0].clientX, e.touches[0].clientY)
    }
    const onTouchEnd = () => endDrag()

    // Resize clamp
    const onResize = () => {
      if (el.style.left && el.style.left !== 'auto') {
        const [x, y] = clamp(parseFloat(el.style.left), parseFloat(el.style.top))
        el.style.left = x + 'px'
        el.style.top = y + 'px'
      }
    }

    el.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    window.addEventListener('resize', onResize)

    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('resize', onResize)
    }
  }, [ref])
}
