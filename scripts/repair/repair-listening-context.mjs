import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const repairs = [
  {
    oldText: 'Simple dialogue. What does B want?',
    newText: 'Simple dialogue. A: “Do you want tea or coffee?” B: “Coffee, please.” What does B want?',
  },
  {
    oldText: 'Dialogue (plans). What time will they meet?',
    newText: 'Dialogue (plans). A: “Let’s meet at 2:00.” B: “I can’t. How about 2:30?” A: “Okay.” What time will they meet?',
  },
  {
    oldText: 'Dialogue (choosing). What does B prefer?',
    newText: 'Dialogue (choosing). A: “Do you want to watch a comedy or an action movie?” B: “Action, but not too violent.” What does B prefer?',
  },
  {
    oldText: 'Dialogue (reason). Why didn’t B join?',
    newText: 'Dialogue (reason). A: “Why didn’t you join the basketball match?” B: “I had a fever, so I stayed home.” Why didn’t B join?',
  },
  {
    oldText: 'Dialogue (preference change). What does B want now?',
    newText: 'Dialogue (preference change). A: “Do you still want to eat Japanese food?” B: “Actually, I’d rather have Thai food today.” What does B want now?',
  },
  {
    oldText: 'Dialogue (inference). What can we infer about B?',
    newText: 'Dialogue (inference). A: “Did you finish the report?” B: “Not yet. I’ll stay up tonight to do it.” What can we infer about B?',
  },
  {
    oldText: 'Dialogue (clarifying a misunderstanding). When are they meeting?',
    newText: 'Dialogue (clarifying a misunderstanding). A: “So we’re meeting on Thursday, right?” B: “No, I said Tuesday. Thursday I have tutorial class.” When are they meeting?',
  },
  {
    oldText: 'Dialogue (choice with constraints). Why does B prefer the MTR?',
    newText: 'Dialogue (choice with constraints). A: “We can take a taxi, but it’s expensive.” B: “Let’s take the MTR. It’s cheaper and faster at this time.” Why does B prefer the MTR?',
  },
  {
    oldText: 'Dialogue (sequence/time). What time do they plan to arrive at the station?',
    newText: 'Dialogue (sequence/time). A: “The train leaves at 8:05.” B: “Then we should get there by 7:50 to be safe.” What time do they plan to arrive at the station?',
  },
  {
    oldText: 'Dialogue (polite refusal). What does B do?',
    newText: 'Dialogue (polite refusal). A: “Can you join the meeting at 6?” B: “I’d like to, but I have a part-time job then. Could we do 7 instead?” What does B do?',
  },
];

async function main() {
  let updated = 0;

  for (const repair of repairs) {
    const { data, error } = await supabase
      .from('questions')
      .update({ question_text: repair.newText })
      .eq('question_text', repair.oldText)
      .select('id, question_text');

    if (error) {
      console.error(`Failed to update: ${repair.oldText}`);
      console.error(error.message);
      continue;
    }

    updated += data?.length ?? 0;
    console.log(`Updated ${data?.length ?? 0} row(s): ${repair.oldText}`);
  }

  console.log(`Total updated rows: ${updated}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
