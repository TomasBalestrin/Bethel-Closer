import { useCallback, useRef, useEffect } from 'react'

interface DragAutoScrollOptions {
  edgeSize?: number  // Size of the edge zone that triggers scrolling (in pixels)
  scrollSpeed?: number  // Base scroll speed (pixels per frame)
  maxSpeed?: number  // Maximum scroll speed
}

interface DragAutoScrollResult {
  containerRef: React.RefObject<HTMLDivElement>
  handleDragMove: (e: React.DragEvent | MouseEvent) => void
  stopAutoScroll: () => void
}

/**
 * Hook that provides auto-scrolling functionality during drag operations.
 * When dragging near the edges of a scrollable container, it will automatically
 * scroll in that direction.
 */
export function useDragAutoScroll(options: DragAutoScrollOptions = {}): DragAutoScrollResult {
  const {
    edgeSize = 100,
    scrollSpeed = 10,
    maxSpeed = 30
  } = options

  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const scrollDirectionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Smooth scroll animation loop
  const animateScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const { x, y } = scrollDirectionRef.current

    if (x !== 0 || y !== 0) {
      container.scrollLeft += x
      container.scrollTop += y
      animationFrameRef.current = requestAnimationFrame(animateScroll)
    }
  }, [])

  // Calculate scroll direction and speed based on cursor position
  const handleDragMove = useCallback((e: React.DragEvent | MouseEvent) => {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const clientX = 'clientX' in e ? e.clientX : 0
    const clientY = 'clientY' in e ? e.clientY : 0

    let xDirection = 0
    let yDirection = 0

    // Check horizontal edges
    const distanceFromLeft = clientX - rect.left
    const distanceFromRight = rect.right - clientX

    if (distanceFromLeft < edgeSize && distanceFromLeft > 0) {
      // Near left edge - scroll left
      const intensity = 1 - (distanceFromLeft / edgeSize)
      xDirection = -Math.min(scrollSpeed + (intensity * scrollSpeed), maxSpeed)
    } else if (distanceFromRight < edgeSize && distanceFromRight > 0) {
      // Near right edge - scroll right
      const intensity = 1 - (distanceFromRight / edgeSize)
      xDirection = Math.min(scrollSpeed + (intensity * scrollSpeed), maxSpeed)
    }

    // Check vertical edges
    const distanceFromTop = clientY - rect.top
    const distanceFromBottom = rect.bottom - clientY

    if (distanceFromTop < edgeSize && distanceFromTop > 0) {
      // Near top edge - scroll up
      const intensity = 1 - (distanceFromTop / edgeSize)
      yDirection = -Math.min(scrollSpeed + (intensity * scrollSpeed), maxSpeed)
    } else if (distanceFromBottom < edgeSize && distanceFromBottom > 0) {
      // Near bottom edge - scroll down
      const intensity = 1 - (distanceFromBottom / edgeSize)
      yDirection = Math.min(scrollSpeed + (intensity * scrollSpeed), maxSpeed)
    }

    const prevDirection = scrollDirectionRef.current
    scrollDirectionRef.current = { x: xDirection, y: yDirection }

    // Start animation if we weren't scrolling before but are now
    if ((prevDirection.x === 0 && prevDirection.y === 0) && (xDirection !== 0 || yDirection !== 0)) {
      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(animateScroll)
      }
    }

    // Stop animation if we're not near any edge
    if (xDirection === 0 && yDirection === 0 && animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [edgeSize, scrollSpeed, maxSpeed, animateScroll])

  // Stop auto-scrolling (call when drag ends)
  const stopAutoScroll = useCallback(() => {
    scrollDirectionRef.current = { x: 0, y: 0 }
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return {
    containerRef,
    handleDragMove,
    stopAutoScroll
  }
}

export default useDragAutoScroll
