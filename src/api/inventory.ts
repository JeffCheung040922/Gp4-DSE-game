import axios from 'axios'
import type { Inventory } from '../types/inventory'

import { getApiBaseUrl } from './apiBaseUrl'

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10_000,
  withCredentials: true,
})

// Runtime validation for Inventory type
function validateInventory(data: unknown): data is Inventory {
  if (typeof data !== 'object' || data === null) return false
  const inv = data as Record<string, unknown>
  return (
    typeof inv.gold === 'number' &&
    Array.isArray(inv.ownedWeaponIds) &&
    typeof inv.equippedWeaponId === 'string' &&
    Array.isArray(inv.potions)
  )
}

// Error handler helper
function handleApiError(error: unknown, context: string): never {
  if (axios.isAxiosError(error)) {
    console.error(`${context} failed:`, error.message)
    throw new Error(`Failed to ${context}: ${error.response?.data?.error || error.message}`)
  }
  throw error
}

// ----------------------------
// Inventory (backend authoritative)
// ----------------------------

export async function fetchInventory(): Promise<Inventory> {
  try {
    const { data } = await api.get('/inventory')
    if (!validateInventory(data)) {
      throw new Error('Invalid inventory data structure')
    }
    return data
  } catch (error) {
    handleApiError(error, 'fetch inventory')
  }
}

export async function equipWeapon(weaponId: string): Promise<Inventory> {
  try {
    const { data } = await api.post('/inventory/equip-weapon', { weaponId })
    if (!validateInventory(data)) {
      throw new Error('Invalid inventory data structure')
    }
    return data
  } catch (error) {
    handleApiError(error, 'equip weapon')
  }
}

export async function buyWeapon(weaponId: string): Promise<Inventory> {
  try {
    const { data } = await api.post('/shop/buy-weapon', { weaponId })
    if (!validateInventory(data)) {
      throw new Error('Invalid inventory data structure')
    }
    return data
  } catch (error) {
    handleApiError(error, 'buy weapon')
  }
}

export async function buyPotion(potionId: string): Promise<Inventory> {
  try {
    const { data } = await api.post('/shop/buy-potion', { potionId })
    if (!validateInventory(data)) {
      throw new Error('Invalid inventory data structure')
    }
    return data
  } catch (error) {
    handleApiError(error, 'buy potion')
  }
}

export async function rewardGold(amount: number): Promise<Inventory> {
  try {
    const { data } = await api.post('/inventory/add-gold', { amount })
    if (!validateInventory(data)) {
      throw new Error('Invalid inventory data structure')
    }
    return data
  } catch (error) {
    handleApiError(error, 'add gold')
  }
}

export async function usePotion(
  potionId: string
): Promise<{ healedAmount: number; inventory: Inventory }> {
  try {
    const { data } = await api.post('/inventory/use-potion', { potionId })
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid response structure')
    }
    const response = data as Record<string, unknown>
    if (typeof response.healedAmount !== 'number' || !validateInventory(response.inventory)) {
      throw new Error('Invalid usePotion response structure')
    }
    return data as { healedAmount: number; inventory: Inventory }
  } catch (error) {
    handleApiError(error, 'use potion')
  }
}

