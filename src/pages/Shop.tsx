import { useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ShoppingBag, Sword, FlaskConical, ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import { useInventory } from '../hooks/useInventory'
import { WEAPON_CATALOG, POTION_CATALOG } from '../types/inventory'

type Tab = 'weapons' | 'potions'

// ── Tier labels & colours ─────────────────────────────────────────────────────
const TIER_LABEL = ['', 'Common', 'Rare', 'Epic']
const TIER_COLOR = ['', '#6b7280', '#a78bfa', '#f59e0b']
const TIER_BG    = ['', 'rgba(107,114,128,0.12)', 'rgba(167,139,250,0.12)', 'rgba(245,158,11,0.12)']
const TIER_BORDER = ['', 'rgba(107,114,128,0.3)', 'rgba(167,139,250,0.35)', 'rgba(245,158,11,0.4)']

// ── Toast notification ────────────────────────────────────────────────────────
interface Toast { id: number; message: string; ok: boolean }

export default function Shop() {
  const { inventory, buyWeapon, buyPotion, equipWeapon } = useInventory()
  const [tab, setTab]       = useState<Tab>('weapons')
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextToastId = useRef(1)

  const pushToast = (message: string, ok: boolean) => {
    const id = nextToastId.current++
    setToasts(prev => [...prev, { id, message, ok }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2200)
  }

  const handleBuyWeapon = async (weaponId: string) => {
    const item = WEAPON_CATALOG.find(w => w.id === weaponId)
    if (!item) return
    if (inventory.ownedWeaponIds.includes(weaponId)) return
    const ok = await buyWeapon(weaponId)
    if (ok) {
      await equipWeapon(weaponId)
      pushToast(`${item.icon} ${item.name} purchased & equipped!`, true)
    } else {
      pushToast('Purchase failed.', false)
    }
  }

  const handleBuyPotion = async (potionId: string) => {
    const item = POTION_CATALOG.find(p => p.id === potionId)
    if (!item) return
    const ok = await buyPotion(potionId)
    if (ok) pushToast(`${item.icon} ${item.name} added to bag!`, true)
    else pushToast('Purchase failed.', false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', padding: '0 0 60px' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(251,191,36,0.1))',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '28px 24px 20px',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <NavLink to="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: '#64748b', fontFamily: 'monospace', fontWeight: 600,
            textDecoration: 'none', marginBottom: 16,
          }}>
            <ArrowLeft size={13} />
            Back to Dashboard
          </NavLink>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShoppingBag size={26} color="#fbbf24" />
                Item Shop
              </h1>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>
                Spend gold earned from correct answers to power up!
              </p>
            </div>

            {/* Gold badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 12,
              background: 'rgba(251,191,36,0.12)', border: '1.5px solid rgba(251,191,36,0.35)',
              boxShadow: '0 0 20px rgba(251,191,36,0.15)',
            }}>
              <span style={{ fontSize: 22 }}>💰</span>
              <div>
                <div style={{ fontSize: 10, color: '#d97706', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }}>GOLD</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fbbf24', fontFamily: 'monospace', lineHeight: 1 }}>
                  {inventory.gold}g
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            {(['weapons', 'potions'] as Tab[]).map(t => {
              const Icon = t === 'weapons' ? Sword : FlaskConical
              const isActive = tab === t
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '8px 18px', borderRadius: 10, cursor: 'pointer',
                    fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                    textTransform: 'capitalize',
                    background: isActive ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${isActive ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    color: isActive ? '#fbbf24' : '#64748b',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={14} />
                  {t}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 760, margin: '28px auto 0', padding: '0 24px' }}>

        {/* ── Weapons tab ── */}
        {tab === 'weapons' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
            {WEAPON_CATALOG.map(item => {
              const owned   = inventory.ownedWeaponIds.includes(item.id)
              const equipped = inventory.equippedWeaponId === item.id
              const canAfford = inventory.gold >= item.price

              return (
                <div key={item.id} style={{
                  borderRadius: 14,
                  background: owned
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.07), rgba(5,150,105,0.04))'
                    : TIER_BG[item.tier],
                  border: `1.5px solid ${owned ? 'rgba(16,185,129,0.25)' : TIER_BORDER[item.tier]}`,
                  padding: '18px 16px',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* Tier badge */}
                  <div style={{
                    position: 'absolute', top: 10, right: 10,
                    fontSize: 9, fontFamily: 'monospace', fontWeight: 800, letterSpacing: 1,
                    color: TIER_COLOR[item.tier],
                    background: TIER_BG[item.tier],
                    border: `1px solid ${TIER_BORDER[item.tier]}`,
                    padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase',
                  }}>
                    {'★'.repeat(item.tier)} {TIER_LABEL[item.tier]}
                  </div>

                  <div style={{ fontSize: 36, marginBottom: 8 }}>{item.icon}</div>
                  <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: 15, marginBottom: 4 }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, lineHeight: 1.4 }}>
                    {item.description}
                  </div>
                  <div style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'monospace', fontWeight: 700, marginBottom: 12 }}>
                    +{item.attackBonus} ATK bonus
                  </div>

                  {owned ? (
                    <div style={{ display: 'flex', gap: 7 }}>
                      <div style={{
                        flex: 1, padding: '7px 0', borderRadius: 8, textAlign: 'center',
                        background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                        color: '#34d399', fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}>
                        <CheckCircle size={12} /> Owned
                      </div>
                      {!equipped && (
                        <button
                          onClick={() => equipWeapon(item.id)}
                          style={{
                            flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                            background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)',
                            color: '#fbbf24', fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                          }}
                        >
                          Equip
                        </button>
                      )}
                      {equipped && (
                        <div style={{
                          flex: 1, padding: '7px 0', borderRadius: 8, textAlign: 'center',
                          background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)',
                          color: '#fbbf24', fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                        }}>
                          ✓ Equipped
                        </div>
                      )}
                    </div>
                  ) : (
                      <button
                      onClick={() => handleBuyWeapon(item.id)}
                      style={{
                        width: '100%', padding: '8px 0', borderRadius: 9, cursor: 'pointer',
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 800,
                        transition: 'all 0.15s',
                        background: canAfford
                          ? `linear-gradient(135deg, ${TIER_COLOR[item.tier]}33, ${TIER_COLOR[item.tier]}22)`
                          : 'rgba(255,255,255,0.04)',
                        border: `1.5px solid ${canAfford ? TIER_BORDER[item.tier] : 'rgba(255,255,255,0.07)'}`,
                        color: canAfford ? TIER_COLOR[item.tier] : '#334155',
                        opacity: canAfford ? 1 : 0.6,
                      }}
                    >
                      {item.price === 0 ? '🎁 Free Starter' : `💰 ${item.price}g`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Potions tab ── */}
        {tab === 'potions' && (
          <div>
            <p style={{ color: '#475569', fontFamily: 'monospace', fontSize: 11, marginBottom: 20 }}>
              Use potions during battle to restore HP. Tap the potion button in the battle panel.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              {POTION_CATALOG.map(item => {
                const count     = inventory.potions.find(p => p.id === item.id)?.count ?? 0
                const canAfford = inventory.gold >= item.price

                return (
                  <div key={item.id} style={{
                    borderRadius: 14,
                    background: 'rgba(52,211,153,0.06)',
                    border: '1.5px solid rgba(52,211,153,0.2)',
                    padding: '18px 16px',
                  }}>
                    <div style={{ fontSize: 38, marginBottom: 8 }}>{item.icon}</div>
                    <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: 15, marginBottom: 4 }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                      {item.description}
                    </div>

                    {count > 0 && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 6, marginBottom: 10,
                        background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
                        color: '#34d399', fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                      }}>
                        <CheckCircle size={11} /> In bag: ×{count}
                      </div>
                    )}

                    <button
                      onClick={() => handleBuyPotion(item.id)}
                      style={{
                        width: '100%', padding: '8px 0', borderRadius: 9, cursor: 'pointer',
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 800,
                        background: canAfford ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.04)',
                        border: `1.5px solid ${canAfford ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.07)'}`,
                        color: canAfford ? '#34d399' : '#334155',
                        opacity: canAfford ? 1 : 0.6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        transition: 'all 0.15s',
                      }}
                    >
                      {canAfford ? <FlaskConical size={13} /> : <XCircle size={13} />}
                      {`💰 ${item.price}g  ·  Buy 1`}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Toast notifications ── */}
      <div style={{ position: 'fixed', bottom: 28, right: 20, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 10,
            background: t.ok ? 'rgba(5,150,105,0.95)' : 'rgba(185,28,28,0.92)',
            border: `1px solid ${t.ok ? 'rgba(52,211,153,0.5)' : 'rgba(252,165,165,0.4)'}`,
            color: 'white', fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            animation: 'slideIn 0.25s ease',
          }}>
            {t.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {t.message}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
