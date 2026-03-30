import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Phaser from 'phaser'
import axios from 'axios'
import {
  Users, Plus, LogIn, Copy, Check, Swords,
  Wifi, WifiOff, Crown, Zap, Shield, Loader2, XCircle, AlertCircle,
} from 'lucide-react'
import { getSavedCharacter } from '../hooks/useCharacter'
import { CHARACTER_CLASSES } from '../types/character'
import { useAuth } from '../hooks/useAuth'
import {
  createRoom,
  joinRoom,
  startRoom,
} from '../api/room'
import type { Subject, CreateRoomResponse, JoinRoomResponse, PlayerInfo } from '../types/api'
import { getMultiplayerSocket } from '../api/multiplayerSocket'

function normalizeLobbyDifficulty(difficulty?: string): 'Easy' | 'Medium' | 'Hard' {
  const normalized = difficulty?.trim().toLowerCase()
  if (normalized === 'medium') return 'Medium'
  if (normalized === 'hard') return 'Hard'
  return 'Easy'
}

// ─── Mini preview scene (Kenney monster parts assembled) ──────────────────────
class LobbyPreviewScene extends Phaser.Scene {
  constructor() { super({ key: 'LobbyPreview' }) }

  preload() {
    this.load.image('body_dark',   '/assets/body_darkA.png')
    this.load.image('body_blue',   '/assets/body_blueA.png')
    this.load.image('body_green',  '/assets/body_greenA.png')
    this.load.image('body_red',    '/assets/body_redA.png')
    this.load.image('body_yellow', '/assets/body_yellowA.png')
  }

  create() {
    const { width, height } = this.scale
    // Warm arena background
    const bg = this.add.graphics()
    bg.fillStyle(0x1a1200, 1); bg.fillRect(0, 0, width, height)
    const grid = this.add.graphics()
    grid.lineStyle(1, 0xfbbf24, 0.05)
    for (let x = 0; x < width; x += 32) grid.lineBetween(x, 0, x, height)
    for (let y = 0; y < height; y += 32) grid.lineBetween(0, y, width, y)

    // 5 hero spots
    const spots = [0.12, 0.30, 0.50, 0.70, 0.88]
    const bodies = ['body_dark', 'body_blue', 'body_green', 'body_red', 'body_yellow']
    const names = ['Knight', 'Mage', 'Rogue', 'Bard', '???']
    const colors = [0x9ca3af, 0xa78bfa, 0x10b981, 0xf59e0b, 0x6b7280]

    spots.forEach((xr, i) => {
      const x = width * xr
      const y = height * 0.52
      // Platform glow
      const plat = this.add.graphics()
      plat.fillStyle(colors[i], 0.08); plat.fillEllipse(x, y + 28, 64, 16)
      plat.fillStyle(colors[i], 0.15); plat.fillEllipse(x, y + 28, 40, 10)

      // Body sprite (from Kenney pack)
      const sprite = this.add.image(x, y, bodies[i])
      sprite.setScale(1.6)
      sprite.setTint(colors[i])

      // Floating animation
      this.tweens.add({
        targets: sprite, y: y - 8, duration: 1800 + i * 200,
        ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
      })

      // Name tag
      this.add.text(x, y + 44, names[i], {
        fontSize: '9px', color: i < 4 ? '#ffffff99' : '#ffffff33',
        fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5, 0)

      // Ready indicator
      if (i < 4) {
        const badge = this.add.graphics()
        badge.fillStyle(0x10b981, 0.9); badge.fillCircle(0, 0, 5)
        badge.setPosition(x + 14, y - 28)
      }
    })

    // VS Boss label
    const bossX = width * 0.5
    this.add.text(bossX, height * 0.12, '⚔ CO-OP BOSS RAID', {
      fontSize: '11px', color: '#fbbf24', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    // Divider
    const div = this.add.graphics()
    div.lineStyle(1, 0xfbbf24, 0.2)
    div.lineBetween(0, height * 0.85, width, height * 0.85)
    this.add.text(bossX, height * 0.88, 'All players share one Boss HP — attack together!', {
      fontSize: '8px', color: '#fbbf2466', fontFamily: 'monospace',
    }).setOrigin(0.5, 0)
  }
}

// ─── Lobby ─────────────────────────────────────────────────────────────────────
export default function MultiplayerLobby() {
  const navigate = useNavigate()
  const savedChar = getSavedCharacter()
  const { user } = useAuth()

  // ── UI state ──────────────────────────────────────────────────────────────
  const [_tab, setTab] = useState<'home' | 'create' | 'join'>('home'); void _tab
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState(false)

  // ── Room REST state ──────────────────────────────────────────────────────
  const [inRoom, setInRoom] = useState(false)
  const [roomState, setRoomState] = useState<CreateRoomResponse | JoinRoomResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [subject, setSubject] = useState<Subject>('reading')
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Easy')

  // ── WebSocket state (live player updates) ───────────────────────────────
  const [livePlayers, setLivePlayers] = useState<PlayerInfo[]>([])
  const [wsConnected, setWsConnected] = useState(false)
  const isHost = !!roomState?.hostId && roomState.hostId === user?.userId
  const battleNavRef = useRef(false)
  // ── Canvas ref ───────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return
    gameRef.current = new Phaser.Game({
      type: Phaser.CANVAS, width: 500, height: 160, transparent: true,
      parent: containerRef.current,
      scene: [LobbyPreviewScene],
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 500, height: 160 },
    })
    return () => { gameRef.current?.destroy(true); gameRef.current = null }
  }, [])

