import { useEffect, useMemo, useState } from 'react'
import type { SavedCharacter } from '../types/character'
import { logout as logoutApi } from '../api/auth'
import { createGuestSession, getStoredSessionToken, storeSessionToken } from '../api/guestAuth'

const AUTH_STORAGE_KEY = 'dse_user'
const AUTH_CHANGED_EVENT = 'dse-auth-changed'

export type AuthUser = {
  userId: string
  name: string
  isGuest: boolean
  sessionToken?: string
}

export function isGuestUser(user: AuthUser | null): boolean {
  return user?.isGuest ?? false
}

function loadAuth(): AuthUser | null {
  try {
    const lsRaw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (lsRaw) {
      const parsed = JSON.parse(lsRaw) as Partial<AuthUser>
      if (parsed?.userId && parsed?.name) {
        return {
          userId: parsed.userId,
          name: parsed.name,
          isGuest: parsed.isGuest ?? false,
          sessionToken: parsed.sessionToken,
        }
      }
    }
    const ssRaw = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (ssRaw) {
      const parsed = JSON.parse(ssRaw) as Partial<AuthUser>
      if (parsed?.userId && parsed?.name) {
        return {
          userId: parsed.userId,
          name: parsed.name,
          isGuest: parsed.isGuest ?? false,
          sessionToken: parsed.sessionToken,
        }
      }
    }
    return null
  } catch (error) {
    console.warn('Failed to load auth data:', error)
    return null
  }
}

export function getSavedUser(): AuthUser | null {
  return loadAuth()
}

export function useAuth() {
  const [user, setUserState] = useState<AuthUser | null>(() => loadAuth())
  const [isInitializing, setIsInitializing] = useState(false)

  useEffect(() => {
    const syncAuthState = () => setUserState(loadAuth())
    window.addEventListener(AUTH_CHANGED_EVENT, syncAuthState)
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncAuthState)
  }, [])

  /**
   * Try to restore a guest session from localStorage (called on app boot).
   * Falls back to creating a brand new guest session via the backend.
   */
  const initGuestSession = useMemo(
    () => async () => {
      if (user !== null) return // already have a user

      setIsInitializing(true)
      try {
        const storedToken = getStoredSessionToken()
        const resp = await createGuestSession(storedToken ?? undefined)

        storeSessionToken(resp.sessionToken)

        const guestUser: AuthUser = {
          userId: resp.userId,
          name: resp.name,
          isGuest: true,
          sessionToken: resp.sessionToken,
        }
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(guestUser))
        setUserState(guestUser)
        window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
      } catch (err) {
        console.error('Failed to init guest session:', err)
      } finally {
        setIsInitializing(false)
      }
    },
    [user]
  )

  const setUser = (next: AuthUser) => {
    if (next.isGuest) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      if (next.sessionToken) {
        storeSessionToken(next.sessionToken)
      }
    } else {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      localStorage.removeItem('dse_guest_session_token')
    }
    setUserState(next)
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  }

  const clearUser = async () => {
    if (!user?.isGuest) {
      try {
        await logoutApi()
      } catch (error) {
        console.warn('Logout failed, proceeding with local cleanup:', error)
      }
    }
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem('dse_guest_session_token')
    setUserState(null)
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  }

  const value = useMemo(
    () => ({ user, setUser, clearUser, isInitializing, initGuestSession }),
    [user, isInitializing, initGuestSession]
  )
  return value
}

export function overwriteSavedCharacterName(name: string) {
  try {
    const raw = localStorage.getItem('dse_character')
    if (!raw) return
    const parsed = JSON.parse(raw) as SavedCharacter
    if (!parsed?.classId) return
    localStorage.setItem('dse_character', JSON.stringify({ ...parsed, name }))
  } catch {
    // ignore
  }
}
