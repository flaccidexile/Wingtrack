import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
        padding: '24px 16px',
      }}
    >
      <div className="fade-in" style={{ width: '100%', maxWidth: 520 }}>
        {/* Logo Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: 'var(--sidebar)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
              boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
            }}
          >
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--sidebar-active)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6l9-3 9 3v12l-9 3-9-3V6z"/><path d="M12 3v18M3 6l9 3 9-3"/>
            </svg>
          </div>
          <h1
            style={{
              fontFamily: 'Fraunces',
              fontSize: 36,
              fontWeight: 700,
              color: 'var(--foreground)',
              lineHeight: 1.15,
            }}
          >
            <span style={{ color: 'var(--accent)' }}>WING</span>TRACK
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted-foreground)', marginTop: 8, fontWeight: 500 }}>
            Wing's Zone — Staff Portal
          </p>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="card"
          style={{
            padding: '42px 38px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            boxShadow: '0 12px 36px rgba(74, 46, 18, 0.08)',
          }}
        >
          <div>
            <label
              htmlFor="login-email"
              style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}
            >
              Email Address
            </label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="email"
              required
              placeholder="you@wingszone.ph"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', padding: '14px 16px', fontSize: 15 }}
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}
            >
              Password
            </label>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '14px 16px', fontSize: 15 }}
            />
          </div>

          {error && (
            <div
              style={{
                background: 'var(--danger-bg)',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                padding: '14px 16px',
                fontSize: 14,
                color: 'var(--danger)',
                fontWeight: 500,
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 3 }}>Sign In Error</div>
              <div>{error}</div>
              {error.toLowerCase().includes('failed to fetch') && (
                <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
                  Please ensure your real Supabase Project URL and Anon Key are set in <code>client/.env.local</code> and restart the server.
                </div>
              )}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ marginTop: 8, padding: '16px', fontSize: 16, fontWeight: 600, borderRadius: 10 }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span className="spinner" style={{ width: 18, height: 18 }} />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>

          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', textAlign: 'center', marginTop: 6, lineHeight: 1.5 }}>
            Staff credentials are provisioned by your Admin.
            <br />Contact your manager if you need access.
          </p>
        </form>
      </div>
    </div>
  )
}
