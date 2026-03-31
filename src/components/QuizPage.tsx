import { useState, useEffect, useRef } from 'react'
import {
  Headphones, Mic, BookOpen, PenTool,
  ChevronRight, RotateCcw, Loader2,
  CheckCircle, XCircle, FlaskConical, Play, Zap,
} from 'lucide-react'
import { BossChallenge, type BossChallengeRef } from './BossChallenge'
import { useInventory } from '../hooks/useInventory'
import type { BossType } from './BattleWidget'
import { getSavedCharacter } from '../hooks/useCharacter'
import { CHARACTER_CLASSES } from '../types/character'
import { fetchRandomQuestions, submitAnswers } from '../api/questions'
import type { Subject, Question, AIAnalysis } from '../types/api'
import type { Inventory } from '../types/inventory'

// ─── Subject config ───────────────────────────────────────────────────────────
const SUBJECT_CFG: Record<Subject, { label: string; labelCn: string; Icon: React.ComponentType<{ size?: number; color?: string }>; color: string; bg: string; border: string }> = {
  listening: { label: 'Listening', labelCn: '聆聽', Icon: Headphones, color: '#2563eb', bg: '#eff6ff',  border: '#bfdbfe' },
  speaking:  { label: 'Speaking',  labelCn: '說話', Icon: Mic,        color: '#059669', bg: '#ecfdf5',  border: '#a7f3d0' },
  reading:   { label: 'Reading',   labelCn: '閱讀', Icon: BookOpen,   color: '#d97706', bg: '#fffbeb',  border: '#fde68a' },
  writing:   { label: 'Writing',   labelCn: '寫作', Icon: PenTool,    color: '#dc2626', bg: '#fff1f2',  border: '#fecdd3' },
}

type Difficulty = 'Easy' | 'Medium' | 'Hard'
const DIFFICULTY_CFG: Record<Difficulty, { label: string; emoji: string; color: string; bg: string; border: string; glow: string }> = {
  Easy:   { label: '⚔ Easy',   emoji: '⚔', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', glow: '#05966920' },
  Medium: { label: '🛡 Medium', emoji: '🛡', color: '#d97706', bg: '#fffbeb', border: '#fde68a', glow: '#d9770620' },
  Hard:   { label: '💀 Hard',   emoji: '💀', color: '#dc2626', bg: '#fff1f2', border: '#fecdd3', glow: '#dc262620' },
}

function getBossType(subject: Subject, difficulty: string): BossType {
  const d = (difficulty ?? '').toLowerCase()
  const diff =
    d === 'medium' || d.startsWith('med') ? 'medium'
    : d === 'hard'   || d.startsWith('hard') ? 'hard'
    : 'easy'
  return `${subject}_${diff}` as BossType
}

function getOptionLetter(index: number): 'A' | 'B' | 'C' | 'D' {
  return String.fromCharCode(65 + index) as 'A' | 'B' | 'C' | 'D'
}

function normalizeCorrectAnswer(answer: string): 'A' | 'B' | 'C' | 'D' {
  if (!answer) return 'A'
  const match = answer.match(/^([A-D])/i)
  return match ? (match[1].toUpperCase() as 'A' | 'B' | 'C' | 'D') : 'A'
}

const LETTER_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  B: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  C: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  D: { bg: '#fff1f2', text: '#dc2626', border: '#fecdd3' },
}

type GamePhase = 'idle' | 'playing' | 'results'

type AIExplanation = AIAnalysis

// ─── AI Tutor Analysis Panel ──────────────────────────────────────────────────
const SUBJECT_ICON: Record<string, string> = {
  listening: '👂', speaking: '🎙️', reading: '📖', writing: '✍️',
}

