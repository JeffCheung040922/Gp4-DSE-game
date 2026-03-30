// ─── Mock data for guest users ───────────────────────────────────────────────
// When backend API calls fail for guest users, we fall back to this data
// so the UI is never empty and all features remain functional.

import type {
  DashboardStats,
  WeeklyStreak,
  WrongQuestionsReview,
  WrongAnswerAnalysis,
  SubjectStat,
  LiveBossTeaser,
  Subject,
} from '../types/api'
import type { Inventory } from '../types/inventory'

// ── Guest dashboard stats ────────────────────────────────────────────────────
export function getMockDashboardStats(): DashboardStats {
  return {
    totalXp: 0,
    level: 1,
    totalGold: 50,
    totalQuestionsAnswered: 0,
    correctRate: 0,
    longestStreak: 0,
    subjectStats: [] as SubjectStat[],
  }
}

// ── Guest weekly streak ──────────────────────────────────────────────────────
export function getMockWeeklyStreak(): WeeklyStreak {
  return {
    streakDays: [false, false, false, false, false, false, false],
    streakCount: 0,
  }
}

// ── Guest wrong questions (empty for new users) ─────────────────────────────
export function getMockWrongQuestions(): WrongQuestionsReview {
  return {
    entries: [],
  }
}

// ── Guest wrong answer analysis ─────────────────────────────────────────────
export function getMockWrongAnswerAnalysis(): WrongAnswerAnalysis {
  return {
    summary: [],
    tips: 'Welcome! Start practicing to unlock your personalised learning tips. Try a quick battle to get familiar with the game mechanics!',
    weakestSubject: null,
    weakSubjects: [],
  }
}

// ── Guest live boss teaser ────────────────────────────────────────────────────
export function getMockLiveBossTeaser(): LiveBossTeaser {
  const subjects = ['listening', 'speaking', 'reading', 'writing'] as const
  const randomSubject = subjects[Math.floor(Math.random() * subjects.length)]
  const colorMap: Record<string, string> = {
    listening: '#2563eb',
    speaking: '#059669',
    reading: '#d97706',
    writing: '#dc2626',
  }
  return {
    bossType: `${randomSubject}_easy`,
    difficulty: 'Easy',
    bossName: 'Practice Boss',
    bossHp: 100,
    bossMaxHp: 100,
    bossColor: colorMap[randomSubject],
    goldReward: 30,
    battleSubject: randomSubject,
  }
}

// ── Guest inventory (initial state) ─────────────────────────────────────────
export function getMockGuestInventory(): Inventory {
  return {
    gold: 50,
    ownedWeaponIds: ['starter_sword'],
    equippedWeaponId: 'starter_sword',
    potions: [],
  }
}

// ── Local guest progress storage ─────────────────────────────────────────────
const GUEST_PROGRESS_KEY = 'dse_guest_progress'

export interface GuestProgress {
  totalXp: number
  level: number
  totalGold: number
  totalQuestionsAnswered: number
  correctAnswers: number
  subjectStats: Record<string, { attempted: number; correct: number }>
  lastPlayedAt: string
}

function defaultGuestProgress(): GuestProgress {
  return {
    totalXp: 0,
    level: 1,
    totalGold: 50,
    totalQuestionsAnswered: 0,
    correctAnswers: 0,
    subjectStats: {},
    lastPlayedAt: new Date().toISOString(),
  }
}

export function loadGuestProgress(): GuestProgress {
  try {
    const raw = localStorage.getItem(GUEST_PROGRESS_KEY)
    if (!raw) return defaultGuestProgress()
    return { ...defaultGuestProgress(), ...JSON.parse(raw) }
  } catch {
    return defaultGuestProgress()
  }
}

export function saveGuestProgress(progress: GuestProgress) {
  try {
    localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(progress))
  } catch {
    // ignore
  }
}

export function calculateLevel(xp: number): number {
  // Level up every 200 XP
  return Math.max(1, Math.floor(xp / 200) + 1)
}

