import { useState, useEffect, useRef, type RefObject } from 'react'

/**
 * Tracks the rendered pixel width of a container so charts can adapt the
 * density of their axis ticks.
 *
 * Recharts' `interval` prop only knows how many data points exist — it has no
 * idea how much horizontal room it actually has. On a 390px phone the same
 * "show a label every N points" rule that looks fine at 1440px produces a
 * solid smear of overlapping dates. Measuring the container lets us pick a
 * tick count that genuinely fits.
 *
 * Returns the measured width (0 until the first measurement lands).
 */
export function useContainerWidth<T extends HTMLElement>(
  ref: RefObject<T | null>,
): number {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    // The ref is still null during the first effect pass (the DOM node has not
    // been attached yet), so resolve it inside a rAF and retry until it exists.
    // Depending on `ref` alone would never re-run once the node mounts.
    let cancelled = false
    let ro: ResizeObserver | null = null
    let frame = 0

    const measure = (el: T) => {
      if (!cancelled) setWidth(el.clientWidth)
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
        window.addEventListener('resize', () => measure(el))
        return
      }

      ro = new ResizeObserver(() => measure(el))
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
 * `containerWidth` pixels.
 *
 * `interval` in Recharts means "skip this many ticks between drawn ones", so
 * the number of labels actually drawn is `ceil(pointCount / (interval + 1))`.
 * We solve that backwards from the per-label budget.
 *
 * @param containerWidth  measured width of the chart area, in px
 * @param pointCount      number of data points on the axis
 * @param labelWidth      approx px consumed by one label at the current font
 * @returns a Recharts-safe interval (>= 0)
 */
export function tickInterval(
  containerWidth: number,
  pointCount: number,
  labelWidth: number,
): number {
  if (containerWidth <= 0 || pointCount <= 1) return 0

  // Never let labels get closer than this; a little breathing room reads
  // better than edge-to-edge text even when they technically do not collide.
  const minGap = 8
  const maxLabels = Math.max(2, Math.floor(containerWidth / (labelWidth + minGap)))
  if (maxLabels >= pointCount) return 0

  return Math.max(0, Math.ceil(pointCount / maxLabels) - 1)
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
