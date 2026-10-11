import { useEffect, useState } from 'react'
import { initialsOf } from '@/lib/presence'

interface AvatarProps {
  name?: string | null
  src?: string | null
  /** Diameter in pixels. */
  size?: number
  /** Renders a thin ring, used for the "online" treatment in lists. */
  ring?: string | null
  title?: string
}

/**
 * Circular staff avatar.
 *
 * Falls back to initials on the brand orange whenever there is no photo — the
 * same shape and size, so a list does not reflow when one person uploads an
 * image and another does not.
 *
 * The fallback also covers a photo that fails to load. A URL can go stale (the
 * object was replaced or removed), and a broken-image icon in a roster reads
 * as a bug rather than as "this person has no photo".
 */
export default function Avatar({ name, src, size = 36, ring = null, title }: AvatarProps) {
  const [failed, setFailed] = useState(false)

  // A new URL deserves a fresh attempt — otherwise one bad load would pin the
  // initials on for the rest of the session, even after a successful upload.
  useEffect(() => { setFailed(false) }, [src])

  const shared = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' as const,
    boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
  }

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ? `${name}'s photo` : 'Staff photo'}
        title={title ?? name ?? undefined}
        onError={() => setFailed(true)}
        style={{ ...shared, objectFit: 'cover', background: 'var(--muted)' }}
      />
    )
  }

  return (
    <div
      title={title ?? name ?? undefined}
      aria-hidden={name ? undefined : true}
      style={{
        ...shared,
        background: 'var(--primary)',
        color: '#fdfaf6',
        fontSize: Math.max(11, Math.round(size * 0.38)),
        fontWeight: 700,
        fontFamily: 'DM Sans',
        letterSpacing: '0.01em',
        userSelect: 'none',
      }}
    >
      {initialsOf(name)}
    </div>
  )
}
