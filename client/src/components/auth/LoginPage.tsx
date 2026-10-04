import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
              width: 88,
              height: 88,
              borderRadius: '50%',
              overflow: 'hidden',
              margin: '0 auto 18px',
              boxShadow: '0 10px 28px rgba(234,88,12,0.3)',
              border: '3px solid rgba(249,115,22,0.4)',
              background: '#ea580c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src="/logo.png"
              alt="Wingtrack Logo"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
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
            Wingtrack — Staff Portal
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
              placeholder="you@wingtrack.ph"
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
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', padding: '14px 46px 14px 16px', fontSize: 15 }}
              />
              <button
                type="button"
                id="toggle-login-password"
                onClick={() => setShowPassword(prev => !prev)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--muted-foreground)',
                  borderRadius: 6,
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
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
