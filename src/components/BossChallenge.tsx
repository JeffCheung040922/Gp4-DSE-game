import {
  forwardRef, useImperativeHandle, useRef, useState, useEffect,
  useMemo, Suspense, useCallback,
} from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, Environment, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import type { ClassId } from '../types/character'
import type { BossType } from './BattleWidget'
import { useInventory } from '../hooks/useInventory'
import { WEAPON_CATALOG, POTION_CATALOG } from '../types/inventory'

// ── Model & config mappings ───────────────────────────────────────────────────
const CHAR_MODELS: Record<ClassId, string> = {
  knight:  '/assets/characters/Knight.glb',
  mage:    '/assets/characters/Mage.glb',
  rogue:   '/assets/characters/Rogue.glb',          // unhooded – not ninja-like
  bard:    '/assets/characters/Adventurer.glb',     // Quaternius adventurer (Z-up)
  archer:  '/assets/characters/Adventurer2.glb',    // match Character Select (Swift Arrow)
  paladin: '/assets/characters/CharacterRPG.glb',   // Quaternius (Z-up)
}

// Per-class nodes to hide (built-in props that look wrong by default)
const CHAR_HIDE: Partial<Record<ClassId, string[]>> = {
  archer: ['Mug', '2H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield'],
  rogue:  ['1H_Crossbow', '2H_Crossbow', 'Throwable'],  // keep Knife only
}

// Per-class mesh tints — visual distinction even when two classes share a base model.
// Paladin = gold holy armour; Archer = forest-green ranger; Bard = warm amber; etc.
// Only emissive accent glow — NO multiply tint so base colours stay original.
// Multiply tints caused entire characters to look dyed a single colour.
const CHAR_TINT: Record<ClassId, { emissive: string; emissiveInt: number }> = {
  // Delete persistent "character tint" colouring: emissiveInt=0 for all classes.
  knight:  { emissive: '#000000', emissiveInt: 0 },
  mage:    { emissive: '#000000', emissiveInt: 0 },
  rogue:   { emissive: '#000000', emissiveInt: 0 },
  bard:    { emissive: '#000000', emissiveInt: 0 },
  archer:  { emissive: '#000000', emissiveInt: 0 },
  paladin: { emissive: '#000000', emissiveInt: 0 },
}

// Quaternius models have internal scale=100 → use scale=1.
// They are Blender Z-up (not GLTF Y-up) → need -90° X rotation wrapper.
const CHAR_SCALE: Record<ClassId, number> = {
  knight: 1, mage: 1, rogue: 1, bard: 1, archer: 1, paladin: 1,
}
const CHAR_Y_OFFSET: Record<ClassId, number> = {
  knight: 0, mage: 0, rogue: 0, bard: 0, archer: 0, paladin: 0,
}
// Keep empty unless a specific model is proven to need an extra wrapper rotation.
// CharacterRPG (paladin) is already upright in battle, so do not apply X-axis correction.
const ZUPCHAR = new Set<ClassId>()

// 4 subjects × 3 difficulties = 12 unique GLB boss models
const BOSS_MODELS: Record<BossType, string> = {
  speaking_easy:    '/assets/bosses/Skeleton_Minion.glb',
  speaking_medium:  '/assets/bosses/Skeleton_Minion.glb',
  speaking_hard:    '/assets/bosses/Skeleton_Minion.glb',
  writing_easy:     '/assets/bosses/Skeleton_Mage.glb',
  writing_medium:   '/assets/bosses/Skeleton_Mage.glb',
  writing_hard:     '/assets/bosses/Skeleton_Mage.glb',
  listening_easy:   '/assets/bosses/Skeleton_Rogue.glb',
  listening_medium: '/assets/bosses/Skeleton_Rogue.glb',
  listening_hard:   '/assets/bosses/Skeleton_Rogue.glb',
  reading_easy:     '/assets/bosses/Skeleton_Warrior.glb',
  reading_medium:   '/assets/bosses/Skeleton_Warrior.glb',
  reading_hard:     '/assets/bosses/Skeleton_Warrior.glb',
  // Legacy
  grammar_golem:    '/assets/bosses/Skeleton_Warrior.glb',
  vocab_vampire:    '/assets/bosses/Skeleton_Mage.glb',
  tense_tyrant:     '/assets/bosses/Skeleton_Warrior.glb',
  essay_empress:    '/assets/bosses/Skeleton_Mage.glb',
  phonics_phantom:  '/assets/bosses/Skeleton_Minion.glb',
}

