import type { ReactNode } from 'react'

/**
 * Shared chrome for every signed-out screen (sign in, sign up, password
 * recovery). Before this existed each auth page carried its own gradient,
 * blooms and motif layer, so the screens drifted apart and the sign-in screen
 * had no visual relationship to the app behind it.
 *
 * The layout is a split:
 *
 *   left  — a photographic brand panel. A real, warm, low-lit room does the
 *           emotional work that a flat gradient could not: it says "this is a
 *           restaurant at close of service" before a single word is read. The
 *           photo is darkened by a scrim layer so the copy always clears
 *           contrast, whatever part of the image sits behind it.
 *   right — a warm cream pane holding the actual form, decorated with the
 *           brand's geometric language (corner bands, dot grid, faint rings)
 *           rather than the wing motif used on the in-app surfaces.
 *
 * The wing motif still runs behind every signed-in page and the sidebar; the
 * auth screens deliberately trade it for photography and geometry so the front
 * door reads as a designed surface rather than another app page.
 */

interface AuthShellProps {
  children: ReactNode
}

/*
 * The brand mark is the supplied logo asset (`/logo.png`) inside a circular
 * badge — not a drawn glyph.
 *
 * An earlier revision of this file replaced it with a hand-drawn wing SVG
 * (six iterations of it, in fact). The user asked for the real logo back, so do
 * not substitute artwork here: `/logo.png` is the brand, and the wordmark
 * beside it carries "WING" in orange. Both are deliberate.
 */

const FEATURES: { label: string; icon: ReactNode }[] = [
  {
    label: 'Ring up orders at the counter',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="20" r="1.6" />
        <circle cx="18" cy="20" r="1.6" />
        <path d="M2 3h2.2l2.3 12.2h12.1l1.9-8.2H5.2" />
      </svg>
    ),
  },
  {
    label: 'Track stock down to the last wing',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8.4v7.2a1.8 1.8 0 0 1-.95 1.6l-7.2 3.7a1.8 1.8 0 0 1-1.7 0l-7.2-3.7A1.8 1.8 0 0 1 3 15.6V8.4a1.8 1.8 0 0 1 .95-1.6l7.2-3.7a1.8 1.8 0 0 1 1.7 0l7.2 3.7A1.8 1.8 0 0 1 21 8.4z" />
        <path d="M3.3 7.3 12 11.8l8.7-4.5M12 21.2v-9.4" />
      </svg>
    ),
  },
  {
    label: 'Watch sales as the day goes',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v16.5a1.5 1.5 0 0 0 1.5 1.5H21" />
        <path d="M7 15.5l3.8-4.3 3.1 2.6L20 7" />
      </svg>
    ),
  },
]

export default function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="auth-shell">
      {/* ── Brand panel ─────────────────────────────────────
          Three stacked layers, painted in order: the photograph, a scrim that
          darkens it to a predictable value, and the copy. Only the copy is
          exposed to assistive tech. */}
      <aside className="auth-brand">
        <div className="auth-brand__photo" aria-hidden="true" />
        <div className="auth-brand__scrim" aria-hidden="true" />

        <div className="auth-brand__top">
          <div className="auth-brand__mark">
            <img src="/logo.png" alt="" />
          </div>
          <div>
            <p className="auth-brand__eyebrow">Staff Portal</p>
            <p className="auth-brand__wordmark"><span>WING</span>TRACK</p>
          </div>
        </div>

        <div className="auth-brand__mid">
          <p className="auth-brand__kicker">People · Stock · Progress</p>
          <h2 className="auth-brand__headline">
            The whole shop,<br /><span>on one screen.</span>
          </h2>
          <p className="auth-brand__tagline">
            Point of sale, stock, and daily takings for Wings Zone — the same
            numbers your counter sees, from anywhere.
          </p>
          <ul className="auth-brand__features">
            {FEATURES.map(({ label, icon }) => (
              <li key={label} className="auth-brand__feature">
                <span className="auth-brand__ficon" aria-hidden="true">{icon}</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-brand__foot">
          <span className="auth-brand__footrule" aria-hidden="true" />
          Wingtrack · Staff Portal
        </p>
      </aside>

      {/* ── Form pane ─────────────────────────────────────── */}
      <main className="auth-pane">
        {/* Decorative geometry. Sits at z-index -1, which paints above the
            pane's own background but below the card. */}
        <div className="auth-pane__decor" aria-hidden="true">
          <span className="auth-pane__stripe auth-pane__stripe--b" />
          <span className="auth-pane__stripe auth-pane__stripe--a" />
          <span className="auth-pane__ring" />
          <span className="auth-pane__dots" />
          <span className="auth-pane__glow" />
        </div>

        {/* The decor lives outside the scroll container on purpose: it is
            anchored to the pane's border box and clipped by the pane, so the
            corner bands bleed off the true edge and stay put while the form
            scrolls. */}
        <div className="auth-pane__scroll">
          <div className="auth-pane__inner">
            {/* The brand panel is hidden on narrow screens, so the wordmark has
                to reappear here or the page loses its identity entirely. */}
            <div className="auth-pane__mobilebrand">
              <img src="/logo.png" alt="" />
              <p><span>WING</span>TRACK</p>
            </div>

            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
