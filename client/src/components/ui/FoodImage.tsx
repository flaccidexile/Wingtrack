import { useEffect, useState } from 'react'

interface FoodImageProps {
  /** The menu item's name — used for the alt text and the placeholder. */
  name: string
  src?: string | null
  /** Rendered height in pixels. The width always fills the parent. */
  height: number
  /** Corner rounding. Match the parent card so the image is clipped cleanly. */
  radius?: number | string
}

/**
 * A menu item's photo, with a placeholder that still reads as food.
 *
 * WHY THE PLACEHOLDER MATTERS
 * ---------------------------
 * Not every item has a photo, and a POS grid with a mix of photos and empty
 * grey boxes looks broken. The fallback is therefore a warm, brand-tinted tile
 * with a cutlery mark — the same footprint as a real photo, so the grid never
 * reflows when one item gains an image and another does not.
 *
 * The fallback also covers a photo that fails to load: a URL can go stale if
 * the stored object is replaced or removed, and a broken-image icon in a menu
 * reads as a bug rather than as "no photo yet".
 */
export default function FoodImage({ name, src, height, radius = 0 }: FoodImageProps) {
  const [failed, setFailed] = useState(false)

  // A new URL deserves a fresh attempt, so one bad load does not pin the
  // placeholder on for the rest of the session.
  useEffect(() => { setFailed(false) }, [src])

  const shared: React.CSSProperties = {
    width: '100%',
    height,
    display: 'block',
    borderRadius: radius,
    overflow: 'hidden',
    flexShrink: 0,
  }

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ ...shared, objectFit: 'cover', background: 'var(--muted)' }}
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={`${name} — no photo yet`}
      style={{
        ...shared,
        background: 'linear-gradient(135deg, #fdf1e6 0%, #f8e0cd 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={Math.round(height * 0.34)}
        height={Math.round(height * 0.34)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#c2410c"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.32 }}
        aria-hidden="true"
      >
        <path d="M3 2v7a3 3 0 0 0 3 3 3 3 0 0 0 3-3V2" />
        <path d="M6 12v10" />
        <path d="M17 2c-1.7 1.2-2.5 3-2.5 5.5S15.3 12 17 13v9" />
      </svg>
    </div>
  )
}
