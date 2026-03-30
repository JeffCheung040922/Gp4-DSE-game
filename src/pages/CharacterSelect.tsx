import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import { ChevronRight, Zap, Star } from 'lucide-react'
import { CHARACTER_CLASSES, type ClassId } from '../types/character'
import { getSavedCharacter, useCharacter } from '../hooks/useCharacter'
import { useAuth } from '../hooks/useAuth'

// ─── Starfield ────────────────────────────────────────────────────────────────
// Deterministic "random" (no Math.random): keeps UI stable per build.
function pseudoRand(n: number) {
  // 0..1 based on sine hash
  const x = Math.sin(n) * 10000
  return x - Math.floor(x)
}

const SMALL_STARS = Array.from({ length: 180 }, (_, i) => {
  const x = Math.floor(pseudoRand(i + 1) * 1920)
  const y = Math.floor(pseudoRand(i + 2) * 1080)
  const a = 0.1 + pseudoRand(i + 3) * 0.4
  return `${x}px ${y}px 0 1px rgba(255,255,255,${a.toFixed(2)})`
}).join(', ')
const BIG_STARS = Array.from({ length: 45 }, (_, i) => {
  const x = Math.floor(pseudoRand(i + 101) * 1920)
  const y = Math.floor(pseudoRand(i + 202) * 1080)
  const a = 0.35 + pseudoRand(i + 303) * 0.45
  return `${x}px ${y}px 0 2px rgba(255,255,255,${a.toFixed(2)})`
}).join(', ')

// ─── GLB model per class ──────────────────────────────────────────────────────
const PREVIEW_MODELS: Record<ClassId, string> = {
  knight:  '/assets/characters/Knight.glb',
  mage:    '/assets/characters/Mage.glb',
  rogue:   '/assets/characters/Rogue.glb',          // unhooded – not ninja-like
  bard:    '/assets/characters/Adventurer.glb',     // Quaternius adventurer (Z-up)
  archer:  '/assets/characters/Adventurer2.glb',  // Quaternius adventurer variant (slightly different gear)
  paladin: '/assets/characters/CharacterRPG.glb',   // Quaternius (Z-up)
}

// Delete persistent "character tint" colouring: emissiveInt=0 for all classes.
const CLASS_TINT: Record<ClassId, { emissive: string; emissiveInt: number }> = {
  knight:  { emissive: '#000000', emissiveInt: 0 },
  mage:    { emissive: '#000000', emissiveInt: 0 },
  rogue:   { emissive: '#000000', emissiveInt: 0 },
  bard:    { emissive: '#000000', emissiveInt: 0 },
  archer:  { emissive: '#000000', emissiveInt: 0 },
  paladin: { emissive: '#000000', emissiveInt: 0 },
}

// Quaternius models have internal CharacterArmature scale=100 → use scale=1.
// They are also Blender Z-up (not GLTF Y-up) → need -90° X rotation wrapper.
const CLASS_PREVIEW_SCALE: Record<ClassId, number> = {
  knight: 1, mage: 1, rogue: 1, bard: 1, archer: 1, paladin: 1,
}
// Per-class wrapper rotations to align models exported with different up-axes.
const CLASS_WRAPPER_ROTATION: Partial<Record<ClassId, [number, number, number]>> = {
}

// Per-class nodes to hide (built-in props/weapons that look wrong by default)
const CLASS_HIDE: Partial<Record<ClassId, string[]>> = {
  archer: ['Mug', '2H_Axe', '1H_Axe_Offhand'],  // Adventurer2 variants (no shield)
  rogue:  ['1H_Crossbow', '2H_Crossbow', 'Throwable'],    // keep Knife only
}


// ─── Apply emissive accent to a material (clones only when needed) ───────────
function applyTint(m: THREE.Material, emissive: THREE.Color, emissiveInt: number): THREE.Material {
  if (emissiveInt === 0) return m
  const mat = m.clone()
  const std = mat as THREE.MeshStandardMaterial
  if (std.emissive) { std.emissive.copy(emissive); std.emissiveIntensity = emissiveInt }
  return mat
}

