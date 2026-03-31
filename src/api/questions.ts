import axios from 'axios'
import type { QuestionSet, Question, SubmitPayload, SubmitResponse, Subject } from '../types/api'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 10_000,
  withCredentials: true,
})

// Guard against Vite dev-server returning index.html (200 OK) instead of a real JSON response
function assertArray<T>(data: unknown, label: string): T[] {
  if (!Array.isArray(data)) {
    throw new Error(`Backend not reachable — ${label} returned unexpected response`)
  }
  return data as T[]
}

function assertObject<T>(data: unknown, label: string): T {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Backend not reachable — ${label} returned unexpected response`)
  }
  return data as T
}

/**
 * Fetch the list of question sets for a given subject and difficulty.
 * GET /api/question-sets?subject=listening&difficulty=Easy
 * Difficulty is fixed: 'Easy' | 'Medium' | 'Hard' (frontend always sends one of these three)
 */
export async function fetchQuestionSets(
  subject: Subject,
  difficulty: 'Easy' | 'Medium' | 'Hard' = 'Easy'
): Promise<QuestionSet[]> {
  const { data } = await api.get('/question-sets', { params: { subject, difficulty } })
  return assertArray<QuestionSet>(data, 'question-sets')
}

/**
 * Fetch all questions for a specific set.
 * GET /api/questions?setId=abc123
 * Correct answers are NOT returned — they are revealed after submission.
 */
export async function fetchQuestions(setId: string): Promise<Question[]> {
  const { data } = await api.get('/questions', { params: { setId } })
  return assertArray<Question>(data, 'questions')
}

/**
 * Fetch N random questions from the DB pool for a given subject + difficulty.
 * GET /api/random-questions?subject=listening&difficulty=Easy&count=12
 * No set concept — just a random quiz.
 */
export async function fetchRandomQuestions(
  subject: Subject,
  difficulty: 'Easy' | 'Medium' | 'Hard',
  count = 12
): Promise<Question[]> {
  const { data } = await api.get('/random-questions', { params: { subject, difficulty, count } })
  return assertArray<Question>(data, 'random-questions')
}

/**
 * Submit the user's answers and receive scored results.
 * POST /api/submit
 */
export async function submitAnswers(payload: SubmitPayload): Promise<SubmitResponse> {
  const { data } = await api.post('/submit', payload)
  return assertObject<SubmitResponse>(data, 'submit')
}