  // ── WebSocket: connect when in a room ────────────────────────────────────
  useEffect(() => {
    if (!inRoom || !roomState?.roomCode) return

    const socket = getMultiplayerSocket()
    battleNavRef.current = false

    const goBattle = (code: string) => {
      if (battleNavRef.current) return
      battleNavRef.current = true
      navigate(`/multiplayer/battle?roomCode=${encodeURIComponent(code.toUpperCase())}`)
    }

    const onConnect = () => setWsConnected(true)
    const onDisconnect = () => setWsConnected(false)

    // NOTE: when backend emits `roomState` events, update live player list.
    const onRoomStateUpdate = (state: {
      hostId?: string
      players?: PlayerInfo[]
      subject?: Subject
      difficulty?: string
      status?: 'waiting' | 'playing' | 'finished'
    }) => {
      if (state.players) setLivePlayers(state.players)
      setRoomState(prev => {
        if (!prev) return prev
        return {
          ...prev,
          hostId: state.hostId ?? prev.hostId,
          subject: state.subject ?? prev.subject,
          difficulty: state.difficulty ? normalizeLobbyDifficulty(state.difficulty) : prev.difficulty,
        }
      })

      if (state.status === 'playing') {
        goBattle(roomState.roomCode)
      }
    }

    const onBattleStarted = (payload: { roomCode?: string }) => {
      const code = (payload?.roomCode ?? roomState.roomCode).toUpperCase()
      goBattle(code)
    }

    const onBattleStartError = (payload: { message?: string }) => {
      setError(payload?.message ?? 'Unable to start battle.')
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('roomState', onRoomStateUpdate)
    socket.on('battleStarted', onBattleStarted)
    socket.on('battleStartError', onBattleStartError)

    socket.emit('joinRoom', {
      roomCode: roomState.roomCode,
      playerName: user?.name ?? savedChar?.name ?? 'You',
      classId: savedChar?.classId ?? 'knight',
    })

    // Fallback sync loop: keeps room state fresh and detects status=playing even if
    // the server missed broadcasting `battleStarted`.
    socket.emit('getRoomState', { roomCode: roomState.roomCode })
    const statePollId = window.setInterval(() => {
      socket.emit('getRoomState', { roomCode: roomState.roomCode })
    }, 1200)

    return () => {
      window.clearInterval(statePollId)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('roomState', onRoomStateUpdate)
      socket.off('battleStarted', onBattleStarted)
      socket.off('battleStartError', onBattleStartError)
    }
  }, [inRoom, roomState?.roomCode, user, savedChar, navigate])

  // ── Create room ──────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!savedChar) { setError('Please create a character first.'); return }
    setIsLoading(true)
    setError(null)
    try {
      const result = await createRoom(
        subject, 
        difficulty,
        user?.name ?? savedChar?.name ?? 'You',
        savedChar?.classId ?? 'knight'
      )
      setRoomState(result)
      setInRoom(true)
      setTab('create')
    } catch (e) {
      const message = axios.isAxiosError(e)
        ? e.response?.data?.error ?? e.message
        : 'Failed to create room.'
      setError(message)
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }, [savedChar, subject, difficulty, user])

