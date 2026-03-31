import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BookOpen, Mic, Headphones, PenTool, Menu, X, Zap, Users, ShoppingBag, Sparkles, LogIn } from 'lucide-react'
import { useInventory } from '../hooks/useInventory'
import { useAuth } from '../hooks/useAuth'

const navItems = [
  { path: '/listening', label: 'Listening', labelCn: '聆聽', icon: Headphones, color: '#2957c8' },
  { path: '/speaking', label: 'Speaking', labelCn: '說話', icon: Mic, color: '#0f8a67' },
  { path: '/reading', label: 'Reading', labelCn: '閱讀', icon: BookOpen, color: '#c77a1a' },
  { path: '/writing', label: 'Writing', labelCn: '寫作', icon: PenTool, color: '#cb4b2f' },
  { path: '/multiplayer', label: 'Co-op', labelCn: '聯機', icon: Users, color: '#8a4db8' },
  { path: '/shop', label: 'Shop', labelCn: '商店', icon: ShoppingBag, color: '#a06a1b' },
]

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { inventory } = useInventory()
  const { user } = useAuth()
  const showAccountLogin = user?.isGuest

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <nav
        style={{
          background: 'linear-gradient(180deg, rgba(255,252,247,0.90), rgba(248,241,228,0.88))',
          border: '1px solid rgba(111, 78, 55, 0.12)',
          boxShadow: '0 10px 30px rgba(83, 57, 37, 0.10), inset 0 1px 0 rgba(255,255,255,0.55)',
          backdropFilter: 'blur(14px)',
          borderRadius: 24,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-[76px] gap-3 py-3">
            <NavLink to="/" className="flex items-center gap-3 min-w-0 group">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0"
                style={{
                  background: 'conic-gradient(from 220deg, #c77a1a, #2957c8, #cb4b2f, #c77a1a)',
                  color: '#fffaf3',
                }}
              >
                <Zap size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-base tracking-tight" style={{ color: '#20150f' }}>
                    DSE English Quest
                  </span>
                  <span
                    className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                    style={{
                      background: 'rgba(201, 122, 26, 0.12)',
                      color: '#8f5712',
                      border: '1px solid rgba(201, 122, 26, 0.22)',
                    }}
                  >
                    <Sparkles size={11} />
                    Questboard
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-medium" style={{ color: '#8b735d' }}>
                  Exam prep with battles, streaks, and boss runs
                </div>
              </div>
            </NavLink>

            <div
              className="hidden lg:flex items-center gap-2 rounded-full px-2 py-2"
              style={{ background: 'rgba(255,255,255,0.42)', border: '1px solid rgba(111, 78, 55, 0.08)' }}
            >
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200"
                    style={{
                      background: isActive ? `linear-gradient(135deg, ${item.color}22, ${item.color}0d)` : 'transparent',
                      color: isActive ? item.color : '#6d5b4d',
                      border: isActive ? `1px solid ${item.color}33` : '1px solid transparent',
                      boxShadow: isActive ? `0 8px 20px ${item.color}12` : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.72)'
                        e.currentTarget.style.color = '#20150f'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = '#6d5b4d'
                      }
                    }}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </div>

            <div className="hidden md:flex items-center gap-3">
              {showAccountLogin && (
                <NavLink
                  to="/login"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs sm:text-sm font-bold no-underline"
                  style={{
                    background: 'rgba(79, 70, 229, 0.10)',
                    color: '#4338ca',
                    border: '1px solid rgba(79, 70, 229, 0.22)',
                  }}
                >
                  <LogIn size={14} />
                  帳號登入
                </NavLink>
              )}
              <div
                className="px-3 py-2 rounded-full text-xs sm:text-sm font-semibold"
                style={{
                  background: 'rgba(41, 87, 200, 0.08)',
                  color: '#2957c8',
                  border: '1px solid rgba(41, 87, 200, 0.14)',
                }}
              >
                Daily grind mode
              </div>
              <NavLink
                to="/shop"
                className="flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-bold no-underline"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,245,214,0.95), rgba(249,228,170,0.9))',
                  color: '#8f5712',
                  border: '1px solid rgba(201, 122, 26, 0.28)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
                }}
              >
                <span>💰</span>
                <span className="font-mono-ui">{inventory.gold}g</span>
              </NavLink>
            </div>

            <button
              className="lg:hidden p-2.5 rounded-2xl transition-colors"
              style={{ color: '#6d5b4d', background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(111,78,55,0.10)' }}
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden px-4 pb-4 sm:px-6">
            <div
              className="rounded-3xl p-3 space-y-2"
              style={{
                border: '1px solid rgba(111, 78, 55, 0.10)',
                background: 'rgba(255,252,247,0.90)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
              }}
            >
              <div className="flex items-center justify-between px-2 py-1 gap-2 flex-wrap">
                <div className="text-sm font-semibold" style={{ color: '#8b735d' }}>Navigation</div>
                <div className="flex items-center gap-2">
                  {showAccountLogin && (
                    <NavLink
                      to="/login"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold no-underline"
                      style={{
                        background: 'rgba(79, 70, 229, 0.10)',
                        color: '#4338ca',
                        border: '1px solid rgba(79, 70, 229, 0.22)',
                      }}
                    >
                      <LogIn size={14} />
                      帳號登入
                    </NavLink>
                  )}
                  <NavLink
                    to="/shop"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold no-underline"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,245,214,0.95), rgba(249,228,170,0.9))',
                      color: '#8f5712',
                      border: '1px solid rgba(201, 122, 26, 0.28)',
                    }}
                  >
                    <span>💰</span>
                    <span className="font-mono-ui">{inventory.gold}g</span>
                  </NavLink>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.path

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-semibold transition-all"
                      style={{
                        background: isActive ? `linear-gradient(135deg, ${item.color}20, ${item.color}0d)` : 'rgba(255,255,255,0.66)',
                        color: isActive ? item.color : '#574536',
                        border: `1px solid ${isActive ? `${item.color}33` : 'rgba(111, 78, 55, 0.10)'}`,
                      }}
                    >
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${item.color}14` }}>
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className="font-semibold">{item.label}</div>
                        <div className="text-sm opacity-65">{item.labelCn}</div>
                      </div>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
