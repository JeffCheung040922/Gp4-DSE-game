import { Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import type { AuthRequest } from '../middleware/authMiddleware';

// dashboardController: user analytics and progress
// Both guest and registered users have a valid userId via JWT — same code handles both.
export async function getStats(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('xp, gold, level, username')
      .eq('id', userId)
      .single();

    const { data: gameHistory } = await supabaseAdmin
      .from('game_history')
      .select('score, total_questions, xp_earned, accuracy, played_at')
      .eq('user_id', userId);

    const { data: userProgress } = await supabaseAdmin
      .from('user_progress')
      .select('subject, difficulty, total_questions_attempted, total_correct, accuracy_percentage')
      .eq('user_id', userId);

    const totalXp = profile?.xp || 0;
    const level = profile?.level || 1;
    const totalGold = profile?.gold || 0;
    const totalQuestionsAnswered = gameHistory?.reduce((sum, gh) => sum + gh.total_questions, 0) || 0;
    const totalCorrect = gameHistory?.reduce((sum, gh) => sum + Math.round((gh.accuracy / 100) * gh.total_questions), 0) || 0;
    const correctRate = totalQuestionsAnswered > 0 ? Math.round((totalCorrect / totalQuestionsAnswered) * 100) : 0;

    // Calculate longest consecutive streak from played_at dates
    const longestStreak = (() => {
      if (!gameHistory || gameHistory.length === 0) return 0;
      const dates = gameHistory
        .map(gh => new Date(gh.played_at).toISOString().split('T')[0]) // YYYY-MM-DD
        .filter((v, i, a) => a.indexOf(v) === i); // unique dates
      dates.sort((a, b) => b.localeCompare(a)); // newest first

      let maxStreak = 1;
      let currentStreak = 1;
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]);
        const curr = new Date(dates[i]);
        const diffDays = Math.round((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 1;
        }
      }
      return maxStreak;
    })();

    const subjectStats = (userProgress || []).map(up => ({
      subject: up.subject,
      difficulty: up.difficulty,
      attempted: up.total_questions_attempted,
      correct: up.total_correct,
      accuracy: up.accuracy_percentage,
    }));

    return res.json({
      totalXp,
      level,
      totalGold,
      totalQuestionsAnswered,
      correctRate,
      longestStreak,
      subjectStats,
    });
  } catch (err) {
    console.error('Get stats error:', err);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

export async function getStreak(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  try {
    const { data: gameHistory } = await supabaseAdmin
      .from('game_history')
      .select('played_at')
      .eq('user_id', userId)
      .order('played_at', { ascending: true });

    const today = new Date();
    const streakDays = [false, false, false, false, false, false, false];
    let streakCount = 0;

    if (gameHistory && gameHistory.length > 0) {
      const uniqueDates = new Set(
        gameHistory.map(gh => new Date(gh.played_at).toDateString())
      );

      for (let i = 0; i < 7; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - (6 - i));
        if (uniqueDates.has(checkDate.toDateString())) {
          streakDays[i] = true;
          streakCount++;
        }
      }

      streakCount = 0;
      for (let i = 6; i >= 0; i--) {
        if (streakDays[i]) {
          streakCount++;
        } else {
          break;
        }
      }
    }

    return res.json({ streakDays, streakCount });
  } catch (err) {
    console.error('Get streak error:', err);
    return res.status(500).json({ error: 'Failed to fetch streak' });
  }
}

export async function getWrongQuestions(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  try {
    const { data: wrongQuestions } = await supabaseAdmin
      .from('user_progress')
      .select('subject, difficulty, total_questions_attempted, total_correct, accuracy_percentage')
      .eq('user_id', userId)
      .lt('accuracy_percentage', 50);

    const entries = (wrongQuestions || []).map(wq => ({
      subject: wq.subject,
      difficulty: wq.difficulty,
      attempted: wq.total_questions_attempted,
      correct: wq.total_correct,
      accuracy: wq.accuracy_percentage,
    }));

    return res.json({ entries });
  } catch (err) {
    console.error('Get wrong questions error:', err);
    return res.status(500).json({ error: 'Failed to fetch wrong questions' });
  }
}

export async function getWrongAnswerAnalysis(req: AuthRequest, res: Response) {
  const userId = req.userId!;

  try {
    const { data: userProgress } = await supabaseAdmin
      .from('user_progress')
      .select('subject, difficulty, total_questions_attempted, total_correct, accuracy_percentage')
      .eq('user_id', userId);

    if (!userProgress || userProgress.length === 0) {
      return res.json({
        summary: [],
        tips: 'Start practicing to unlock your personalised learning tips!',
        weakestSubject: null,
        weakSubjects: [],
      });
    }

    const subjectSummary = (userProgress || []).map(up => ({
      subject: up.subject,
      difficulty: up.difficulty,
      attempted: up.total_questions_attempted,
      correct: up.total_correct,
      accuracy: up.accuracy_percentage ?? 0,
    }));

    const weakSubjects = subjectSummary
      .filter(s => s.attempted > 0 && s.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy);

    const strongSubjects = subjectSummary
      .filter(s => s.attempted > 0 && s.accuracy >= 80);

    const weakestSubject = weakSubjects.length > 0 ? weakSubjects[0].subject : null;

    const tips = buildImprovementTips(subjectSummary, weakSubjects, strongSubjects);

    return res.json({
      summary: subjectSummary,
      tips,
      weakestSubject,
      weakSubjects: weakSubjects.map(w => ({ subject: w.subject, accuracy: w.accuracy })),
    });
  } catch (err) {
    console.error('Get wrong answer analysis error:', err);
    return res.status(500).json({ error: 'Failed to fetch wrong answer analysis' });
  }
}

