import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type ConfirmTone = 'danger' | 'default'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Body copy explaining the consequence of the action. */
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` renders the confirm button in red. */
  tone?: ConfirmTone
  /** Disables both buttons and shows a working state on confirm. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Accessible in-app confirmation dialog.
 *
 * Replaces the browser-native `window.confirm()`, which cannot be styled,
 * blocks the JS thread, and looks out of place in the app shell.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Close on Escape and lock background scrolling while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, busy, onCancel])

  if (!open || typeof document === 'undefined') return null

  const confirmBg = tone === 'danger' ? '#b91c1c' : 'var(--primary)'
  const confirmBgHover = tone === 'danger' ? '#991b1b' : 'var(--primary)'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div
        className="card fade-in dialog-card"
        style={{ width: '100%', maxWidth: 420, padding: '26px', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}
      >
        <h3
          style={{
            fontFamily: 'Fraunces',
            fontSize: 18,
            color: tone === 'danger' ? '#b91c1c' : 'var(--foreground)',
            marginBottom: 10,
          }}
        >
          {title}
        </h3>

        <div style={{ fontSize: 13.5, color: 'var(--muted-foreground)', lineHeight: 1.6, marginBottom: 22 }}>
          {message}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-ghost"
            style={{ flex: 1, padding: '10px' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: 8,
              border: 'none',
              background: confirmBg,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
              fontFamily: 'DM Sans',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              if (!busy) (e.currentTarget as HTMLElement).style.background = confirmBgHover
            }}
            onMouseLeave={e => {
              if (!busy) (e.currentTarget as HTMLElement).style.background = confirmBg
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
