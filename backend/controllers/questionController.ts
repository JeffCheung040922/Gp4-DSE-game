import { Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import type { AuthRequest } from '../middleware/authMiddleware';
import type { SubmitRequest } from '../types';

function getBattleValues(difficulty: string) {
  const normalized = String(difficulty || 'Easy').toLowerCase();

  if (normalized === 'hard') {
    return { bossDamage: 18, charDamage: 14, goldPerCorrect: 8 };
  }

  if (normalized === 'medium') {
    return { bossDamage: 14, charDamage: 10, goldPerCorrect: 6 };
  }

  return { bossDamage: 10, charDamage: 7, goldPerCorrect: 4 };
}

// questionController: question set, question list and answer submission
// Both guest and registered users have a valid userId via JWT — the same code handles both.
export async function getSets(req: AuthRequest, res: Response) {
  const { subject, difficulty } = req.query;

  try {
    let query = supabaseAdmin
      .from('question_sets')
      .select('id, title, subject, difficulty, question_count, xp_reward, gold_reward, duration_minutes');

    if (subject && typeof subject === 'string') {
      query = query.ilike('subject', `%${subject}%`);
    }

    if (difficulty && typeof difficulty === 'string') {
      query = query.ilike('difficulty', `%${difficulty}%`);
    }

    const { data: sets, error } = await query;

    if (error) {
      console.error('Get sets error:', error);
      return res.status(500).json({ error: 'Failed to fetch question sets' });
    }

    const formattedSets = sets?.map(set => ({
      id: set.id,
      title: set.title,
      type: 'multiple-choice',
      subject: set.subject,
      difficulty: set.difficulty,
      duration: `${set.duration_minutes} min`,
      questionCount: set.question_count,
      status: 'incomplete',
      xpReward: set.xp_reward,
      goldReward: set.gold_reward,
    })) || [];

    return res.json(formattedSets);
  } catch (err) {
    console.error('Get sets error:', err);
    return res.status(500).json({ error: 'Failed to fetch question sets' });
  }
}

export async function getQuestions(req: AuthRequest, res: Response) {
  const { setId } = req.query;

  try {
    if (!setId || typeof setId !== 'string') {
      return res.status(400).json({ error: 'setId required' });
    }

    const { data: questions, error } = await supabaseAdmin
      .from('questions')
      .select('id, set_id, question_no, question_text, option_a, option_b, option_c, option_d')
      .eq('set_id', setId)
      .order('question_no');

    if (error) {
      console.error('Get questions error:', error);
      return res.status(500).json({ error: 'Failed to fetch questions' });
    }

    const formattedQuestions = questions?.map(q => ({
      id: q.id,
      no: q.question_no,
      text: q.question_text,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
    })) || [];

    return res.json(formattedQuestions);
  } catch (err) {
    console.error('Get questions error:', err);
    return res.status(500).json({ error: 'Failed to fetch questions' });
  }
}

export async function submitAnswers(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { setId, subject, answers } = req.body as SubmitRequest;

  try {
    if (!setId || !subject || !answers) {
      return res.status(400).json({ error: 'setId, subject, and answers required' });
    }

    const { data: questions, error: questionsError } = await supabaseAdmin
      .from('questions')
      .select('id, question_no, correct_answer')
      .eq('set_id', setId)
      .order('question_no');

    if (questionsError || !questions) {
      console.error('Get correct answers error:', questionsError);
      return res.status(500).json({ error: 'Failed to process answers' });
    }

    const { data: questionSet } = await supabaseAdmin
      .from('question_sets')
      .select('xp_reward, gold_reward, difficulty')
      .eq('id', setId)
      .single();

    const difficulty = questionSet?.difficulty || 'Easy';
    const battleValues = getBattleValues(difficulty);

    const answeredQuestionIds = new Set(Object.keys(answers));
    const answeredCount = questions.filter(q => answeredQuestionIds.has(q.id)).length;
    const isSetComplete = answeredCount >= questions.length;

    let correctCount = 0;
    const results = questions.map(q => {
      const userAnswer = answers[q.id] ?? answers[String(q.question_no - 1)] ?? answers[String(q.question_no)];
      const isCorrect = userAnswer === q.correct_answer;
      if (isCorrect) correctCount++;
      return {
        questionId: q.id,
        questionNo: q.question_no,
        userAnswer,
        correctAnswer: q.correct_answer,
        isCorrect,
        bossDamage: isCorrect ? battleValues.bossDamage : 0,
        charDamage: isCorrect ? 0 : battleValues.charDamage,
        goldEarned: isCorrect ? battleValues.goldPerCorrect : 0,
      };
    });

    const totalQuestions = questions.length;
    const score = Math.round((correctCount / totalQuestions) * 100);
    const accuracy = score;
    const xpEarned = Math.round((correctCount / totalQuestions) * 100);
    const goldEarned = Math.round((correctCount / totalQuestions) * 50);

    const actualXp = questionSet?.xp_reward || xpEarned;
    const actualGold = questionSet?.gold_reward || goldEarned;

    if (isSetComplete) {
      const { error: historyError } = await supabaseAdmin
        .from('game_history')
        .insert({
          user_id: userId,
          set_id: setId,
          score,
          total_questions: totalQuestions,
          xp_earned: actualXp,
          gold_earned: actualGold,
          accuracy,
        });

      if (historyError) {
        console.error('Insert game history error:', historyError);
      }

      const { data: existingProgress } = await supabaseAdmin
        .from('user_progress')
        .select('total_questions_attempted, total_correct, accuracy_percentage')
        .eq('user_id', userId)
        .eq('subject', subject)
        .eq('difficulty', difficulty)
        .single();

      const newTotal = (existingProgress?.total_questions_attempted || 0) + totalQuestions;
      const newCorrect = (existingProgress?.total_correct || 0) + correctCount;
      const newAccuracy = Math.round((newCorrect / newTotal) * 100);

      await supabaseAdmin
        .from('user_progress')
        .upsert(
          {
            user_id: userId,
            subject,
            difficulty,
            total_questions_attempted: newTotal,
            total_correct: newCorrect,
            accuracy_percentage: newAccuracy,
            last_played_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,subject,difficulty' }
        );

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('xp, gold')
        .eq('id', userId)
        .single();

      await supabaseAdmin
        .from('profiles')
        .update({
          xp: (profile?.xp || 0) + actualXp,
          gold: (profile?.gold || 0) + actualGold,
        })
        .eq('id', userId);
    }

    return res.json({
      score,
      total: totalQuestions,
      xpEarned: isSetComplete ? actualXp : 0,
      goldEarned: isSetComplete ? actualGold : 0,
      results,
    });
  } catch (err) {
    console.error('Submit answers error:', err);
    return res.status(500).json({ error: 'Failed to submit answers' });
  }
}