const BOSS_UI: Record<BossType, { name: string; color: string; glowColor: string }> = {
  speaking_easy:    { name: '👄 Word Sprite',          color: '#34d399', glowColor: '#064e3b' },
  speaking_medium:  { name: '👄 Voice Phantom',        color: '#60a5fa', glowColor: '#1e3a8a' },
  speaking_hard:    { name: '👄 The Screamer',         color: '#ff4444', glowColor: '#7f1d1d' },
  writing_easy:     { name: '📜 Ink Wisp',             color: '#a78bfa', glowColor: '#3b0764' },
  writing_medium:   { name: '📜 Arcane Scribe',        color: '#8b5cf6', glowColor: '#2e1065' },
  writing_hard:     { name: '📜 The Lich Author',      color: '#cc44ff', glowColor: '#4a0472' },
  listening_easy:   { name: '👂 Shadow Imp',           color: '#6ee7b7', glowColor: '#064e3b' },
  listening_medium: { name: '👂 Void Stalker',         color: '#22c55e', glowColor: '#14532d' },
  listening_hard:   { name: '👂 The Silence',          color: '#9333ea', glowColor: '#3b0764' },
  reading_easy:     { name: '📖 Page Knight',          color: '#fbbf24', glowColor: '#78350f' },
  reading_medium:   { name: '📖 Iron Lore Keeper',     color: '#3b82f6', glowColor: '#1e3a8a' },
  reading_hard:     { name: '📖 FINAL BOSS: Tyrant',   color: '#ff8800', glowColor: '#7c2d12' },
  grammar_golem:    { name: '💀 Grammar Golem',        color: '#ef4444', glowColor: '#7f1d1d' },
  vocab_vampire:    { name: '🦇 Vocab Vampire',        color: '#60a5fa', glowColor: '#1e3a8a' },
  tense_tyrant:     { name: '⚔️ Tense Tyrant',         color: '#fbbf24', glowColor: '#78350f' },
  essay_empress:    { name: '👑 Essay Empress',        color: '#34d399', glowColor: '#064e3b' },
  phonics_phantom:  { name: '👻 Phonics Phantom',      color: '#a78bfa', glowColor: '#3b0764' },
}

const CHAR_ATTACK_ANIM: Record<ClassId, string> = {
  knight:  '1H_Melee_Attack_Chop',
  mage:    'Spellcast_Shoot',
  rogue:   '1H_Melee_Attack_Stab',
  bard:    'CharacterArmature|Gun_Shoot',  // Adventurer (Quaternius) model
  archer:  '2H_Melee_Attack_Chop',        // Barbarian model
  paladin: 'Punch',                        // CharacterRPG model
}

const PROJ_COLOR: Record<ClassId, string> = {
  knight:  '#93c5fd', mage: '#c4b5fd', rogue: '#6ee7b7',
  bard:    '#fde68a', archer: '#86efac', paladin: '#fde68a',
}

const IS_RANGED = new Set<ClassId>(['mage', 'archer', 'bard'])

// (Weapon bone-attachment system removed — weapons are managed via the inventory UI panel)

// ── Shared model handle ───────────────────────────────────────────────────────
interface ModelHandle {
  playAttack: () => void
  playHurt:   () => void
}

function queueIdleReset(action: THREE.AnimationAction, idle?: THREE.AnimationAction | null) {
  const ms = Math.max((action.getClip().duration - 0.15) * 1000, 400)
  setTimeout(() => {
    action.fadeOut(0.2)
    idle?.reset().fadeIn(0.2).play()
  }, ms)
}

function applyCharTint(m: THREE.Material, emissive: THREE.Color, emissiveInt: number): THREE.Material {
  if (emissiveInt === 0) return m  // No tint — keep original material (no clone needed)
  const mat = m.clone()
  const std = mat as THREE.MeshStandardMaterial
  if (std.emissive) { std.emissive.copy(emissive); std.emissiveIntensity = emissiveInt }
  return mat
}

function applyBossDifficultyTint(
  material: THREE.Material,
  tint: THREE.Color,
  emissiveIntensity: number,
  colorMix: number,
): THREE.Material {
  if (emissiveIntensity <= 0 && colorMix <= 0) return material
  const cloned = material.clone()
  const standardMaterial = cloned as THREE.MeshStandardMaterial
  if (standardMaterial.color) {
    standardMaterial.color.lerp(tint, colorMix)
  }
  if (standardMaterial.emissive) {
    standardMaterial.emissive.copy(tint)
    standardMaterial.emissiveIntensity = emissiveIntensity
  }
  return cloned
}

function getFirstAvailableAction(actions: Record<string, THREE.AnimationAction | null | undefined>) {
  return Object.values(actions).find(
    (action): action is THREE.AnimationAction => Boolean(action)
  )
}

// ── CharacterModel ────────────────────────────────────────────────────────────
// Simplified: no external weapon attachment — character uses built-in model weapon.
const CharacterModel = forwardRef<
  ModelHandle,
  { url: string; classId: ClassId; position: [number, number, number] }
