import { useState, useEffect, useCallback } from 'react'
import { type Inventory, DEFAULT_INVENTORY } from '../types/inventory'
import * as inventoryApi from '../api/inventory'

const STORAGE_KEY = 'dse_inventory'

function loadInventoryFromCache(): Inventory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_INVENTORY
    const parsed = JSON.parse(raw) as Partial<Inventory>
    return { ...DEFAULT_INVENTORY, ...parsed }
  } catch {
    return DEFAULT_INVENTORY
  }
}

function saveInventoryToCache(inv: Inventory) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inv))
  } catch {
    // ignore
  }
}

export function useInventory() {
  const [inventory, setInventory] = useState<Inventory>(DEFAULT_INVENTORY)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load initial state from cache for fast first render, then sync from backend
  useEffect(() => {
    const cached = loadInventoryFromCache()
    setInventory(cached)

    let cancelled = false
    ;(async () => {
      try {
        const inv = await inventoryApi.fetchInventory()
        if (cancelled) return
        setInventory(inv)
        saveInventoryToCache(inv)
      } catch {
        if (cancelled) return
        // Keep cached inventory on backend failure
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const syncInventory = useCallback((next: Inventory) => {
    setInventory(next)
    saveInventoryToCache(next)
    return true
  }, [])

  const addGold = useCallback(async (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Invalid gold amount: must be a positive number')
    }
    try {
      const next = await inventoryApi.rewardGold(amount)
      setInventory(next)
      saveInventoryToCache(next)
      return next
    } catch (err) {
      console.error('Failed to add gold:', err)
      throw err instanceof Error ? err : new Error('Failed to add gold')
    }
  }, [])

  const equipWeapon = useCallback(async (weaponId: string) => {
    try {
      const next = await inventoryApi.equipWeapon(weaponId)
      setInventory(next)
      saveInventoryToCache(next)
      return true
    } catch (err) {
      console.error('Failed to equip weapon:', err)
      throw err instanceof Error ? err : new Error('Failed to equip weapon')
    }
  }, [])

  const buyWeapon = useCallback(async (weaponId: string): Promise<boolean> => {
    try {
      const next = await inventoryApi.buyWeapon(weaponId)
      setInventory(next)
      saveInventoryToCache(next)
      return true
    } catch (err) {
      console.error('Failed to buy weapon:', err)
      throw err instanceof Error ? err : new Error('Failed to buy weapon')
    }
  }, [])

  const buyPotion = useCallback(async (potionId: string): Promise<boolean> => {
    try {
      const next = await inventoryApi.buyPotion(potionId)
      setInventory(next)
      saveInventoryToCache(next)
      return true
    } catch (err) {
      console.error('Failed to buy potion:', err)
      throw err instanceof Error ? err : new Error('Failed to buy potion')
    }
  }, [])

  const usePotion = useCallback(async (potionId: string): Promise<number> => {
    try {
      const res = await inventoryApi.usePotion(potionId)
      setInventory(res.inventory)
      saveInventoryToCache(res.inventory)
      return res.healedAmount
    } catch (err) {
      console.error('Failed to use potion:', err)
      throw err instanceof Error ? err : new Error('Failed to use potion')
    }
  }, [])

  return {
    inventory,
    isLoaded,
    syncInventory,
    addGold,
    equipWeapon,
    buyWeapon,
    buyPotion,
    usePotion,
  }
}