function AIAnalysisPanel({
  qId, isCorrect, correctAnswer, subject, color, analysis,
}: {
  qId: string
  isCorrect: boolean
  correctAnswer: string
  subject: string
  color: string
  analysis?: AIExplanation | null
}) {
  const ex = analysis ?? null

  return (
    <div style={{
      borderRadius: 20,
      overflow: 'hidden',
      border: `1.5px solid ${isCorrect ? '#6ee7b7' : '#fca5a5'}`,
      boxShadow: `0 6px 28px ${isCorrect ? '#10b98118' : '#ef444418'}`,
      animation: 'aiPanelIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px',
        background: isCorrect
          ? 'linear-gradient(135deg, #064e3b, #065f46)'
          : 'linear-gradient(135deg, #7f1d1d, #991b1b)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>🤖</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>
              AI Tutor Analysis
            </div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.72)', fontFamily: 'monospace' }}>
              {SUBJECT_ICON[subject]} {subject.charAt(0).toUpperCase() + subject.slice(1)} · Question {qId.split('-q')[1]}
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 20,
          background: isCorrect ? 'rgba(52,211,153,0.25)' : 'rgba(252,165,165,0.25)',
          border: `1px solid ${isCorrect ? 'rgba(52,211,153,0.5)' : 'rgba(252,165,165,0.5)'}`,
          fontSize: 12.5, fontWeight: 800, color: isCorrect ? '#6ee7b7' : '#fca5a5',
        }}>
          {isCorrect ? '✓ Correct' : `✗ Answer: ${correctAnswer}`}
        </div>
      </div>

      {/* Body */}
      <div style={{
        background: 'linear-gradient(160deg, rgba(255,252,247,0.98), rgba(248,241,228,0.95))',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        {/* Why explanation */}
        <div style={{
          padding: '12px 15px', borderRadius: 12,
          background: '#fff', border: '1px solid #f0ece4',
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 900, color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            💡 Why this answer?
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
            {ex?.why ?? `The correct answer is ${correctAnswer}. Study the question again to understand the key concept.`}
          </p>
        </div>

        {/* Grammar + Vocab in two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{
            padding: '12px 13px', borderRadius: 12,
            background: '#eff6ff', border: '1px solid #bfdbfe',
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              📐 Grammar Tip
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#1e40af', lineHeight: 1.65 }}>
              {ex?.grammarTip ?? 'Review the grammatical structure of this type of question.'}
            </p>
          </div>
          <div style={{
            padding: '12px 13px', borderRadius: 12,
            background: '#fdf4ff', border: '1px solid #e9d5ff',
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              📚 Vocabulary Note
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#5b21b6', lineHeight: 1.65 }}>
              {ex?.vocabNote ?? 'Pay attention to word choice and register in context.'}
            </p>
          </div>
        </div>

        {/* Performance indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 13px', borderRadius: 10,
          background: isCorrect ? '#ecfdf5' : '#fff7ed',
          border: `1px solid ${isCorrect ? '#a7f3d0' : '#fed7aa'}`,
          fontSize: 13, color: isCorrect ? '#065f46' : '#92400e',
        }}>
          <span>{isCorrect ? '⭐' : '💪'}</span>
          <span style={{ fontWeight: 800 }}>
            {isCorrect
              ? 'Great work! You understood the concept correctly.'
              : 'Keep going! Review the explanation above and try similar questions to reinforce your understanding.'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main QuizPage ───────────────────────────────────────────────────────────
export default function QuizPage({ subject }: { subject: Subject }) {
  const cfg = SUBJECT_CFG[subject]
  const { Icon, color, bg, border } = cfg

  const savedChar = getSavedCharacter()
  const charClass = savedChar ? CHARACTER_CLASSES.find(c => c.id === savedChar.classId) : null
  const classId = charClass?.id ?? 'knight'

  // ── Difficulty selection ──────────────────────────────────────────────────
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('Easy')
  const [questions, setQuestions] = useState<Question[]>([])
  const [qLoading, setQLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Game state ────────────────────────────────────────────────────────────
  const [gamePhase, setGamePhase] = useState<GamePhase>('idle')
  const [currentQIdx, setCurrentQIdx] = useState(0)
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [locked, setLocked] = useState(false)
  const [sessionScore, setSessionScore] = useState(0)
  const [sessionResults, setSessionResults] = useState<{ correct: boolean; correctAnswer: string }[]>([])
  const [answersSoFar, setAnswersSoFar] = useState<Record<string, string>>({})
  const [currentAnalysis, setCurrentAnalysis] = useState<AIExplanation | null>(null)

  const { addGold, syncInventory } = useInventory()
  const battleRef = useRef<BossChallengeRef>(null)

  // ── Load random questions when difficulty changes ─────────────────────────
  const loadRandom = async (diff: Difficulty) => {
    setQLoading(true)
    setLoadError(null)
    setQuestions([])
    setGamePhase('idle')
    setCurrentQIdx(0)
    setSessionResults([])
    setSessionScore(0)
    setLocked(false)
    setFeedback(null)
    setSelectedLetter(null)
    setAnswersSoFar({})
    setCurrentAnalysis(null)

    try {
      const data = await fetchRandomQuestions(subject, diff, 12)
      setQuestions(data)
    } catch {
      setLoadError('Failed to load questions. Please try again.')
    } finally {
      setQLoading(false)
    }
  }

  useEffect(() => {
    // Pre-load questions for selected difficulty
    loadRandom(selectedDifficulty)
  }, [selectedDifficulty]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start game ────────────────────────────────────────────────────────────
  const handleStart = () => {
    if (questions.length === 0) return
    setGamePhase('playing')
    setCurrentQIdx(0)
    setSessionScore(0)
    setSessionResults([])
    setFeedback(null)
    setSelectedLetter(null)
    setLocked(false)
    setAnswersSoFar({})
    setCurrentAnalysis(null)
  }

  // ── Answer a question ─────────────────────────────────────────────────────
  const handlePickAnswer = async (letter: string) => {
    if (locked || feedback !== null) return
    const q = questions[currentQIdx]
    if (!q) return

    let correct = 'A'
    let isCorrect = false
    let analysis: AIExplanation | null = null
    let goldEarned: number | undefined
    let bossDamage: number | undefined
    let charDamage: number | undefined
    let updatedInventory: Inventory | undefined

    setLocked(true)

    const nextAnswers = { ...answersSoFar, [q.id]: letter }
    setAnswersSoFar(nextAnswers)

    try {
      const resp = await submitAnswers({
        subject,
        answers: nextAnswers,
      })
      updatedInventory = resp.updatedInventory
      const r = resp.results.find(rr => rr.questionId === q.id) ?? resp.results[0]

      isCorrect = !!r?.isCorrect
      correct = r?.correctAnswer ?? 'A'
      analysis = r?.analysis ?? null
      goldEarned = r?.goldEarned
      bossDamage = r?.bossDamage
      charDamage = r?.charDamage
    } catch (e) {
      console.error(e)
      isCorrect = false
      correct = 'A'
      analysis = null
      goldEarned = undefined
      bossDamage = undefined
      charDamage = undefined
      updatedInventory = undefined
    }

    const normalizedCorrectAnswer = normalizeCorrectAnswer(correct)
    setSelectedLetter(letter)
    setCorrectAnswer(normalizedCorrectAnswer)
    setCurrentAnalysis(analysis)
    setFeedback(isCorrect ? 'correct' : 'wrong')

    if (isCorrect) {
      setSessionScore(s => s + 1)
      if (updatedInventory) {
        syncInventory(updatedInventory)
      } else {
        const toAdd = typeof goldEarned === 'number' ? goldEarned : 0
        if (toAdd > 0) await addGold(toAdd)
      }
    }
    setSessionResults(prev => [...prev, { correct: isCorrect, correctAnswer: normalizedCorrectAnswer }])
    battleRef.current?.triggerVerdict({ isCorrect, bossDamage, charDamage })

    const nextIdx = currentQIdx + 1
    if (nextIdx >= questions.length) {
      setTimeout(() => battleRef.current?.resolveBattleEndByHealth(), 1200)
    }

    setTimeout(() => {
      if (nextIdx >= questions.length) {
        setGamePhase('results')
        setCurrentAnalysis(null)
      } else {
        setCurrentQIdx(nextIdx)
        setSelectedLetter(null)
        setCorrectAnswer(null)
        setCurrentAnalysis(null)
        setFeedback(null)
        setLocked(false)
      }
    }, 2500)
  }

  const handleReplay = () => {
    setGamePhase('idle')
    setCurrentQIdx(0)
    setSessionScore(0)
    setSessionResults([])
    setFeedback(null)
    setSelectedLetter(null)
    setLocked(false)
    setAnswersSoFar({})
    setCurrentAnalysis(null)
    loadRandom(selectedDifficulty)
  }

  const handleChangeDifficulty = (diff: Difficulty) => {
    setSelectedDifficulty(diff)
  }

  const currentQ = questions[currentQIdx] ?? null
  const totalQ = questions.length
  const xpEarned = sessionScore * 15

  const bossDifficulty = selectedDifficulty
  const bossType: BossType = getBossType(subject, bossDifficulty)

  return (
    <div className="max-w-[1500px] mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-5">
      <style>{`
        @keyframes aiPanelIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 animate-fade-in">

        {/* ── Left: Difficulty selector ──────────────────────────────────────── */}
        <div
          className="lg:col-span-3 rounded-[24px] p-4 space-y-3 self-start animate-fade-left"
          style={{
            background: 'linear-gradient(160deg, rgba(255,252,247,0.96), rgba(248,241,228,0.92))',
            border: '1px solid rgba(111,78,55,0.13)',
            boxShadow: '0 4px 20px rgba(83,57,37,0.07), inset 0 1px 0 rgba(255,255,255,0.6)',
          }}
        >
          {/* Subject header */}
          <div className="flex items-center gap-2.5 mb-3 pb-3" style={{ borderBottom: '1px solid rgba(111,78,55,0.10)' }}>
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${bg}, white)`, border: `1.5px solid ${border}` }}
            >
              <Icon size={17} color={color} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: '#1c1917' }}>{cfg.label}</div>
              <div className="text-xs font-mono-ui" style={{ color: 'rgba(111,78,55,0.50)', lineHeight: 1.3 }}>{cfg.labelCn} · DSE Paper</div>
              {loadError && (
                <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: '#cb4b2f' }}>
                  <FlaskConical size={10} /> {loadError}
                </div>
              )}
            </div>
          </div>

          {/* Difficulty buttons */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(111,78,55,0.50)', letterSpacing: '0.10em' }}>
              Difficulty
            </div>
            {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map((diff, i) => {
              const dc = DIFFICULTY_CFG[diff]
              const isSelected = selectedDifficulty === diff
              return (
                <button
                  key={diff}
                  onClick={() => handleChangeDifficulty(diff)}
                  className="w-full text-left px-3 py-2.5 rounded-2xl transition-all font-semibold text-sm"
                  style={{
                    animationDelay: `${i * 0.06}s`,
                    backgroundColor: isSelected ? dc.bg : 'rgba(255,255,255,0.45)',
                    border: `1.5px solid ${isSelected ? dc.border : 'rgba(111,78,55,0.10)'}`,
                    color: isSelected ? dc.color : '#78716b',
                    boxShadow: isSelected ? `0 3px 12px ${dc.glow}, inset 0 1px 0 rgba(255,255,255,0.7)` : 'none',
                    transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                  }}
                >
                  {dc.label}
                </button>
              )
            })}
          </div>

          {/* Status: questions loaded */}
          <div style={{ borderTop: '1px solid rgba(111,78,55,0.10)', paddingTop: 12 }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(111,78,55,0.50)', letterSpacing: '0.10em' }}>
              Quiz Info
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: '#78716b' }}>Questions</span>
                <span className="font-bold font-mono-ui" style={{ color }}>12 random</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: '#78716b' }}>Status</span>
                {qLoading ? (
                  <Loader2 size={12} className="animate-spin" color={color} />
                ) : questions.length > 0 ? (
                  <span className="font-bold" style={{ color: '#059669' }}>Ready</span>
                ) : (
                  <span style={{ color: '#a8a29e' }}>—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Game view ─────────────────────────────────────────────── */}
        <div className="lg:col-span-9 space-y-0 flex flex-col">

          {/* Battle arena */}
          <div
            className="rounded-t-[24px] overflow-hidden"
            style={{ border: `1.5px solid ${border}`, borderBottom: 'none', boxShadow: `0 8px 32px ${color}18` }}
          >
            <BossChallenge
              ref={battleRef}
              classId={classId}
              bossType={bossType}
              difficulty={bossDifficulty}
              arenaHeight="clamp(360px, 62vw, 620px)"
              bossScaleOverride={0.8}
            />
          </div>

          {/* Game area below arena */}
          <div
            className="rounded-b-[24px]"
            style={{
              background: 'linear-gradient(160deg, rgba(255,252,247,0.97), rgba(248,241,228,0.93))',
              border: `1.5px solid ${border}`,
              borderTop: `1px solid rgba(111,78,55,0.08)`,
              boxShadow: `0 8px 32px ${color}08, inset 0 1px 0 rgba(255,255,255,0.65)`,
            }}
          >
            {/* ── Idle: show quiz overview ─────────────────────────────── */}
            {gamePhase === 'idle' && (
              <div className="p-6 flex flex-col items-center text-center gap-5 animate-scale-in">
                {qLoading ? (
                  <div className="flex items-center gap-2 py-4">
                    <Loader2 size={18} color={color} className="animate-spin" />
                    <span className="text-sm" style={{ color: '#78716b' }}>Loading 12 random questions…</span>
                  </div>
                ) : questions.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <FlaskConical size={32} color={color} />
                    <p className="text-sm font-bold" style={{ color: '#78716b' }}>
                      No questions available for {selectedDifficulty}
                    </p>
                    <p className="text-xs" style={{ color: '#a8a29e' }}>Try a different difficulty level</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <h2 className="text-lg font-bold" style={{ color: '#1c1917' }}>
                        {DIFFICULTY_CFG[selectedDifficulty].emoji}{' '}
                        {cfg.label} — {selectedDifficulty}
                      </h2>
                      <p className="text-sm mt-1" style={{ color: '#78716b' }}>
                        12 random questions from the question pool
                      </p>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="text-center">
                        <div className="text-2xl font-black font-mono-ui" style={{ color }}>{questions.length}</div>
                        <div className="text-xs font-semibold" style={{ color: '#a8a29e' }}>Questions</div>
                      </div>
                      <div className="w-px h-10" style={{ backgroundColor: 'rgba(111,78,55,0.12)' }} />
                      <div className="text-center">
                        <div className="text-2xl font-black font-mono-ui" style={{ color: DIFFICULTY_CFG[selectedDifficulty].color }}>
                          {selectedDifficulty}
                        </div>
                        <div className="text-xs font-semibold" style={{ color: '#a8a29e' }}>Difficulty</div>
                      </div>
                    </div>
                    <button
                      onClick={handleStart}
                      className="flex items-center gap-2 px-8 py-3.5 rounded-[16px] text-base font-bold transition-all active:scale-95"
                      style={{
                        background: `linear-gradient(135deg, #2957c8, ${color} 78%)`,
                        color: 'white',
                        boxShadow: `0 6px 20px ${color}40`,
                      }}
                    >
                      <Play size={18} /> Start Battle
                    </button>
                    {charClass && (
                      <p className="text-xs" style={{ color: '#a8a29e' }}>
                        Fighting as {charClass.emoji} {charClass.name}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Playing ─────────────────────────────────────────────── */}
            {gamePhase === 'playing' && currentQ && (
              <div className="p-5 space-y-4 animate-fade-up">

                {/* Progress bar + counter */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold font-mono-ui flex-shrink-0" style={{ color }}>
                    Q {currentQIdx + 1} / {totalQ}
                  </span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: bg }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${((currentQIdx) / totalQ) * 100}%`,
                        background: `linear-gradient(90deg, ${color}88, ${color})`,
                      }}
                    />
                  </div>
                  {/* Dot indicators */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {questions.map((_, i) => (
                      <div
                        key={i}
                        className="rounded-full transition-all duration-300"
                        style={{
                          width: i === currentQIdx ? 18 : 8,
                          height: 8,
                          backgroundColor: i < currentQIdx
                            ? sessionResults[i]?.correct ? '#059669' : '#dc2626'
                            : i === currentQIdx ? color : '#f0ece4',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Question text */}
                <div
                  className="rounded-[18px] p-4"
                  style={{
                    background: `linear-gradient(135deg, ${bg}, rgba(255,255,255,0.6))`,
                    border: `1.5px solid ${border}`,
                    boxShadow: `0 2px 10px ${color}0c, inset 0 1px 0 rgba(255,255,255,0.7)`,
                  }}
                >
                  <p className="text-base font-semibold leading-relaxed" style={{ color: '#1c1917' }}>
                    {currentQ.text}
                  </p>
                </div>

                {/* Feedback banner */}
                {feedback && (
                  <div
                    className="rounded-[14px] px-4 py-3 flex items-center gap-3 text-sm font-bold animate-slide-down"
                    style={{
                      background: feedback === 'correct'
                        ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
                        : 'linear-gradient(135deg, #fff1f2, #ffe4e6)',
                      border: `1.5px solid ${feedback === 'correct' ? '#6ee7b7' : '#fca5a5'}`,
                      color: feedback === 'correct' ? '#059669' : '#dc2626',
                      boxShadow: feedback === 'correct' ? '0 2px 10px #05966918' : '0 2px 10px #dc262618',
                    }}
                  >
                    {feedback === 'correct'
                      ? <><CheckCircle size={16} /> Correct! +15 XP — Boss takes damage ⚔</>
                      : <><XCircle size={16} /> Wrong! Correct answer: <strong style={{ color: '#b91c1c' }}>{correctAnswer}</strong> — Boss strikes back 🛡</>
                    }
                  </div>
                )}

                {/* ABCD Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {currentQ.options.map((opt, idx) => {
                    const letter = getOptionLetter(idx)
                    const lc = LETTER_COLOR[letter] ?? LETTER_COLOR['A']
                    const isSelected = selectedLetter === letter
                    const isCorrectOpt = feedback !== null && letter === correctAnswer
                    const isWrongSelected = isSelected && feedback === 'wrong'

                    let cardBg = 'rgba(255,255,255,0.55)'
                    let cardBorder = 'rgba(111,78,55,0.10)'
                    let textColor = '#57534e'
                    if (isCorrectOpt)        { cardBg = 'linear-gradient(135deg,#ecfdf5,#d1fae5)'; cardBorder = '#6ee7b7'; textColor = '#065f46' }
                    else if (isWrongSelected) { cardBg = 'linear-gradient(135deg,#fff1f2,#ffe4e6)'; cardBorder = '#fca5a5'; textColor = '#9f1239' }
                    else if (isSelected)     { cardBg = `linear-gradient(135deg,${bg},rgba(255,255,255,0.7))`; cardBorder = border; textColor = color }

                    return (
                      <button
                        key={`${currentQ.id}-${idx}-${letter}`}
                        onClick={() => handlePickAnswer(letter)}
                        disabled={locked}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-[16px] text-left transition-all text-sm font-medium disabled:cursor-default"
                        style={{
                          background: cardBg,
                          border: `1.5px solid ${cardBorder}`,
                          color: textColor,
                          boxShadow: isSelected ? `0 3px 12px ${cardBorder}60, inset 0 1px 0 rgba(255,255,255,0.7)` : 'inset 0 1px 0 rgba(255,255,255,0.5)',
                          transform: isSelected ? 'scale(0.99)' : 'scale(1)',
                        }}
                        onMouseEnter={e => { if (!locked) (e.currentTarget.style.background = 'rgba(255,255,255,0.78)') }}
                        onMouseLeave={e => { if (!locked && !isSelected) (e.currentTarget.style.background = 'rgba(255,255,255,0.55)') }}
                      >
                        <span
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{
                            backgroundColor: isCorrectOpt ? '#059669' : isWrongSelected ? '#dc2626' : isSelected ? color : lc.bg,
                            color: (isCorrectOpt || isWrongSelected || isSelected) ? 'white' : lc.text,
                          }}
                        >
                          {isCorrectOpt ? '✓' : isWrongSelected ? '✗' : letter}
                        </span>
                        <span className="leading-snug">{String(opt ?? '').trim()}</span>
                      </button>
                    )
                  })}
                </div>

                {/* AI Tutor Analysis (shown after answering) */}
                {feedback && currentQ && (
                  <AIAnalysisPanel
                    qId={currentQ.id}
                    isCorrect={feedback === 'correct'}
                    correctAnswer={correctAnswer ?? ''}
                    subject={subject}
                    color={color}
                    analysis={currentAnalysis}
                  />
                )}
              </div>
            )}

            {/* ── Results ──────────────────────────────────────────────── */}
            {gamePhase === 'results' && (
              <div className="p-6 space-y-5 animate-scale-in">
                {/* Score banner */}
                <div
                  className="rounded-[22px] p-6 text-center"
                  style={{
                    background: sessionScore === totalQ
                      ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
                      : sessionScore >= totalQ / 2
                      ? 'linear-gradient(135deg, #fffbeb, #fef3c7)'
                      : 'linear-gradient(135deg, #fff1f2, #ffe4e6)',
                    border: `1.5px solid ${sessionScore === totalQ ? '#6ee7b7' : sessionScore >= totalQ / 2 ? '#fde68a' : '#fecdd3'}`,
                    boxShadow: sessionScore === totalQ
                      ? '0 6px 24px #05966920'
                      : sessionScore >= totalQ / 2
                      ? '0 6px 24px #d9770620'
                      : '0 6px 24px #dc262620',
                  }}
                >
                  <div className="text-5xl font-black font-mono-ui" style={{ color: sessionScore === totalQ ? '#059669' : sessionScore >= totalQ / 2 ? '#d97706' : '#dc2626' }}>
                    {sessionScore}<span className="text-2xl opacity-50">/{totalQ}</span>
                  </div>
                  <div className="text-sm font-bold mt-2" style={{ color: '#78716b' }}>
                    {sessionScore === totalQ ? '⚔ Perfect Score! Boss Defeated!' : sessionScore >= totalQ / 2 ? '🛡 Good effort! Keep practicing.' : '💀 Boss won this round! Try again.'}
                  </div>
                  <div className="inline-flex items-center gap-1.5 mt-3 px-4 py-1.5 rounded-full text-sm font-bold" style={{ background: 'rgba(217,150,43,0.12)', color: '#c77a1a', border: '1px solid rgba(217,150,43,0.25)' }}>
                    <Zap size={13} /> +{xpEarned} XP earned
                  </div>
                </div>

                {/* Per-question breakdown */}
                <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                  {sessionResults.map((r, i) => (
                    <div key={i} className="flex flex-col items-center gap-1 p-2 rounded-2xl"
                      style={{
                        background: r.correct
                          ? 'linear-gradient(135deg,#ecfdf5,#d1fae5)'
                          : 'linear-gradient(135deg,#fff1f2,#ffe4e6)',
                        border: `1px solid ${r.correct ? '#a7f3d0' : '#fecdd3'}`,
                      }}>
                      <span className="text-xs font-bold font-mono-ui" style={{ color: '#78716b' }}>Q{i + 1}</span>
                      {r.correct
                        ? <CheckCircle size={16} color="#059669" />
                        : <XCircle size={16} color="#dc2626" />}
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleReplay}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[16px] text-sm font-bold transition-all active:scale-95"
                    style={{
                      background: `linear-gradient(135deg, ${bg}, rgba(255,255,255,0.6))`,
                      color,
                      border: `1.5px solid ${border}`,
                      boxShadow: `0 2px 10px ${color}18`,
                    }}
                  >
                    <RotateCcw size={15} /> Try Again (New Questions)
                  </button>
                  <button
                    onClick={() => setGamePhase('idle')}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[16px] text-sm font-bold transition-all active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #2957c8, #d9962b 78%)',
                      color: 'white',
                      boxShadow: '0 6px 20px rgba(41,87,200,0.30)',
                    }}
                  >
                    <BookOpen size={15} /> Change Difficulty <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