>(({ url, classId, position }, ref) => {
  const groupRef = useRef<THREE.Group>(null!)

  const { scene: origScene, animations } = useGLTF(url)
  const { actions } = useAnimations(animations, groupRef)

  // Clone + apply emissive tint + hide unwanted built-in props
  const scene = useMemo(() => {
    const cloned   = SkeletonUtils.clone(origScene)
    const tint     = CHAR_TINT[classId]
    const hideSet  = new Set(CHAR_HIDE[classId] ?? [])
    const emissive = new THREE.Color(tint.emissive)
    cloned.traverse(child => {
      if (hideSet.has(child.name)) { child.visible = false; return }
      const mesh = child as THREE.Mesh
      if (mesh.isMesh && tint.emissiveInt > 0) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(m => applyCharTint(m, emissive, tint.emissiveInt))
        } else {
          mesh.material = applyCharTint(mesh.material, emissive, tint.emissiveInt)
        }
      }
    })
    return cloned
  }, [origScene, classId])

  useEffect(() => {
    const idle = actions['Idle'] ?? actions['CharacterArmature|Idle']
    idle?.reset().fadeIn(0.3).play()
  }, [actions])

  const playOneShot = useCallback((name: string) => {
    const action = actions[name]
    const idle = actions['Idle'] ?? actions['CharacterArmature|Idle']
    if (!action) return
    idle?.fadeOut(0.1)
    action.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play()
    queueIdleReset(action, idle)
  }, [actions])

  useImperativeHandle(ref, () => ({
    playAttack: () => playOneShot(CHAR_ATTACK_ANIM[classId]),
    playHurt: () => {
      const hurtAnim = actions['Hit_A'] ? 'Hit_A'
        : actions['RecieveHit'] ? 'RecieveHit'
        : actions['CharacterArmature|HitRecieve'] ? 'CharacterArmature|HitRecieve'
        : null
      if (hurtAnim) playOneShot(hurtAnim)
    },
  }), [actions, classId, playOneShot])

  const modelScale = CHAR_SCALE[classId] ?? 1
  const yOff = CHAR_Y_OFFSET[classId] ?? 0
  const needsZUp = ZUPCHAR.has(classId)
  const yaw = Math.PI / 2

  return (
    <group ref={groupRef}
      position={[position[0], position[1] + yOff, position[2]]}
      rotation={[0, yaw, 0]}
      scale={modelScale}
    >
      {needsZUp ? (
        // CharacterRPG.glb already includes an internal -90° X on CharacterArmature,
        // so we flip the external wrapper sign to avoid double-rotation (sideways).
        <group rotation={[Math.PI / 2, 0, 0]}>
          <primitive object={scene} />
        </group>
      ) : (
        <primitive object={scene} />
      )}
    </group>
  )
})
CharacterModel.displayName = 'CharacterModel'

