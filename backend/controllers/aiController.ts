import { Response } from 'express';
import OpenAI from 'openai';
import type { AuthRequest } from '../middleware/authMiddleware';
import type { AIGenerateRequest, AIMemoryRequest } from '../types';

// aiController: adaptive AI interface and memory tracking
// TODO: replace in-memory Map with DB → supabaseAdmin.from('user_ai_memory').upsert/select
// ⚠️ 注意：目前 setup-database.sql 冇 user_ai_memory table，需要先新增：
// CREATE TABLE IF NOT EXISTS public.user_ai_memory (
//     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//     user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
//     topic TEXT NOT NULL,
//     difficulty TEXT NOT NULL,
//     confidence_score INTEGER DEFAULT 0,
//     updated_at TIMESTAMPTZ DEFAULT NOW(),
//     UNIQUE(user_id, topic)
// );
//
// getUserMemory(userId) → supabaseAdmin.from('user_ai_memory').select('*').eq('user_id', userId)
// updateMemory() → supabaseAdmin.from('user_ai_memory').upsert({ user_id: userId, topic, difficulty, confidence_score }, { onConflict: 'user_id,topic' })
// AI 生成題目後 → 用戶 submit 完根據結果 updateMemory (confidence_score based on accuracy)
interface MemoryTopic {
  name: string;
  difficulty: string;
  confidenceScore: number;
  updatedAt: string;
}

interface UserMemory {
  topics: MemoryTopic[];
  lastUpdated: string;
}

interface GeneratedQuestion {
  id: string;
  no: number;
  text: string;
  options: string[];
  correctAnswer: string;
}

const userMemoryStore = new Map<string, UserMemory>();

// ─── AI Provider Clients ───────────────────────────────────────────────────────
// Priority: Groq (free+fast) → DeepSeek → OpenAI → fallback

function createGroqClient(): OpenAI {
  return new OpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
  });
}

function createDeepseekClient(): OpenAI {
  return new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
  });
}

type AIProvider = 'groq' | 'deepseek' | 'openai';

interface AIClient {
  client: OpenAI;
  provider: AIProvider;
  model: string;
}

function getAIClient(): AIClient | null {
  if (process.env.GROQ_API_KEY) {
    return { client: createGroqClient(), provider: 'groq', model: 'llama-3.1-8b-instant' };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { client: createDeepseekClient(), provider: 'deepseek', model: 'deepseek-chat' };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      provider: 'openai',
      model: 'gpt-4o-mini',
    };
  }
  return null;
}

function getDefaultMemory(): UserMemory {
  return {
    topics: [],
    lastUpdated: new Date().toISOString(),
  };
}

function getUserMemory(userId: string): UserMemory {
  const existing = userMemoryStore.get(userId);
  if (existing) {
    return existing;
  }
  const initial = getDefaultMemory();
  userMemoryStore.set(userId, initial);
  return initial;
}

function buildPrompt(subject: string, difficulty: string, count: number, weakTopics: string[]): string {
  const weakFocus = weakTopics.length > 0 ? weakTopics.join(', ') : 'general fundamentals';
  return [
    `Generate ${count} multiple-choice English learning questions.`,
    `Subject: ${subject}.`,
    `Difficulty: ${difficulty}.`,
    `Focus on weak topics: ${weakFocus}.`,
    'Return ONLY strict JSON with this shape:',
    '{"questions":[{"text":"...","options":["A","B","C","D"],"correctAnswer":"A"}]}'
  ].join(' ');
}

function parseGeneratedQuestions(content: string, count: number): GeneratedQuestion[] {
  const parsed = JSON.parse(content) as { questions?: Array<{ text?: string; options?: string[]; correctAnswer?: string }> };
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

  return questions.slice(0, count).map((q, idx) => ({
    id: `ai-q-${Date.now()}-${idx + 1}`,
    no: idx + 1,
    text: typeof q.text === 'string' && q.text.trim().length > 0 ? q.text : `AI generated question ${idx + 1}?`,
    options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ['A', 'B', 'C', 'D'],
    correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer : 'A',
  }));
}

