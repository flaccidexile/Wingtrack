import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SuccessDialogProps {
  open: boolean
  title: string
  message: ReactNode
  buttonLabel?: string
  onClose: () => void
}

/**
 * Accessible in-app success confirmation modal.
 *
 * Shown after destructive or important management actions (e.g., deleting an
 * inventory stock item or menu item) so the user gets clear visual feedback.
 */
export default function SuccessDialog({
  open,
  title,
  message,
  buttonLabel = 'Done',
  onClose,
}: SuccessDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

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
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="card fade-in dialog-card"
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '30px 26px 26px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#dcfce7',
            color: '#16a34a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h3
          style={{
            fontFamily: 'Inter',
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          {title}
        </h3>

        <div
          style={{
            fontSize: 13.5,
            color: 'var(--muted-foreground)',
            lineHeight: 1.6,
            marginTop: 10,
            marginBottom: 22,
          }}
        >
          {message}
        </div>

        <button
          type="button"
          className="btn-primary"
          autoFocus
          onClick={onClose}
          style={{ width: '100%', padding: '12px', fontSize: 14 }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>,
    document.body,
  )
}