function buildImprovementTips(
  subjectSummary: { subject: string; difficulty: string; attempted: number; correct: number; accuracy: number }[],
  weakSubjects: { subject: string; accuracy: number }[],
  strongSubjects: { subject: string; accuracy: number }[],
): string {
  if (weakSubjects.length === 0) {
    if (strongSubjects.length >= 3) {
      return 'Excellent work! You\'re strong across most subjects. Keep practicing daily to maintain your edge and push into harder difficulty levels!';
    }
    return 'Good progress! Keep practicing each subject regularly to build confidence and improve your accuracy across all areas.';
  }

  const tipParts: string[] = [];

  for (const weak of weakSubjects.slice(0, 2)) {
    const subject = weak.subject.toLowerCase();
    const accuracy = weak.accuracy;

    if (subject === 'reading') {
      if (accuracy < 40) {
        tipParts.push('Reading: Focus on understanding the main idea first. Try reading one English article daily (e.g., BBC Learning English) and summarize it in 3 sentences.');
      } else {
        tipParts.push('Reading: Practice skimming and scanning techniques. Always read question keywords before going back to the passage.');
      }
    } else if (subject === 'listening') {
      if (accuracy < 40) {
        tipParts.push('Listening: Listen to English podcasts or news (e.g., BBC Learning English) for 15 minutes daily to train your ear. Focus on catching key words first.');
      } else {
        tipParts.push('Listening: Take short notes while listening. Focus on the speaker\'s opinion and purpose, not just surface-level facts.');
      }
    } else if (subject === 'speaking') {
      if (accuracy < 40) {
        tipParts.push('Speaking: Practice speaking English out loud every day, even if alone. Record yourself and compare your pronunciation with native speakers.');
      } else {
        tipParts.push('Speaking: Work on common DSE topics: environment, technology, youth culture. Use the PAST method: Prepare, Ask for feedback, Study model answers, Take action.');
      }
    } else if (subject === 'writing') {
      if (accuracy < 40) {
        tipParts.push('Writing: Focus on essay structure — Introduction + 2-3 Body Paragraphs + Conclusion. Memorize useful linking phrases and sentence starters.');
      } else {
        tipParts.push('Writing: Expand your vocabulary range and use more sophisticated sentence structures. Practice writing under timed conditions (35 minutes).');
      }
    } else {
      tipParts.push(`${weak.subject}: Focus on understanding the question types and common mistakes in this area. Review your past answers carefully.`);
    }
  }

  const attemptedEntries = subjectSummary.filter(s => s.attempted > 0);
  const avgAccuracy = attemptedEntries.length > 0
    ? attemptedEntries.reduce((sum, s) => sum + s.accuracy, 0) / attemptedEntries.length
    : 0;

  if (avgAccuracy < 40) {
    tipParts.push('General: Slow down and read all options carefully before answering. Many mistakes come from rushing — double-check before submitting!');
  } else if (avgAccuracy > 75) {
    tipParts.push('General: Great performance! Try increasing difficulty to challenge yourself further and build stamina for harder questions.');
  }

  tipParts.push('General: Practice little and often — 20 questions daily beats 100 questions once a week! Consistency is key to DSE success.');

  return tipParts.join(' | ');
}

export async function getBossTeaserInfo(req: AuthRequest, res: Response) {
  const { subject } = req.query;

  try {
    const normalizedSubject = typeof subject === 'string' && subject.trim()
      ? subject.trim().toLowerCase()
      : null;

    let query = supabaseAdmin
      .from('question_sets')
      .select('title, subject, difficulty, question_count, xp_reward, gold_reward')
      .limit(50);

    if (normalizedSubject) {
      query = query.ilike('subject', `%${normalizedSubject}%`);
    }

    const { data: bossSets } = await query;

    const difficultyRank: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
    const bossSet = (bossSets || [])
      .sort((left, right) => {
        const byDifficulty = (difficultyRank[right.difficulty?.toLowerCase() || 'easy'] || 0)
          - (difficultyRank[left.difficulty?.toLowerCase() || 'easy'] || 0);
        if (byDifficulty !== 0) return byDifficulty;
        return (right.gold_reward || 0) - (left.gold_reward || 0);
      })[0];

    const teaserSubject = (bossSet?.subject || normalizedSubject || 'reading').toLowerCase();
    const teaserDifficulty = (bossSet?.difficulty || 'Hard') as 'Easy' | 'Medium' | 'Hard';
    const teaserColorMap: Record<string, string> = {
      listening: '#2563eb',
      speaking: '#059669',
      reading: '#d97706',
      writing: '#dc2626',
    };
    const teaserHpMap: Record<string, number> = {
      easy: 120,
      medium: 180,
      hard: 260,
    };

    return res.json({
      bossType: `${teaserSubject}_${teaserDifficulty.toLowerCase()}`,
      difficulty: teaserDifficulty,
      bossName: bossSet?.title || `${teaserSubject.charAt(0).toUpperCase() + teaserSubject.slice(1)} Boss`,
      bossHp: teaserHpMap[teaserDifficulty.toLowerCase()] || 260,
      bossMaxHp: teaserHpMap[teaserDifficulty.toLowerCase()] || 260,
      bossColor: teaserColorMap[teaserSubject] || '#dc2626',
      goldReward: bossSet?.gold_reward || 50,
      battleSubject: teaserSubject,
    });
  } catch (err) {
    console.error('Get boss teaser error:', err);
    return res.status(500).json({ error: 'Failed to fetch boss teaser' });
  }
}
