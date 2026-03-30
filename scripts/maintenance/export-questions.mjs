import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function exportQuestions() {
  try {
    console.log('Fetching all question sets...\n');
    
    // Fetch all question sets
    const { data: sets, error: setsError } = await supabase
      .from('question_sets')
      .select('*')
      .order('subject', { ascending: true })
      .order('difficulty', { ascending: true });
    
    if (setsError) throw setsError;
    
    console.log(`Found ${sets.length} question sets\n`);
    
    let jsonData = [];
    let textOutput = '';
    
    textOutput += '='.repeat(120) + '\n';
    textOutput += 'ALL IMPORTED DSE QUESTIONS\n';
    textOutput += '='.repeat(120) + '\n\n';
    
    // For each set, fetch and display questions
    for (const set of sets) {
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('set_id', set.id)
        .order('question_no', { ascending: true });
      
      if (questionsError) throw questionsError;
      
      console.log(`✓ ${set.title}: ${questions.length} questions`);
      
      textOutput += `\n📚 SET: ${set.title}\n`;
      textOutput += `   Subject: ${set.subject} | Difficulty: ${set.difficulty}\n`;
      textOutput += `   Questions: ${questions.length} | XP Reward: ${set.xp_reward} | Gold Reward: ${set.gold_reward}\n\n`;
      
      const setData = {
        setId: set.id,
        title: set.title,
        subject: set.subject,
        difficulty: set.difficulty,
        xpReward: set.xp_reward,
        goldReward: set.gold_reward,
        questionCount: questions.length,
        questions: []
      };
      
      questions.forEach((q) => {
        textOutput += `Q${q.question_no}. ${q.question_text}\n`;
        textOutput += `   A) ${q.option_a}\n`;
        textOutput += `   B) ${q.option_b}\n`;
        textOutput += `   C) ${q.option_c}\n`;
        textOutput += `   D) ${q.option_d}\n`;
        textOutput += `   ✓ Answer: ${q.correct_answer} | Explanation: ${q.explanation}\n`;
        textOutput += `\n`;
        
        setData.questions.push({
          questionNo: q.question_no,
          questionText: q.question_text,
          options: {
            A: q.option_a,
            B: q.option_b,
            C: q.option_c,
            D: q.option_d
          },
          correctAnswer: q.correct_answer,
          explanation: q.explanation
        });
      });
      
      textOutput += '-'.repeat(120) + '\n';
      jsonData.push(setData);
    }
    
    // Write JSON file
    fs.writeFileSync('exported-questions.json', JSON.stringify(jsonData, null, 2));
    console.log('\n✅ JSON exported to: exported-questions.json');
    
    // Write text file
    fs.writeFileSync('exported-questions.txt', textOutput);
    console.log('✅ Formatted text exported to: exported-questions.txt');
    
    // Print summary
    const totalQuestions = jsonData.reduce((sum, set) => sum + set.questionCount, 0);
    console.log(`\n📊 Summary: ${jsonData.length} sets, ${totalQuestions} total questions`);
    
  } catch (error) {
    console.error('❌ Error exporting questions:', error);
    process.exit(1);
  }
}

exportQuestions();
