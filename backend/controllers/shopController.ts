import { Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import type { AuthRequest } from '../middleware/authMiddleware';

// shopController: in-game shop (buy weapons/potions)
// IMPLEMENTED: Check gold + deduct → supabaseAdmin.from('inventory').insert + supabaseAdmin.from('profiles').update
// Tables: public.shop_items + public.inventory + public.profiles
// shop_items columns: id (UUID), item_id, name, description, item_type, price, effect_type, effect_value, available
// inventory columns: id (UUID), user_id (UUID FK→profiles.id), item_id, item_name, item_type, quantity, acquired_at
// profiles columns: id (UUID), gold (INTEGER)
// buyWeapon():
//   1. Query shop_items for weapon price
//   2. Check user gold >= price
//   3. Deduct gold from profiles
//   4. Add/upsert weapon in inventory
// buyPotion(): Same flow for potions
export async function buyWeapon(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { weaponId } = req.body;

  try {
    if (!weaponId) {
      return res.status(400).json({ error: 'weaponId required' });
    }

    // Get weapon from shop_items
    const { data: shopItem, error: itemError } = await supabaseAdmin
      .from('shop_items')
      .select('*')
      .eq('item_id', weaponId)
      .eq('item_type', 'weapon')
      .single();

    if (itemError || !shopItem) {
      return res.status(404).json({ error: 'Weapon not found in shop' });
    }

    // Check if available
    if (!shopItem.available) {
      return res.status(400).json({ error: 'Item not available' });
    }

    // Get user gold
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('gold')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has enough gold
    if (profile.gold < shopItem.price) {
      return res.status(400).json({ error: 'Not enough gold' });
    }

    // Deduct gold from user
    const newGold = profile.gold - shopItem.price;
    await supabaseAdmin
      .from('profiles')
      .update({ gold: newGold })
      .eq('id', userId);

    // Add weapon to inventory (upsert to increase quantity if already owned)
    await supabaseAdmin
      .from('inventory')
      .upsert(
        {
          user_id: userId,
          item_id: weaponId,
          item_name: shopItem.name,
          item_type: 'weapon',
          quantity: 1,
        },
        { onConflict: 'user_id,item_id' }
      );

    // Get updated inventory
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
    console.error('Buy weapon error:', err);
    return res.status(500).json({ error: 'Failed to buy weapon' });
  }
}

export async function buyPotion(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { potionId } = req.body;

  try {
    if (!potionId) {
      return res.status(400).json({ error: 'potionId required' });
    }

    // Get potion from shop_items
    const { data: shopItem, error: itemError } = await supabaseAdmin
      .from('shop_items')
      .select('*')
      .eq('item_id', potionId)
      .eq('item_type', 'potion')
      .single();

    if (itemError || !shopItem) {
      return res.status(404).json({ error: 'Potion not found in shop' });
    }

    // Check if available
    if (!shopItem.available) {
      return res.status(400).json({ error: 'Item not available' });
    }

    // Get user gold
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('gold')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has enough gold
    if (profile.gold < shopItem.price) {
      return res.status(400).json({ error: 'Not enough gold' });
    }

    // Deduct gold from user
    const newGold = profile.gold - shopItem.price;
    await supabaseAdmin
      .from('profiles')
      .update({ gold: newGold })
      .eq('id', userId);

    // Add potion to inventory (upsert to increase quantity if already owned)
    const { data: existingPotion } = await supabaseAdmin
      .from('inventory')
      .select('quantity')
      .eq('user_id', userId)
      .eq('item_id', potionId)
      .eq('item_type', 'potion')
      .single();

    const newQuantity = (existingPotion?.quantity || 0) + 1;

    await supabaseAdmin
      .from('inventory')
      .upsert(
        {
          user_id: userId,
          item_id: potionId,
          item_name: shopItem.name,
          item_type: 'potion',
          quantity: newQuantity,
        },
        { onConflict: 'user_id,item_id' }
      );

    // Get updated inventory
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
    console.error('Buy potion error:', err);
    return res.status(500).json({ error: 'Failed to buy potion' });
  }
}