import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getSavedCharacter } from '../hooks/useCharacter'
import { type ClassId } from '../types/character'
import type { BossChallengeRef } from '../components/BossChallenge'
import { BossChallenge } from '../components/BossChallenge'
import type { BossType } from '../components/BattleWidget'
import { getMultiplayerSocket } from '../api/multiplayerSocket'
import { useAuth } from '../hooks/useAuth'

import type { Subject } from '../types/api'

import demonQueenUrl from '/assets/bosses/Skeleton_Mage.glb'
import ErrorBoundary from '../components/ErrorBoundary'

type Difficulty = 'Easy' | 'Medium' | 'Hard'

type ChoiceLetter = 'A' | 'B' | 'C' | 'D'

type MultiplayerPlayer = {
  id: string
  name: string
  classId: ClassId
  ready?: boolean 
  charHp?: number
}

type MultiplayerRoomState = {
  roomCode: string
  hostId?: string
  battleSubject?: Subject
  difficulty?: Difficulty | string
  bossType?: BossType | string
  bossHp?: number
  teamHp?: number
  status?: 'waiting' | 'playing' | 'finished'
  currentQuestion?: number
  totalQuestions?: number
  roundDeadlineTs?: number
  activeQuestion?: CoopQuestion
  players: MultiplayerPlayer[]
}

type CoopQuestion = {
  id: string
  no: number
  text: string
  options: string[]
}

const LETTER_COLOR: Record<ChoiceLetter, { bg: string; text: string; border: string }> = {
  A: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  B: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  C: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  D: { bg: '#fff1f2', text: '#dc2626', border: '#fecdd3' },
}

// Until backend emits real roomState, we only render the local player.
const OTHER_PLAYER_SLOTS = 4

function normalizeDifficulty(d: unknown): Difficulty {
  const s = typeof d === 'string' ? d.toLowerCase() : ''
  if (s === 'hard' || s.startsWith('hard')) return 'Hard'
  if (s === 'medium' || s.startsWith('med')) return 'Medium'
  return 'Easy'
}

function getOptionLetter(optionText: string, index: number): ChoiceLetter {
  const head = optionText.trim().slice(0, 1).toUpperCase()
  if (head === 'A' || head === 'B' || head === 'C' || head === 'D') {
    return head as ChoiceLetter
  }
  return (['A', 'B', 'C', 'D'][index] ?? 'A') as ChoiceLetter
}