export async function generateQuestions(req: AuthRequest, res: Response) {
  const userId = req.userId;
  const { subject, difficulty, count } = req.body as AIGenerateRequest;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!subject || !difficulty) {
    return res.status(400).json({ error: 'Subject and difficulty are required' });
  }

  const questionCount = Number.isFinite(count) && (count as number) > 0 ? Math.min(count as number, 10) : 5;
  const memory = getUserMemory(userId);
  const weakTopics = memory.topics
    .filter(t => t.confidenceScore < 60)
    .map(t => t.name);

  const aiClient = getAIClient();

  // If no AI key configured, gracefully fall back to placeholder questions.
  if (!aiClient) {
    const fallbackQuestions: GeneratedQuestion[] = Array.from({ length: questionCount }, (_, idx) => ({
      id: `ai-q-fallback-${Date.now()}-${idx + 1}`,
      no: idx + 1,
      text: `Fallback ${subject} ${difficulty} question ${idx + 1}?`,
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 'A',
    }));

    return res.json({
      setId: `ai-generated-set-${Date.now()}`,
      subject,
      difficulty,
      questions: fallbackQuestions,
      source: 'fallback-no-api-key',
    });
  }

  try {
    const completion = await aiClient.client.chat.completions.create({
      model: aiClient.model,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: 'You are an assistant that creates educational MCQ questions for students. Output JSON only.',
        },
        {
          role: 'user',
          content: buildPrompt(subject, difficulty, questionCount, weakTopics),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'AI provider returned empty content' });
    }

    const questions = parseGeneratedQuestions(content, questionCount);
    if (questions.length === 0) {
      return res.status(502).json({ error: 'AI provider returned invalid question format' });
    }

    return res.json({
      setId: `ai-generated-set-${Date.now()}`,
      subject,
      difficulty,
      questions,
      source: aiClient.provider,
    });
  } catch (error) {
    console.error(`AI generation failed (${aiClient.provider}):`, error);
    return res.status(502).json({ error: `Failed to generate AI questions via ${aiClient.provider}` });
  }
}

export async function getMemory(req: AuthRequest, res: Response) {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const memory = getUserMemory(userId);

  return res.json({
    topics: memory.topics,
    lastUpdated: memory.lastUpdated,
  });
}

export async function updateMemory(req: AuthRequest, res: Response) {
  const userId = req.userId;
  const { topic, difficulty, confidenceScore } = req.body as AIMemoryRequest;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'Topic is required' });
  }
  if (!difficulty || typeof difficulty !== 'string') {
    return res.status(400).json({ error: 'Difficulty is required' });
  }
  if (!Number.isFinite(confidenceScore)) {
    return res.status(400).json({ error: 'confidenceScore must be a valid number' });
  }

  const memory = getUserMemory(userId);
  const existingIdx = memory.topics.findIndex(t => t.name.toLowerCase() === topic.toLowerCase());
  const nextTopic: MemoryTopic = {
    name: topic,
    difficulty,
    confidenceScore,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    memory.topics[existingIdx] = nextTopic;
  } else {
    memory.topics.push(nextTopic);
  }
  memory.lastUpdated = new Date().toISOString();
  userMemoryStore.set(userId, memory);

  return res.json({
    topics: memory.topics,
    lastUpdated: memory.lastUpdated,
  });
}

export async function getWeakPoints(req: AuthRequest, res: Response) {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const memory = getUserMemory(userId);
  const weakAreas = memory.topics
    .filter(t => t.confidenceScore < 60)
    .sort((a, b) => a.confidenceScore - b.confidenceScore)
    .map(t => ({
      subject: 'reading',
      topic: t.name,
      incorrectCount: Math.max(0, Math.round((100 - t.confidenceScore) / 10)),
      successRate: t.confidenceScore,
    }));

  return res.json({
    weakAreas,
  });
}
