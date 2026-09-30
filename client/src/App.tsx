import { AuthProvider, useAuth } from '@/hooks/useAuth'
import LoginPage from '@/components/auth/LoginPage'
import AppShell from '@/components/layout/AppShell'

function AppContent() {
  const { session, loading, profile } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <p style={{ marginTop: 14, fontSize: 13, color: 'var(--muted-foreground)', fontFamily: 'DM Mono' }}>Loading WINGTRACK...</p>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!session) return <LoginPage />

  // Logged in but profile not found or inactive — force sign-out
  if (!profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
        <div className="card" style={{ padding: '32px 28px', maxWidth: 360, textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, marginBottom: 10, color: 'var(--foreground)' }}>Access Denied</h2>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 20 }}>
            Your account does not have an active staff profile. Contact your Admin.
          </p>
          <button
            id="access-denied-signout"
            className="btn-ghost"
            onClick={() => { window.location.reload() }}
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  return <AppShell />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
