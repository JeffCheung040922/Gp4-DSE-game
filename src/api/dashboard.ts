import axios from 'axios'
import type { WeeklyStreak, WrongQuestionsReview, DashboardStats, WrongAnswerAnalysis } from '../types/api'

import { getApiBaseUrl } from './apiBaseUrl'

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10_000,
  withCredentials: true,
})

function assertObject<T>(data: unknown, label: string): T {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Backend not reachable — ${label} returned unexpected response`)
  }
  return data as T
}

/**
 * GET /api/dashboard/weekly-streak
 * Returns a 7-day streak array ordered Mon..Sun.
 */
export async function fetchWeeklyStreak(): Promise<WeeklyStreak> {
  const { data } = await api.get('/dashboard/weekly-streak')
  return assertObject<WeeklyStreak>(data, 'weekly-streak')
}

/**
 * GET /api/dashboard/wrong-questions-review
 * Returns wrong question counts grouped by subject.
 */
export async function fetchWrongQuestionsReview(): Promise<WrongQuestionsReview> {
  const { data } = await api.get('/dashboard/wrong-questions-review')
  return assertObject<WrongQuestionsReview>(data, 'wrong-questions-review')
}

/**
 * GET /api/dashboard/stats
 * Returns the full dashboard statistics for the current user.
 * Includes total XP, level, gold, question counts, correct rate, and per-subject breakdowns.
 */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data } = await api.get('/dashboard/stats')
  return assertObject<DashboardStats>(data, 'dashboard-stats')
}

/**
 * GET /api/dashboard/wrong-answer-analysis
 * Returns per-subject accuracy breakdown + AI-generated improvement tips.
 */
export async function fetchWrongAnswerAnalysis(): Promise<WrongAnswerAnalysis> {
  const { data } = await api.get('/dashboard/wrong-answer-analysis')
  return assertObject<WrongAnswerAnalysis>(data, 'wrong-answer-analysis')
}