// ── BossAura – glowing ring for Hard (final boss) ────────────────────────────
function BossAura({ color }: { color: string }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(() => {
    if (matRef.current)
      matRef.current.emissiveIntensity = 1.5 + Math.sin(Date.now() * 0.004) * 1.2
  })
  const col = useMemo(() => new THREE.Color(color), [color])
  return (
    <group>
      {/* Outer ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <torusGeometry args={[1.5, 0.08, 8, 64]} />
        <meshStandardMaterial ref={matRef} color={col} emissive={col}
          emissiveIntensity={2.5} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      {/* Inner ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <torusGeometry args={[1.0, 0.04, 6, 48]} />
        <meshStandardMaterial color={col} emissive={col}
          emissiveIntensity={1.8} toneMapped={false} transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

// ── BossModel ─────────────────────────────────────────────────────────────────
const BossModel = forwardRef<
  ModelHandle,
  {
    url: string
    position: [number, number, number]
    difficulty?: string
    bossColor?: string
    bossScaleOverride?: number
  }
>(({ url, position, difficulty = 'Easy', bossColor = '#ef4444', bossScaleOverride }, ref) => {
  const groupRef  = useRef<THREE.Group>(null!)
  const rotPhase  = useRef(0)
  const { scene: origScene, animations } = useGLTF(url)
  const isHard   = difficulty === 'Hard'
  const isMedium = difficulty === 'Medium'
  const bossTint = useMemo(() => new THREE.Color(bossColor), [bossColor])
  const difficultyStyle = useMemo(() => {
    if (isHard) {
      return { emissiveIntensity: 0.95, colorMix: 0.18 }
    }
    if (isMedium) {
      return { emissiveIntensity: 0.35, colorMix: 0.08 }
    }
    return { emissiveIntensity: 0, colorMix: 0 }
  }, [isHard, isMedium])
  const scene = useMemo(() => {
    const cloned = SkeletonUtils.clone(origScene)
    cloned.traverse(child => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(material =>
          applyBossDifficultyTint(
            material,
            bossTint,
            difficultyStyle.emissiveIntensity,
            difficultyStyle.colorMix,
          )
        )
      } else {
        mesh.material = applyBossDifficultyTint(
          mesh.material,
          bossTint,
          difficultyStyle.emissiveIntensity,
          difficultyStyle.colorMix,
        )
      }
    })
    return cloned
  }, [origScene, bossTint, difficultyStyle])
  const { actions } = useAnimations(animations, scene)
  const modelYOffset = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(scene)
    if (!Number.isFinite(bounds.min.y)) return 0
    return -bounds.min.y
  }, [scene])

  // Scale: Easy=1.0, Medium=subtle increase, Hard=large boss presence.
  const bossScale = typeof bossScaleOverride === 'number'
    ? bossScaleOverride
    : isHard ? 1.35 : isMedium ? 1.12 : 1.0

  const idleAction = actions['Idle']
    ?? actions['CharacterArmature|Idle']
    ?? actions['Armature|Idle']
    ?? getFirstAvailableAction(actions)

  useEffect(() => {
    idleAction?.reset().fadeIn(0.3).play()
    return () => {
      Object.values(actions).forEach(action => action?.stop())
    }
  }, [actions, idleAction])

  useFrame((_, dt) => {
    rotPhase.current += dt * (isHard ? 0.7 : 0.5)
    if (groupRef.current)
      groupRef.current.rotation.y = -Math.PI / 2 + Math.sin(rotPhase.current) * (isHard ? 0.18 : 0.12)
  })

  const playOneShot = useCallback((name: string) => {
    const action = actions[name]
    const idle = idleAction
    if (!action) return
    idle?.fadeOut(0.1)
    action.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play()
    queueIdleReset(action, idle)
  }, [actions, idleAction])

  useImperativeHandle(ref, () => ({
    playAttack: () => playOneShot('1H_Melee_Attack_Slice_Diagonal'),
    playHurt: () => {
      playOneShot('Hit_A')
      scene.traverse(child => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh) return
        const mat = mesh.material as THREE.MeshStandardMaterial
        if (!mat?.emissive) return
        const orig = mat.emissive.clone()
        mat.emissive.setRGB(0.7, 0, 0)
        setTimeout(() => mat.emissive.copy(orig), 350)
      })
    },
  }), [scene, playOneShot])

  return (
    <group ref={groupRef} position={position} scale={bossScale}>
      <group position={[0, modelYOffset, 0]}>
        <primitive object={scene} />
      </group>
      {isHard && <BossAura color={bossColor} />}
    </group>
  )
})
BossModel.displayName = 'BossModel'

// ── Arena geometry ────────────────────────────────────────────────────────────
function Arena() {
  const floorMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: '#1a1208', roughness: 0.95 }), [])
  const wallMat  = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: '#241b0e', roughness: 0.92 }), [])
  const stoneMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: '#2d2416', roughness: 0.9, metalness: 0.06 }), [])

  const pillars: [number, number, number][] = [
    [-7, 2.5, -3], [-7, 2.5, 3],
    [ 7, 2.5, -3], [ 7, 2.5, 3],
    [-7, 2.5,  0], [ 7, 2.5,  0],
  ]

  return (
    <group>
      {/* Stone floor */}
      <mesh material={floorMat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 14]} />
      </mesh>

      {/* Back wall */}
      <mesh material={wallMat} position={[0, 4, -7]} receiveShadow>
        <planeGeometry args={[22, 10]} />
      </mesh>

      {/* Side walls */}
      <mesh material={wallMat} position={[-11, 4, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[14, 10]} />
      </mesh>
      <mesh material={wallMat} position={[11, 4, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[14, 10]} />
      </mesh>

      {/* Pillars */}
      {pillars.map((pos, i) => (
        <mesh key={i} material={stoneMat} position={pos} castShadow receiveShadow>
          <cylinderGeometry args={[0.4, 0.5, 5.2, 8]} />
        </mesh>
      ))}

      {/* Ceiling to seal the dungeon */}
      <mesh material={wallMat} position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[22, 14]} />
      </mesh>

      {/* Character platform glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2.8, 0.01, 0]}>
        <circleGeometry args={[1.3, 32]} />
        <meshBasicMaterial color="#1d4ed8" transparent opacity={0.25} />
      </mesh>
      {/* Boss platform glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.8, 0.01, 0]}>
        <circleGeometry args={[1.3, 32]} />
        <meshBasicMaterial color="#7f1d1d" transparent opacity={0.22} />
      </mesh>

      {/* Torch-like point lights along walls */}
      <pointLight position={[-6, 3.5, -2.5]} color="#ff8833" intensity={0.6} distance={8} />
      <pointLight position={[ 6, 3.5, -2.5]} color="#ff8833" intensity={0.6} distance={8} />
      <pointLight position={[-6, 3.5,  2.5]} color="#ff6622" intensity={0.5} distance={7} />
      <pointLight position={[ 6, 3.5,  2.5]} color="#ff6622" intensity={0.5} distance={7} />
    </group>
  )
}

// ── Flying projectile ─────────────────────────────────────────────────────────
function Projectile({ classId, onComplete }: { classId: ClassId; onComplete: () => void }) {
  const meshRef   = useRef<THREE.Mesh>(null!)
  const progress  = useRef(0)
  const completed = useRef(false)
  const color     = PROJ_COLOR[classId]

  useFrame((_, dt) => {
    if (completed.current) return
    progress.current += dt * 2.8
    if (progress.current >= 1) {
      completed.current = true
      onComplete()
      return
    }
    if (!meshRef.current) return
    const t = progress.current
    meshRef.current.position.x = -2.8 + (2.8 - (-2.8)) * t   // char → boss x
    meshRef.current.position.y = 2.2 + Math.sin(t * Math.PI) * 0.9
    meshRef.current.rotation.x += dt * 6
    meshRef.current.rotation.y += dt * 9
  })

  return (
    <mesh ref={meshRef} position={[-2.8, 2.2, 0]}>
      <icosahedronGeometry args={[0.13, 1]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3}
        toneMapped={false} />
    </mesh>
  )
}