  // ── Join room ─────────────────────────────────────────────────────────────
  const handleJoin = useCallback(async () => {
    if (joinCode.trim().length < 4) { setError('Enter a valid 6-character code.'); return }
    setIsLoading(true)
    setError(null)
    try {
      const result = await joinRoom(
        joinCode.trim().toUpperCase(),
        user?.name ?? savedChar?.name ?? 'You',
        savedChar?.classId ?? 'knight'
      )
      setRoomState(result)
      setLivePlayers(result.players)
      setInRoom(true)
      setTab('create')
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        const roomCode = joinCode.trim().toUpperCase()
        const socket = getMultiplayerSocket()

        const socketJoin = await new Promise<JoinRoomResponse>((resolve, reject) => {
          const cleanup = () => {
            socket.off('roomState', onRoomState)
            socket.off('error', onError)
            clearTimeout(timeoutId)
          }

          const onRoomState = (state: { hostId: string; players: PlayerInfo[]; subject: Subject; difficulty: string }) => {
            cleanup()
            resolve({
              roomCode,
              hostId: state.hostId,
              players: state.players,
              subject: state.subject,
              difficulty: normalizeLobbyDifficulty(state.difficulty),
            })
          }

          const onError = (payload: { message?: string }) => {
            cleanup()
            reject(new Error(payload?.message ?? 'Cannot join room.'))
          }

          const timeoutId = setTimeout(() => {
            cleanup()
            reject(new Error('Timed out while joining room.'))
          }, 5000)

          socket.once('roomState', onRoomState)
          socket.once('error', onError)
          socket.emit('joinRoom', {
            roomCode,
            playerName: user?.name ?? savedChar?.name ?? 'You',
            classId: savedChar?.classId ?? 'knight',
          })
        })

        setRoomState(socketJoin)
        setLivePlayers(socketJoin.players)
        setInRoom(true)
        setTab('create')
        return
      }

      const backendMessage = axios.isAxiosError(e)
        ? e.response?.data?.error
        : null
      setError(backendMessage ?? `Cannot join room "${joinCode.toUpperCase()}". Check the code and try again.`)
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }, [joinCode, savedChar, user])

  // ── Leave room ────────────────────────────────────────────────────────────
  const handleLeave = useCallback(async () => {
    battleNavRef.current = false
    if (roomState?.roomCode) {
      const socket = getMultiplayerSocket()
      socket.emit('leaveRoom')
    }
    setInRoom(false)
    setRoomState(null)
    setLivePlayers([])
    setError(null)
    setJoinCode('')
    setTab('home')
  }, [roomState?.roomCode])

  // ── Merge local player into live player list ──────────────────────────────
  const allPlayers = ((): Array<PlayerInfo & { isYou: boolean }> => {
    if (!inRoom) return []
    const myId = user?.userId ?? 'local'
    const myEntry: PlayerInfo & { isYou: boolean } = {
      id: myId,
      name: user?.name ?? savedChar?.name ?? 'You',
      classId: (savedChar?.classId ?? 'knight') as PlayerInfo['classId'],
      isYou: true,
    }
    const others = (livePlayers ?? []).filter(p => p.id !== myId) as Array<PlayerInfo & { isYou: boolean }>
    return [myEntry, ...others]
  })()

