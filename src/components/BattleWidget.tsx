import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'
import Phaser from 'phaser'
import { type ClassId } from '../types/character'

export type BossType =
  // ── 4 subjects × 3 difficulty tiers = 12 unique boss models ───────────────
  | 'speaking_easy'   | 'speaking_medium'   | 'speaking_hard'
  | 'writing_easy'    | 'writing_medium'    | 'writing_hard'
  | 'listening_easy'  | 'listening_medium'  | 'listening_hard'
  | 'reading_easy'    | 'reading_medium'    | 'reading_hard'
  // ── Legacy / backward-compat ───────────────────────────────────────────────
  | 'grammar_golem' | 'vocab_vampire' | 'tense_tyrant' | 'essay_empress' | 'phonics_phantom'

export interface BattleWidgetRef {
  /** Called by the parent after it receives a correct/wrong answer verdict from the backend */
  triggerAttack: (isCorrect: boolean) => void
  /**
   * Called by the parent when the backend decides the weapon should upgrade.
   * Level is 1 | 2 | 3.  The Phaser scene itself never counts answers.
   */
  setWeaponLevel: (level: number) => void
}

const BOSS_CONFIG: Record<BossType, { maxHp: number; name: string; color: number }> = {
  speaking_easy:   { maxHp:  60, name: '👄 Word Sprite',       color: 0x34d399 },
  speaking_medium: { maxHp:  80, name: '👄 Voice Phantom',     color: 0x60a5fa },
  speaking_hard:   { maxHp: 120, name: '👄 The Screamer',      color: 0xff4444 },
  writing_easy:    { maxHp:  65, name: '📜 Ink Wisp',          color: 0xa78bfa },
  writing_medium:  { maxHp:  85, name: '📜 Arcane Scribe',     color: 0x8b5cf6 },
  writing_hard:    { maxHp: 130, name: '📜 The Lich Author',   color: 0xcc44ff },
  listening_easy:  { maxHp:  60, name: '👂 Shadow Imp',        color: 0x6ee7b7 },
  listening_medium:{ maxHp:  80, name: '👂 Void Stalker',      color: 0x22c55e },
  listening_hard:  { maxHp: 120, name: '👂 The Silence',       color: 0x6d28d9 },
  reading_easy:    { maxHp:  70, name: '📖 Page Knight',       color: 0xfbbf24 },
  reading_medium:  { maxHp:  90, name: '📖 Iron Lore Keeper',  color: 0x3b82f6 },
  reading_hard:    { maxHp: 140, name: '📖 FINAL BOSS: Tyrant', color: 0xff8800 },
  grammar_golem:   { maxHp: 100, name: '💀 Grammar Golem',   color: 0xe02424 },
  vocab_vampire:   { maxHp:  80, name: '🦇 Vocab Vampire',   color: 0x3b82f6 },
  tense_tyrant:    { maxHp:  90, name: '⚔️ Tense Tyrant',    color: 0xf59e0b },
  essay_empress:   { maxHp:  85, name: '👑 Essay Empress',   color: 0x10b981 },
  phonics_phantom: { maxHp:  75, name: '👻 Phonics Phantom', color: 0xa78bfa },
}

// ─── Deterministic star positions ────────────────────────────────────────────
const STARS: [number, number, number][] = Array.from({ length: 40 }, (_, i) => [
  ((i * 131 + 79) % 720) + 40,   // x
  ((i * 97  + 53) % 85)  + 34,   // y (below HP bar)
  i % 5 === 0 ? 1.5 : 1,         // radius
])

// ─── Battle Scene ─────────────────────────────────────────────────────────────
// ── Which roguelike spritesheet row each class uses (frame = row × 54) ────────
const CHAR_FRAMES: Record<ClassId, number> = {
  knight:  378,   // row 7 – gray armored warrior
  mage:    486,   // row 9 – white-hair wizard
  rogue:   540,   // row 10 – teal-clad assassin
  bard:    324,   // row 6 – orange adventurer
  archer:  270,   // row 5 – red wilderness hunter
  paladin: 432,   // row 8 – holy armored champion
}

// ── Weapon config per class ────────────────────────────────────────────────────
const WEAPON_NAMES: Record<ClassId, [string, string, string]> = {
  knight:  ['Iron Sword',    'Steel Blade',    '⚡ Thunderstrike'],
  mage:    ['Wooden Staff',  'Crystal Staff',  '✨ Arcane Scepter'],
  rogue:   ['Iron Dagger',   'Twin Daggers',   '☠️ Venom Fang'],
  bard:    ['Lute',          'Silver Lyre',    '🎵 Song of Ruin'],
  archer:  ['Short Bow',     'Longbow',        '🔥 Flamebow'],
  paladin: ['Iron Hammer',   'Holy Maul',      '🌟 Divine Wrath'],
}

class BattleScene extends Phaser.Scene {
  private classId: ClassId
  private bossType: BossType
  private bossHp: number
  private charHp = 100
  private charHpFill!: Phaser.GameObjects.Graphics
  private bossHpFill!: Phaser.GameObjects.Graphics
  private charHpText!: Phaser.GameObjects.Text
  private bossHpText!: Phaser.GameObjects.Text
  private charCont!: Phaser.GameObjects.Container
  private bossCont!: Phaser.GameObjects.Container
  private charFloatTween!: Phaser.Tweens.Tween
  private bossFloatTween!: Phaser.Tweens.Tween
  private charSprite!: Phaser.GameObjects.Sprite
  private weaponGfx!: Phaser.GameObjects.Graphics
  private weaponLevelText!: Phaser.GameObjects.Text
  private weaponLevel = 1    // controlled externally (backend decides upgrades)
  private locked = false

  // ── Canvas / layout constants ────────────────────────────────────────────
  private readonly W    = 800
  private readonly BAR  = 30
  private readonly CX   = 200
  private readonly BX   = 600
  private readonly GY   = 375
  private readonly BSCL = 1.45

  constructor(classId: ClassId, bossType: BossType = 'grammar_golem') {
    super({ key: 'BattleScene' })
    this.classId = classId
    this.bossType = bossType
    this.bossHp = BOSS_CONFIG[bossType].maxHp
  }

