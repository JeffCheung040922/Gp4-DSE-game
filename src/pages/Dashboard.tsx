import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen, Mic, Headphones, PenTool,
  Flame, Trophy, ChevronRight,
  Skull, Users,
} from 'lucide-react'
import { useAuth, isGuestUser } from '../hooks/useAuth'
import { fetchWeeklyStreak, fetchWrongQuestionsReview, fetchDashboardStats } from '../api/dashboard'
import { fetchLiveBossTeaser } from '../api/teaser'
import type { Subject, WeeklyStreak, WrongQuestionsReview, DashboardStats, LiveBossTeaser } from '../types/api'

// ─── Subject cards ────────────────────────────────────────────────────────────
const subjectCards = [
  {
    path: '/listening', label: 'Listening', labelCn: '聆聽',
    desc: 'Paper 3 · Short answers & multiple choice',
    icon: Headphones, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe',
  },
  {
    path: '/speaking', label: 'Speaking', labelCn: '說話',
    desc: 'Paper 4 · Role-play & group discussion',
    icon: Mic, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0',
  },
  {
    path: '/reading', label: 'Reading', labelCn: '閱讀',
    desc: 'Paper 1 · Comprehension & vocabulary',
    icon: BookOpen, color: '#d97706', bg: '#fffbeb', border: '#fde68a',
  },
  {
    path: '/writing', label: 'Writing', labelCn: '寫作',
    desc: 'Paper 2 · Essays & formal letters',
    icon: PenTool, color: '#dc2626', bg: '#fff1f2', border: '#fecdd3',
  },
]

const streakDays = [true, true, true, false, true, true, false]

const SUBJECT_LABEL: Record<Subject, string> = {
  listening: 'Listening',
  speaking: 'Speaking',
  reading: 'Reading',
  writing: 'Writing',
}

