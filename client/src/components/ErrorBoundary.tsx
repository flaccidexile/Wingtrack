import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional label shown in the fallback, e.g. the page name. */
  label?: string
  /** When provided, renders a "Try again" action instead of asking for a reload. */
  onRetry?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render-time errors in its subtree so a single broken page or widget
 * cannot blank the entire application.
 *
 * Wrap each page in one of these (see AppShell) so a crash in, say, Analytics
 * leaves the sidebar and navigation usable.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught render error:', error)
    console.error('[ErrorBoundary] Component stack:', info.componentStack)
  }

  private handleReset = (): void => {
    this.setState({ error: null })
    this.props.onRetry?.()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const scope = this.props.label ? `the ${this.props.label} page` : 'this section'

    return (
      <div
        role="alert"
        style={{
          padding: '48px 24px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          minHeight: 320,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: '100%',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '28px 26px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: 24,
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            ⚠️
          </div>

          <h2
            style={{
              fontFamily: 'Fraunces',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--foreground)',
              marginBottom: 8,
            }}
          >
            Something went wrong
          </h2>

          <p style={{ fontSize: 14, color: 'var(--muted-foreground)', lineHeight: 1.6, marginBottom: 20 }}>
            We hit an unexpected error while loading {scope}. Your data is safe — nothing was saved or lost.
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" onClick={this.handleReset} style={{ padding: '11px 22px', fontSize: 14, fontWeight: 600, borderRadius: 10 }}>
              Try again
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.location.reload()}
              style={{ padding: '11px 22px', fontSize: 14, fontWeight: 600, borderRadius: 10 }}
            >
              Reload the page
            </button>
          </div>

          {import.meta.env.DEV && (
            <pre
              style={{
                marginTop: 20,
                padding: '12px 14px',
                background: 'var(--muted)',
                borderRadius: 8,
                fontSize: 11.5,
                color: '#b91c1c',
                textAlign: 'left',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {error.message}
            </pre>
          )}
        </div>
      </div>
    )
  }
}