export function updateGuestProgressAfterQuiz(
  subject: string,
  totalQuestions: number,
  correctCount: number,
  xpEarned: number,
  goldEarned: number
): GuestProgress {
  const current = loadGuestProgress()

  const subjectStats = { ...current.subjectStats }
  const existing = subjectStats[subject] ?? { attempted: 0, correct: 0 }
  subjectStats[subject] = {
    attempted: existing.attempted + totalQuestions,
    correct: existing.correct + correctCount,
  }

  const newXp = current.totalXp + xpEarned
  const newLevel = calculateLevel(newXp)

  const next: GuestProgress = {
    totalXp: newXp,
    level: newLevel,
    totalGold: current.totalGold + goldEarned,
    totalQuestionsAnswered: current.totalQuestionsAnswered + totalQuestions,
    correctAnswers: current.correctAnswers + correctCount,
    subjectStats,
    lastPlayedAt: new Date().toISOString(),
  }

  saveGuestProgress(next)
  return next
}

export function getGuestDashboardStats(): DashboardStats {
  const progress = loadGuestProgress()
  const correctRate = progress.totalQuestionsAnswered > 0
    ? Math.round((progress.correctAnswers / progress.totalQuestionsAnswered) * 100)
    : 0

  const subjectStats: SubjectStat[] = Object.entries(progress.subjectStats).map(
    ([subject, stat]) => ({
      subject: subject as Subject,
      attempted: stat.attempted,
      correct: stat.correct,
      correctRate: stat.attempted > 0 ? Math.round((stat.correct / stat.attempted) * 100) : 0,
    })
  )

  return {
    totalXp: progress.totalXp,
    level: progress.level,
    totalGold: progress.totalGold,
    totalQuestionsAnswered: progress.totalQuestionsAnswered,
    correctRate,
    longestStreak: progress.totalQuestionsAnswered > 0 ? 1 : 0,
    subjectStats,
  }
}

export function getGuestWeeklyStreak(): WeeklyStreak {
  const progress = loadGuestProgress()
  const today = new Date()
  const streakDays = [false, false, false, false, false, false, false]

  if (progress.totalQuestionsAnswered > 0) {
    const playedDate = new Date(progress.lastPlayedAt)
    const daysDiff = Math.floor((today.getTime() - playedDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysDiff < 7) {
      streakDays[6 - daysDiff] = true
    }
  }

  const streakCount = streakDays.filter(Boolean).length
  return { streakDays, streakCount }
}

export function getGuestWrongAnswerAnalysis(): WrongAnswerAnalysis {
  const progress = loadGuestProgress()

  const weakSubjects = Object.entries(progress.subjectStats)
    .filter(([, stat]) => {
      const rate = stat.attempted > 0 ? (stat.correct / stat.attempted) * 100 : 0
      return rate > 0 && rate < 60
    })
    .map(([subject, stat]) => {
      const rate = (stat.correct / stat.attempted) * 100
      return { subject: subject as Subject, accuracy: rate }
    })
    .sort((a, b) => a.accuracy - b.accuracy)

  const summary: SubjectStat[] = Object.entries(progress.subjectStats).map(
    ([subject, stat]) => ({
      subject: subject as Subject,
      attempted: stat.attempted,
      correct: stat.correct,
      correctRate: stat.attempted > 0 ? Math.round((stat.correct / stat.attempted) * 100) : 0,
    })
  )

  const tips = progress.totalQuestionsAnswered === 0
    ? 'Welcome! Start practicing to unlock your personalised learning tips. Try a quick battle to get familiar with the game mechanics!'
    : 'Keep practicing! Little and often beats cramming — aim for 20 questions a day across different subjects. You\'re making great progress!'

  return {
    summary,
    tips,
    weakestSubject: weakSubjects[0]?.subject ?? null,
    weakSubjects,
  }
}

// ── Gold management for guests ────────────────────────────────────────────────
export function addGuestGold(amount: number) {
  const progress = loadGuestProgress()
  progress.totalGold = Math.max(0, progress.totalGold + amount)
  saveGuestProgress(progress)
  return progress.totalGold
}

export function getGuestGold(): number {
  return loadGuestProgress().totalGold
}
