import { useState, useEffect, useRef, type RefObject } from 'react'

/**
 * Tracks the rendered pixel width of a container so charts can adapt the
 * density of their axis ticks.
 *
 * Recharts' `interval` prop only knows how many data points exist — it has no
 * idea how much horizontal room it actually has. Measuring the container lets us
 * pick a tick count that genuinely fits and prevents date labels from overlapping.
 *
 * Initializes with an estimated width based on the window viewport so first render
 * never defaults to 0.
 */
export function useContainerWidth<T extends HTMLElement>(
  ref: RefObject<T | null>,
): number {
  const getInitial = () => {
    if (typeof window !== 'undefined' && window.innerWidth > 0) {
      return Math.max(320, Math.min(1200, Math.round(window.innerWidth * 0.6)))
    }
    return 600
  }

  const [width, setWidth] = useState(getInitial)

  useEffect(() => {
    let cancelled = false
    let ro: ResizeObserver | null = null
    let frame = 0

    const measure = (el: T) => {
      if (cancelled) return
      const rect = el.getBoundingClientRect()
      const w = Math.round(rect.width || el.clientWidth || 0)
      if (w > 0) {
        setWidth(w)
      }
    }

    const attach = () => {
      if (cancelled) return
      const el = ref.current
      if (!el) {
        frame = requestAnimationFrame(attach)
        return
      }

      measure(el)

      if (typeof ResizeObserver === 'undefined') {
        const onResize = () => measure(el)
        window.addEventListener('resize', onResize)
        return
      }

      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.round(entry.contentRect.width || entry.target.clientWidth || 0)
          if (w > 0 && !cancelled) {
            setWidth(w)
          }
        }
      })
      ro.observe(el)
    }

    attach()

    return () => {
      cancelled = true
      if (frame) cancelAnimationFrame(frame)
      ro?.disconnect()
    }
  }, [ref])

  return width
}

/**
 * Picks a Recharts `interval` value that fits `pointCount` ticks into
 * `containerWidth` pixels without any crowding or collisions.
 *
 * In Recharts, `interval={n}` means "skip n ticks between visible ones", so
 * the number of labels drawn is approximately `ceil(pointCount / (n + 1))`.
 *
 * For time series data (like 30 days):
 * - Gives each label at least ~72-80px of horizontal room so dates like "Sep 12"
 *   remain clean, readable, and never collide.
 * - Caps total visible ticks to 6-8 on wide screens and 4-5 on narrow screens.
 * - Always ensures that if pointCount > 8, ticks are comfortably spaced rather
 *   than collapsed together.
 *
 * @param containerWidth  measured width of the chart area, in px
 * @param pointCount      number of data points on the axis
 * @param labelWidth      approx px consumed by one label at the current font
 * @returns a Recharts-safe interval (>= 0)
 */
export function tickInterval(
  containerWidth: number,
  pointCount: number,
  labelWidth: number = 45,
): number {
  if (pointCount <= 1) return 0

  // Sensible fallback if width is unmeasured
  const usable = containerWidth > 0
    ? containerWidth
    : (typeof window !== 'undefined' && window.innerWidth > 0 ? Math.max(300, window.innerWidth * 0.5) : 600)

  // Target comfortable slot width so labels have generous breathing room
  const targetSlot = Math.max(72, labelWidth + 24)
  const maxLabels = Math.max(3, Math.min(8, Math.floor(usable / targetSlot)))

  if (pointCount <= maxLabels) return 0

  const step = Math.ceil(pointCount / maxLabels)
  return Math.max(1, step - 1)
}

/**
 * A ref + width pair in one call, for the common "measure this wrapper, then
 * size ticks from it" pattern used by the dashboard and analytics charts.
 */
export function useChartWidth<T extends HTMLElement>(): [
  RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null)
  const width = useContainerWidth(ref)
  return [ref, width]
}