// ─── 3D character model with idle animation + slow rotation ──────────────────
function CharacterModel3D({ classId, color }: { classId: ClassId; color: string }) {
  const groupRef = useRef<THREE.Group>(null!)
  const { scene: origScene, animations } = useGLTF(PREVIEW_MODELS[classId])

  // Clone scene AND apply tint synchronously — avoids 1-frame flicker from useEffect
  const scene = useMemo(() => {
    const cloned = SkeletonUtils.clone(origScene)
    const tint   = CLASS_TINT[classId]
    const hideSet = new Set(CLASS_HIDE[classId] ?? [])
    const emissive = new THREE.Color(tint.emissive)
    cloned.traverse(child => {
      if (hideSet.has(child.name)) { child.visible = false; return }
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || tint.emissiveInt === 0) return
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(m => applyTint(m, emissive, tint.emissiveInt))
      } else {
        mesh.material = applyTint(mesh.material, emissive, tint.emissiveInt)
      }
    })
    return cloned
  }, [origScene, classId])

  const { actions } = useAnimations(animations, groupRef)

  useEffect(() => {
    const idle = actions['Idle'] ?? actions['CharacterArmature|Idle'] ?? Object.values(actions).find(Boolean)
    idle?.reset().fadeIn(0.25).play()
    return () => {
      Object.values(actions).forEach(action => action?.stop())
    }
  }, [actions, classId])

  void color // keep prop for potential future styling; we intentionally removed class tinting

  const previewScale = CLASS_PREVIEW_SCALE[classId] ?? 1
  // Use Storm Herald (mage) position settings for all characters.
  const yPos = -1.2
  const wrapperRotation = CLASS_WRAPPER_ROTATION[classId]

  // All characters use the same yaw as Storm Herald (mage) - Math.PI / 6 (30 degrees)
  // This makes them face forward at a slight angle for better view
  const yaw = Math.PI / 6

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    // Keep subtle deterministic motion without triggering React re-renders.
    groupRef.current.rotation.y = yaw + Math.sin(clock.elapsedTime * 0.35) * 0.12
  })

  return (
    <group ref={groupRef} position={[0, yPos, 0]} rotation={[0, yaw, 0]} scale={previewScale}>
      {wrapperRotation ? (
        <group rotation={wrapperRotation}>
          <primitive object={scene} />
        </group>
      ) : (
        <primitive object={scene} />
      )}
    </group>
  )
}

