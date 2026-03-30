import { Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import type { AuthRequest } from '../middleware/authMiddleware';
import type { EquipWeaponRequest, AddGoldRequest } from '../types';

// inventoryController: user inventory and potion logic
// Both guest and registered users share the same tables — the same code handles both.
export async function getInventory(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('gold')
      .eq('id', userId)
      .single();

    const { data: items, error } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Get inventory error:', error);
      return res.status(500).json({ error: 'Failed to fetch inventory' });
    }

    const weapons = items?.filter(i => i.item_type === 'weapon') || [];
    const potions = items?.filter(i => i.item_type === 'potion') || [];

    return res.json({
      gold: profile?.gold || 0,
      ownedWeaponIds: weapons.map(w => w.item_id),
      equippedWeaponId: weapons.length > 0 ? weapons[0].item_id : '',
      potions: potions.map(p => ({ id: p.item_id, count: p.quantity })),
    });
  } catch (err) {
    console.error('Get inventory error:', err);
    return res.status(500).json({ error: 'Failed to fetch inventory' });
  }
}

export async function equipWeapon(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { weaponId } = req.body as EquipWeaponRequest;

  try {
    if (!weaponId) {
      return res.status(400).json({ error: 'weaponId required' });
    }

    const { data: item } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('user_id', userId)
      .eq('item_id', weaponId)
      .eq('item_type', 'weapon')
      .single();

    if (!item) {
      return res.status(404).json({ error: 'Weapon not found in inventory' });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('gold')
      .eq('id', userId)
      .single();

    const { data: items } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('user_id', userId);

    const weapons = items?.filter(i => i.item_type === 'weapon') || [];
    const potions = items?.filter(i => i.item_type === 'potion') || [];

    return res.json({
      gold: profile?.gold || 0,
      ownedWeaponIds: weapons.map(w => w.item_id),
      equippedWeaponId: weaponId,
      potions: potions.map(p => ({ id: p.item_id, count: p.quantity })),
    });
  } catch (err) {
    console.error('Equip weapon error:', err);
    return res.status(500).json({ error: 'Failed to equip weapon' });
  }
}

export async function addGold(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { amount } = req.body as AddGoldRequest;

  try {
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount required' });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('gold')
      .eq('id', userId)
      .single();

    const newGold = (profile?.gold || 0) + amount;

    await supabaseAdmin
      .from('profiles')
      .update({ gold: newGold })
      .eq('id', userId);

    const { data: items } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('user_id', userId);

    const weapons = items?.filter(i => i.item_type === 'weapon') || [];
    const potions = items?.filter(i => i.item_type === 'potion') || [];

    return res.json({
      gold: newGold,
      ownedWeaponIds: weapons.map(w => w.item_id),
      equippedWeaponId: weapons.length > 0 ? weapons[0].item_id : '',
      potions: potions.map(p => ({ id: p.item_id, count: p.quantity })),
    });
  } catch (err) {
    console.error('Add gold error:', err);
    return res.status(500).json({ error: 'Failed to add gold' });
  }
}

export async function usePotion(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { potionId } = req.body;

  try {
    if (!potionId) {
      return res.status(400).json({ error: 'potionId required' });
    }

    const { data: potionItem } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('user_id', userId)
      .eq('item_id', potionId)
      .eq('item_type', 'potion')
      .single();

    if (!potionItem || potionItem.quantity <= 0) {
      return res.status(404).json({ error: 'Potion not found in inventory' });
    }

    // Look up the potion's healing value from shop_items table
    const { data: shopItem } = await supabaseAdmin
      .from('shop_items')
      .select('effect_value')
      .eq('item_id', potionId)
      .single();

    const healedAmount = shopItem?.effect_value ?? 50; // fallback to 50 if not found

    if (potionItem.quantity > 1) {
      await supabaseAdmin
        .from('inventory')
        .update({ quantity: potionItem.quantity - 1 })
        .eq('user_id', userId)
        .eq('item_id', potionId);
    } else {
      await supabaseAdmin
        .from('inventory')
        .delete()
        .eq('user_id', userId)
        .eq('item_id', potionId);
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('gold')
      .eq('id', userId)
      .single();

    const { data: items } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .eq('user_id', userId);

    const weapons = items?.filter(i => i.item_type === 'weapon') || [];
    const potions = items?.filter(i => i.item_type === 'potion') || [];

    return res.json({
      healedAmount,
      inventory: {
        gold: profile?.gold || 0,
        ownedWeaponIds: weapons.map(w => w.item_id),
        equippedWeaponId: weapons.length > 0 ? weapons[0].item_id : '',
        potions: potions.map(p => ({ id: p.item_id, count: p.quantity })),
      },
    });
  } catch (err) {
    console.error('Use potion error:', err);
    return res.status(500).json({ error: 'Failed to use potion' });
  }
}
