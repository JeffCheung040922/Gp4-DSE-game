import type { ReactNode } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import Navbar from './Navbar'

function RequireAuthGuard({ children }: { children: ReactNode }) {
  const hasCharacter = !!localStorage.getItem('dse_character')
  if (!hasCharacter) return <Navigate to="/character-select" replace />
  return <>{children}</>
}

export default function AppLayout() {
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

export { RequireAuthGuard }