  // ── Start battle ──────────────────────────────────────────────────────────
  const handleStartBattle = useCallback(async () => {
    if (!roomState?.roomCode) return
    if (!isHost) {
      setError('Only the host can start the battle.')
      return
    }
    if (allPlayers.length < 2) {
      setError('Need at least 2 players before starting the battle.')
      return
    }
    if (!wsConnected) {
      setError('Live connection required to start the battle for all players.')
      return
    }

    const socket = getMultiplayerSocket()
    socket.emit('startBattle', { roomCode: roomState.roomCode })

    // REST fallback for environments where socket `startBattle` handler is not live yet.
    // Other players will still move via room-state polling once status becomes "playing".
    try {
      await startRoom(roomState.roomCode)
    } catch {
      // Socket path may still succeed; explicit error comes from battleStartError event.
    }
  }, [allPlayers.length, isHost, roomState?.roomCode, wsConnected])

  // ── Copy room code ────────────────────────────────────────────────────────
  const handleCopy = () => {
    if (!roomState?.roomCode) return
    navigator.clipboard.writeText(roomState.roomCode).catch((error) => {
      console.warn('Failed to copy room code to clipboard:', error)
      // Fallback: could show a message to user to copy manually
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #dc2626)' }}
        >
          <Users size={22} color="white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1c1917' }}>Co-op Battle Room</h1>
          <p className="text-sm" style={{ color: '#78716c' }}>
            Team up with classmates and raid bosses together
          </p>
        </div>
        <div className="ml-auto">
          <span
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-bold"
            style={{ backgroundColor: wsConnected ? '#ecfdf5' : '#fffbeb', color: wsConnected ? '#059669' : '#d97706', border: `1px solid ${wsConnected ? '#a7f3d0' : '#fde68a'}` }}
          >
            {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {wsConnected ? 'Live' : 'REST only'}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
          style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3' }}>
          <AlertCircle size={16} color="#dc2626" />
          <p className="text-sm font-medium" style={{ color: '#dc2626' }}>{error}</p>
          <button className="ml-auto" onClick={() => setError(null)}>
            <XCircle size={16} color="#dc2626" />
          </button>
        </div>
      )}

      {/* Preview canvas */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#1a1200', border: '1px solid #fbbf2430' }}
      >
        <div ref={containerRef} style={{ height: 160 }} />
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Plus,   label: '1. Create a room', desc: 'Get a 6-character room code to share', color: '#7c3aed' },
          { icon: Users,  label: '2. Invite classmates', desc: 'Up to 5 players can join the same room', color: '#2563eb' },
          { icon: Swords, label: '3. Battle together', desc: 'Answer questions to attack the shared boss', color: '#dc2626' },
        ].map(({ icon: Icon, label, desc, color }) => (
          <div
            key={label}
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{ backgroundColor: '#ffffff', border: '1px solid #f0ece4', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ backgroundColor: `${color}15` }}
            >
              <Icon size={18} color={color} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: '#1c1917' }}>{label}</div>
              <div className="text-xs mt-0.5" style={{ color: '#78716c' }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Action area */}
      {!inRoom ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Create Room */}
          <div
            className="rounded-2xl p-6 flex flex-col items-center text-center gap-4"
            style={{ backgroundColor: '#ffffff', border: '1.5px solid #e9d5ff', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
            >
              <Crown size={26} color="white" />
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: '#1c1917' }}>Create a Room</h3>
              <p className="text-sm mt-1" style={{ color: '#78716c' }}>
                Be the host — pick subject & difficulty, then share the code
              </p>
            </div>