export default function MultiplayerBattle() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const roomCode = (searchParams.get('roomCode') ?? '').toUpperCase()

  const { user } = useAuth()
  const localPlayer = useMemo<MultiplayerPlayer | null>(() => {
    const savedChar = getSavedCharacter()
    return savedChar
      ? {
          id: user?.userId ?? `local-${savedChar.classId}-${savedChar.name}`,
          name: user?.name ?? savedChar.name,
          classId: savedChar.classId,
        }
      : null
  }, [user?.name, user?.userId])

  // Room state (set by backend `roomState` event).
  const [roomState, setRoomState] = useState<MultiplayerRoomState | null>(null)
  const [bossHp, setBossHp] = useState(100)
  const [yourCharHp, setYourCharHp] = useState(100)
  const [question, setQuestion] = useState<CoopQuestion | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<ChoiceLetter | null>(null)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [roundDeadlineTs, setRoundDeadlineTs] = useState<number | null>(null)
  const [battleNote, setBattleNote] = useState<string>('Waiting for host to start the battle round...')
  const [gameResult, setGameResult] = useState<'victory' | 'defeat' | 'exhausted' | null>(null)
  const [finalScores, setFinalScores] = useState<Array<{ id: string; name: string; classId: ClassId; score: number; charHp: number }> | null>(null)
  const [myRoomPlayerId, setMyRoomPlayerId] = useState<string | null>(null)
  const myRoomPlayerIdRef = useRef<string | null>(null)
  const socket = useMemo(() => getMultiplayerSocket(), [])
  const [connected, setConnected] = useState(() => socket.connected)

  useEffect(() => {
    if (!roomCode || !localPlayer) return

    const requestRoomSync = () => {
      socket.emit('getRoomState', { roomCode })
    }

    const onConnect = () => {
      setConnected(true)
      socket.emit('joinRoom', {
        roomCode,
        playerName: localPlayer.name,
        classId: localPlayer.classId,
      })
      requestRoomSync()
    }
    const onDisconnect = () => setConnected(false)

    const onRoomState = (state: {
      roomCode?: string
      id?: string
      hostId?: string
      subject?: Subject
      battleSubject?: Subject
      difficulty?: Difficulty | string
      bossType?: BossType | string
      bossHp?: number
      teamHp?: number
      status?: 'waiting' | 'playing' | 'finished'
      currentQuestion?: number
      totalQuestions?: number
      roundDeadlineTs?: number
      activeQuestion?: {
        id?: string
        no?: number
        text?: string
        options?: string[]
      }
      players?: Array<{
        id?: string
        playerId?: string
        name?: string
        classId?: ClassId
        ready?: boolean
        charHp?: number
      }>
    }) => {
      const normalizedPlayers: MultiplayerPlayer[] = (state.players ?? [])
        .map(p => ({
          id: p.id ?? p.playerId ?? '',
          name: p.name ?? 'Player',
          classId: (p.classId ?? 'knight') as ClassId,
          ready: p.ready,
          charHp: p.charHp,
        }))
        .filter(p => p.id.length > 0)

      const normalizedState: MultiplayerRoomState = {
        roomCode: (state.roomCode ?? state.id ?? roomCode).toUpperCase(),
        hostId: state.hostId,
        battleSubject: state.battleSubject ?? state.subject,
        difficulty: state.difficulty,
        bossType: state.bossType,
        bossHp: state.bossHp,
        teamHp: state.teamHp,
        status: state.status,
        currentQuestion: state.currentQuestion,
        totalQuestions: state.totalQuestions,
        roundDeadlineTs: state.roundDeadlineTs,
        activeQuestion: state.activeQuestion && state.activeQuestion.id && state.activeQuestion.text && Array.isArray(state.activeQuestion.options)
          ? {
              id: state.activeQuestion.id,
              no: state.activeQuestion.no ?? ((state.currentQuestion ?? 0) + 1),
              text: state.activeQuestion.text,
              options: state.activeQuestion.options,
            }
          : undefined,
        players: normalizedPlayers,
      }

      setRoomState(normalizedState)
      if (typeof normalizedState.bossHp === 'number') setBossHp(normalizedState.bossHp)
      if (typeof normalizedState.teamHp === 'number') setYourCharHp(normalizedState.teamHp)
      if (typeof normalizedState.roundDeadlineTs === 'number') {
        setRoundDeadlineTs(normalizedState.roundDeadlineTs)
      }

      if (normalizedState.status === 'playing' && normalizedState.activeQuestion) {
        setQuestion((prev) => {
          if (prev?.id === normalizedState.activeQuestion?.id) return prev
          return normalizedState.activeQuestion ?? null
        })
      }

      const mineByUserId = user?.userId
        ? normalizedState.players.find((p) => p.id === user.userId)
        : null
      const localIdentityMatches = normalizedState.players.filter((p) => (
        p.name === localPlayer.name && p.classId === localPlayer.classId
      ))
      const mineByLocalIdentity = !user?.userId && localIdentityMatches.length === 1
        ? localIdentityMatches[0]
        : null
      const mine = mineByUserId ?? mineByLocalIdentity ?? null

      if (mine?.id && mine.id !== myRoomPlayerIdRef.current) {
        myRoomPlayerIdRef.current = mine.id
        setMyRoomPlayerId(mine.id)
      }
      if (typeof normalizedState.teamHp !== 'number' && typeof mine?.charHp === 'number') {
        setYourCharHp(mine.charHp)
      }
    }

    const onQuestionRound = (payload: {
      question?: {
        id?: string
        no?: number
        text?: string
        options?: string[]
      }
      timeLimitSec?: number
      deadlineTs?: number
      totalQuestions?: number
    }) => {
      const q = payload.question
      if (!q?.id || !q?.text || !Array.isArray(q.options)) return
      setQuestion({
        id: q.id,
        no: q.no ?? 1,
        text: q.text,
        options: q.options,
      })
      setSelectedAnswer(null)
      setHasSubmitted(false)
      setBattleNote('Answer correct to damage the boss. Collaborate with your teammates to win the battle!')
      if (typeof payload.deadlineTs === 'number') {
        setRoundDeadlineTs(payload.deadlineTs)
      } else if (typeof payload.timeLimitSec === 'number') {
        setRoundDeadlineTs(Date.now() + payload.timeLimitSec * 1000)
      }
    }

    const onBattleUpdate = (payload: {
      correctAnswer?: string
      bossHp?: number
      teamHp?: number
      players?: Array<{ id?: string; charHp?: number; score?: number }>
      verdicts?: Array<{
        playerId?: string
        answer?: string
        isCorrect?: boolean
        bossDamage?: number
        charDamage?: number
      }>
    }) => {
      if (typeof payload.bossHp === 'number') setBossHp(payload.bossHp)
      if (typeof payload.teamHp === 'number') setYourCharHp(payload.teamHp)

      const selfId = myRoomPlayerIdRef.current ?? user?.userId ?? localPlayer.id
      const hpRow = payload.players?.find((p) => p.id === selfId)
      if (typeof payload.teamHp !== 'number' && typeof hpRow?.charHp === 'number') setYourCharHp(hpRow.charHp)

      const myVerdict = payload.verdicts?.find((v) => v.playerId === selfId)
      if (myVerdict) {
        // BossChallenge is in external-HP mode (props externalBossHp/externalCharHp are set),
        // so it will only play animations + show float text — HP bar mutations are bypassed.
        battleRef.current?.triggerVerdict({
          isCorrect: Boolean(myVerdict.isCorrect),
          bossDamage: myVerdict.bossDamage,
          charDamage: myVerdict.charDamage,
        })

        if (myVerdict.isCorrect) {
          setBattleNote(`Correct. You dealt ${myVerdict.bossDamage ?? 0} damage to the boss.`)
        } else {
          setBattleNote(`Wrong (${myVerdict.answer || 'no answer'}). Boss dealt ${myVerdict.charDamage ?? 0} damage to your team.`)
        }
      }

      setQuestion(null)
      setRoundDeadlineTs(null)
      setHasSubmitted(false)
    }

    const onGameFinished = (payload: { reason?: string; room?: { players?: Array<{ id?: string; name?: string; classId?: ClassId; score?: number; charHp?: number }> } }) => {
      const reason = payload?.reason ?? 'battle_finished'
      if (reason === 'boss_defeated') {
        setGameResult('victory')
      } else if (reason === 'players_defeated') {
        setGameResult('defeat')
      } else {
        setGameResult('exhausted')
      }
      const rawPlayers = payload?.room?.players ?? []
      if (rawPlayers.length > 0) {
        setFinalScores(
          rawPlayers
            .filter(p => p.id)
            .map(p => ({
              id: p.id!,
              name: p.name ?? 'Player',
              classId: (p.classId ?? 'knight') as ClassId,
              score: p.score ?? 0,
              charHp: p.charHp ?? 0,
            }))
            .sort((a, b) => b.score - a.score)
        )
      }
      setQuestion(null)
      setRoundDeadlineTs(null)
    }

    const onBattleStarted = () => {
      setBattleNote('Battle started. First question incoming...')
    }

    const onBattleStartError = (payload: { message?: string }) => {
      setBattleNote(payload?.message ?? 'Unable to start battle round.')
    }

    const onSocketError = (payload: { message?: string }) => {
      console.warn('[socket error]', payload?.message)
      setBattleNote(`Connection error: ${payload?.message ?? 'Check your connection.'}`)
    }

    // NOTE: event names are "contract placeholders".
    // When your backend is ready, make it emit `roomState` and `battleUpdate`.
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('roomState', onRoomState)
    socket.on('questionRound', onQuestionRound)
    socket.on('battleUpdate', onBattleUpdate)
    socket.on('gameFinished', onGameFinished)
    socket.on('battleStarted', onBattleStarted)
    socket.on('battleStartError', onBattleStartError)
    socket.on('error', onSocketError)

    socket.emit('joinRoom', {
      roomCode,
      playerName: localPlayer.name,
      classId: localPlayer.classId,
    })
    requestRoomSync()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('roomState', onRoomState)
      socket.off('questionRound', onQuestionRound)
      socket.off('battleUpdate', onBattleUpdate)
      socket.off('gameFinished', onGameFinished)
      socket.off('battleStarted', onBattleStarted)
      socket.off('battleStartError', onBattleStartError)
      socket.off('error', onSocketError)
      socket.emit('leaveRoom')
    }
  }, [socket, roomCode, localPlayer, user?.userId])

  const secondsLeft = useMemo(() => {
    if (!roundDeadlineTs) return 0
    return Math.max(0, Math.ceil((roundDeadlineTs - nowMs) / 1000))
  }, [roundDeadlineTs, nowMs])

  useEffect(() => {
    if (!roundDeadlineTs) return
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [roundDeadlineTs])

  const submitAnswer = (choice: ChoiceLetter) => {
    if (!question || hasSubmitted) return
    setSelectedAnswer(choice)
    setHasSubmitted(true)
    socket.emit('submitAnswer', { roomCode, answer: choice })
    setBattleNote(`Answer ${choice} submitted. Waiting for teammates...`)
  }

  const battleRef = useRef<BossChallengeRef>(null)

  const ARENA_HEIGHT = 'clamp(340px, 58vw, 560px)'
  const { myClassId, extraPlayers, bossType, difficulty } = useMemo(() => {
    const myClassId = localPlayer?.classId ?? 'knight'
    const players = roomState?.players ?? []
    const difficulty = normalizeDifficulty(roomState?.difficulty ?? 'Easy')

    const bossTypeRaw = roomState?.bossType ?? 'grammar_golem'
    const bossType = (typeof bossTypeRaw === 'string' && bossTypeRaw in {
      speaking_easy: 1,
      speaking_medium: 1,
      speaking_hard: 1,
      writing_easy: 1,
      writing_medium: 1,
      writing_hard: 1,
      listening_easy: 1,
      listening_medium: 1,
      listening_hard: 1,
      reading_easy: 1,
      reading_medium: 1,
      reading_hard: 1,
      grammar_golem: 1,
      vocab_vampire: 1,
      tense_tyrant: 1,
      essay_empress: 1,
      phonics_phantom: 1,
    }) ? (bossTypeRaw as BossType) : 'grammar_golem'

    const localIds = new Set<string>()
    if (localPlayer?.id) localIds.add(localPlayer.id)
    if (user?.userId) localIds.add(user.userId)
    if (myRoomPlayerId) localIds.add(myRoomPlayerId)

    const extraPlayers = players
      .filter(p => !localIds.has(p.id))
      .slice(0, OTHER_PLAYER_SLOTS)
      .map(p => ({ playerId: p.id, classId: p.classId, name: p.name }))

    return { myClassId, extraPlayers, bossType, difficulty }
  }, [localPlayer, roomState, user, myRoomPlayerId])

  const isHost = Boolean(
    roomState?.hostId
    && [myRoomPlayerId, user?.userId, localPlayer?.id].some((id) => id === roomState.hostId)
  )
  const playerCount = roomState?.players?.length ?? 1

  const handleStartBattle = () => {
    if (!roomCode) return
    socket.emit('startBattle', { roomCode })
    setBattleNote('Starting battle...')
  }

  if (!localPlayer) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div style={{ fontFamily: 'monospace', color: '#dc2626', fontWeight: 800 }}>
          Please create/select your character first.
        </div>
        <button
          onClick={() => navigate('/character-select')}
          style={{ marginTop: 14, padding: '8px 12px', borderRadius: 10, background: '#2563eb', color: 'white', fontWeight: 800 }}
        >
          Go to Character Select
        </button>
      </div>
    )
  }

  if (gameResult) {
    const isVictory = gameResult === 'victory'
    const isDefeat = gameResult === 'defeat'
    const scores = finalScores ?? roomState?.players?.map(p => ({ id: p.id, name: p.name, classId: p.classId, score: 0, charHp: p.charHp ?? 0 })) ?? []
    const selfId = myRoomPlayerId ?? user?.userId ?? localPlayer.id

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div
          style={{
            borderRadius: 24,
            overflow: 'hidden',
            border: `2px solid ${isVictory ? '#fbbf24' : isDefeat ? '#dc2626' : '#6366f1'}`,
            boxShadow: isVictory
              ? '0 0 60px rgba(251,191,36,0.25), 0 8px 32px rgba(0,0,0,0.3)'
              : isDefeat
              ? '0 0 60px rgba(220,38,38,0.25), 0 8px 32px rgba(0,0,0,0.3)'
              : '0 8px 32px rgba(0,0,0,0.3)',
            background: isVictory
              ? 'linear-gradient(160deg, #1c1408 0%, #2d1f00 50%, #0f0f0f 100%)'
              : isDefeat
              ? 'linear-gradient(160deg, #1a0505 0%, #2d0808 50%, #0f0f0f 100%)'
              : 'linear-gradient(160deg, #0f0c2e 0%, #1e1b4b 50%, #0f0f0f 100%)',
          }}
        >
          {/* Header banner */}
          <div style={{
            padding: '40px 32px 28px',
            textAlign: 'center',
            borderBottom: `1px solid ${isVictory ? 'rgba(251,191,36,0.2)' : isDefeat ? 'rgba(220,38,38,0.2)' : 'rgba(99,102,241,0.2)'}`,
          }}>
            <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 12 }}>
              {isVictory ? '🏆' : isDefeat ? '💀' : '⚔️'}
            </div>
            <div style={{
              fontFamily: 'monospace',
              fontWeight: 900,
              fontSize: 36,
              letterSpacing: 4,
              color: isVictory ? '#fbbf24' : isDefeat ? '#ef4444' : '#818cf8',
              textShadow: isVictory
                ? '0 0 30px rgba(251,191,36,0.6)'
                : isDefeat
                ? '0 0 30px rgba(239,68,68,0.6)'
                : '0 0 30px rgba(129,140,248,0.6)',
            }}>
              {isVictory ? 'VICTORY' : isDefeat ? 'DEFEAT' : 'BATTLE OVER'}
            </div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: 14,
              color: isVictory ? '#fde68a' : isDefeat ? '#fca5a5' : '#c7d2fe',
              marginTop: 10,
              fontWeight: 600,
            }}>
              {isVictory
                ? 'The team vanquished the Dark Demon Queen!'
                : isDefeat
                ? 'The party was defeated by the Dark Demon Queen.'
                : 'All questions answered. The battle concludes.'}
            </div>
          </div>

          {/* Scoreboard */}
          <div style={{ padding: '28px 32px' }}>
            <div style={{
              fontFamily: 'monospace',
              fontWeight: 900,
              color: '#94a3b8',
              fontSize: 11,
              letterSpacing: 3,
              textTransform: 'uppercase',
              marginBottom: 14,
            }}>Final Scores</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {scores.map((player, idx) => {
                const isSelf = player.id === selfId
                const rankColors = ['#fbbf24', '#94a3b8', '#cd7c2f']
                const rankColor = rankColors[idx] ?? '#475569'
                const medals = ['🥇', '🥈', '🥉']
                return (
                  <div
                    key={player.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '14px 18px',
                      borderRadius: 14,
                      background: isSelf
                        ? isVictory ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.06)'
                        : 'rgba(255,255,255,0.04)',
                      border: isSelf
                        ? `1.5px solid ${isVictory ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.15)'}` 
                        : '1.5px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div style={{ fontSize: 22, width: 30, textAlign: 'center', flexShrink: 0 }}>
                      {medals[idx] ?? `#${idx + 1}`}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'monospace',
                        fontWeight: 900,
                        color: isSelf ? '#f8fafc' : '#cbd5e1',
                        fontSize: 15,
                      }}>
                        {player.name}{isSelf ? ' (you)' : ''}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        {player.classId}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 20, color: rankColor }}>
                        {player.score}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#475569', marginTop: 1 }}>pts</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{
            padding: '20px 32px 32px',
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
            borderTop: 'rgba(255,255,255,0.06) 1px solid',
          }}>
            <button
              onClick={() => navigate('/multiplayer')}
              style={{
                padding: '12px 28px',
                borderRadius: 12,
                border: '1.5px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.07)',
                color: '#e2e8f0',
                fontFamily: 'monospace',
                fontWeight: 800,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ← Back to Lobby
            </button>
            {isVictory && (
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  padding: '12px 28px',
                  borderRadius: 12,
                  border: '1.5px solid #fbbf24',
                  background: 'linear-gradient(135deg, #78350f, #92400e)',
                  color: '#fde68a',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                🏆 View Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
      <div
        className="rounded-2xl p-4 flex items-center justify-between gap-4"
        style={{ backgroundColor: '#fff', border: '1px solid #f0ece4', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}
      >
        <div>
          <div style={{ fontFamily: 'monospace', color: '#1c1917', fontWeight: 900 }}>
            Room: {roomCode || 'DEMO'}
          </div>
          <div style={{ fontFamily: 'monospace', color: '#78716c', fontSize: 12, marginTop: 4 }}>
            {connected ? 'Connected' : 'Not connected to backend'} · Players: {playerCount}
          </div>
        </div>
        <div style={{ fontFamily: 'monospace', fontWeight: 900, color: connected ? '#059669' : '#d97706' }}>
          {connected ? '● LIVE' : '● LOCAL (waiting for backend)'}
        </div>
      </div>

      {roomState?.status !== 'playing' && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#fff', border: '1px solid #f0ece4', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontFamily: 'monospace', color: '#374151' }}>
              {isHost
                ? 'You are host. Start battle when both players are here.'
                : 'Waiting for host to start the battle.'}
            </div>
            {isHost && (
              <button
                onClick={handleStartBattle}
                disabled={playerCount < 2}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: '1px solid #c7d2fe',
                  background: playerCount >= 2 ? '#2563eb' : '#94a3b8',
                  color: '#fff',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  cursor: playerCount >= 2 ? 'pointer' : 'not-allowed',
                }}
              >
                Start Battle
              </button>
            )}
          </div>
        </div>
      )}

      <ErrorBoundary fallback={
        <div style={{
          height: ARENA_HEIGHT,
          background: 'linear-gradient(160deg, #0f172a, #1e293b)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: 48 }}>👑</div>
          <div style={{ fontFamily: 'monospace', color: '#94a3b8', fontWeight: 800 }}>
            3D Arena unavailable
          </div>
          <div style={{ fontFamily: 'monospace', color: '#475569', fontSize: 13 }}>
            The battle will continue without the 3D view.
          </div>
        </div>
      }>
        <BossChallenge
          ref={battleRef}
          classId={myClassId}
          bossType={bossType}
          difficulty={difficulty}
          bossUrl={demonQueenUrl}
          bossUiOverride={{ name: '👑 Dark Demon Queen', color: '#ff3b6a', glowColor: '#7f1d1d' }}
          extraPlayers={extraPlayers}
          bossScaleOverride={1.2}
          bossPosOverride={[2.2, 0.15, 0]}
          externalBossHp={bossHp}
          externalCharHp={yourCharHp}
          arenaHeight={ARENA_HEIGHT}
        />
      </ErrorBoundary>

      <div
        className="rounded-2xl p-4"
        style={{
          background: 'linear-gradient(160deg, rgba(255,252,247,0.97), rgba(248,241,228,0.93))',
          border: '1.5px solid #d6d3d1',
          boxShadow: '0 8px 28px rgba(37,99,235,0.08), inset 0 1px 0 rgba(255,255,255,0.65)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 900, color: '#1f2937' }}>
            {question ? `Question ${question.no}${typeof roomState?.totalQuestions === 'number' ? ` / ${roomState.totalQuestions}` : ''}` : 'No active question'}
          </div>
          <div style={{
            fontFamily: 'monospace',
            fontWeight: 900,
            color: secondsLeft <= 5 ? '#dc2626' : '#2563eb',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 10,
            padding: '4px 10px',
          }}>
            {question ? `Timer: ${secondsLeft}s` : 'Timer: --'}
          </div>
        </div>

        {question && typeof roomState?.totalQuestions === 'number' && roomState.totalQuestions > 0 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#2563eb', fontWeight: 800, minWidth: 64 }}>
              Q {question.no} / {roomState.totalQuestions}
            </div>
            <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(question.no / roomState.totalQuestions) * 100}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, #60a5fa, #2563eb)',
                  transition: 'width 250ms ease',
                }}
              />
            </div>
          </div>
        )}

        <div style={{ marginTop: 10, fontFamily: 'monospace', color: '#334155', fontSize: 13 }}>
          {battleNote}
        </div>

        {question && (
          <>
            <div style={{ marginTop: 12, fontFamily: 'monospace', color: '#111827', fontWeight: 700 }}>
              {question.text}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 10 }}>
              {question.options.map((option, index) => {
                const choice = getOptionLetter(option, index)
                const isSelected = selectedAnswer === choice
                const lc = LETTER_COLOR[choice]
                return (
                  <button
                    key={`${question.id}-${choice}`}
                    onClick={() => submitAnswer(choice)}
                    disabled={hasSubmitted || secondsLeft <= 0}
                    style={{
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '11px 12px',
                      borderRadius: 14,
                      border: isSelected ? `1.5px solid ${lc.border}` : '1.5px solid rgba(111,78,55,0.10)',
                      background: isSelected ? `linear-gradient(135deg, ${lc.bg}, rgba(255,255,255,0.72))` : 'rgba(255,255,255,0.58)',
                      color: isSelected ? lc.text : '#57534e',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      cursor: hasSubmitted || secondsLeft <= 0 ? 'not-allowed' : 'pointer',
                      opacity: hasSubmitted || secondsLeft <= 0 ? 0.75 : 1,
                      boxShadow: isSelected ? `0 3px 12px ${lc.border}66, inset 0 1px 0 rgba(255,255,255,0.7)` : 'inset 0 1px 0 rgba(255,255,255,0.5)',
                    }}
                  >
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 10,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        backgroundColor: isSelected ? lc.text : lc.bg,
                        color: isSelected ? '#fff' : lc.text,
                        flexShrink: 0,
                      }}
                    >
                      {choice}
                    </span>
                    <span>{option}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'monospace', color: '#e2e8f0', fontWeight: 900 }}>
            TEAM HP: {yourCharHp} / 100
          </div>
          <div style={{ fontFamily: 'monospace', color: '#e2e8f0', fontWeight: 900 }}>
            BOSS HP: {bossHp} / 100
          </div>
        </div>

        <div style={{ marginTop: 10, fontFamily: 'monospace', color: '#94a3b8', fontSize: 12 }}>
          Battle actions must be decided by the backend and synced in real-time.
        </div>
      </div>
    </div>
  )
}