// ─── R3F Preview Canvas (replaces Phaser) ────────────────────────────────────
function GLBCharacterPreview({ classId, color }: { classId: ClassId; color: string }) {
  return (
    <div style={{ width: 200, height: 290 }}>
      <Canvas
        camera={{ position: [0, -0.1, 3.5], fov: 50 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[-2, 6, 4]} intensity={1.6} castShadow />
        <Suspense fallback={null}>
          <CharacterModel3D key={classId} classId={classId} color={color} />
        </Suspense>
      </Canvas>
    </div>
  )
}

// Preload all character models so preview is instant
Object.values(PREVIEW_MODELS).forEach(url => useGLTF.preload(url))

// ─── CharacterSelect Page ─────────────────────────────────────────────────────
export default function CharacterSelect() {
  const navigate = useNavigate()
  // Read previously saved class + name so returning players see their info
  const _saved = getSavedCharacter()
  const { user, setUser } = useAuth()
  const { saveCharacter } = useCharacter()
  const [selected, setSelected] = useState<ClassId>(_saved?.classId ?? 'knight')
  // Never auto-fill name from old local saves (e.g. old default "Jeff").
  const [playerName, setPlayerName] = useState(user?.name ?? '')
  const [isBeginning, setIsBeginning] = useState(false)

  const cls = CHARACTER_CLASSES.find(c => c.id === selected)!

  const handleBegin = async () => {
    if (!playerName.trim()) return
    setIsBeginning(true)
    const charData = { classId: selected, name: playerName.trim() }
    // saveCharacter writes to localStorage AND POSTs to /api/character (backend).
    await saveCharacter(charData)
    // Keep auth profile name in sync (so other pages won't show stale defaults).
    if (user) {
      setUser({ ...user, name: playerName.trim() })
    }
    setTimeout(() => navigate('/', { replace: true }), 400)
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% -5%, #1e1030 0%, #100b1e 45%, #0b0916 100%)' }}
    >
      {/* Warm radial glow overlays */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 20% 60%, rgba(199,122,26,0.12), transparent 55%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 30%, rgba(41,87,200,0.10), transparent 45%)' }} />
      </div>
      {/* Starfield */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, boxShadow: SMALL_STARS }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: 2, boxShadow: BIG_STARS }} />
      </div>

      {/* Main content */}
      <div className="relative w-full max-w-6xl px-4 sm:px-5 py-6 sm:py-8 flex flex-col gap-6" style={{ zIndex: 10 }}>

        {/* Title */}
        <div className="text-center animate-fade-up">
          <div className="text-sm font-bold font-mono-ui tracking-[0.22em] mb-3" style={{ color: 'rgba(199,122,26,0.60)' }}>
            DSE ENGLISH QUEST · 2026
          </div>
          <h1
            className="text-4xl sm:text-5xl font-black mb-2"
            style={{
              color: '#f0e8d8',
              textShadow: `0 0 50px ${cls.color}70, 0 2px 0 rgba(0,0,0,0.4)`,
              letterSpacing: '-0.02em',
              transition: 'text-shadow 0.5s ease',
            }}
          >
            CHOOSE YOUR CLASS
          </h1>
          <p className="text-sm" style={{ color: 'rgba(199,122,26,0.55)' }}>
            Your class determines XP bonuses and your battle style
          </p>
        </div>

        {/* Class Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-up-1">
          {CHARACTER_CLASSES.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className="relative rounded-[20px] p-4 text-left transition-all duration-300 card-lift group"
              style={{
                background: selected === c.id
                  ? `linear-gradient(145deg, ${c.bgColor}22 0%, rgba(30,18,50,0.95) 100%)`
                  : 'rgba(20,14,34,0.75)',
                border: `1.5px solid ${selected === c.id ? c.color + '70' : 'rgba(199,122,26,0.14)'}`,
                boxShadow: selected === c.id
                  ? `0 8px 32px ${c.color}30, inset 0 1px 0 rgba(255,255,255,0.06)`
                  : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                backdropFilter: 'blur(6px)',
              }}
            >
              {/* Selected indicator */}
              {selected === c.id && (
                <div
                  className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}aa)`, boxShadow: `0 0 8px ${c.color}60` }}
                >
                  <Star size={10} color="white" fill="white" />
                </div>
              )}

              {/* Emoji with glow */}
              <div
                className="text-4xl mb-3 transition-all duration-300"
                style={{
                  filter: `drop-shadow(0 0 ${selected === c.id ? '14px' : '4px'} ${c.color}90)`,
                  transform: selected === c.id ? 'scale(1.12)' : 'scale(1)',
                }}
              >
                {c.emoji}
              </div>

              <div className="text-sm font-bold mb-0.5 tracking-widest" style={{ color: c.color + 'bb' }}>
                {c.role.toUpperCase()}
              </div>
              <div className="text-sm font-bold leading-tight" style={{ color: '#e8e0d0' }}>
                {c.name}
              </div>
              <div className="text-sm mt-1.5" style={{ color: 'rgba(199,122,26,0.55)' }}>
                {c.bonus}
              </div>
            </button>
          ))}
        </div>

        {/* Detail Panel */}
        <div
          className="grid grid-cols-1 lg:grid-cols-3 gap-0 rounded-[28px] overflow-hidden transition-all duration-500 animate-fade-up-2"
          style={{
            border: `1px solid ${cls.color}38`,
            boxShadow: `0 20px 60px ${cls.color}18, 0 4px 0 ${cls.color}14`,
          }}
        >
          {/* Character Preview */}
          <div
            className="flex flex-col items-center justify-center p-6 gap-4"
            style={{ background: `linear-gradient(180deg, ${cls.bgColor}28, rgba(15,10,25,0.90))` }}
          >
            <div className="relative">
              {/* Glow backdrop */}
              <div
                className="absolute inset-0 rounded-2xl blur-2xl"
                style={{ backgroundColor: cls.color, opacity: 0.18 }}
              />
              <div
                className="relative rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${cls.color}30` }}
              >
                <GLBCharacterPreview classId={selected} color={cls.color} />
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black transition-colors duration-400" style={{ color: cls.color }}>
                {cls.name}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(199,122,26,0.50)' }}>
                {cls.role}
              </div>
            </div>
          </div>

          {/* Stats + Description */}
          <div
            className="flex flex-col gap-4 p-6"
            style={{
              background: 'linear-gradient(160deg, rgba(255,252,247,0.07), rgba(15,9,22,0.94))',
              borderLeft: `1px solid rgba(199,122,26,0.10)`,
            }}
          >
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(220,210,195,0.72)' }}>
              {cls.description}
            </p>

            <div className="space-y-3">
              {(Object.entries(cls.stats) as [string, number][]).map(([stat, val]) => (
                <div key={stat}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold" style={{ color: 'rgba(199,122,26,0.55)' }}>{stat}</span>
                    <span className="text-xs font-black font-mono-ui" style={{ color: cls.color }}>{val} / 10</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${val * 10}%`,
                        background: `linear-gradient(90deg, ${cls.color}aa, ${cls.color})`,
                        boxShadow: `0 0 6px ${cls.color}50`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bonus + Name Input + CTA */}
          <div
            className="flex flex-col gap-4 p-6"
            style={{
              background: 'linear-gradient(160deg, rgba(255,252,247,0.05), rgba(12,8,20,0.95))',
              borderLeft: `1px solid ${cls.color}18`,
            }}
          >
            {/* Class bonus box */}
            <div
              className="rounded-[16px] p-4"
              style={{
                background: `linear-gradient(135deg, ${cls.color}10, rgba(255,255,255,0.03))`,
                border: `1px solid ${cls.color}28`,
              }}
            >
              <div className="text-xs font-bold mb-2 tracking-widest" style={{ color: 'rgba(199,122,26,0.55)' }}>CLASS BONUS</div>
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} color={cls.color} />
                <span className="text-sm font-bold" style={{ color: cls.color }}>{cls.bonus}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cls.subjects.map(s => (
                  <span
                    key={s}
                    className="text-xs px-2.5 py-0.5 rounded-full font-bold"
                    style={{
                      backgroundColor: `${cls.color}18`,
                      color: cls.color,
                      border: `1px solid ${cls.color}35`,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Name input */}
            <div>
              <label className="text-xs font-bold block mb-1.5 tracking-widest" style={{ color: 'rgba(199,122,26,0.55)' }}>
                HERO NAME
              </label>
              <input
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBegin()}
                maxLength={20}
                placeholder="Enter your name..."
                className="w-full px-4 py-2.5 rounded-[14px] text-sm font-bold outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${cls.color}40`,
                  color: '#f0e8d8',
                }}
              />
            </div>

            {/* Begin Quest CTA */}
            <button
              onClick={handleBegin}
              disabled={!playerName.trim() || isBeginning}
              className="w-full py-4 rounded-[16px] font-black text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-95"
              style={{
                background: playerName.trim()
                  ? `linear-gradient(135deg, ${cls.color} 0%, ${cls.color}bb 100%)`
                  : 'rgba(255,255,255,0.06)',
                color: playerName.trim() ? 'white' : 'rgba(255,255,255,0.25)',
                boxShadow: playerName.trim() ? `0 8px 28px ${cls.color}45` : 'none',
                border: playerName.trim() ? 'none' : '1px solid rgba(255,255,255,0.08)',
                opacity: isBeginning ? 0.7 : 1,
              }}
            >
              {isBeginning ? '⚔ Entering the Quest...' : '⚔ BEGIN QUEST'}
              {!isBeginning && <ChevronRight size={16} />}
            </button>

            {/* Small hint */}
            <p className="text-xs text-center" style={{ color: 'rgba(199,122,26,0.35)' }}>
              You can change your class later in Settings
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
