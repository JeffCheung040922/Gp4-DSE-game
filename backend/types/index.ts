export type ClassId = 'knight' | 'mage' | 'rogue' | 'bard' | 'archer' | 'paladin';
export type Subject = 'listening' | 'speaking' | 'reading' | 'writing';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type SetStatus = 'completed' | 'incomplete' | 'wrong';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  name: string;
}

export interface CreateCharacterRequest {
  classId: ClassId;
  name: string;
}

export interface UpdateCharacterRequest {
  name: string;
}

export interface SubmitRequest {
  setId: string;
  subject: Subject;
  answers: Record<string, string>;
}

export interface CreateRoomRequest {
  subject: Subject;
  difficulty: Difficulty;
  playerName?: string;
  classId?: ClassId;
}

export interface JoinRoomRequest {
  roomCode: string;
  playerName?: string;
  classId?: ClassId;
}

export interface EquipWeaponRequest {
  weaponId: string;
}

export interface AddGoldRequest {
  amount: number;
}

export interface AIGenerateRequest {
  subject: Subject;
  difficulty: Difficulty;
  count?: number;
}

export interface AIMemoryRequest {
  setId: string;
  topic: string;
  difficulty: Difficulty;
  confidenceScore: number;
}

export interface BossTeaserRequest {
  subject: Subject;
}