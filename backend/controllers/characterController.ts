import { Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import type { AuthRequest } from '../middleware/authMiddleware';
import type { CreateCharacterRequest, UpdateCharacterRequest } from '../types';

// characterController: handle character CRUD
// IMPLEMENTED: Uses Supabase characters table
// Table: public.characters
// Columns: id (UUID), user_id (UUID FK→profiles.id), name, character_type, level, xp, health, attack, defense, created_at
// GET    → Read character by user_id
// CREATE → Insert new character (deletes old one if exists)
// UPDATE → Update character name
// DELETE → Remove character for user
export async function getCharacter(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  try {
    const { data: character, error } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    return res.json({
      userId,
      classId: character.character_type,
      name: character.name,
      xp: character.xp,
      level: character.level,
      health: character.health,
      attack: character.attack,
      defense: character.defense,
    });
  } catch (err) {
    console.error('Get character error:', err);
    return res.status(500).json({ error: 'Failed to retrieve character' });
  }
}

export async function createCharacter(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { classId, name } = req.body as CreateCharacterRequest;

  try {
    // Validate input
    if (!classId || !name) {
      return res.status(400).json({ error: 'classId and name required' });
    }

    // Delete existing character if any
    await supabaseAdmin
      .from('characters')
      .delete()
      .eq('user_id', userId);

    // Create new character
    const { data: character, error } = await supabaseAdmin
      .from('characters')
      .insert({
        user_id: userId,
        name,
        character_type: classId,
        level: 1,
        xp: 0,
        health: 100,
        attack: 10,
        defense: 5,
      })
      .select()
      .single();

    if (error || !character) {
      console.error('Create character error:', error);
      return res.status(500).json({ error: 'Failed to create character' });
    }

    return res.json({
      userId,
      classId: character.character_type,
      name: character.name,
      xp: character.xp,
      level: character.level,
      health: character.health,
      attack: character.attack,
      defense: character.defense,
    });
  } catch (err) {
    console.error('Create character error:', err);
    return res.status(500).json({ error: 'Failed to create character' });
  }
}

export async function updateCharacter(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { name } = req.body as UpdateCharacterRequest;

  try {
    // Validate input
    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }

    // Update character
    const { data: character, error } = await supabaseAdmin
      .from('characters')
      .update({ name })
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !character) {
      console.error('Update character error:', error);
      return res.status(500).json({ error: 'Failed to update character' });
    }

    return res.json({
      userId,
      classId: character.character_type,
      name: character.name,
      xp: character.xp,
      level: character.level,
      health: character.health,
      attack: character.attack,
      defense: character.defense,
    });
  } catch (err) {
    console.error('Update character error:', err);
    return res.status(500).json({ error: 'Failed to update character' });
  }
}

export async function deleteCharacter(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  try {
    const { error } = await supabaseAdmin
      .from('characters')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Delete character error:', error);
      return res.status(500).json({ error: 'Failed to delete character' });
    }

    return res.json({
      message: 'Character deleted successfully',
    });
  } catch (err) {
    console.error('Delete character error:', err);
    return res.status(500).json({ error: 'Failed to delete character' });
  }
}