// ── HP bar helpers ────────────────────────────────────────────────────────────
function HpBar({
  hp, maxHp = 100, color, label, align,
}: {
  hp: number; maxHp?: number; color: string; label: string; align: 'left' | 'right'
}) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100))
  const barColor = pct > 50 ? color : pct > 20 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
      alignItems: align === 'left' ? 'flex-start' : 'flex-end',
    }}>
      <div style={{
        fontSize: 13,
        fontWeight: 800,
        color: '#cbd5e1',
        fontFamily: 'monospace',
        lineHeight: 'normal',
        letterSpacing: 0.4,
      }}>
        {label}
      </div>
      <div style={{
        width: '100%', height: 18,
        background: '#0f172a',
        borderRadius: 5,
        border: '1px solid #1e293b',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 0, right: `${100 - pct}%`,
          background: `linear-gradient(90deg, ${barColor}88, ${barColor})`,
          borderRadius: 3,
          transition: 'right 0.3s ease',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 900, color: '#fff', fontFamily: 'monospace',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        }}>
          {hp} / {maxHp}
        </div>
      </div>
    </div>
  )
}

// ── Floating damage text ──────────────────────────────────────────────────────
interface FloatingText { id: number; text: string; color: string; x: number }

function FloatingTexts({ texts }: { texts: FloatingText[] }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      {texts.map(t => (
        <div key={t.id} style={{
          position: 'absolute',
          left: t.x,
          top: '40%',
          transform: 'translateX(-50%)',
          fontSize: 18,
          fontWeight: 900,
          color: t.color,
          fontFamily: 'monospace',
          textShadow: '0 2px 8px rgba(0,0,0,0.9)',
          animation: 'floatUp 1.2s ease-out forwards',
          pointerEvents: 'none',
        }}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

// ── BossChallenge (main export) ───────────────────────────────────────────────
export interface BossChallengeRef {
  /** Called after backend returns answer verdict */
  triggerAttack: (isCorrect: boolean) => void
  /** Called after backend returns answer verdict + optional damage numbers */
  triggerVerdict: (verdict: BattleVerdict) => void
  /** Resolve the final battle using whichever side has lower remaining HP */
  resolveBattleEndByHealth: () => void
}

export interface BattleVerdict {
  isCorrect: boolean
  bossDamage?: number
  charDamage?: number
}

const BOSS_MAX_HP = 100
const CHAR_MAX_HP = 100

export const BossChallenge = forwardRef<
  BossChallengeRef,
  {
    classId: ClassId
    bossType?: BossType
    difficulty?: string
    /**
     * Override boss model URL (multiplayer demo: allow a single fixed raid boss model).
     * If not provided, `bossType` mapping is used.
     */
    bossUrl?: string
    /**
     * Override the boss UI label/colors (useful when `bossType` doesn't match the overridden model).
     */
    bossUiOverride?: Partial<{ name: string; color: string; glowColor: string }>
    /**
     * Override boss model scale (useful for different GLB proportions/animation ranges).
     */
    bossScaleOverride?: number
    /**
     * For multiplayer: show other players' character models (visual only).
     * HP/damage animations only apply to the local player (this component's `classId`).
     */
    extraPlayers?: Array<{ playerId: string; classId: ClassId; name?: string }>
    /** For multiplayer: controlled HP from backend. */
    externalBossHp?: number
    /** For multiplayer: controlled HP from backend. */
    externalCharHp?: number
    /** Optional canvas wrapper height, e.g. "clamp(360px, 60vw, 600px)" */
    arenaHeight?: string
    /**
     * For multiplayer: override local character scale.
     * Used to flip relative proportions vs other players / boss.
     */
    localCharScaleOverride?: number
    /**
     * For multiplayer: override extra players character scale (visual only).
     */
    extraPlayersScaleOverride?: number
    /**
     * Override boss position [x, y, z].
     * Single-player uses original position, multiplayer uses new adjusted position.
     */
    bossPosOverride?: [number, number, number]
  }
>(({ classId, bossType = 'grammar_golem', difficulty = 'Easy', bossUrl, bossUiOverride, bossScaleOverride, extraPlayers = [], externalBossHp, externalCharHp, arenaHeight = 'clamp(340px, 58vw, 560px)', localCharScaleOverride, extraPlayersScaleOverride, bossPosOverride }, ref) => {
  const charModelRef = useRef<ModelHandle>(null)
  const bossModelRef = useRef<ModelHandle>(null)
  const pendingBossDamageRef = useRef<number | null>(null)
  const charHpRef = useRef(typeof externalCharHp === 'number' ? externalCharHp : CHAR_MAX_HP)
  const bossHpRef = useRef(typeof externalBossHp === 'number' ? externalBossHp : BOSS_MAX_HP)
  // When external HP props are provided (multiplayer), internal HP mutations are skipped.
  // The server is the single source of truth and externalBossHp/externalCharHp drive the bars.
  const isExternalHpModeRef = useRef(typeof externalBossHp === 'number' || typeof externalCharHp === 'number')
  useEffect(() => {
    isExternalHpModeRef.current = typeof externalBossHp === 'number' || typeof externalCharHp === 'number'
  }, [externalBossHp, externalCharHp])

  const [locked,         setLocked]       = useState(false)
  const [charHp,         setCharHp]       = useState(typeof externalCharHp === 'number' ? externalCharHp : CHAR_MAX_HP)
  const [bossHp,         setBossHp]       = useState(typeof externalBossHp === 'number' ? externalBossHp : BOSS_MAX_HP)
  const [showProjectile, setShowProjectile] = useState(false)
  const [floatingTexts,  setFloatingTexts] = useState<FloatingText[]>([])
  const [showWeaponPicker, setShowWeaponPicker] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Recover gracefully from WebGL context loss (e.g. tab switching / memory pressure).
  useEffect(() => {
    const canvas = canvasRef.current?.querySelector('canvas')
    if (!canvas) return
    const onContextLost = (e: Event) => {
      e.preventDefault()
      console.warn('[BossChallenge] WebGL context lost, will recover on restore.')
    }
    const onContextRestored = () => {
      console.info('[BossChallenge] WebGL context restored.')
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
    }
  }, [])

  useEffect(() => {
    if (typeof externalCharHp === 'number') {
      charHpRef.current = externalCharHp
      setCharHp(externalCharHp)
    }
  }, [externalCharHp])

  useEffect(() => {
    if (typeof externalBossHp === 'number') {
      bossHpRef.current = externalBossHp
      setBossHp(externalBossHp)
    }
  }, [externalBossHp])

  // Inventory system (localStorage-backed)
  const { inventory, equipWeapon, usePotion: consumePotion } = useInventory()
  const equippedWeapon = WEAPON_CATALOG.find(w => w.id === inventory.equippedWeaponId)
    ?? WEAPON_CATALOG[0]
  const ownedWeapons = WEAPON_CATALOG.filter(w => inventory.ownedWeaponIds.includes(w.id))

  const bossUIBase = BOSS_UI[bossType]
  const bossUIOverridden = bossUiOverride ? { ...bossUIBase, ...bossUiOverride } : bossUIBase
  const bossUI = difficulty === 'Hard'
    ? { ...bossUIOverridden, name: `👑 ${bossUIOverridden.name.replace(/^[^\s]+\s/, '')}` }
    : bossUIOverridden

  const floatIdSeq = useRef(1)
  const addFloat = useCallback((text: string, color: string, x: number) => {
    const id = floatIdSeq.current++
    setFloatingTexts(prev => [...prev, { id, text, color, x }])
    setTimeout(() => setFloatingTexts(prev => prev.filter(t => t.id !== id)), 1200)
  }, [])

  const handleUsePotion = useCallback(async (potionId: string) => {
    const healed = await consumePotion(potionId)
    if (healed === 0) return
    setCharHp(h => Math.min(CHAR_MAX_HP, h + healed))
    addFloat(`+${healed} HP`, '#34d399', 22)
  }, [consumePotion, addFloat])

  const applyBossDamage = useCallback((dmg: number) => {
    if (isExternalHpModeRef.current) return   // server controls HP — only show float animation
    if (!Number.isFinite(dmg) || dmg <= 0) return
    setBossHp(h => {
      const next = Math.max(0, h - dmg)
      bossHpRef.current = next
      if (next <= 0) {
        addFloat('⚡ DEFEATED!', '#10b981', 65)
      } else {
        addFloat(`-${dmg}`, '#f87171', 65)
      }
      return next
    })
  }, [addFloat])

  const applyCharDamage = useCallback((dmg: number) => {
    if (isExternalHpModeRef.current) return   // server controls HP — only show float animation
    if (!Number.isFinite(dmg) || dmg <= 0) return
    setCharHp(h => {
      const next = Math.max(0, h - dmg)
      charHpRef.current = next
      if (next <= 0) {
        addFloat('💀 KO!', '#f87171', 28)
      } else {
        addFloat(`-${dmg}`, '#f87171', 28)
      }
      return next
    })
  }, [addFloat])

  useImperativeHandle(ref, () => ({
    triggerAttack(isCorrect) {
      // Deprecated backward-compat method. We no longer generate any random damage on the client.
      // (Only triggerVerdict() should be used now.)
      if (locked) return
      setLocked(true)
      pendingBossDamageRef.current = null

      if (isCorrect) {
        charModelRef.current?.playAttack()
        if (IS_RANGED.has(classId)) {
          // No backend verdict damage provided -> apply 0 damage and log.
          console.error('BossChallenge.triggerAttack called without backend damage')
          pendingBossDamageRef.current = 0
          setShowProjectile(true)
        } else {
          setTimeout(() => {
            bossModelRef.current?.playHurt()
            applyBossDamage(0)
          }, 500)
          setTimeout(() => setLocked(false), 950)
        }
      } else {
        bossModelRef.current?.playAttack()
        setTimeout(() => {
          charModelRef.current?.playHurt()
          applyCharDamage(0)
        }, 420)
        setTimeout(() => setLocked(false), 950)
      }
    },
    triggerVerdict(verdict) {
      const { isCorrect, bossDamage, charDamage } = verdict
      if (locked) return
      setLocked(true)
      pendingBossDamageRef.current = null

      const bossDmg = typeof bossDamage === 'number' ? bossDamage : null
      const charDmg = typeof charDamage === 'number' ? charDamage : null

      if (isCorrect) {
        charModelRef.current?.playAttack()

        if (IS_RANGED.has(classId)) {
          pendingBossDamageRef.current = isExternalHpModeRef.current ? 0 : (bossDmg ?? 0)
          setShowProjectile(true)
        } else {
          setTimeout(() => {
            bossModelRef.current?.playHurt()
            if (isExternalHpModeRef.current) {
              // Show float text only — HP bar is driven by externalBossHp prop
              if (bossDmg && bossDmg > 0) addFloat(`-${bossDmg}`, '#f87171', 65)
            } else {
              applyBossDamage(bossDmg ?? 0)
            }
          }, 500)
          setTimeout(() => setLocked(false), 950)
        }
      } else {
        bossModelRef.current?.playAttack()
        setTimeout(() => {
          charModelRef.current?.playHurt()
          if (isExternalHpModeRef.current) {
            // Show float text only — HP bar is driven by externalCharHp prop
            if (charDmg && charDmg > 0) addFloat(`-${charDmg}`, '#f87171', 28)
          } else {
            applyCharDamage(charDmg ?? 0)
          }
        }, 420)
        setTimeout(() => setLocked(false), 950)
      }
    },
    resolveBattleEndByHealth() {
      pendingBossDamageRef.current = null
      setShowProjectile(false)

      const currentBossHp = bossHpRef.current
      const currentCharHp = charHpRef.current

      // Tie goes to the player so the set always resolves decisively.
      const winner = currentBossHp < currentCharHp ? 'boss' : 'player'

      if (winner === 'player') {
        if (currentBossHp > 0) {
          bossModelRef.current?.playHurt()
          applyBossDamage(currentBossHp)
        }
        setLocked(false)
        return
      }

      if (currentCharHp > 0) {
        charModelRef.current?.playHurt()
        applyCharDamage(currentCharHp)
      }
      setLocked(false)
    },
  }), [locked, classId, addFloat, applyBossDamage, applyCharDamage])

  const handleProjectileComplete = useCallback(() => {
    setShowProjectile(false)
    bossModelRef.current?.playHurt()
    const dmg = typeof pendingBossDamageRef.current === 'number'
      ? pendingBossDamageRef.current
      : 0
    pendingBossDamageRef.current = null
    applyBossDamage(dmg)
    setTimeout(() => setLocked(false), 500)
  }, [applyBossDamage])

  // ── Tier colour helper ────────────────────────────────────────────────────
  const tierColor = (tier: 1 | 2 | 3) =>
    tier === 3 ? '#f59e0b' : tier === 2 ? '#a78bfa' : '#6b7280'

  // Visual-only slots for extra players (multiplayer).
  const extraPlayerPositions: [number, number, number][] = [
    [-3.05, 0, -0.45],
    [-3.05, 0,  0.45],
    [-2.55, 0, -0.95],
    [-2.55, 0,  0.95],
  ]

  const localCharScale = typeof localCharScaleOverride === 'number' 
    ? localCharScaleOverride 
    : extraPlayers.length > 0 ? 0.9 : 0.8
  const extraCharScale = typeof extraPlayersScaleOverride === 'number' ? extraPlayersScaleOverride : 0.85

  const bossPos: [number, number, number] = bossPosOverride ?? (
    extraPlayers.length > 0
      ? [2.2, -0.8, 0]   // 聯機：拉近
      : [3, 0.3, 0.6]    // 單人：拉近 + 降低
  )

  return (
    <div style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* ── 3D Battle canvas ── */}
      <div ref={canvasRef} style={{ position: 'relative', width: '100%', height: arenaHeight }}>
        <FloatingTexts texts={floatingTexts} />

        {/* HP bars */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
          padding: '10px 16px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.65) 80%, transparent)',
          display: 'flex', gap: 16, alignItems: 'flex-start',
        }}>
          <HpBar hp={charHp} maxHp={CHAR_MAX_HP} color="#3b82f6" label="YOUR HP" align="left" />
          <HpBar hp={bossHp} maxHp={BOSS_MAX_HP} color={bossUI.color} label={bossUI.name} align="right" />
        </div>

        <Canvas camera={{ position: extraPlayers.length > 0 ? [0, 3.2, 5.0] : [0, 3.2, 4.5], fov: extraPlayers.length > 0 ? 52 : 58 }} shadows
          style={{ width: '100%', height: '100%' }} gl={{ antialias: true }}>
          <Environment files="/assets/env/dungeon-cave.hdr" background backgroundBlurriness={0.08} />
          <ambientLight intensity={difficulty === 'Hard' ? 0.2 : 0.35} />
          <directionalLight position={[-3, 9, 5]} intensity={1.8} castShadow shadow-mapSize={[1024, 1024]} />
          <pointLight position={[-2.8, 4, 2]} color="#6090ff" intensity={1.2} />
          <pointLight position={[2.8, 4, 2]}
            color={difficulty === 'Hard' ? bossUI.color : '#ff4422'}
            intensity={difficulty === 'Hard' ? 2.5 : 0.9} />
          <pointLight position={[0, 6, -5]} color="#ffffff" intensity={0.4} />
          {difficulty === 'Hard' && (
            <pointLight position={[2.8, 8, 0]} color={bossUI.color} intensity={3} distance={12} />
          )}
          <Arena />

          <Suspense fallback={null}>
            <group scale={localCharScale}>
              <CharacterModel
                ref={charModelRef}
                url={CHAR_MODELS[classId]}
                classId={classId}
                position={extraPlayers.length > 0 ? [-3.55, 0, 0] : [-3.5, 0, 0]}
              />
            </group>
          </Suspense>

          {/* Other players (visual only) - scale down to avoid "too big /割裂" */}
          {extraPlayers.length > 0 && extraPlayers.map((p, idx) => (
            <Suspense fallback={null} key={p.playerId}>
              <group scale={extraCharScale}>
                <CharacterModel
                  url={CHAR_MODELS[p.classId]}
                  classId={p.classId}
                  position={extraPlayerPositions[idx] ?? [-2.8, 0, idx % 2 === 0 ? -0.6 : 0.6]}
                />
              </group>
            </Suspense>
          ))}

          <Suspense fallback={null}>
            <BossModel
              key={`${bossType}-${difficulty}-${bossUI.color}`}
              ref={bossModelRef}
              url={bossUrl ?? BOSS_MODELS[bossType]}
              position={bossPos}
              difficulty={difficulty}
              bossColor={bossUI.color}
              bossScaleOverride={bossScaleOverride}
            />
          </Suspense>

          {showProjectile && (
            <Projectile classId={classId} onComplete={handleProjectileComplete} />
          )}
        </Canvas>

        <style>{`
          @keyframes floatUp {
            0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-60px); }
          }
        `}</style>

        {locked && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, cursor: 'not-allowed' }} />
        )}
      </div>

      {/* ── Bottom Battle Panel ─────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>

        {/* ── Weapon slot ── */}
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', fontWeight: 800, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Equipped
          </div>
          <button
            onClick={() => setShowWeaponPicker(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.35)',
              color: '#fbbf24', fontFamily: 'monospace', fontSize: 14, fontWeight: 800,
            }}
          >
            <span style={{ fontSize: 20 }}>{equippedWeapon?.icon}</span>
            <span>{equippedWeapon?.name}</span>
            <span style={{ fontSize: 12, color: tierColor(equippedWeapon?.tier ?? 1) }}>
              {'★'.repeat(equippedWeapon?.tier ?? 1)}
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>▼</span>
          </button>

          {/* Weapon picker dropdown */}
          {showWeaponPicker && (
            <div style={{
              position: 'absolute', bottom: '110%', left: 0, zIndex: 20,
              background: '#0f172a', border: '1px solid #334155',
              borderRadius: 10, padding: 8, minWidth: 200,
              boxShadow: '0 -8px 24px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', fontWeight: 800, paddingBottom: 4, borderBottom: '1px solid #1e293b', marginBottom: 2 }}>
                OWNED WEAPONS
              </div>
              {ownedWeapons.map(w => {
                const isEquipped = w.id === inventory.equippedWeaponId
                return (
                  <button
                    key={w.id}
                    onClick={() => { equipWeapon(w.id); setShowWeaponPicker(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      background: isEquipped ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isEquipped ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      color: isEquipped ? '#fbbf24' : '#94a3b8',
                      fontFamily: 'monospace', fontSize: 13,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{w.icon}</span>
                    <div>
                      <div style={{ fontWeight: 800 }}>{w.name}</div>
                      <div style={{ fontSize: 11, color: tierColor(w.tier) }}>
                        {'★'.repeat(w.tier)} · +{w.attackBonus} ATK
                      </div>
                    </div>
                    {isEquipped && <span style={{ marginLeft: 'auto', fontSize: 12 }}>✓</span>}
                  </button>
                )
              })}
              {ownedWeapons.length === 0 && (
                <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', padding: '4px 8px' }}>
                  No weapons owned. Visit the Shop!
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div style={{ width: 1, height: 48, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

        {/* ── Potions ── */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', fontWeight: 800, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Potions
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {POTION_CATALOG.map(p => {
              const entry = inventory.potions.find(e => e.id === p.id)
              if (!entry) return null
              const canUse = charHp < CHAR_MAX_HP
              return (
                <button
                  key={p.id}
                  onClick={() => handleUsePotion(p.id)}
                  disabled={!canUse}
                  title={p.description}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px', borderRadius: 8, cursor: canUse ? 'pointer' : 'not-allowed',
                    background: canUse ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${canUse ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    color: canUse ? '#34d399' : '#475569',
                    fontFamily: 'monospace', fontSize: 13, fontWeight: 800,
                    transition: 'all 0.15s', opacity: canUse ? 1 : 0.5,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{p.icon}</span>
                  <span>×{entry.count}</span>
                  <span style={{ fontSize: 12, color: canUse ? '#6ee7b7' : '#334155' }}>+{p.healAmount}HP</span>
                </button>
              )
            })}
            {inventory.potions.length === 0 && (
              <span style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', alignSelf: 'center' }}>
                No potions — buy some at the Shop!
              </span>
            )}
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ width: 1, height: 48, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

        {/* ── Gold display ── */}
        <div style={{ textAlign: 'right', minWidth: 70 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', fontWeight: 800, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Gold
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 12px', borderRadius: 8,
            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
          }}>
            <span style={{ fontSize: 18 }}>💰</span>
            <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: '#fbbf24' }}>
              {inventory.gold}g
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})

BossChallenge.displayName = 'BossChallenge'

// Preload all character and boss models
Object.values(CHAR_MODELS).forEach(url => useGLTF.preload(url))
Object.values(BOSS_MODELS).forEach(url => useGLTF.preload(url))