            {/* Subject selector */}
            <div className="w-full flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: '#78716c' }}>Subject</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['reading', 'listening', 'writing', 'speaking'] as Subject[]).map(s => (
                  <button key={s}
                    onClick={() => setSubject(s)}
                    className="py-1.5 rounded-lg text-xs font-bold capitalize transition-all"
                    style={{
                      backgroundColor: subject === s ? '#7c3aed' : '#f5f3ef',
                      color: subject === s ? 'white' : '#78716c',
                      border: `1px solid ${subject === s ? '#7c3aed' : '#e8e0d8'}`,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty selector */}
            <div className="w-full flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: '#78716c' }}>Difficulty</label>
              <div className="flex gap-1.5">
                {(['Easy', 'Medium', 'Hard'] as const).map(d => (
                  <button key={d}
                    onClick={() => setDifficulty(d)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{
                      backgroundColor: difficulty === d ? (d === 'Easy' ? '#10b981' : d === 'Medium' ? '#d97706' : '#dc2626') : '#f5f3ef',
                      color: difficulty === d ? 'white' : '#78716c',
                      border: `1px solid ${difficulty === d ? (d === 'Easy' ? '#10b981' : d === 'Medium' ? '#d97706' : '#dc2626') : '#e8e0d8'}`,
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={isLoading}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: 'white' }}
            >
              {isLoading ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Plus size={14} className="inline" /> Create Room</>}
            </button>
          </div>

          {/* Join Room */}
          <div
            className="rounded-2xl p-6 flex flex-col items-center text-center gap-4"
            style={{ backgroundColor: '#ffffff', border: '1.5px solid #bfdbfe', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
            >
              <LogIn size={26} color="white" />
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: '#1c1917' }}>Join a Room</h3>
              <p className="text-sm mt-1" style={{ color: '#78716c' }}>
                Enter the room code your classmate shared
              </p>
            </div>
            <div className="w-full space-y-2">
              <input
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase().slice(0, 6)); setError(null) }}
                placeholder="e.g. AB3X9Z"
                maxLength={6}
                className="w-full px-4 py-2.5 rounded-xl text-center text-lg font-bold tracking-widest outline-none transition-all"
                style={{
                  backgroundColor: '#faf9f7',
                  border: '1.5px solid #bfdbfe',
                  color: '#1c1917',
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#2563eb'}
                onBlur={e => e.currentTarget.style.borderColor = '#bfdbfe'}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />
              <button
                onClick={handleJoin}
                disabled={isLoading || joinCode.trim().length < 4}
                className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 shadow-sm disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: 'white' }}
              >
                {isLoading ? <><Loader2 size={14} className="animate-spin" /> Joining…</> : <><LogIn size={14} className="inline" /> Join Room</>}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* In-room view */
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{ backgroundColor: '#ffffff', border: '1px solid #f0ece4', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}
        >
          {/* Room info bar */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl"
            style={{ backgroundColor: '#fdf9f2', border: '1px solid #fde68a' }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: '#78716c' }}>Room Code — share with classmates</p>
              <p className="text-3xl font-bold tracking-widest mt-0.5" style={{ color: '#1c1917' }}>
                {roomState?.roomCode ?? '------'}
              </p>
            </div>
            {roomState?.subject && (
              <div className="text-center px-3">
                <div className="text-xs font-medium capitalize" style={{ color: '#78716c' }}>Subject</div>
                <div className="text-sm font-bold capitalize" style={{ color: '#7c3aed' }}>{roomState.subject}</div>
              </div>
            )}
            {roomState?.difficulty && (
              <div className="text-center px-3">
                <div className="text-xs font-medium" style={{ color: '#78716c' }}>Difficulty</div>
                <div className="text-sm font-bold" style={{ color: roomState.difficulty === 'Easy' ? '#10b981' : roomState.difficulty === 'Medium' ? '#d97706' : '#dc2626' }}>{roomState.difficulty}</div>
              </div>
            )}
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                backgroundColor: copied ? '#ecfdf5' : '#fffbeb',
                color: copied ? '#059669' : '#d97706',
                border: `1px solid ${copied ? '#a7f3d0' : '#fde68a'}`,
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Players list */}
          <div>
            <h3 className="text-sm font-bold mb-3" style={{ color: '#1c1917' }}>
              Players ({allPlayers.length}/5)
              {wsConnected && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: '#059669' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#10b981' }} />
                  Live
                </span>
              )}
            </h3>
            <div className="space-y-2">
              {allPlayers.map(p => {
                const cls = CHARACTER_CLASSES.find(c => c.id === p.classId)
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{
                      backgroundColor: p.isYou ? '#eff6ff' : '#faf9f7',
                      border: `1px solid ${p.isYou ? '#bfdbfe' : '#f0ece4'}`,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ backgroundColor: cls ? `${cls.color}15` : '#f0ece4' }}
                    >
                      {cls?.emoji ?? '👤'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: '#1c1917' }}>{p.name}</span>
                        {p.isYou && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                            style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>You</span>
                        )}
                        {roomState?.hostId === p.id && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"
                            style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>
                            <Crown size={9} /> Host
                          </span>
                        )}
                      </div>
                      <span className="text-xs" style={{ color: cls?.color ?? '#78716c' }}>
                        {cls?.emoji} {cls?.name ?? 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: '#10b981' }}
                      />
                      <span className="text-xs" style={{ color: '#059669' }}>In Lobby</span>
                    </div>
                  </div>
                )
              })}
              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 5 - allPlayers.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: '#faf9f7', border: '1px dashed #e8e0d8' }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: '#f5f3ef' }}>
                    <Users size={16} color="#d6cfc6" />
                  </div>
                <span className="text-sm" style={{ color: '#a8a29e' }}>Waiting for player…</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shared boss info */}
          <div
            className="rounded-xl p-4 flex items-center gap-4"
            style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3' }}
          >
            <Swords size={20} color="#dc2626" className="flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold capitalize" style={{ color: '#dc2626' }}>
                {roomState?.subject ?? 'Reading'} Boss — {roomState?.difficulty ?? 'Easy'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#78716c' }}>
                Every correct answer from any player deals damage. Wrong answers cause the boss to retaliate on that player only.
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xl font-bold" style={{ color: '#dc2626' }}>500 HP</div>
              <div className="text-xs" style={{ color: '#a8a29e' }}>shared</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleLeave}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
              style={{ backgroundColor: '#faf9f7', color: '#78716c', border: '1px solid #f0ece4' }}
            >
              <LogIn size={14} className="rotate-180" />
              Leave Room
            </button>
            <button
              onClick={handleStartBattle}
              disabled={!isHost || allPlayers.length < 2 || !wsConnected}
              className="flex-2 px-8 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 shadow-sm flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #dc2626, #7c3aed)',
                color: 'white',
                flex: 2,
                opacity: !isHost || allPlayers.length < 2 || !wsConnected ? 0.5 : 1,
                cursor: !isHost || allPlayers.length < 2 || !wsConnected ? 'not-allowed' : 'pointer',
              }}
            >
              <Swords size={16} />
              {isHost ? 'Start Battle!' : 'Host Starts Battle'}
            </button>
          </div>

          {/* Real-time sync notice */}
          <div
            className="rounded-xl p-3 flex items-start gap-2"
            style={{ backgroundColor: wsConnected ? '#ecfdf5' : '#fffbeb', border: `1px solid ${wsConnected ? '#a7f3d0' : '#fde68a'}` }}
          >
            {wsConnected
              ? <Wifi size={14} color="#059669" className="flex-shrink-0 mt-0.5" />
              : <WifiOff size={14} color="#d97706" className="flex-shrink-0 mt-0.5" />
            }
            <p className="text-xs" style={{ color: wsConnected ? '#065f46' : '#92400e' }}>
              {wsConnected
                ? 'Live player updates are active. Players joining this room will appear automatically.'
                : 'Live sync is unavailable right now. Room create/join still works, but realtime updates need the socket connection.'
              }
            </p>
          </div>

          {/* Stats preview */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Shield, label: 'Shared Boss HP', value: '500', color: '#dc2626', bg: '#fff1f2' },
              { icon: Zap,    label: 'Total DPS',       value: `${allPlayers.length * 12}/round`, color: '#d97706', bg: '#fffbeb' },
              { icon: Users,  label: 'Players',           value: `${allPlayers.length}/5`, color: '#2563eb', bg: '#eff6ff' },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <div key={label} className="rounded-xl p-3 text-center"
                style={{ backgroundColor: bg, border: `1px solid ${color}30` }}>
                <Icon size={16} color={color} className="mx-auto mb-1" />
                <div className="text-lg font-bold" style={{ color }}>{value}</div>
                <div className="text-xs" style={{ color: '#78716c' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