  // ─────────────────────────────────────────────────────────────────────────
  preload() {
    this.load.spritesheet('roguelike', '/assets/roguelike-chars.png', {
      frameWidth: 16, frameHeight: 16, spacing: 1,
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  create() {
    const { W, BAR, CX, BX, GY } = this

    this.drawBackground()
    this.drawHpBarBg()

    // HP fills (drawn on top of BG graphics, behind text)
    this.charHpFill = this.add.graphics()
    this.bossHpFill = this.add.graphics()

    // HP text labels
    const hpStyle = {
      fontSize: '13px', color: '#ffffff', fontFamily: 'monospace',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }
    this.charHpText = this.add.text(W * 0.25, BAR / 2, '', hpStyle).setOrigin(0.5)
    this.bossHpText = this.add.text(W * 0.75, BAR / 2, '', { ...hpStyle, color: `#${BOSS_CONFIG[this.bossType].color.toString(16).padStart(6, '0')}` }).setOrigin(0.5)
    this.refreshHpBars()

    // ── Character (Roguelike pixel sprite) ───────────────────────────────────
    const cy = GY - 64
    this.charCont = this.add.container(CX, cy)

    // Ground shadow
    const charShadow = this.add.graphics()
    charShadow.fillStyle(0x000000, 0.25); charShadow.fillEllipse(0, 68, 80, 16)
    this.charCont.add(charShadow)

    // Roguelike pixel sprite – scaled 8× with nearest-neighbor
    this.charSprite = this.add.sprite(0, 0, 'roguelike', CHAR_FRAMES[this.classId])
    this.charSprite.setOrigin(0.5, 0.5)
    this.charSprite.setScale(8)
    this.charCont.add(this.charSprite)

    // Weapon overlay drawn on top of the sprite
    this.weaponGfx = this.add.graphics()
    this.charCont.add(this.weaponGfx)
    this.redrawWeapon()

    // ── Boss (Graphics-drawn) ─────────────────────────────────────────────────
    const by = GY - Math.round(30 * this.BSCL)
    this.bossCont = this.add.container(BX, by)
    this.drawBoss()
    this.bossCont.setScale(this.BSCL)

    // ── Idle floats ──────────────────────────────────────────────────────────
    this.charFloatTween = this.tweens.add({
      targets: this.charCont, y: cy - 10,
      duration: 1900, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    })
    this.bossFloatTween = this.tweens.add({
      targets: this.bossCont, y: by - 10,
      duration: 2200, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    })

    // Class label under character
    const charClass = ({
      knight:  '⚔️ Lexicon Knight',
      mage:    '🔮 Storm Herald',
      rogue:   '🗡️ Echo Hunter',
      bard:    '🎭 Orator\'s Champion',
      archer:  '🏹 Swift Arrow',
      paladin: '🛡️ Holy Vanguard',
    } as Record<string, string>)[this.classId] ?? '⚔️ Hero'

    this.add.text(CX, GY + 8, charClass, {
      fontSize: '11px', color: '#8892b0', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    // Weapon level indicator
    this.weaponLevelText = this.add.text(CX, GY + 22, '', {
      fontSize: '10px', color: '#fbbf24', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0)
    this.refreshWeaponLabel()

    const bCfg = BOSS_CONFIG[this.bossType]
    this.add.text(BX, GY + 14, bCfg.name, {
      fontSize: '11px',
      color: `#${bCfg.color.toString(16).padStart(6, '0')}aa`,
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    // ── Event listeners ──────────────────────────────────────────────────────
    // Fired by BattleWidget.triggerAttack – result comes from backend
    this.game.events.on('playerAttack', (isCorrect: boolean) => {
      if (this.locked) return
      this.locked = true
      if (isCorrect) this.animatePlayerAttack()
      else            this.animateBossRetaliation()
    }, this)

    // Fired by BattleWidget.setWeaponLevel – backend decides when to upgrade
    this.game.events.on('setWeaponLevel', (level: number) => {
      const clamped = Math.max(1, Math.min(3, level))
      if (clamped !== this.weaponLevel) {
        this.weaponLevel = clamped
        this.redrawWeapon()
        this.refreshWeaponLabel()
        // Upgrade fanfare
        const name = WEAPON_NAMES[this.classId][this.weaponLevel - 1]
        this.showFloatingText(this.CX, this.GY - 160, `⬆ ${name}!`, '#fbbf24')
        const flash = this.add.graphics()
        flash.fillStyle(0xfbbf24, 0.2); flash.fillCircle(this.CX, this.GY - 64, 60)
        this.tweens.add({ targets: flash, alpha: 0, duration: 600,
          onComplete: () => flash.destroy() })
      }
    }, this)
  }

  // ─── Background layers ────────────────────────────────────────────────────
  private drawBackground() {
    const { W, BAR, GY } = this
    const H = 420
    const VPX = W / 2          // vanishing-point x (center)
    const VPY = BAR + 118      // horizon / vanishing-point y

    // ── 1. SKY gradient (multi-band dark purple-blue) ────────────────────────
    const skyBands = [0x02020e, 0x030415, 0x05061c, 0x080924, 0x0b0c2c, 0x0d0f32, 0x101238, 0x12143c]
    const sky = this.add.graphics()
    const skyBH = (VPY - BAR) / skyBands.length
    skyBands.forEach((c, i) => { sky.fillStyle(c, 1); sky.fillRect(0, BAR + i * skyBH, W, skyBH + 1) })

    // ── 2. Stars ─────────────────────────────────────────────────────────────
    const sg = this.add.graphics()
    STARS.forEach(([sx, sy, r]) => { sg.fillStyle(0xffffff, 0.3 + (sy % 5) * 0.1); sg.fillCircle(sx, sy, r) })

    // ── 3. Far horizon wall + distant arch silhouette ────────────────────────
    const far = this.add.graphics()
    far.fillStyle(0x060912, 1); far.fillRect(0, VPY - 10, W, 14)
    far.lineStyle(1, 0x0b0e1e, 0.6)
    for (let x = 0; x < W; x += 38) far.lineBetween(x, VPY - 10, x, VPY + 4)

    const arch = this.add.graphics()
    arch.fillStyle(0x03050e, 1)
    arch.fillRect(350, BAR + 55, 16, VPY - BAR - 60)   // left arch pillar
    arch.fillRect(434, BAR + 55, 16, VPY - BAR - 60)   // right arch pillar
    arch.lineStyle(5, 0x03050e, 1)
    arch.beginPath(); arch.arc(400, VPY - 32, 50, Math.PI, 0, false); arch.strokePath()
    arch.fillStyle(0x05081a, 1); arch.fillRect(393, BAR + 52, 14, 22)  // keystone

    // Flanking distant ruins (even further back)
    arch.fillStyle(0x020408, 1)
    arch.fillRect(48, VPY - 55, 16, 58); arch.fillRect(40, VPY - 65, 36, 12)
    for (let mx = 42; mx < 76; mx += 12) arch.fillRect(mx, VPY - 77, 8, 14)
    arch.fillRect(W - 64, VPY - 55, 16, 58); arch.fillRect(W - 76, VPY - 65, 36, 12)
    for (let mx = W - 74; mx < W - 42; mx += 12) arch.fillRect(mx, VPY - 77, 8, 14)

    // ── 4. PERSPECTIVE FLOOR ──────────────────────────────────────────────────
    const numV = 16  // radial "slices"
    const floorPie = this.add.graphics()
    for (let i = 0; i < numV; i++) {
      const x1 = (i / numV) * W
      const x2 = ((i + 1) / numV) * W
      floorPie.fillStyle(i % 2 === 0 ? 0x0b1a2e : 0x0e1f36, 1)
      floorPie.fillTriangle(VPX, VPY, x1, GY + 8, x2, GY + 8)
    }

    // Perspective grid lines
    const gridG = this.add.graphics()
    // Radial lines
    for (let i = 0; i <= numV; i++) {
      const bx = (i / numV) * W
      const alpha = i === numV / 2 ? 0.45 : 0.22
      gridG.lineStyle(1, 0x1e3d7a, alpha)
      gridG.lineBetween(VPX, VPY, bx, GY + 8)
    }
    // Horizontal lines (perspective-spaced using power curve)
    const numH = 10
    for (let j = 1; j <= numH; j++) {
      const t = (j / numH) ** 0.58
      const y = VPY + t * (GY - VPY)
      gridG.lineStyle(1, 0x1e3d7a, 0.12 + t * 0.32)
      gridG.lineBetween(0, y, W, y)
    }
    // Slight alternating band shading between horizontal rows
    const bandG = this.add.graphics()
    for (let j = 0; j < numH; j += 2) {
      const t1 = (j / numH) ** 0.58, t2 = ((j + 1) / numH) ** 0.58
      const y1 = VPY + t1 * (GY - VPY), y2 = VPY + t2 * (GY - VPY)
      bandG.fillStyle(0xffffff, 0.018); bandG.fillRect(0, y1, W, y2 - y1)
    }

    // ── 5. Below-ground stone area ────────────────────────────────────────────
    const gnd = this.add.graphics()
    gnd.fillStyle(0x060d1c, 1); gnd.fillRect(0, GY, W, H - GY)
    gnd.lineStyle(1, 0x0e1e3a, 1)
    for (let x = 0; x <= W; x += 48) gnd.lineBetween(x, GY, x, H)
    for (let y = GY; y <= H; y += 24) gnd.lineBetween(0, y, W, y)

    // ── 6. LEFT 3-FACE STONE PILLAR ──────────────────────────────────────────
    const pFW = 34, pSW = 12          // front-face width, side-face width
    const pLX = 14, pY = BAR + 44, pH = GY - BAR - 52
    const pilL = this.add.graphics()
    pilL.fillStyle(0x000000, 0.28); pilL.fillEllipse(pLX + pFW / 2, GY + 5, pFW + 8, 10) // shadow
    pilL.fillStyle(0x091522, 1); pilL.fillRect(pLX + pFW, pY + 5, pSW, pH - 5)   // east side (shadow)
    pilL.fillStyle(0x13233e, 1); pilL.fillRect(pLX, pY, pFW, pH)                   // front face
    pilL.fillStyle(0x1c3254, 0.55); pilL.fillRect(pLX, pY, 3, pH)                  // left rim highlight
    pilL.fillStyle(0x1c3050, 0.3); pilL.fillRect(pLX + pFW - 6, pY, 6, pH)        // right shadow on front
    pilL.lineStyle(1, 0x0a1828, 0.45)                                               // horizontal seams
    for (let sy = pY + 28; sy < pY + pH; sy += 28) pilL.lineBetween(pLX, sy, pLX + pFW + pSW, sy)
    pilL.fillStyle(0x1c3258, 1); pilL.fillRect(pLX - 5, pY - 9, pFW + pSW + 6, 12) // top face
    pilL.fillStyle(0x263d6a, 0.5); pilL.fillRect(pLX - 3, pY - 7, pFW + pSW + 2, 5)// top highlight
    pilL.fillStyle(0x13233e, 1)                                                      // merlons
    for (let mx = pLX - 4; mx < pLX + pFW + 12; mx += 14) pilL.fillRect(mx, pY - 22, 9, 15)
    pilL.fillStyle(0x1c3258, 0.4)
    for (let mx = pLX - 4; mx < pLX + pFW + 12; mx += 14) pilL.fillRect(mx, pY - 22, 2, 15)

    // ── 7. RIGHT 3-FACE STONE PILLAR ─────────────────────────────────────────
    const pRX = W - pLX - pFW
    const pilR = this.add.graphics()
    pilR.fillStyle(0x000000, 0.28); pilR.fillEllipse(pRX + pFW / 2, GY + 5, pFW + 8, 10)
    pilR.fillStyle(0x091522, 1); pilR.fillRect(pRX - pSW, pY + 5, pSW, pH - 5)    // west side (shadow)
    pilR.fillStyle(0x13233e, 1); pilR.fillRect(pRX, pY, pFW, pH)
    pilR.fillStyle(0x1c3254, 0.55); pilR.fillRect(pRX + pFW - 3, pY, 3, pH)       // right rim highlight
    pilR.fillStyle(0x1c3050, 0.3); pilR.fillRect(pRX, pY, 6, pH)                  // left shadow on front
    pilR.lineStyle(1, 0x0a1828, 0.45)
    for (let sy = pY + 28; sy < pY + pH; sy += 28) pilR.lineBetween(pRX - pSW, sy, pRX + pFW, sy)
    pilR.fillStyle(0x1c3258, 1); pilR.fillRect(pRX - pSW - 1, pY - 9, pFW + pSW + 6, 12)
    pilR.fillStyle(0x263d6a, 0.5); pilR.fillRect(pRX - pSW + 1, pY - 7, pFW + pSW + 2, 5)
    pilR.fillStyle(0x13233e, 1)
    for (let mx = pRX - pSW - 2; mx < pRX + pFW + 4; mx += 14) pilR.fillRect(mx, pY - 22, 9, 15)
    pilR.fillStyle(0x1c3258, 0.4)
    for (let mx = pRX - pSW - 2; mx < pRX + pFW + 4; mx += 14) pilR.fillRect(mx + pFW - 5, pY - 22, 2, 15)

    // ── 8. GOD RAYS (atmospheric light beams from top center) ────────────────
    const ray = this.add.graphics()
    ray.fillStyle(0x3060c0, 0.05)
    ray.fillTriangle(VPX, VPY, VPX - 18, VPY, VPX - 85, GY - 15)
    ray.fillTriangle(VPX, VPY, VPX + 18, VPY, VPX + 85, GY - 15)
    ray.fillStyle(0x4070d0, 0.04)
    ray.fillTriangle(VPX - 6, VPY, VPX + 6, VPY, VPX - 35, GY - 15)
    ray.fillTriangle(VPX - 6, VPY, VPX + 6, VPY, VPX + 35, GY - 15)

    // ── 9. ATMOSPHERIC HAZE at horizon ───────────────────────────────────────
    const haze = this.add.graphics()
    haze.fillStyle(0x0c1c3e, 0.38); haze.fillRect(0, VPY - 6, W, 20)
    haze.fillStyle(0x0a1630, 0.18); haze.fillRect(0, VPY + 14, W, 22)

    // ── 10. GROUND GLOW LINES ────────────────────────────────────────────────
    const gl = this.add.graphics()
    gl.fillStyle(0x1a56db, 0.26); gl.fillRect(0, GY, W / 2, 4)
    gl.fillStyle(0xe02424, 0.26); gl.fillRect(W / 2, GY, W / 2, 4)
    gl.fillStyle(0x3b82f6, 0.07); gl.fillRect(0, GY + 4, W / 2, 14)
    gl.fillStyle(0xe02424, 0.07); gl.fillRect(W / 2, GY + 4, W / 2, 14)

    // ── 11. PLATFORM ARCANE CIRCLES ──────────────────────────────────────────
    const plat = this.add.graphics()
    plat.fillStyle(0x1d4ed8, 0.06); plat.fillEllipse(this.CX, GY + 10, 240, 52)
    plat.fillStyle(0x3b82f6, 0.11); plat.fillEllipse(this.CX, GY + 4, 148, 26)
    plat.lineStyle(1.5, 0x3b82f6, 0.32); plat.strokeEllipse(this.CX, GY + 2, 190, 34)
    plat.lineStyle(1, 0x3b82f6, 0.16); plat.strokeEllipse(this.CX, GY + 2, 220, 42)
    plat.fillStyle(0xe02424, 0.06); plat.fillEllipse(this.BX, GY + 10, 240, 52)
    plat.fillStyle(0xe02424, 0.11); plat.fillEllipse(this.BX, GY + 4, 148, 26)
    plat.lineStyle(1.5, 0xe02424, 0.32); plat.strokeEllipse(this.BX, GY + 2, 190, 34)
    plat.lineStyle(1, 0xe02424, 0.16); plat.strokeEllipse(this.BX, GY + 2, 220, 42)

    // ── 12. CENTER DIVIDER ────────────────────────────────────────────────────
    gl.lineStyle(1, 0x1a2555, 0.5)
    gl.lineBetween(W / 2, BAR + 14, W / 2, GY - 20)
    this.add.text(W / 2, (BAR + GY) / 2, 'VS', {
      fontSize: '13px', color: '#1e2a4a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5)
  }

  // ─── HP bar backgrounds ───────────────────────────────────────────────────
  private drawHpBarBg() {
    const { W, BAR } = this

    const bg = this.add.graphics()
    // Left (player) - metallic dark blue
    bg.fillStyle(0x060e20, 1); bg.fillRect(0, 0, W / 2, BAR)
    bg.fillStyle(0x0c1e3a, 1); bg.fillRect(0, 0, W / 2, BAR - 8)     // lighter upper band
    bg.fillStyle(0x1a3060, 0.35); bg.fillRect(0, 0, W / 2, 5)          // top highlight strip
    bg.fillStyle(0x00000, 0.4); bg.fillRect(0, BAR - 4, W / 2, 4)      // bottom shadow strip
    bg.lineStyle(1, 0x1e3a6a, 0.8); bg.strokeRect(0, 0, W / 2, BAR)

    // Right (boss) - metallic dark red
    bg.fillStyle(0x200606, 1); bg.fillRect(W / 2, 0, W / 2, BAR)
    bg.fillStyle(0x3a0c0c, 1); bg.fillRect(W / 2, 0, W / 2, BAR - 8)
    bg.fillStyle(0x601a1a, 0.35); bg.fillRect(W / 2, 0, W / 2, 5)
    bg.fillStyle(0x000000, 0.4); bg.fillRect(W / 2, BAR - 4, W / 2, 4)
    bg.lineStyle(1, 0x5a1010, 0.8); bg.strokeRect(W / 2, 0, W / 2, BAR)

    // Centre divider
    bg.fillStyle(0x000000, 1); bg.fillRect(W / 2 - 1, 0, 2, BAR)
    bg.fillStyle(0x404060, 0.5); bg.fillRect(W / 2, 0, 1, BAR)
  }

  // ─── Refresh HP fills + text ──────────────────────────────────────────────
  private refreshHpBars() {
    const { W, BAR } = this
    const pW = W / 2 - 2
    const bW = W / 2 - 2
    const bH = BAR - 6

    this.charHpFill.clear()
    const cr = Math.max(0, this.charHp / 100)
    const cc = cr > 0.5 ? 0x10b981 : cr > 0.25 ? 0xf59e0b : 0xe02424
    this.charHpFill.fillStyle(cc, 1)
    this.charHpFill.fillRoundedRect(2, 3, pW * cr, bH, 3)
    this.charHpFill.fillStyle(0xffffff, 0.16)
    if (cr > 0.05) this.charHpFill.fillRoundedRect(2, 3, pW * cr, bH * 0.42, 3)

    this.bossHpFill.clear()
    const maxBossHp = BOSS_CONFIG[this.bossType].maxHp
    const br = Math.max(0, this.bossHp / maxBossHp)
    this.bossHpFill.fillStyle(BOSS_CONFIG[this.bossType].color, 1)
    this.bossHpFill.fillRoundedRect(W / 2 + 2, 3, bW * br, bH, 3)
    this.bossHpFill.fillStyle(0xffffff, 0.16)
    if (br > 0.05) this.bossHpFill.fillRoundedRect(W / 2 + 2, 3, bW * br, bH * 0.42, 3)

    this.charHpText.setText(`HP  ${this.charHp} / 100`)
    this.bossHpText.setText(`BOSS  ${this.bossHp} / ${maxBossHp}`)
  }


  // ─── Draw Boss (dispatches to per-type drawing) ───────────────────────────
  private drawBoss() {
    switch (this.bossType) {
      case 'vocab_vampire':   this.drawVocabVampire();   break
      case 'tense_tyrant':    this.drawTenseTyrant();    break
      case 'essay_empress':   this.drawEssayEmpress();   break
      case 'phonics_phantom': this.drawPhonicsPhantom(); break
      default:                this.drawGrammarGolem();   break
    }
  }

  // Boss 1 – Grammar Golem (Writing) ────── dark stone sphere, 3D-lit
  private drawGrammarGolem() {
    const g = this.add.graphics()
    // Cast shadow on ground
    g.fillStyle(0x000000, 0.38); g.fillEllipse(6, 40, 72, 14)
    // Outer glow aura
    g.fillStyle(0xe02424, 0.05); g.fillCircle(0, -2, 46)
    // Base sphere – darkest layer (bottom-right in shadow)
    g.fillStyle(0x0d0818, 1); g.fillCircle(0, -2, 34)
    // Mid-tone layer
    g.fillStyle(0x1a0f3d, 1); g.fillCircle(-2, -4, 30)
    // Upper-left lit region (light source top-left)
    g.fillStyle(0x2d1b69, 1); g.fillCircle(-5, -8, 23)
    // Secondary highlight
    g.fillStyle(0x3c2580, 0.85); g.fillCircle(-8, -13, 15)
    // Tertiary highlight
    g.fillStyle(0x4e3298, 0.65); g.fillCircle(-10, -17, 9)
    // Specular hot-spot
    g.fillStyle(0x7050b8, 0.45); g.fillCircle(-12, -20, 5)
    g.fillStyle(0x9070d0, 0.25); g.fillCircle(-13, -22, 2.5)
    // Rim light on right edge (bounce light from arena floor glow)
    g.lineStyle(1.5, 0xe02424, 0.22); g.strokeCircle(0, -2, 35)
    // Glowing fissure / crack lines
    g.lineStyle(2, 0xe02424, 0.65)
    g.lineBetween(-10, -14, -4, 8); g.lineBetween(7, -18, 14, 4); g.lineBetween(-14, 4, 0, 12)
    // Inner magma glow (softer inner line)
    g.lineStyle(1, 0xff6644, 0.30)
    g.lineBetween(-9, -13, -3, 7); g.lineBetween(8, -17, 15, 5)
    // 3D horns (with own highlight side)
    g.fillStyle(0x0b0616, 1)
    g.fillTriangle(-18, -22, -27, -42, -10, -23)
    g.fillTriangle(18, -22, 27, -42, 10, -23)
    g.fillStyle(0x2a1860, 0.55)   // highlight face on left side of horns
    g.fillTriangle(-20, -24, -24, -38, -14, -24)
    g.fillTriangle(20, -24, 24, -38, 14, -24)
    // Eye socket depth
    g.fillStyle(0x000000, 0.9); g.fillCircle(0, -6, 12)
    // Eye – layered for 3D depth
    g.fillStyle(0xe02424, 0.95); g.fillCircle(0, -6, 9)
    g.fillStyle(0xff4444, 0.85); g.fillCircle(-2, -8, 6)   // offset for depth
    g.fillStyle(0xffffff, 0.85); g.fillCircle(-2, -9, 3)   // specular
    g.fillStyle(0x000000, 1);    g.fillCircle(0, -6, 3)    // pupil
    g.lineStyle(1.5, 0xe02424, 0.55); g.strokeCircle(0, -6, 11)
    this.bossCont.add(g)
    // Animated eye-pulse glow
    const eyeG = this.add.graphics(); this.bossCont.add(eyeG)
    const ed = { t: 0 }
    this.tweens.add({
      targets: ed, t: 1, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => {
        eyeG.clear()
        eyeG.fillStyle(0xe02424, ed.t * 0.28); eyeG.fillCircle(0, -6, 16 + ed.t * 4)
        eyeG.lineStyle(0.8, 0xff5533, ed.t * 0.4)
        eyeG.lineBetween(-10, -14, -4, 8); eyeG.lineBetween(7, -18, 14, 4)
      },
    })
  }

  // Boss 2 – Vocab Vampire (Listening) ──── blue bat, 3D-lit
  private drawVocabVampire() {
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.32); g.fillEllipse(5, 42, 62, 14)   // cast shadow
    // Left wing – base + 3D edge highlight
    g.fillStyle(0x122260, 0.95)
    g.fillTriangle(-8, -10, -55, -40, -48, 12)
    g.fillTriangle(-8, -10, -48, 12, -12, 18)
    g.fillStyle(0x2a4a9e, 0.5)   // wing highlight face (inner)
    g.fillTriangle(-8, -10, -42, -28, -38, 8)
    g.lineStyle(1.5, 0x3b82f6, 0.5)
    g.lineBetween(-8, -10, -55, -40); g.lineBetween(-8, -10, -48, 12); g.lineBetween(-48, -14, -30, 10)
    // Right wing
    g.fillStyle(0x122260, 0.95)
    g.fillTriangle(8, -10, 55, -40, 48, 12)
    g.fillTriangle(8, -10, 48, 12, 12, 18)
    g.fillStyle(0x2a4a9e, 0.5)
    g.fillTriangle(8, -10, 42, -28, 38, 8)
    g.lineStyle(1.5, 0x3b82f6, 0.5)
    g.lineBetween(8, -10, 55, -40); g.lineBetween(8, -10, 48, 12); g.lineBetween(48, -14, 30, 10)
    // Body (dark cape) – lit from upper-left
    g.fillStyle(0x0a1020, 1); g.fillEllipse(0, 14, 36, 44)
    g.fillStyle(0x1e3a8a, 0.65); g.fillEllipse(-2, 10, 24, 34)  // front highlight
    g.fillStyle(0x3058b0, 0.25); g.fillEllipse(-5, 6, 14, 22)   // secondary highlight
    // Head – 3D layered sphere
    g.fillStyle(0x0a1020, 1); g.fillCircle(0, -16, 18)          // base dark
    g.fillStyle(0x1c3272, 0.9); g.fillCircle(-2, -18, 14)       // mid-tone
    g.fillStyle(0x2a4898, 0.7); g.fillCircle(-4, -20, 9)        // upper highlight
    g.fillStyle(0x4060b8, 0.4); g.fillCircle(-5, -22, 5)        // specular
    // Ears – with inner lit face
    g.fillStyle(0x0a1020, 1)
    g.fillTriangle(-12, -24, -20, -44, -4, -28)
    g.fillTriangle(12, -24, 20, -44, 4, -28)
    g.fillStyle(0x3b82f6, 0.55)
    g.fillTriangle(-12, -26, -17, -40, -6, -28)
    g.fillTriangle(12, -26, 17, -40, 6, -28)
    // Eyes – 3D depth
    g.fillStyle(0x3b82f6, 1); g.fillCircle(-6, -18, 5); g.fillCircle(6, -18, 5)
    g.fillStyle(0x93c5fd, 0.9); g.fillCircle(-7, -19, 2); g.fillCircle(5, -19, 2) // offset specular
    g.fillStyle(0x000000, 1); g.fillCircle(-6, -18, 2); g.fillCircle(6, -18, 2)
    // Fangs
    g.fillStyle(0xf0f0f0, 1)
    g.fillTriangle(-4, -6, -2, 0, 0, -6)
    g.fillTriangle(4, -6, 2, 0, 0, -6)
    this.bossCont.add(g)
    const glowG = this.add.graphics(); this.bossCont.add(glowG)
    const vd = { t: 0 }
    this.tweens.add({ targets: vd, t: 1, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => { glowG.clear(); glowG.fillStyle(0x3b82f6, vd.t * 0.18); glowG.fillCircle(0, -16, 24 + vd.t * 5) } })
  }

  // Boss 3 – Tense Tyrant (Oral) ──── steel armoured knight, 3D-lit
  private drawTenseTyrant() {
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.32); g.fillEllipse(5, 42, 64, 14)   // cast shadow
    // Legs (greaves) – front lit + side shadow
    g.fillStyle(0x2a3340, 1); g.fillRoundedRect(-14, 18, 11, 24, 2); g.fillRoundedRect(3, 18, 11, 24, 2)
    g.fillStyle(0x4b5870, 1); g.fillRoundedRect(-13, 20, 6, 8, 1); g.fillRoundedRect(4, 20, 6, 8, 1) // lit front
    g.fillStyle(0x1a2230, 1); g.fillRoundedRect(-8, 18, 4, 24, 1); g.fillRoundedRect(10, 18, 4, 24, 1) // shadow side
    // Torso (breastplate) – 3D box shading
    g.fillStyle(0x2a3340, 1); g.fillRoundedRect(-17, -14, 34, 34, 4)                   // dark base
    g.fillStyle(0x4b5870, 1); g.fillRoundedRect(-14, -11, 22, 26, 3)                   // lit front panel
    g.fillStyle(0x6070a0, 0.25); g.fillRoundedRect(-12, -10, 14, 16, 2)               // upper highlight
    g.fillStyle(0x1a2230, 1); g.fillRoundedRect(8, -11, 8, 26, 2)                      // shadow edge
    // Orange chest sigil with 3D depth
    g.fillStyle(0xf59e0b, 0.95); g.fillRoundedRect(-6, -6, 12, 6, 1)
    g.fillStyle(0xfde68a, 0.7); g.fillRoundedRect(-5, -6, 8, 3, 1)                    // top specular
    // Shoulders (pauldrons) – 3D curved
    g.fillStyle(0x2a3340, 1)
    g.fillRoundedRect(-33, -17, 17, 14, 4); g.fillRoundedRect(16, -17, 17, 14, 4)
    g.fillStyle(0x4b5870, 1)                                                            // lit top of pauldron
    g.fillRoundedRect(-31, -16, 13, 7, 3); g.fillRoundedRect(18, -16, 13, 7, 3)
    g.fillStyle(0x6070a0, 0.2)
    g.fillRoundedRect(-30, -16, 7, 5, 2); g.fillRoundedRect(18, -16, 7, 5, 2)         // specular
    g.fillStyle(0x1a2230, 1)
    g.fillRoundedRect(-33, -6, 8, 6, 2); g.fillRoundedRect(25, -6, 8, 6, 2)           // shadow underside
    // Neck + helmet – 3D box
    g.fillStyle(0x2a3340, 1); g.fillRoundedRect(-8, -18, 16, 8, 2)
    g.fillStyle(0x2a3340, 1); g.fillRoundedRect(-16, -38, 32, 22, 5)                   // helmet base
    g.fillStyle(0x3e4e6a, 1); g.fillRoundedRect(-14, -36, 22, 14, 4)                  // lit front
    g.fillStyle(0x1a2230, 1); g.fillRoundedRect(8, -36, 6, 18, 3)                     // shadow side
    g.fillStyle(0x1f2937, 1); g.fillRoundedRect(-10, -32, 20, 10, 3)                   // visor socket
    // Visor glow
    g.fillStyle(0xf59e0b, 0.95); g.fillRoundedRect(-8, -30, 16, 7, 2)
    g.fillStyle(0xfde68a, 0.7); g.fillRoundedRect(-6, -30, 10, 3, 1)                  // visor specular
    // Helmet crest (3D)
    g.fillStyle(0xf59e0b, 0.85); g.fillRoundedRect(-3, -46, 6, 10, 2)
    g.fillStyle(0xfde68a, 0.5); g.fillRoundedRect(-2, -46, 3, 5, 1)                   // highlight
    // Arms (with gauntlets) – 3D
    g.fillStyle(0x2a3340, 1)
    g.fillRoundedRect(-36, -8, 10, 18, 3); g.fillRoundedRect(26, -8, 10, 18, 3)
    g.fillStyle(0x4b5870, 0.6)
    g.fillRoundedRect(-35, -7, 5, 10, 2); g.fillRoundedRect(27, -7, 5, 10, 2)         // arm highlight
    g.fillStyle(0x1a2230, 1)
    g.fillRoundedRect(-37, 6, 12, 10, 3); g.fillRoundedRect(25, 6, 12, 10, 3)
    g.fillStyle(0x3e4e6a, 0.5)
    g.fillRoundedRect(-36, 6, 6, 5, 2); g.fillRoundedRect(26, 6, 6, 5, 2)             // gauntlet highlight
    this.bossCont.add(g)
    const visorG = this.add.graphics(); this.bossCont.add(visorG)
    const td = { t: 0 }
    this.tweens.add({ targets: td, t: 1, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => { visorG.clear(); visorG.fillStyle(0xf59e0b, td.t * 0.38); visorG.fillRoundedRect(-10, -32, 20, 9, 3) } })
  }

  // Boss 4 – Essay Empress (Speaking) ──── teal ghost with crown, 3D-lit
  private drawEssayEmpress() {
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.25); g.fillEllipse(4, 42, 56, 12)   // cast shadow
    // Ghost tail wisps – layered for depth
    g.fillStyle(0x0b6b62, 0.5)
    g.fillEllipse(-14, 28, 14, 22); g.fillEllipse(0, 32, 14, 28); g.fillEllipse(14, 28, 14, 22)
    g.fillStyle(0x0d9488, 0.28)
    g.fillEllipse(-22, 22, 10, 18); g.fillEllipse(22, 22, 10, 18)
    g.fillStyle(0x18c4b2, 0.18); g.fillEllipse(-10, 30, 8, 16)  // wisp highlight
    // Main body – 3D volume with lit upper-left
    g.fillStyle(0x0a5048, 0.95); g.fillEllipse(0, 0, 50, 68)    // shadow base
    g.fillStyle(0x0f766e, 0.9); g.fillEllipse(-3, -2, 44, 62)   // mid-tone
    g.fillStyle(0x14b8a6, 0.55); g.fillEllipse(-8, -10, 30, 42) // highlight region
    g.fillStyle(0x20d8c6, 0.25); g.fillEllipse(-11, -14, 18, 26) // secondary highlight
    g.fillStyle(0x40e8d8, 0.12); g.fillEllipse(-13, -17, 10, 14) // specular
    // Hands – 3D oval with highlight
    g.fillStyle(0x0b6b62, 0.8); g.fillEllipse(-30, -4, 16, 24); g.fillEllipse(30, -4, 16, 24)
    g.fillStyle(0x14b8a6, 0.45); g.fillCircle(-32, -7, 6); g.fillCircle(30, -7, 6)
    g.fillStyle(0x20d8c6, 0.2); g.fillCircle(-34, -8, 3); g.fillCircle(28, -8, 3)   // specular
    // Head – 3D sphere
    g.fillStyle(0x0a5048, 1); g.fillCircle(0, -26, 20)           // dark base
    g.fillStyle(0x0f766e, 0.95); g.fillCircle(-2, -28, 16)       // mid
    g.fillStyle(0x14b8a6, 0.55); g.fillCircle(-5, -31, 11)       // highlight
    g.fillStyle(0x20d8c6, 0.3); g.fillCircle(-7, -33, 6)         // secondary highlight
    g.fillStyle(0x40e8d8, 0.15); g.fillCircle(-8, -35, 3)        // specular
    // Crown base – metallic 3D
    g.fillStyle(0xa37000, 1); g.fillRoundedRect(-18, -52, 36, 10, 3)    // shadow underside
    g.fillStyle(0xca8a04, 1); g.fillRoundedRect(-18, -54, 36, 9, 3)     // main
    g.fillStyle(0xfde68a, 0.5); g.fillRoundedRect(-16, -54, 28, 4, 2)  // top specular
    // Crown spikes – with highlight face
    g.fillStyle(0xa37000, 1)
    g.fillTriangle(-14, -52, -10, -65, -6, -52)
    g.fillTriangle(-4, -52, 0, -70, 4, -52)
    g.fillTriangle(6, -52, 10, -65, 14, -52)
    g.fillStyle(0xfde68a, 0.4)  // spike lit face
    g.fillTriangle(-13, -53, -10, -62, -8, -53)
    g.fillTriangle(-3, -53, 0, -66, 2, -53)
    g.fillTriangle(7, -53, 10, -62, 12, -53)
    // Crown gems
    g.fillStyle(0xe02424, 1); g.fillCircle(-10, -47, 3)
    g.fillStyle(0xffffff, 1); g.fillCircle(-10, -48, 1.5)  // gem specular
    g.fillStyle(0xffffff, 0.95); g.fillCircle(0, -47, 4)
    g.fillStyle(0xffffff, 0.6); g.fillCircle(-1, -48, 2)
    g.fillStyle(0x3b82f6, 1); g.fillCircle(10, -47, 3)
    g.fillStyle(0xffffff, 1); g.fillCircle(9, -48, 1.5)
    // Eyes – 3D depth
    g.fillStyle(0xfef9c3, 1); g.fillCircle(-7, -28, 5); g.fillCircle(7, -28, 5)
    g.fillStyle(0xfbbf24, 0.8); g.fillCircle(-8, -29, 3); g.fillCircle(6, -29, 3) // offset specular
    g.fillStyle(0x000000, 1); g.fillCircle(-7, -28, 1.5); g.fillCircle(7, -28, 1.5)
    this.bossCont.add(g)
    const auraG = this.add.graphics(); this.bossCont.add(auraG)
    const emd = { t: 0 }
    this.tweens.add({ targets: emd, t: 1, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => { auraG.clear(); auraG.fillStyle(0x14b8a6, emd.t * 0.16); auraG.fillEllipse(0, 0, 66, 88) } })
  }

  // Boss 5 – Phonics Phantom (Multiplayer) ──── white screaming ghost, 3D-lit
  private drawPhonicsPhantom() {
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.18); g.fillEllipse(4, 42, 58, 12)   // cast shadow
    // Wispy tail – layered depth
    g.fillStyle(0xa0aee0, 0.35)
    g.fillEllipse(-16, 30, 18, 28); g.fillEllipse(0, 36, 20, 34); g.fillEllipse(16, 30, 18, 28)
    g.fillStyle(0xc7d2fe, 0.18)
    g.fillEllipse(-26, 22, 12, 20); g.fillEllipse(26, 22, 12, 20)
    g.fillStyle(0xe8eeff, 0.12); g.fillEllipse(-8, 32, 8, 20)   // inner highlight wisp
    // Body – 3D volume lit from upper-left
    g.fillStyle(0xb0bada, 0.9); g.fillEllipse(0, -2, 52, 72)    // shadow base
    g.fillStyle(0xe0e7ff, 0.88); g.fillEllipse(-3, -4, 46, 66)  // mid-tone
    g.fillStyle(0xf4f6ff, 0.6); g.fillEllipse(-8, -12, 32, 48)  // highlight region
    g.fillStyle(0xffffff, 0.4); g.fillEllipse(-11, -16, 20, 30) // secondary highlight
    g.fillStyle(0xffffff, 0.2); g.fillEllipse(-13, -19, 11, 16) // specular
    // Arms (flowing) – lit on top
    g.fillStyle(0xb8c4e8, 0.7); g.fillEllipse(-32, -6, 18, 28); g.fillEllipse(32, -6, 18, 28)
    g.fillStyle(0xe8eeff, 0.5); g.fillCircle(-34, -9, 7); g.fillCircle(32, -9, 7)   // arm highlight
    g.fillStyle(0xffffff, 0.25); g.fillCircle(-35, -10, 3); g.fillCircle(31, -10, 3) // specular
    // Head – 3D sphere
    g.fillStyle(0xd0d8f0, 0.95); g.fillCircle(0, -28, 22)        // dark base
    g.fillStyle(0xf0f4ff, 0.95); g.fillCircle(-3, -30, 18)       // mid-tone
    g.fillStyle(0xffffff, 0.6); g.fillCircle(-7, -34, 12)        // highlight
    g.fillStyle(0xffffff, 0.35); g.fillCircle(-9, -37, 7)        // secondary
    g.fillStyle(0xffffff, 0.2); g.fillCircle(-10, -39, 3.5)      // specular
    // Hollow eyes – depth
    g.fillStyle(0xa78bfa, 0.95); g.fillEllipse(-8, -30, 10, 12); g.fillEllipse(8, -30, 10, 12)
    g.fillStyle(0x4c1d95, 1); g.fillEllipse(-8, -30, 6, 8); g.fillEllipse(8, -30, 6, 8)
    g.fillStyle(0x8b5cf6, 0.3); g.fillCircle(-10, -31, 2); g.fillCircle(6, -31, 2)  // eye specular
    // Screaming mouth
    g.fillStyle(0x3b0f8c, 1); g.fillEllipse(0, -18, 14, 16)
    g.fillStyle(0xffffff, 0.35); g.fillEllipse(-1, -20, 7, 8)   // inner highlight
    // Wispy hair
    g.fillStyle(0xc7d2fe, 0.6)
    g.fillEllipse(-14, -46, 8, 14); g.fillEllipse(0, -50, 8, 14); g.fillEllipse(14, -46, 8, 14)
    g.fillStyle(0xffffff, 0.25); g.fillEllipse(-2, -50, 4, 8)   // hair specular
    this.bossCont.add(g)
    const phantomG = this.add.graphics(); this.bossCont.add(phantomG)
    const pd = { t: 0 }
    this.tweens.add({ targets: pd, t: 1, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => { phantomG.clear(); phantomG.fillStyle(0xa78bfa, pd.t * 0.2); phantomG.fillEllipse(0, -2, 70, 94) } })
  }

  // ─── Weapon drawing ───────────────────────────────────────────────────────
  private redrawWeapon() {
    const g = this.weaponGfx; g.clear()
    const lvl = this.weaponLevel
    // Colors per level
    const baseC  = [0x9ca3af, 0x60a5fa, 0xfde68a]
    const glowC  = [0x374151, 0x1d4ed8, 0xd97706]
    const c = baseC[lvl - 1], gc = glowC[lvl - 1]
    if (lvl === 3) { g.fillStyle(gc, 0.2); g.fillCircle(28, -20, 26) }  // level-3 aura
    switch (this.classId) {
      case 'knight': {
        // Sword held diagonally (handle lower-left, blade upper-right)
        g.fillStyle(0x78350f, 1); g.fillRoundedRect(10, 5, 6, 16, 1)    // handle
        g.fillStyle(0x9ca3af, 1); g.fillRoundedRect(8, -4, 4, 4, 1)     // guard
        g.fillStyle(c, 1);       g.fillRoundedRect(10, -24, 6, 30, 2)   // blade
        if (lvl >= 2) { g.fillStyle(0xffffff, 0.35); g.fillRoundedRect(11, -22, 2, 28, 1) } // shine
        if (lvl === 3) { g.lineStyle(2, gc, 0.7); g.strokeRoundedRect(9, -25, 8, 32, 2) }
        break
      }
      case 'mage': {
        // Staff with orb
        g.fillStyle(0x78350f, 1); g.fillRoundedRect(-4, -30, 6, 55, 2)  // shaft
        g.fillStyle(c, lvl === 3 ? 0.9 : 0.95); g.fillCircle(-1, -36, lvl === 1 ? 7 : 9)
        g.fillStyle(0xffffff, 0.6); g.fillCircle(-4, -39, 3)
        if (lvl >= 2) { g.lineStyle(1.5, gc, 0.55); g.strokeCircle(-1, -36, 12) }
        if (lvl === 3) { g.lineStyle(1, gc, 0.3); g.strokeCircle(-1, -36, 16) }
        break
      }
      case 'rogue': {
        // Dagger(s)
        g.fillStyle(0x78350f, 1); g.fillRoundedRect(12, 6, 4, 12, 1)
        g.fillStyle(c, 1);        g.fillRoundedRect(12, -20, 5, 28, 1)
        g.fillStyle(0x9ca3af, 1); g.fillRoundedRect(10, -2, 9, 3, 1)
        if (lvl >= 2) {  // second dagger
          g.fillStyle(0x78350f, 1); g.fillRoundedRect(22, 2, 4, 10, 1)
          g.fillStyle(c, 1);        g.fillRoundedRect(22, -16, 5, 20, 1)
          g.fillStyle(0x9ca3af, 1); g.fillRoundedRect(20, -2, 9, 3, 1)
        }
        if (lvl === 3) { g.lineStyle(1.5, 0x34d399, 0.7); g.strokeRoundedRect(11, -21, 7, 30, 1) }
        break
      }
      case 'bard': {
        // Lute body
        g.fillStyle(0x78350f, 1); g.fillEllipse(20, -2, 22, 26)
        g.fillStyle(0x92400e, 0.6); g.fillEllipse(18, -4, 14, 18)
        g.fillStyle(0x000000, 1); g.fillCircle(20, -2, 3)  // sound hole
        g.fillStyle(0x9ca3af, 1)
        for (let i = -2; i <= 2; i++) g.fillRoundedRect(25, -10 + i * 4, 18, 1, 0.5) // strings
        if (lvl === 3) { g.lineStyle(2, gc, 0.6); g.strokeEllipse(20, -2, 26, 30) }
        break
      }
      case 'archer': {
        // Bow
        g.lineStyle(lvl >= 2 ? 4 : 3, c, 1)
        g.beginPath(); g.arc(-2, -10, 20, -1.1, 1.1, false); g.strokePath()
        g.lineStyle(1, 0x9ca3af, 0.7)
        g.lineBetween(-2, -28, -2, 8)  // bowstring
        if (lvl >= 2) { g.lineStyle(1, gc, 0.4); g.lineBetween(-2, -32, -2, 12) }
        // Arrow on string
        g.fillStyle(0x9ca3af, 1); g.fillRoundedRect(-2, -24, 3, 28, 1)
        g.fillStyle(gc, 1); g.fillTriangle(-2, -28, 1, -20, -5, -20)
        break
      }
      case 'paladin': {
        // Hammer
        g.fillStyle(0x78350f, 1); g.fillRoundedRect(-2, -8, 6, 35, 2)   // handle
        g.fillStyle(c, 1);        g.fillRoundedRect(-10, -26, 20, 18, 3) // head
        g.fillStyle(0xffffff, 0.25); g.fillRoundedRect(-8, -25, 12, 6, 2) // shine
        if (lvl >= 2) { g.lineStyle(2, gc, 0.55); g.strokeRoundedRect(-11, -27, 22, 20, 3) }
        if (lvl === 3) {
          g.fillStyle(0xfde68a, 0.3); g.fillRoundedRect(-14, -30, 28, 22, 4)
          g.lineStyle(1.5, 0xfde68a, 0.5); g.strokeRoundedRect(-14, -30, 28, 22, 4)
        }
        break
      }
    }
  }

  // ─── Weapon label ─────────────────────────────────────────────────────────
  private refreshWeaponLabel() {
    const name = WEAPON_NAMES[this.classId][this.weaponLevel - 1]
    const stars = '★'.repeat(this.weaponLevel) + '☆'.repeat(3 - this.weaponLevel)
    this.weaponLevelText?.setText(`${stars} ${name}`)
  }

  // ─── Floating damage text ─────────────────────────────────────────────────
  private showFloatingText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      fontSize: '20px', color, fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5)
    this.tweens.add({
      targets: t, y: y - 50, alpha: 0, duration: 1000, ease: 'Power2',
      onComplete: () => t.destroy(),
    })
  }

  // ─── Flash ────────────────────────────────────────────────────────────────
  private flash(cont: Phaser.GameObjects.Container, color: number) {
    const f = this.add.graphics()
    f.fillStyle(color, 0.55); f.fillCircle(0, 0, 40)
    cont.add(f)
    this.tweens.add({ targets: f, alpha: 0, duration: 260, onComplete: () => f.destroy() })
  }

  // ─── Impact particles ─────────────────────────────────────────────────────
  private sparks(x: number, y: number, color: number) {
    for (let i = 0; i < 7; i++) {
      const s = this.add.graphics()
      // No Math.random: keep deterministic particle sizes/angles.
      s.fillStyle(color, 0.9); s.fillCircle(0, 0, 4)
      s.setPosition(x, y)
      const a = Math.PI
      const d = 55
      this.tweens.add({
        targets: s,
        x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 20,
        alpha: 0, duration: 675, ease: 'Power2',
        onComplete: () => s.destroy(),
      })
    }
  }

  // ─── Shared hit-callback ─────────────────────────────────────────────────
  private onHitBoss(dmg: number) {
    const { BX, GY } = this
    const midY = GY - 100
    this.flash(this.bossCont, 0xe02424)
    this.sparks(BX, midY, 0xe02424)
    this.showFloatingText(BX, midY - 24, `-${dmg}`, '#f87171')
    const startY2 = this.bossCont.y
    this.bossFloatTween.pause()
    this.tweens.add({
      targets: this.bossCont, x: BX + 14, duration: 55, yoyo: true, repeat: 3,
      onComplete: () => { this.bossCont.setPosition(BX, startY2); this.bossFloatTween.resume() },
    })
    this.refreshHpBars()
    if (this.bossHp <= 0) {
      this.time.delayedCall(600, () => {
        this.showFloatingText(BX, midY - 55, '⚡ DEFEATED!', '#10b981')
        this.time.delayedCall(2000, () => { this.bossHp = BOSS_CONFIG[this.bossType].maxHp; this.refreshHpBars() })
      })
    }
    this.time.delayedCall(850, () => { this.locked = false })
  }

  // ─── Player attack dispatcher ─────────────────────────────────────────────
  private animatePlayerAttack() {
    const baseDmg = 16
    const dmg = baseDmg + (this.weaponLevel - 1) * 6  // weapon level bonus
    this.bossHp = Math.max(0, this.bossHp - dmg)

    switch (this.classId) {
      case 'knight':  this.attackKnight(dmg);  break
      case 'mage':    this.attackMage(dmg);    break
      case 'rogue':   this.attackRogue(dmg);   break
      case 'bard':    this.attackBard(dmg);    break
      case 'archer':  this.attackArcher(dmg);  break
      case 'paladin': this.attackPaladin(dmg); break
    }
  }

  // ── Knight: charges forward and SLASHES the boss ─────────────────────────
  private attackKnight(dmg: number) {
    const { CX, BX, GY } = this
    const midY = GY - 64
    this.charFloatTween.pause()
    const startY = this.charCont.y
    // Rush to boss, slash, return
    this.tweens.add({
      targets: this.charCont, x: BX - 90, y: midY + 10, duration: 220, ease: 'Power3',
      onComplete: () => {
        // Slash effect at boss
        const slash = this.add.graphics()
        for (let i = 0; i < 3; i++) {
          const angle = -0.4 + i * 0.4
          slash.lineStyle(this.weaponLevel >= 3 ? 5 : 3, this.weaponLevel >= 3 ? 0xfde68a : 0xf1f5f9, 0.9 - i * 0.2)
          slash.lineBetween(
            Math.cos(angle - 1.2) * 40, Math.sin(angle - 1.2) * 40,
            Math.cos(angle + 1.2) * 40, Math.sin(angle + 1.2) * 40
          )
        }
        slash.setPosition(BX, midY)
        this.sparks(BX, midY, this.weaponLevel >= 3 ? 0xfde68a : 0x93c5fd)
        this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.5, scaleY: 1.5, duration: 350,
          onComplete: () => slash.destroy() })
        this.tweens.add({
          targets: this.charCont, x: CX, y: startY, duration: 250, ease: 'Power2',
          delay: 150,
          onComplete: () => { this.charCont.setPosition(CX, startY); this.charFloatTween.resume() },
        })
        this.onHitBoss(dmg)
      },
    })
  }

  // ── Mage: fires arcane bolt from standing position ────────────────────────
  private attackMage(dmg: number) {
    const { CX, BX, GY } = this
    const midY = GY - 120
    const colors = [0xa78bfa, 0x818cf8, 0x38bdf8]
    const c = colors[this.weaponLevel - 1]
    const orbCount = this.weaponLevel  // 1, 2, or 3 orbs

    // Cast shake
    this.charFloatTween.pause()
    const startY = this.charCont.y
    this.tweens.add({ targets: this.charCont, y: startY - 18, duration: 120, yoyo: true,
      onComplete: () => { this.charCont.setPosition(CX, startY); this.charFloatTween.resume() } })

    for (let orb = 0; orb < orbCount; orb++) {
      const yOff = (orb - (orbCount - 1) / 2) * 18
      this.time.delayedCall(orb * 100, () => {
        const proj = this.add.graphics()
        proj.fillStyle(c, 0.3); proj.fillCircle(0, 0, 16)
        proj.fillStyle(c, 0.95); proj.fillCircle(0, 0, 10)
        proj.fillStyle(0xffffff, 0.7); proj.fillCircle(-3, -3, 4)
        if (this.weaponLevel === 3) { proj.lineStyle(2, 0x38bdf8, 0.6); proj.strokeCircle(0, 0, 20) }
        proj.setPosition(CX + 30, midY + yOff)

        this.tweens.add({
          targets: proj, x: BX - 30, duration: 310 + orb * 30, ease: 'Sine.easeIn',
          onUpdate: () => { proj.angle += 8 },
          onComplete: () => {
            proj.destroy()
            this.sparks(BX, midY + yOff, c)
            if (orb === orbCount - 1) this.onHitBoss(dmg)
          },
        })
      })
    }
  }

  // ── Rogue: teleports to boss, multi-hit stabs, vanishes back ─────────────
  private attackRogue(dmg: number) {
    const { CX, BX, GY } = this
    const midY = GY - 64
    const hitCount = this.weaponLevel + 1  // 2, 3, or 4 hits
    this.charFloatTween.pause()
    const startY = this.charCont.y

    // Teleport OUT (fade away)
    this.tweens.add({
      targets: this.charCont, alpha: 0, duration: 120,
      onComplete: () => {
        this.charCont.setPosition(BX - 60, midY + 10)
        // Teleport IN at boss
        this.tweens.add({ targets: this.charCont, alpha: 1, duration: 90 })

        let hitsDone = 0
        const doHit = () => {
          if (!this.charCont.active) return
          // Dagger slash
          const slash = this.add.graphics()
          slash.lineStyle(2, this.weaponLevel === 3 ? 0x34d399 : 0xe5e7eb, 0.9)
          slash.lineBetween(-22, -10, 22, 14); slash.lineBetween(-18, 6, 18, -16)
          slash.setPosition(BX, midY)
          this.tweens.add({ targets: slash, alpha: 0, duration: 180, onComplete: () => slash.destroy() })
          this.sparks(BX, midY, this.weaponLevel === 3 ? 0x34d399 : 0x9ca3af)
          hitsDone++
          if (hitsDone < hitCount) {
            this.time.delayedCall(160, doHit)
          } else {
            this.onHitBoss(dmg)
            // Teleport back
            this.tweens.add({
              targets: this.charCont, alpha: 0, duration: 100, delay: 80,
              onComplete: () => {
                this.charCont.setPosition(CX, startY)
                this.tweens.add({ targets: this.charCont, alpha: 1, duration: 90,
                  onComplete: () => { this.charCont.setPosition(CX, startY); this.charFloatTween.resume() } })
              },
            })
          }
        }
        doHit()
      },
    })
  }

  // ── Bard: expanding sound-wave rings ─────────────────────────────────────
  private attackBard(dmg: number) {
    const { CX, BX, GY } = this
    const midY = GY - 100
    const ringCount = this.weaponLevel + 1
    const waveColor = this.weaponLevel === 3 ? 0xfbbf24 : 0xfde68a

    this.charFloatTween.pause()
    const startY = this.charCont.y
    this.tweens.add({ targets: this.charCont, y: startY - 12, duration: 100, yoyo: true,
      onComplete: () => { this.charCont.setPosition(CX, startY); this.charFloatTween.resume() } })

    for (let r = 0; r < ringCount; r++) {
      this.time.delayedCall(r * 90, () => {
        const ring = this.add.graphics()
        ring.lineStyle(3, waveColor, 0.85)
        ring.strokeEllipse(0, 0, 30, 20)
        if (this.weaponLevel >= 2) { ring.lineStyle(1.5, waveColor, 0.4); ring.strokeEllipse(0, 0, 50, 32) }
        ring.setPosition(CX + 20, midY)
        this.tweens.add({
          targets: ring, x: BX - 20, scaleX: 1.5 + r * 0.3, alpha: 0, duration: 400 + r * 50,
          ease: 'Linear',
          onComplete: () => {
            ring.destroy()
            if (r === ringCount - 1) {
              this.sparks(BX, midY, waveColor)
              this.onHitBoss(dmg)
            }
          },
        })
      })
    }
  }

  // ── Archer: draws bow, fires arrow ───────────────────────────────────────
  private attackArcher(dmg: number) {
    const { CX, BX, GY } = this
    const midY = GY - 100
    const arrowColor = this.weaponLevel === 3 ? 0xf97316 : this.weaponLevel === 2 ? 0x4ade80 : 0xe5e7eb

    // Bow-draw pose (lunge + scale pulse)
    this.charFloatTween.pause()
    const startY = this.charCont.y
    this.tweens.add({ targets: this.charCont, x: CX - 20, duration: 150, ease: 'Back',
      yoyo: false, onComplete: () => {
        // Fire arrow(s)
        const arrowCount = this.weaponLevel === 3 ? 3 : this.weaponLevel === 2 ? 2 : 1
        for (let a = 0; a < arrowCount; a++) {
          const yOff = (a - (arrowCount - 1) / 2) * 14
          this.time.delayedCall(a * 70, () => {
            const arrow = this.add.graphics()
            arrow.fillStyle(arrowColor, 1); arrow.fillRoundedRect(-24, -2, 44, 4, 1)
            arrow.fillStyle(0x78350f, 1);   arrow.fillRoundedRect(-26, -3, 8, 6, 0.5)
            arrow.fillStyle(arrowColor, 1); arrow.fillTriangle(18, -5, 28, 0, 18, 5)
            if (this.weaponLevel === 3) { arrow.lineStyle(1.5, 0xf97316, 0.4); arrow.strokeRoundedRect(-24, -3, 46, 6, 1) }
            arrow.setPosition(CX, midY + yOff)
            this.tweens.add({
              targets: arrow, x: BX - 20, duration: 240, ease: 'Cubic',
              onComplete: () => {
                arrow.destroy()
                this.sparks(BX, midY + yOff, arrowColor)
                if (a === arrowCount - 1) this.onHitBoss(dmg)
              },
            })
          })
        }
        this.tweens.add({ targets: this.charCont, x: CX, y: startY, duration: 200, delay: 100,
          onComplete: () => { this.charCont.setPosition(CX, startY); this.charFloatTween.resume() } })
      },
    })
  }

  // ── Paladin: holy hammer charge + divine explosion ────────────────────────
  private attackPaladin(dmg: number) {
    const { CX, BX, GY } = this
    const midY = GY - 64
    this.charFloatTween.pause()
    const startY = this.charCont.y
    const holyColor = this.weaponLevel === 3 ? 0xfde68a : 0xfef3c7

    // Wind-up glow
    const glow = this.add.graphics()
    glow.fillStyle(holyColor, 0.25); glow.fillCircle(0, 0, 50)
    glow.setPosition(CX, startY - 20)
    this.tweens.add({ targets: glow, alpha: 0, scaleX: 2, scaleY: 2, duration: 350,
      onComplete: () => glow.destroy() })

    // Charge to boss
    this.tweens.add({
      targets: this.charCont, x: BX - 70, y: midY + 10, duration: 280, ease: 'Power3',
      onComplete: () => {
        // Holy cross explosion
        const cross = this.add.graphics()
        cross.fillStyle(holyColor, 0.9); cross.fillRoundedRect(-60, -8, 120, 16, 4)
        cross.fillStyle(holyColor, 0.9); cross.fillRoundedRect(-8, -60, 16, 120, 4)
        if (this.weaponLevel === 3) {
          cross.lineStyle(3, 0xfbbf24, 0.6); cross.strokeRoundedRect(-65, -12, 130, 24, 5)
          cross.lineStyle(3, 0xfbbf24, 0.6); cross.strokeRoundedRect(-12, -65, 24, 130, 5)
        }
        cross.setPosition(BX, midY)
        this.sparks(BX, midY, holyColor)
        if (this.weaponLevel === 3) {
          for (let i = 0; i < 6; i++) this.sparks(BX, midY, 0xfde68a)
        }
        this.tweens.add({ targets: cross, alpha: 0, scaleX: 2.2, scaleY: 2.2, duration: 480,
          onComplete: () => cross.destroy() })
        // Return
        this.tweens.add({
          targets: this.charCont, x: CX, y: startY, duration: 300, ease: 'Power2', delay: 200,
          onComplete: () => { this.charCont.setPosition(CX, startY); this.charFloatTween.resume() },
        })
        this.onHitBoss(dmg)
      },
    })
  }

  // ─── Boss retaliation ─────────────────────────────────────────────────────
  private animateBossRetaliation() {
    const { CX, BX, GY } = this
    const midY = GY - 100
    const dmg = 11
    this.charHp = Math.max(0, this.charHp - dmg)

    const startY = this.bossCont.y
    this.bossFloatTween.pause()
    this.tweens.add({
      targets: this.bossCont, x: BX - 20, duration: 120, ease: 'Power2',
      yoyo: true,
      onComplete: () => { this.bossCont.setPosition(BX, startY); this.bossFloatTween.resume() },
    })

    const proj = this.add.graphics()
    proj.fillStyle(0xe02424, 0.85); proj.fillCircle(0, 0, 10)
    proj.fillStyle(0xf87171, 0.9);  proj.fillCircle(-3, -3, 5)
    proj.lineStyle(1.5, 0xe02424, 0.6); proj.strokeCircle(0, 0, 14)
    proj.setPosition(BX - 28, midY)

    this.tweens.add({
      targets: proj, x: CX + 28, duration: 310, ease: 'Power2',
      onUpdate: () => { proj.angle += 12 },
      onComplete: () => {
        proj.destroy()
        // Tint sprite red (hurt) then back to normal
        this.charSprite?.setTint(0xff4444)
        this.time.delayedCall(450, () => this.charSprite?.clearTint())
        this.flash(this.charCont, 0xe02424)
        this.sparks(CX, midY, 0x7c3aed)
        this.showFloatingText(CX, midY - 24, `-${dmg}`, '#f87171')
        const startY2 = this.charCont.y
        this.charFloatTween.pause()
        this.tweens.add({
          targets: this.charCont, x: CX - 14, duration: 55, yoyo: true, repeat: 2,
          onComplete: () => { this.charCont.setPosition(CX, startY2); this.charFloatTween.resume() },
        })
        this.refreshHpBars()
        if (this.charHp <= 0) {
          this.showFloatingText(CX, midY - 55, '💀 KO!', '#f87171')
          this.time.delayedCall(2000, () => { this.charHp = 100; this.refreshHpBars() })
        }
        this.time.delayedCall(750, () => { this.locked = false })
      },
    })
  }

  shutdown() {
    this.game.events.off('playerAttack',   undefined, this)
    this.game.events.off('setWeaponLevel', undefined, this)
  }
}

// ─── React Component ──────────────────────────────────────────────────────────
export const BattleWidget = forwardRef<
  BattleWidgetRef,
  { classId: ClassId; bossType?: BossType; weaponLevel?: number }
>(
  ({ classId, bossType = 'grammar_golem', weaponLevel = 1 }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const gameRef = useRef<Phaser.Game | null>(null)

    useImperativeHandle(ref, () => ({
      triggerAttack: (isCorrect: boolean) => {
        gameRef.current?.events.emit('playerAttack', isCorrect)
      },
      setWeaponLevel: (level: number) => {
        gameRef.current?.events.emit('setWeaponLevel', level)
      },
    }))

    // When weaponLevel prop changes (backend sent a new value), forward to scene
    useEffect(() => {
      gameRef.current?.events.emit('setWeaponLevel', weaponLevel)
    }, [weaponLevel])

    useEffect(() => {
      if (!containerRef.current) return

      const SceneClass = class extends BattleScene {
        constructor() { super(classId, bossType) }
      }

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        width: 800,
        height: 420,
        transparent: true,
        parent: containerRef.current,
        scene: [SceneClass],
        audio: { noAudio: true },
        render: { pixelArt: true },   // sharp nearest-neighbour for pixel sprites
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: 800,
          height: 420,
        },
      })

      return () => {
        gameRef.current?.destroy(true)
        gameRef.current = null
      }
    }, [classId, bossType])

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '420px' }}
      />
    )
  }
)

BattleWidget.displayName = 'BattleWidget'
