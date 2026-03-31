import type { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout, { RequireAuthGuard } from './components/AppLayout'
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
      <Route
        path="/login"
        element={user && !user.isGuest ? <Navigate to="/character-select" replace /> : <Login />}
      />

      <Route element={<RequireAuthGuard><AppLayout /></RequireAuthGuard>}>
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
