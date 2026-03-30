// ── Item catalogue definitions ────────────────────────────────────────────────

export interface WeaponItem {
  id: string
  name: string
  icon: string
  tier: 1 | 2 | 3
  price: number        // 0 = starter (free)
  attackBonus: number  // extra damage per correct answer
  description: string
}

export interface PotionItem {
  id: string
  name: string
  icon: string
  price: number
  healAmount: number
  description: string
}

export const WEAPON_CATALOG: WeaponItem[] = [
  { id: 'starter_sword',  name: 'Starter Sword',  icon: '⚔️',  tier: 1, price: 0,   attackBonus: 0,  description: 'The trusty blade you started with.' },
  { id: 'iron_sword',     name: 'Iron Sword',      icon: '🗡️', tier: 1, price: 80,  attackBonus: 3,  description: 'Reliable iron, slightly sharper edge.' },
  { id: 'magic_wand',     name: 'Magic Wand',      icon: '🪄',  tier: 2, price: 120, attackBonus: 5,  description: 'Channels arcane power. Glows faintly.' },
  { id: 'heavy_axe',      name: 'Heavy Axe',       icon: '🪓',  tier: 2, price: 140, attackBonus: 6,  description: 'Brutal cleave — slow but punishing.' },
  { id: 'arcane_staff',   name: 'Arcane Staff',    icon: '🔮',  tier: 3, price: 260, attackBonus: 10, description: 'Ancient staff humming with power.' },
  { id: 'dragon_blade',   name: 'Dragon Blade',    icon: '🔥',  tier: 3, price: 320, attackBonus: 13, description: 'Forged from dragon scales. Fearsome.' },
]

export const POTION_CATALOG: PotionItem[] = [
  { id: 'small_potion', name: 'Small Potion', icon: '🧪', price: 30,  healAmount: 25,  description: 'Restores 25 HP.' },
  { id: 'large_potion', name: 'Large Potion', icon: '💊', price: 55,  healAmount: 50,  description: 'Restores 50 HP.' },
  { id: 'elixir',       name: 'Elixir',       icon: '✨', price: 100, healAmount: 100, description: 'Fully restores all HP.' },
]

// ── Player inventory (persisted in localStorage) ──────────────────────────────

export interface Inventory {
  gold: number
  ownedWeaponIds: string[]
  equippedWeaponId: string
  potions: { id: string; count: number }[]
}

export const DEFAULT_INVENTORY: Inventory = {
  gold: 50,
  ownedWeaponIds: ['starter_sword'],
  equippedWeaponId: 'starter_sword',
  potions: [],
}
