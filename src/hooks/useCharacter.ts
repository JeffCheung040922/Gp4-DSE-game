import { useState } from 'react'
import { type SavedCharacter } from '../types/character'
import { createCharacter, fetchCharacter, updateCharacterName } from '../api/character'

const STORAGE_KEY = 'dse_character'

export function useCharacter() {
  const [character, setCharacterState] = useState<SavedCharacter | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? (JSON.parse(saved) as SavedCharacter) : null
    } catch {
      return null
    }
  })

  /** Save to localStorage AND persist to backend. */
  const saveCharacter = async (data: SavedCharacter) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    setCharacterState(data)
    try {
      await createCharacter(data)
    } catch (error) {
      console.error('Failed to save character to backend:', error)
      // Backend may not exist yet; localStorage is the fallback.
    }
  }

  /** Update character name on localStorage AND backend. */
  const updateName = async (name: string) => {
    try {
      await updateCharacterName(name)
    } catch (error) {
      console.error('Failed to update character name on backend:', error)
      // Backend may not exist yet.
    }
    const next: SavedCharacter = { ...(character ?? { classId: 'knight', name: '' }), name }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setCharacterState(next)
  }

  const clearCharacter = () => {
    localStorage.removeItem(STORAGE_KEY)
    setCharacterState(null)
  }

  /** Load authoritative character from backend (replaces localStorage on success). */
  const syncFromBackend = async (): Promise<SavedCharacter | null> => {
    try {
      const data = await fetchCharacter()
      const saved: SavedCharacter = { classId: data.classId, name: data.name }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
      setCharacterState(saved)
      return saved
    } catch (error) {
      console.error('Failed to sync character from backend:', error)
      return character
    }
  }

  return { character, saveCharacter, updateName, clearCharacter, syncFromBackend }
}

export function getSavedCharacter(): SavedCharacter | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as SavedCharacter) : null
  } catch (error) {
    console.warn('Failed to load character from localStorage:', error)
    return null
  }
}
