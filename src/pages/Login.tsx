import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth, overwriteSavedCharacterName, type AuthUser } from '../hooks/useAuth'
import { getSavedCharacter } from '../hooks/useCharacter'
import { CHARACTER_CLASSES } from '../types/character'
import { login } from '../api/auth'
import { register } from '../api/register'
import { createGuestSession } from '../api/guestAuth'

type AuthMode = 'login' | 'register'

export default function Login() {
  const navigate = useNavigate()
  const { user, setUser, clearUser } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState(user?.name ?? '')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const savedChar = getSavedCharacter()

  // 已用帳號登入才跳過登入頁；訪客可留在此頁以登入／註冊
  if (user && !user.isGuest) {
    return <Navigate to="/character-select" replace />
  }

  const handleSubmit = async () => {
    const trimmed = name.trim()
    const trimmedPwd = password.trim()
    if (!trimmed || !trimmedPwd) return

    setSubmitting(true)
    setError(null)

    try {
      if (mode === 'login') {
        const response = await login({ username: trimmed, password: trimmedPwd })
        const nextUser: AuthUser = { userId: response.userId, name: response.name, isGuest: false }
        setUser(nextUser)
        overwriteSavedCharacterName(response.name)
      } else {
        const response = await register({ username: trimmed, password: trimmedPwd, name: trimmed })
        const nextUser: AuthUser = { userId: response.userId, name: response.name, isGuest: false }
        setUser(nextUser)
        overwriteSavedCharacterName(response.name)
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (err.response?.status === 401 || err.response?.status === 403) {
          if (mode === 'login') {
            setError(err.response?.data?.error ?? 'Invalid username or password')
          } else {
            setError('Registration failed.')
          }
        } else if (err.response?.status === 409) {
          setError('Username already taken. Please choose a different username or log in instead.')
        } else if (err.response?.status === 404 || err.response?.status === 503) {
          setError('Backend server not reachable. Please check VITE_API_URL.')
        } else {
          setError(err.response?.data?.message ?? `${mode === 'login' ? 'Login' : 'Registration'} failed.`)
        }
        if (![401, 403, 404, 409, 503].includes(status || 0)) {
          console.error(`${mode} error:`, err)
        }
      } else {
        setError('An unexpected error occurred.')
        console.error(`${mode} error:`, err)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleGuest = async () => {
    setSubmitting(true)
    setError(null)

    try {
      const resp = await createGuestSession()
      const guestUser: AuthUser = {
        userId: resp.userId,
        name: resp.name,
        isGuest: true,
        sessionToken: resp.sessionToken,
      }
      setUser(guestUser)
      overwriteSavedCharacterName(guestUser.name)
      navigate('/character-select', { replace: true })
    } catch (err: unknown) {
      console.error('Guest session error:', err)
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404 || err.response?.status === 503) {
          setError('Backend server not reachable. Please check VITE_API_URL.')
        } else {
          setError(err.response?.data?.error ?? 'Failed to create guest session.')
        }
      } else {
        setError('Failed to start guest session.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Convert current guest account to a registered account.
   * Only available when a guest user is logged in.
   */
  const switchMode = (m: AuthMode) => {
    setMode(m)
    setError(null)
  }

  const cls = savedChar ? CHARACTER_CLASSES.find(c => c.id === savedChar.classId) : null

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: 'linear-gradient(180deg, #0b1020 0%, #0a1228 100%)' }}
    >
      <div className="w-full max-w-md">
        {/* Mode tabs */}
        <div className="flex rounded-xl overflow-hidden mb-6 border border-white/10">
          {(['login', 'register'] as AuthMode[]).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className="flex-1 py-3 text-sm font-bold transition-all"
              style={{
                background: mode === m ? 'rgba(99,102,241,0.16)' : 'transparent',
                color: mode === m ? '#e0e7ff' : '#64748b',
              }}
            >
              {m === 'login' ? 'Login' : 'Register'}
            </button>
          ))}
        </div>

        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div
            className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold mb-4"
            style={{ background: 'rgba(56,189,248,0.10)', color: '#7dd3fc', border: '1px solid rgba(56,189,248,0.24)' }}
          >
            English Quest Portal
          </div>

          <h2 className="text-2xl font-bold mb-1" style={{ color: '#f1f5f9' }}>
            {mode === 'login' ? 'Welcome back, adventurer' : 'Create your account'}
          </h2>
          <p className="text-sm mb-6" style={{ color: '#64748b' }}>
            {mode === 'login'
              ? 'Sign in to continue your quest run.'
              : 'Register to begin your first quest run.'}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>
                Username
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter username"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.10)', color: '#e2e8f0' }}
                maxLength={20}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.10)', color: '#e2e8f0' }}
                maxLength={30}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.20)' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !password.trim() || submitting}
            className="w-full mt-5 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #4f46e5, #f43f5e)',
              color: 'white',
              cursor: name.trim() && password.trim() && !submitting ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}
          </button>

          {mode === 'login' && (
            <>
              {user?.isGuest ? (
                <button
                  type="button"
                  onClick={() => navigate('/character-select', { replace: true })}
                  className="w-full mt-3 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-sky-400/10"
                  style={{ background: 'transparent', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }}
                >
                  以訪客繼續遊戲
                </button>
              ) : (
                <button
                  onClick={handleGuest}
                  disabled={submitting}
                  className="w-full mt-3 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-sky-400/10"
                  style={{ background: 'transparent', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }}
                >
                  Continue as Guest
                </button>
              )}
            </>
          )}

          <div className="mt-3 text-sm" style={{ color: '#64748b' }}>
            Tip: Press Enter to submit quickly.
          </div>

          {/* Saved character info */}
          {(savedChar || user) && (
            <div className="mt-5 pt-5 border-t border-white/8">
              {savedChar && cls && (
                <div className="text-sm mb-3" style={{ color: '#64748b' }}>
                  <span style={{ color: '#94a3b8' }}>Saved:</span> {savedChar.name} · {cls.name}
                </div>
              )}
              {user && (
                <button
                  onClick={async () => { await clearUser(); navigate('/', { replace: true }) }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Logout
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
