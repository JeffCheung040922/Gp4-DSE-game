import type { ReactNode } from 'react'
import { Routes, Route, Outlet, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Listening from './pages/Listening'
import Speaking from './pages/Speaking'
import Reading from './pages/Reading'
import Writing from './pages/Writing'
import CharacterSelect from './pages/CharacterSelect'
import MultiplayerLobby from './pages/MultiplayerLobby'
import MultiplayerBattle from './pages/MultiplayerBattle'
import Shop from './pages/Shop'
import Login from './pages/Login'
import ErrorBoundary from './components/ErrorBoundary'
import { useAuth } from './hooks/useAuth'

function RequireAuthOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Redirects to /login if no user profile exists
function RequireAuthAndCharacter() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />

  const hasCharacter = !!localStorage.getItem('dse_character')
  if (!hasCharacter) return <Navigate to="/character-select" replace />

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: [
            'radial-gradient(circle at 18% 12%, rgba(217,150,43,0.18), transparent 24%)',
            'radial-gradient(circle at 82% 14%, rgba(41,87,200,0.14), transparent 20%)',
            'radial-gradient(circle at 50% 100%, rgba(203,75,47,0.12), transparent 28%)',
          ].join(', '),
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 'auto -8% -24% auto',
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(41,87,200,0.10), transparent 68%)',
          filter: 'blur(8px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const { user } = useAuth()

  return (
    <ErrorBoundary>
      <Routes>
      <Route
        path="/character-select"
        element={
          <RequireAuthOnly>
            <CharacterSelect />
          </RequireAuthOnly>
        }
      />
      <Route path="/login" element={user ? <Navigate to="/character-select" replace /> : <Login />} />

      <Route element={<RequireAuthAndCharacter />}>
        <Route index element={<Dashboard />} />
        <Route path="listening"  element={<Listening />} />
        <Route path="speaking"   element={<Speaking />} />
        <Route path="reading"    element={<Reading />} />
        <Route path="writing"     element={<Writing />} />
        <Route path="multiplayer" element={<MultiplayerLobby />} />
        <Route path="multiplayer/battle" element={<MultiplayerBattle />} />
        <Route path="shop" element={<Shop />} />
      </Route>
    </Routes>
    </ErrorBoundary>
  )
}
