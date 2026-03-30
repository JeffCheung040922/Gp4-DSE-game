export type ClassId = 'knight' | 'mage' | 'rogue' | 'bard' | 'archer' | 'paladin'

export interface CharacterClass {
  id: ClassId
  name: string
  role: string
  description: string
  color: string
  bgColor: string
  emoji: string
  stats: { ATK: number; SPD: number; INT: number; CHA: number }
  bonus: string
  subjects: string[]
}

export interface SavedCharacter {
  classId: ClassId
  name: string
}

export const CHARACTER_CLASSES: CharacterClass[] = [
  {
    id: 'knight',
    name: 'Lexicon Knight',
    role: 'All-Rounder',
    description:
      'A balanced warrior of words. Masters every DSE skill with equal dedication and unwavering resolve. No weaknesses — only strength.',
    color: '#3b82f6',
    bgColor: '#0d1f3c',
    emoji: '⚔️',
    stats: { ATK: 8, SPD: 6, INT: 7, CHA: 7 },
    bonus: '+10% XP (All Subjects)',
    subjects: ['Listening', 'Speaking', 'Reading', 'Writing'],
  },
  {
    id: 'mage',
    name: 'Storm Herald',
    role: 'Word Weaver',
    description:
      'Transforms blank pages into powerful essays with arcane precision. Harnesses the magic of language to dominate Writing and Speaking.',
    color: '#7c3aed',
    bgColor: '#130826',
    emoji: '🔮',
    stats: { ATK: 5, SPD: 7, INT: 10, CHA: 6 },
    bonus: '+25% XP (Writing & Speaking)',
    subjects: ['Writing', 'Speaking'],
  },
  {
    id: 'rogue',
    name: 'Shadow Rogue',
    role: 'Silent Listener',
    description:
      'Moves through soundscapes like a shadow. Catches every detail others miss with razor-sharp ears and lightning-fast comprehension.',
    color: '#10b981',
    bgColor: '#011a0f',
    emoji: '🥷',
    stats: { ATK: 7, SPD: 10, INT: 6, CHA: 5 },
    bonus: '+25% XP (Listening)',
    subjects: ['Listening'],
  },
  {
    id: 'bard',
    name: "Orator's Champion",
    role: 'Voice of Power',
    description:
      'Commands every room with silver tongue and perfect diction. Born to speak, born to lead. The crowd is always on your side.',
    color: '#f59e0b',
    bgColor: '#1c0d00',
    emoji: '🎤',
    stats: { ATK: 6, SPD: 7, INT: 7, CHA: 10 },
    bonus: '+25% XP (Oral & Speaking)',
    subjects: ['Speaking'],
  },
  {
    id: 'archer',
    name: 'Swift Arrow',
    role: 'Precision Striker',
    description:
      'Never misses a detail. Hunts down every trick question from afar with perfect aim and tactical foresight. Fast, accurate, deadly.',
    color: '#16a34a',
    bgColor: '#051a08',
    emoji: '⚡',
    stats: { ATK: 9, SPD: 9, INT: 6, CHA: 5 },
    bonus: '+20% XP (Listening & Oral)',
    subjects: ['Listening', 'Reading'],
  },
  {
    id: 'paladin',
    name: 'Holy Vanguard',
    role: 'Sacred Defender',
    description:
      'Blessed with divine knowledge and iron will. Wields the hammer of grammar and the shield of structure to crush every exam question.',
    color: '#ca8a04',
    bgColor: '#1a1000',
    emoji: '🛡️',
    stats: { ATK: 7, SPD: 5, INT: 8, CHA: 9 },
    bonus: '+20% XP (Writing & Oral)',
    subjects: ['Writing', 'Reading'],
  },
]