const SUBJECT_COLOR: Record<Subject, string> = {
  listening: '#2563eb',
  speaking: '#059669',
  reading: '#d97706',
  writing: '#dc2626',
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()
  const isGuest = isGuestUser(user)
  const [weeklyStreak, setWeeklyStreak] = useState<WeeklyStreak | null>(null)
  const [wrongReview, setWrongReview] = useState<WrongQuestionsReview | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [teaser, setTeaser] = useState<LiveBossTeaser | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [ws, wr, st, ts] = await Promise.all([
          fetchWeeklyStreak(),
          fetchWrongQuestionsReview(),
          fetchDashboardStats(),
          fetchLiveBossTeaser(),
        ])
        if (cancelled) return
        setWeeklyStreak(ws)
        setWrongReview(wr)
        setStats(st)
        setTeaser(ts)
      } catch (e) {
        console.error(e)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const streakDaysEffective = weeklyStreak?.streakDays ?? streakDays
  const streakCountEffective = weeklyStreak?.streakCount ?? stats?.longestStreak ?? null
  const wrongEntries = wrongReview?.entries ?? []
  const wrongTotal = wrongEntries.reduce((sum, e) => sum + (e.wrongCount ?? 0), 0)
  const daysToExam = 78

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

      {/* ── Hero Banner ─────────────────────────────────────────────────────── */}
      <div
        className="rounded-[32px] p-6 sm:p-8 lg:p-9 flex flex-col lg:flex-row items-start lg:items-center gap-6 overflow-hidden relative animate-fade-up"
        style={{
          background: 'linear-gradient(135deg, rgba(255,251,243,0.96) 0%, rgba(250,235,196,0.92) 52%, rgba(244,235,218,0.96) 100%)',
          border: '1px solid rgba(201, 122, 26, 0.16)',
          boxShadow: '0 18px 50px rgba(109, 82, 44, 0.14), inset 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: [
              'radial-gradient(circle at 82% 18%, rgba(41,87,200,0.10), transparent 18%)',
              'radial-gradient(circle at 15% 85%, rgba(203,75,47,0.08), transparent 22%)',
            ].join(', '),
            pointerEvents: 'none',
          }}
        />
        {/* Character avatar */}
        <div
          className="w-24 h-24 rounded-[28px] flex items-center justify-center text-5xl flex-shrink-0 shadow-md relative z-10"
          style={{
            background: charClass
              ? `linear-gradient(135deg, ${charClass.color}20, ${charClass.color}55)`
              : 'linear-gradient(135deg, rgba(41,87,200,0.18), rgba(217,150,43,0.22))',
            border: charClass ? `2px solid ${charClass.color}50` : '2px solid rgba(41,87,200,0.18)',
            boxShadow: '0 16px 36px rgba(0,0,0,0.10)',
          }}
        >
          {charClass?.emoji ?? '⚔️'}
        </div>

        <div className="flex-1 relative z-10">
          <div className="text-xs uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: '#8f5712' }}>
            Daily command center
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: '#1c1917' }}>
            Welcome back, <span style={{ color: charClass?.color ?? '#2957c8' }}>{savedChar?.name ?? 'Hero'}</span>
          </h1>
          <p className="text-sm mt-2 leading-6 max-w-2xl" style={{ color: '#6f6258' }}>
            DSE 2026 · English ·{' '}
            <span className="font-semibold" style={{ color: '#cb4b2f' }}>{daysToExam} days</span> to exam
          </p>
          {charClass && (
            <button
              onClick={() => navigate('/character-select')}
              className="mt-4 flex items-center gap-2 text-sm px-4 py-2 rounded-full font-bold transition-all hover:opacity-80"
              style={{ backgroundColor: `${charClass.color}14`, color: charClass.color, border: `1px solid ${charClass.color}2f`, boxShadow: `0 10px 24px ${charClass.color}12` }}
            >
              <Swords size={12} /> {charClass.name} · Change class
            </button>
          )}
        </div>

        {/* Quick stats — real data from fetchDashboardStats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto relative z-10">
          {[
            {
              icon: Flame,
              label: 'Streak',
              value: stats ? `${stats.longestStreak} days` : '—',
              color: '#d97706',
              bg: '#fffbeb',
              border: '#fde68a',
            },
            {
              icon: Trophy,
              label: 'Level',
              value: stats ? String(stats.level) : '—',
              color: '#2563eb',
              bg: '#eff6ff',
              border: '#bfdbfe',
            },
            {
              icon: Zap,
              label: 'XP',
              value: stats ? String(stats.totalXp) : '—',
              color: '#7c3aed',
              bg: '#f5f3ff',
              border: '#ddd6fe',
            },
          ].map(({ icon: Icon, label, value, color, bg, border }) => (
            <div
              key={label}
              className="flex flex-col items-start px-4 py-4 rounded-3xl min-w-[92px]"
              style={{ backgroundColor: bg, border: `1px solid ${border}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}
            >
              <Icon size={16} color={color} />
              <div className="text-2xl font-bold mt-3" style={{ color }}>{value}</div>
              <div className="text-xs uppercase tracking-[0.16em] mt-1" style={{ color: '#7b6756' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Guest Mode Banner ───────────────────────────────────────────────── */}
      {isGuest && (
        <Link
          to="/login"
          className="group block rounded-[24px] overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg animate-fade-up"
          style={{
            background: 'linear-gradient(135deg, #1e293b, #0f172a 55%, #1e1b4b)',
            border: '1px solid rgba(99,102,241,0.30)',
            boxShadow: '0 8px 24px rgba(99,102,241,0.15)',
          }}
        >
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <UserPlus size={18} color="#818cf8" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold" style={{ color: '#e0e7ff' }}>
                Playing as Guest — Your progress is saved locally
              </div>
              <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                Create a free account to sync your progress across devices and unlock leaderboards
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl flex-shrink-0 font-bold text-sm"
              style={{ background: 'rgba(99,102,241,0.20)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
              Sign Up Free <ChevronRight size={14} />
            </div>
          </div>
        </Link>
      )}

      {/* ── Live Boss Teaser ──────────────────────────────────────────────────── */}
      {teaser && (
        <Link
          to={`/${teaser.battleSubject}`}
          className="group block rounded-[28px] overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-xl animate-fade-up-1"
          style={{
            background: `linear-gradient(135deg, ${teaser.bossColor}24, rgba(255,250,241,0.78))`,
            border: `1px solid ${teaser.bossColor}33`,
            boxShadow: `0 18px 32px ${teaser.bossColor}15`,
          }}
        >
          <div className="px-5 py-5 flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-3xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${teaser.bossColor}18` }}
            >
              <Skull size={24} color={teaser.bossColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-base font-bold" style={{ color: '#1c1917' }}>⚔️ Live Boss:</span>
                <span className="text-base font-bold" style={{ color: teaser.bossColor }}>{teaser.bossName}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: '#78716c' }}>
                <span className="font-semibold capitalize">{teaser.battleSubject}</span>
                <span>·</span>
                <span>{teaser.difficulty}</span>
                <span>·</span>
                <span>{teaser.bossHp}/{teaser.bossMaxHp} HP</span>
                {teaser.goldReward && (
                  <>
                    <span>·</span>
                    <span className="font-semibold" style={{ color: '#d97706' }}>🪙 {teaser.goldReward} Gold</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl flex-shrink-0"
              style={{ backgroundColor: `${teaser.bossColor}12`, border: `1px solid ${teaser.bossColor}20` }}>
              <span className="text-sm font-bold" style={{ color: teaser.bossColor }}>Challenge!</span>
              <ChevronRight size={14} color={teaser.bossColor} className="transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>
      )}

      {/* ── Co-op Banner ──────────────────────────────────────────────────────── */}
      <Link
        to="/multiplayer"
        className="block rounded-[28px] overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg animate-fade-up-2"
        style={{
          background: 'linear-gradient(135deg, #22305d, #2957c8 45%, #cb4b2f)',
          boxShadow: '0 18px 34px rgba(41,87,200,0.20)',
        }}
      >
        <div className="px-5 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-3xl bg-white/18 flex items-center justify-center flex-shrink-0 border border-white/15">
            <Users size={22} color="white" />
          </div>
          <div className="flex-1">
            <div className="text-base font-bold text-white">⚔ Co-op Battle Room</div>
            <div className="text-sm text-white/65 mt-0.5">Team up with classmates — fight the same boss together!</div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15">
            <span className="text-white text-sm font-bold">Up to 5 players</span>
            <ChevronRight size={14} color="white" />
          </div>
        </div>
      </Link>

      {/* ── 4 Subject Cards ───────────────────────────────────────────────────── */}
      <section className="animate-fade-up-3">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: '#8f5712' }}>Practice routes</div>
            <h2 className="text-2xl font-bold mt-1" style={{ color: '#1c1917' }}>Choose your subject run</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {subjectCards.map((s) => {
            const Icon = s.icon
            return (
              <Link
                key={s.path}
                to={s.path}
                className="group block rounded-[28px] overflow-hidden transition-all duration-200 hover:-translate-y-1 card-lift"
                style={{ backgroundColor: 'rgba(255,250,241,0.86)', border: `1px solid ${s.border}`, boxShadow: '0 16px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.65)' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = `0 20px 40px rgba(0,0,0,0.10), 0 0 0 2px ${s.color}20`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 16px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.65)'}
              >
                <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${s.color}cc, ${s.color}55)` }} />
                <div className="p-5 flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-3xl flex items-center justify-center flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: s.bg, border: `1px solid ${s.border}` }}
                  >
                    <Icon size={26} color={s.color} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold" style={{ color: '#1c1917' }}>{s.label}</span>
                      <span className="text-sm font-semibold" style={{ color: s.color }}>{s.labelCn}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#78716c' }}>{s.desc}</p>
                    {/* Progress from backend */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: s.bg, border: `1px solid ${s.border}` }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            backgroundColor: s.color,
                            width: `${(stats?.subjectStats.find(e => e.subject === s.path.slice(1))?.correctRate ?? 0) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold" style={{ color: s.color }}>
                        {stats
                          ? `${Math.round((stats.subjectStats.find(e => e.subject === s.path.slice(1))?.correctRate ?? 0) * 100)}%`
                          : '—%'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={18} color={s.color} className="flex-shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── Bottom Grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-up-4">

        {/* Wrong queue + review */}
        <div
          className="lg:col-span-2 rounded-[28px] p-5"
          style={{ backgroundColor: 'rgba(255,250,241,0.88)', border: '1px solid rgba(111,78,55,0.10)', boxShadow: '0 18px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.65)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <RotateCcw size={15} color="#dc2626" />
              <h2 className="text-sm font-bold" style={{ color: '#1c1917' }}>Wrong Questions Review</h2>
            </div>
            <span
              className="text-xs px-2 py-1 rounded-full font-medium"
              style={{ backgroundColor: '#fff1f2', color: '#dc2626', border: '1px solid #fecdd3' }}
            >
              {wrongReview ? `— ${wrongTotal} wrong` : '— pending'}
            </span>
          </div>

          <div className="space-y-2">
            {!wrongReview && (
              // Placeholder rows
              <>
                {(['listening', 'speaking', 'reading', 'writing'] as Subject[]).map((subject) => (
                  <div
                    key={subject}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: 'rgba(255,255,255,0.56)', border: '1px solid rgba(111,78,55,0.08)' }}
                  >
                    <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: '#e8e0d8' }} />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-48 rounded" style={{ backgroundColor: '#f0ece4' }} />
                      <div className="h-2.5 w-28 rounded" style={{ backgroundColor: '#f5f3ef' }} />
                    </div>
                    <div className="h-5 w-14 rounded-full" style={{ backgroundColor: '#f5f3ef' }} />
                  </div>
                ))}
              </>
            )}
            {wrongReview && (['listening', 'speaking', 'reading', 'writing'] as Subject[]).map((subject) => {
              const entry = wrongEntries.find(e => e.subject === subject)
              const count = entry?.wrongCount ?? 0
              return (
                <div
                  key={subject}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: 'rgba(255,255,255,0.56)', border: '1px solid rgba(111,78,55,0.08)' }}
                >
                  <div
                    className="w-1 h-10 rounded-full flex-shrink-0"
                    style={{ backgroundColor: SUBJECT_COLOR[subject] }}
                  />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-sm font-bold" style={{ color: '#1c1917' }}>{SUBJECT_LABEL[subject]}</div>
                      <div className="text-sm font-bold" style={{ color: SUBJECT_COLOR[subject], fontFamily: 'monospace' }}>
                        {count}
                      </div>
                    </div>
                    <div className="text-xs mt-1" style={{ color: '#a8a29e' }}>
                      wrong questions
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs mt-3 text-center" style={{ color: '#a8a29e' }}>
            {wrongReview ? 'Use these to review and improve.' : 'Wrong question data will be loaded from the backend'}
          </p>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Streak */}
          <div
            className="rounded-[28px] p-4"
            style={{ backgroundColor: 'rgba(255,250,241,0.88)', border: '1px solid rgba(111,78,55,0.10)', boxShadow: '0 18px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.65)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={14} color="#d97706" />
              <h3 className="text-sm font-bold" style={{ color: '#1c1917' }}>Weekly Streak</h3>
              <span className="ml-auto text-xs font-bold" style={{ color: '#d97706' }}>
                {streakCountEffective !== null ? `${streakCountEffective} days` : '— days'}
              </span>
            </div>
            <div className="flex justify-between gap-1">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                    style={{ backgroundColor: streakDaysEffective[i] ? '#fffbeb' : '#faf9f7', border: `1px solid ${streakDaysEffective[i] ? '#fde68a' : '#f0ece4'}` }}>
                    {streakDaysEffective[i] ? '🔥' : '·'}
                  </div>
                  <span className="text-xs" style={{ color: '#a8a29e' }}>{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Badges */}
          <div
            className="rounded-[28px] p-4"
            style={{ backgroundColor: 'rgba(255,250,241,0.88)', border: '1px solid rgba(111,78,55,0.10)', boxShadow: '0 18px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.65)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Star size={14} color="#d97706" />
              <h3 className="text-sm font-bold" style={{ color: '#1c1917' }}>Achievements</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { emoji: '🎯', label: 'Sharp Shooter', earned: false },
                { emoji: '📚', label: '50 Questions', earned: false },
                { emoji: '🔥', label: '7-Day Streak', earned: false },
                { emoji: '⚔️', label: 'Boss Slayer', earned: false },
                { emoji: '🏆', label: 'Top 10%', earned: false },
                { emoji: '✍️', label: 'Essay Master', earned: false },
              ].map(b => (
                <div key={b.label} className="flex flex-col items-center gap-1 p-2 rounded-xl text-center"
                  style={{ backgroundColor: '#faf9f7', border: '1px solid #f0ece4', opacity: 0.45 }}>
                  <span className="text-lg">{b.emoji}</span>
                  <span className="text-xs leading-tight" style={{ color: '#78716c' }}>{b.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-2 text-center" style={{ color: '#a8a29e' }}>Unlocked by backend progress</p>
          </div>
        </div>
      </div>
    </div>
  )
}
