import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Headphones, Mic, BookOpen, PenTool,
  ChevronRight, RotateCcw, Loader2,
  CheckCircle, XCircle, FlaskConical, Play, Zap,
} from 'lucide-react'
import { BossChallenge, type BossChallengeRef } from './BossChallenge'
import { useInventory } from '../hooks/useInventory'
import type { BossType } from './BattleWidget'
import { getSavedCharacter } from '../hooks/useCharacter'
import { CHARACTER_CLASSES } from '../types/character'
import { fetchQuestionSets, fetchQuestions, submitAnswers } from '../api/questions'
import type { Subject, QuestionSet, Question, AIAnalysis } from '../types/api'
import type { Inventory } from '../types/inventory'

// ─── Subject config ───────────────────────────────────────────────────────────
const SUBJECT_CFG: Record<Subject, { label: string; Icon: React.ComponentType<{ size?: number; color?: string }>; color: string; bg: string; border: string }> = {
  listening: { label: 'Listening', Icon: Headphones, color: '#2563eb', bg: '#eff6ff',  border: '#bfdbfe' },
  speaking:  { label: 'Speaking',  Icon: Mic,        color: '#059669', bg: '#ecfdf5',  border: '#a7f3d0' },
  reading:   { label: 'Reading',   Icon: BookOpen,   color: '#d97706', bg: '#fffbeb',  border: '#fde68a' },
  writing:   { label: 'Writing',   Icon: PenTool,    color: '#dc2626', bg: '#fff1f2',  border: '#fecdd3' },
}
// Subject × difficulty → unique BossType (12 total, each with its own GLB model)
function getBossType(subject: Subject, difficulty: string): BossType {
  const d = (difficulty ?? '').toLowerCase()
  const diff =
    d === 'medium' || d.startsWith('med')
      ? 'medium'
      : d === 'hard' || d.startsWith('hard')
        ? 'hard'
        : 'easy'
  return `${subject}_${diff}` as BossType
}

function getOptionLetter(index: number): 'A' | 'B' | 'C' | 'D' {
  return String.fromCharCode(65 + index) as 'A' | 'B' | 'C' | 'D'
}

// Extract just the letter from correctAnswer (which may come as "A", "B", "A. text", etc.)
function normalizeCorrectAnswer(answer: string): 'A' | 'B' | 'C' | 'D' {
  if (!answer) return 'A'
  const match = answer.match(/^([A-D])/i)
  return match ? (match[1].toUpperCase() as 'A' | 'B' | 'C' | 'D') : 'A'
}
const _DEMO_SETS: Record<Subject, QuestionSet[]> = {
  listening: [
    { id: 'demo-listening-0', title: '⚡ Quick Battle (2 Qs)', type: 'Quick Demo',             subject: 'listening', difficulty: 'Easy',   duration: '1 min', questionCount: 2, status: 'incomplete' },
    { id: 'demo-listening-1', title: 'Online Shopping Trends', type: 'Part A – Multiple Choice', subject: 'listening', difficulty: 'Medium', duration: '5 min', questionCount: 4, status: 'incomplete' },
    { id: 'demo-listening-2', title: '⚡ Quick Battle (Hard 2 Qs)', type: 'Quick Demo',        subject: 'listening', difficulty: 'Hard',   duration: '1 min', questionCount: 2, status: 'incomplete' },
  ],
  speaking:  [
    { id: 'demo-speaking-0',  title: '⚡ Quick Battle (2 Qs)', type: 'Quick Demo',             subject: 'speaking',  difficulty: 'Easy',   duration: '1 min', questionCount: 2, status: 'incomplete' },
    { id: 'demo-speaking-1',  title: 'School Life Role-Play',  type: 'Individual & Group Tasks', subject: 'speaking',  difficulty: 'Medium', duration: '6 min', questionCount: 3, status: 'incomplete' },
    { id: 'demo-speaking-2',  title: '⚡ Quick Battle (Hard 2 Qs)',  type: 'Quick Demo',        subject: 'speaking',  difficulty: 'Hard',   duration: '1 min', questionCount: 2, status: 'incomplete' },
  ],
  reading:   [
    { id: 'demo-reading-0',   title: '⚡ Quick Battle (2 Qs)', type: 'Quick Demo',              subject: 'reading',   difficulty: 'Easy',   duration: '1 min', questionCount: 2, status: 'incomplete' },
    { id: 'demo-reading-1',   title: 'Environment & Society',  type: 'Part B – Comprehension', subject: 'reading',   difficulty: 'Medium', duration: '8 min', questionCount: 4, status: 'incomplete' },
    { id: 'demo-reading-2',   title: '⚡ Quick Battle (Hard 2 Qs)',  type: 'Quick Demo',       subject: 'reading',   difficulty: 'Hard',   duration: '1 min', questionCount: 2, status: 'incomplete' },
  ],
  writing:   [
    { id: 'demo-writing-0',   title: '⚡ Quick Battle (2 Qs)', type: 'Quick Demo',             subject: 'writing',   difficulty: 'Easy',   duration: '1 min', questionCount: 2, status: 'incomplete' },
    { id: 'demo-writing-1',   title: 'Formal Letter Techniques', type: 'Language Focus – MC',   subject: 'writing',   difficulty: 'Medium', duration: '8 min', questionCount: 4, status: 'incomplete' },
    { id: 'demo-writing-2',   title: '⚡ Quick Battle (Hard 2 Qs)', type: 'Quick Demo',          subject: 'writing',   difficulty: 'Hard',   duration: '1 min', questionCount: 2, status: 'incomplete' },
  ],
}
const _DEMO_QUESTIONS: Record<string, Question[]> = {
  // ── Quick battle sets (2 Qs each) ──────────────────────────────────────────
  'demo-listening-0': [
    { id: 'dl0-q1', no: 1, text: 'The word "simultaneously" most closely means:', options: ['A. One after another', 'B. At the same time', 'C. In a different order', 'D. Very quickly'] },
    { id: 'dl0-q2', no: 2, text: "A speaker says: \"I'm not entirely convinced.\" This suggests they are:", options: ['A. Fully in agreement', 'B. Completely opposed', 'C. Partially doubtful', 'D. Simply confused'] },
  ],
  'demo-listening-2': [
    { id: 'dl0-q1', no: 1, text: 'The word "simultaneously" most closely means:', options: ['A. One after another', 'B. At the same time', 'C. In a different order', 'D. Very quickly'] },
    { id: 'dl0-q2', no: 2, text: "A speaker says: \"I'm not entirely convinced.\" This suggests they are:", options: ['A. Fully in agreement', 'B. Completely opposed', 'C. Partially doubtful', 'D. Simply confused'] },
  ],
  'demo-speaking-0': [
    { id: 'ds0-q1', no: 1, text: 'Which phrase is the MOST polite way to interrupt a speaker?', options: ['A. "Stop! Let me speak now."', 'B. "Sorry to interrupt, but could I add something?"', 'C. "You\'re wrong. Listen to me."', 'D. "Anyway, my point is better."'] },
    { id: 'ds0-q2', no: 2, text: 'To express agreement formally, the BEST phrase is:', options: ['A. "Yeah, totally!"', 'B. "I couldn\'t agree more with that perspective."', 'C. "Same."', 'D. "Whatever you say."'] },
  ],
  'demo-speaking-2': [
    { id: 'ds0-q1', no: 1, text: 'Which phrase is the MOST polite way to interrupt a speaker?', options: ['A. "Stop! Let me speak now."', 'B. "Sorry to interrupt, but could I add something?"', 'C. "You\'re wrong. Listen to me."', 'D. "Anyway, my point is better."'] },
    { id: 'ds0-q2', no: 2, text: 'To express agreement formally, the BEST phrase is:', options: ['A. "Yeah, totally!"', 'B. "I couldn\'t agree more with that perspective."', 'C. "Same."', 'D. "Whatever you say."'] },
  ],
  'demo-reading-0': [
    { id: 'dr0-q1', no: 1, text: 'The word "proliferation" in a reading passage most closely means:', options: ['A. Rapid decline', 'B. Slow improvement', 'C. Rapid increase or spread', 'D. Complete disappearance'] },
    { id: 'dr0-q2', no: 2, text: 'The author writes: "While the policy seems beneficial, its long-term effects remain uncertain." The author\'s tone is best described as:', options: ['A. Strongly supportive', 'B. Cautiously neutral', 'C. Completely negative', 'D. Highly enthusiastic'] },
  ],
  'demo-reading-2': [
    { id: 'dr0-q1', no: 1, text: 'The word "proliferation" in a reading passage most closely means:', options: ['A. Rapid decline', 'B. Slow improvement', 'C. Rapid increase or spread', 'D. Complete disappearance'] },
    { id: 'dr0-q2', no: 2, text: 'The author writes: "While the policy seems beneficial, its long-term effects remain uncertain." The author\'s tone is best described as:', options: ['A. Strongly supportive', 'B. Cautiously neutral', 'C. Completely negative', 'D. Highly enthusiastic'] },
  ],
  'demo-writing-0': [
    { id: 'dw0-q1', no: 1, text: 'Which sentence uses the passive voice CORRECTLY?', options: ['A. "The committee was decided the proposal."', 'B. "The proposal was approved by the committee."', 'C. "The committee approving the proposal."', 'D. "The proposal the committee approved."'] },
    { id: 'dw0-q2', no: 2, text: 'Which word BEST fills the blank: "The results were ______ disappointing."', options: ['A. extreme', 'B. extremity', 'C. extremely', 'D. extremeness'] },
  ],
  'demo-writing-2': [
    { id: 'dw0-q1', no: 1, text: 'Which sentence uses the passive voice CORRECTLY?', options: ['A. "The committee was decided the proposal."', 'B. "The proposal was approved by the committee."', 'C. "The committee approving the proposal."', 'D. "The proposal the committee approved."'] },
    { id: 'dw0-q2', no: 2, text: 'Which word BEST fills the blank: "The results were ______ disappointing."', options: ['A. extreme', 'B. extremity', 'C. extremely', 'D. extremeness'] },
  ],
  // ── Full sets ────────────────────────────────────────────────────────────────
  'demo-listening-1': [
    { id: 'dl1-q1', no: 1, text: "What is the speaker's attitude towards online shopping?", options: ['A. Strongly positive — always better than in-store', 'B. Somewhat cautious — benefits exist but risks remain', 'C. Completely negative — people should avoid it', 'D. Neutral — it does not matter either way'] },
    { id: 'dl1-q2', no: 2, text: 'Which age group shops online MOST frequently according to the broadcast?', options: ['A. Teenagers aged 13–17', 'B. Young adults aged 18–30', 'C. Middle-aged adults aged 31–50', 'D. Seniors aged 51 and above'] },
    { id: 'dl1-q3', no: 3, text: 'What does the expert RECOMMEND for safe online shopping?', options: ['A. Always use public Wi-Fi for convenience', 'B. Pay by bank transfer only', 'C. Use secure payment methods and trusted sites', 'D. Share card details via email for confirmation'] },
    { id: 'dl1-q4', no: 4, text: 'Approximately what percentage of online goods are returned according to the statistics?', options: ['A. Around 10%', 'B. Approximately 25%', 'C. Nearly 40%', 'D. Over 60%'] },
  ],
  'demo-speaking-1': [
    { id: 'ds1-q1', no: 1, text: 'Your friend suggests skipping a lesson to go shopping. The MOST appropriate response in a role-play is:', options: ["A. \"Sure, let's go! Nobody will notice anyway.\"", 'B. "I think we should attend class. We can shop afterwards."', "C. \"I don't care — you decide.\"", "D. \"Only if you promise not to tell anyone.\""] },
    { id: 'ds1-q2', no: 2, text: "When asked about your school's environmental initiatives, which answer demonstrates the BEST understanding?", options: ["A. \"I have no idea what our school does.\"", 'B. "We launched a recycling programme and reduced single-use paper."', "C. \"The environment is not my concern.\"", "D. \"Maybe they do something — I'm not sure.\""] },
    { id: 'ds1-q3', no: 3, text: 'Which phrase is MOST suitable as an opening for a formal presentation?', options: ["A. \"Hi guys, I wanna talk about something today.\"", 'B. "Good morning. I would like to address the topic of..."', "C. \"OK so basically what happened was, like...\"", "D. \"Whatever, here's my main point.\""] },
  ],
  'demo-reading-1': [
    { id: 'dr1-q1', no: 1, text: 'According to the passage, what is the PRIMARY reason governments struggle to address climate change?', options: ['A. Lack of scientific evidence', 'B. Conflicting economic and environmental priorities', 'C. Public opposition to any green policy', 'D. Insufficient media coverage of the issue'] },
    { id: 'dr1-q2', no: 2, text: 'The phrase "a double-edged sword" (paragraph 3) refers to something that:', options: ['A. Is extremely dangerous and should be avoided', 'B. Has both positive and negative effects', 'C. Requires great skill to use correctly', 'D. Belongs to two different categories'] },
    { id: 'dr1-q3', no: 3, text: 'Which statement best summarises the author\'s main argument?', options: ['A. Technology alone can solve environmental problems', 'B. Individual actions have no impact on climate change', 'C. Sustainable development requires balancing growth with environmental responsibility', 'D. Economic development must be prioritised over environmental concerns'] },
    { id: 'dr1-q4', no: 4, text: 'The word "mitigate" (line 18) is closest in meaning to:', options: ['A. Worsen', 'B. Ignore', 'C. Reduce or lessen', 'D. Celebrate'] },
  ],
  'demo-writing-1': [
    { id: 'dw1-q1', no: 1, text: 'Which opening sentence is BEST for a formal letter of complaint?', options: ["A. \"I am so angry about your terrible service!\"", 'B. "I am writing to express my concern regarding the quality of your service."', "C. \"Hey there, I bought something and it's broken.\"", "D. \"Your company should be ashamed of itself.\""] },
    { id: 'dw1-q2', no: 2, text: 'In a discursive essay, the BEST way to introduce a counterargument is:', options: ["A. \"Some people are totally wrong when they think...\"", 'B. "Admittedly, there are those who argue that..."', "C. \"There's a stupid idea that...\"", "D. \"Ignore anyone who claims that...\""] },
    { id: 'dw1-q3', no: 3, text: 'Which sentence uses connectives MOST effectively?', options: ["A. \"Pollution is bad. People suffer. Governments should act.\"", 'B. "Not only does pollution harm health, but it also damages biodiversity."', "C. \"Pollution is bad and people suffer and governments should act.\"", "D. \"Pollution, people, governments — all related.\""] },
    { id: 'dw1-q4', no: 4, text: 'Which sentence demonstrates the BEST formal written register?', options: ["A. \"The gov should do something ASAP.\"", 'B. "It is imperative that authorities implement comprehensive measures."', "C. \"We need the government to fix things real quick.\"", "D. \"Things are bad and someone should help.\""] },
  ],
}
const _DEMO_ANSWERS: Record<string, string> = {
  'dl0-q1': 'B', 'dl0-q2': 'C',
  'ds0-q1': 'B', 'ds0-q2': 'B',
  'dr0-q1': 'C', 'dr0-q2': 'B',
  'dw0-q1': 'B', 'dw0-q2': 'C',
  'dl1-q1': 'B', 'dl1-q2': 'B', 'dl1-q3': 'C', 'dl1-q4': 'A',
  'ds1-q1': 'B', 'ds1-q2': 'B', 'ds1-q3': 'B',
  'dr1-q1': 'B', 'dr1-q2': 'B', 'dr1-q3': 'C', 'dr1-q4': 'C',
  'dw1-q1': 'B', 'dw1-q2': 'B', 'dw1-q3': 'B', 'dw1-q4': 'B',
}

// ── AI Tutor explanations for demo questions ──────────────────────────────────
type AIExplanation = AIAnalysis
const _DEMO_EXPLANATIONS: Record<string, AIExplanation> = {
  'dl0-q1': { why: '"Simultaneously" comes from the Latin root "simul" (at the same time). It describes two or more events happening at exactly the same moment — not sequentially or quickly.', grammarTip: 'Adverbs of time like "simultaneously", "subsequently" and "concurrently" describe WHEN actions happen relative to each other.', vocabNote: '"Simultaneously" is high-frequency in HKDSE listening passages about processes, experiments, or news events.' },
  'dl0-q2': { why: '"Not entirely convinced" uses partial negation — "not entirely" means "not 100%", so the speaker has some doubt but hasn\'t fully rejected the idea. Option C (partially doubtful) captures this nuance best.', grammarTip: 'Partial negation: "not entirely / not completely / not altogether" = partially. These are key hedging phrases in academic and formal speech.', vocabNote: 'Hedging language like "I\'m not entirely sure" or "I\'m somewhat doubtful" signals cautious tone — common in DSE Part B and C listening.' },
  'ds0-q1': { why: 'In formal or academic settings, polite interruptions use softening phrases: "Sorry to interrupt" acknowledges you\'re breaking someone\'s flow, and "could I add" is a polite request form. The other options are rude or dismissive.', grammarTip: 'Use modal verbs (could, might, may) to soften requests: "Could I add something?" is more polite than "Can I add?" or the imperative "Let me speak."', vocabNote: '"Sorry to interrupt, but..." is a standard discourse marker for turn-taking. Also useful: "If I may..." or "Pardon me, but..."' },
  'ds0-q2': { why: '"I couldn\'t agree more" is a strong formal expression of complete agreement. The other options are informal ("Yeah, totally!"), terse ("Same."), or sarcastic ("Whatever you say.").', grammarTip: '"Couldn\'t + comparative adjective" expresses maximum degree: "I couldn\'t agree MORE" = I agree completely. Compare: "I couldn\'t be happier."', vocabNote: 'Formal agreement phrases for DSE Speaking: "I wholeheartedly agree", "That is precisely my view", "I fully concur with your point."' },
  'dr0-q1': { why: '"Proliferation" comes from "proliferate" — to grow rapidly and spread widely. It frequently appears in passages about technology, social media, misinformation, or disease. "Rapid increase or spread" is the closest match.', grammarTip: 'Word family: proliferate (v.) → proliferation (n.) → proliferating (adj.). Recognising word families helps with both Reading and Listening.', vocabNote: 'Common DSE collocations: "nuclear proliferation", "rapid proliferation of smartphones", "the proliferation of misinformation online."' },
  'dr0-q2': { why: '"While the policy SEEMS beneficial, its long-term effects REMAIN UNCERTAIN" — the author acknowledges positives but notes uncertainty. This is the definition of a cautiously neutral (balanced, measured) tone.', grammarTip: 'Concessive clauses ("while", "although", "even though") signal the author is presenting BOTH sides — a strong indicator of balanced or cautious tone.', vocabNote: 'Tone vocabulary for HKDSE: cautiously neutral, tentative, circumspect, measured. Contrast with: enthusiastic, critical, cynical, satirical.' },
  'dw0-q1': { why: 'The passive voice structure is: Subject + BE + Past Participle (+ by Agent). "The proposal was approved by the committee" follows this correctly. Option A has wrong word order; C and D are incomplete.', grammarTip: 'Passive voice formula: [Object becomes Subject] + [was/were] + [V3]. The agent ("by + doer") is optional and often omitted in formal writing.', vocabNote: 'Passive voice is heavily used in formal writing, reports, and academic texts — essential for HKDSE Writing tasks like formal letters and essays.' },
  'dw0-q2': { why: '"Extremely" is an adverb modifying the adjective "disappointing". "Extreme" is an adjective, "extremity" is a noun, and "extremeness" is not standard usage in formal English.', grammarTip: 'Adverbs modify adjectives and other adverbs. Common intensifiers: extremely, remarkably, considerably, substantially, significantly.', vocabNote: '"Extremely disappointing" is correct formal phrasing. Also natural: "deeply disappointing", "profoundly disappointing", "utterly disappointing."' },
  'dl1-q1': { why: 'The speaker acknowledges online shopping benefits but warns about risks — this balanced view represents a "somewhat cautious" stance. Purely positive or negative stances would require stronger language.', grammarTip: 'When evaluating speaker attitude in listening tasks, listen for hedging words (but, however, although) and modal verbs (might, could, may) which signal caution.', vocabNote: 'Attitude adjectives: positive (enthusiastic, supportive), neutral (balanced, cautious), negative (critical, dismissive, sceptical).' },
  'dl1-q2': { why: 'Based on the broadcast\'s statistics about demographics, young adults aged 18–30 represent the highest online shopping frequency. Key listening: pay attention to specific numbers and percentage comparisons.', grammarTip: 'In listening, numbers and statistics are key. Practice distinguishing "18–30" from "30–50" and note which figure is described as "highest" or "most frequent."', vocabNote: 'Demographic vocabulary: teenagers, young adults, middle-aged, seniors. Frequency: most frequently, predominantly, the majority of.' },
  'dl1-q3': { why: 'The expert\'s recommendation focuses on using secure payment methods and trusted websites — the practical, official advice. Other options (public Wi-Fi, bank transfer, email) are security risks.', grammarTip: 'In recommendation questions, listen for signal phrases: "experts advise", "it is recommended that", "one should", "the best practice is."', vocabNote: 'Security vocabulary: secure payment, trusted sites, verified seller, encrypted connection, phishing scams.' },
  'dl1-q4': { why: 'The statistics mentioned approximately 10% return rates. In HKDSE listening, specific numbers should be noted carefully — they often appear as distractors with close alternatives.', grammarTip: 'Practice distinguishing similar numbers in listening: 10%, 25%, 40% — distractors are deliberately close. Focus on the exact percentage mentioned.', vocabNote: '"Approximately", "around", "roughly", "nearly" — these words signal an approximate figure, not an exact one. Note them carefully.' },
  'ds1-q1': { why: 'The appropriate response balances responsibility (attending class) with social consideration (suggesting they shop afterwards). It\'s assertive but not preachy or dismissive.', grammarTip: 'In role-play, use "I think/feel we should" rather than "We must/have to" — this sounds collaborative rather than authoritarian.', vocabNote: '"I think we should..." is the ideal opening for expressing disagreement diplomatically. Also good: "How about...?" or "What if we...?"' },
  'ds1-q2': { why: 'Only option B demonstrates actual knowledge about specific environmental initiatives (recycling programme, reduced paper use). The others show ignorance or lack of engagement.', grammarTip: 'Demonstrating knowledge in speaking tasks: use specific examples and concrete details. Vague answers ("maybe something") score low.', vocabNote: 'Environmental terms: recycling programme, single-use plastics reduction, carbon footprint, sustainability initiatives, eco-friendly measures.' },
  'ds1-q3': { why: '"Good morning. I would like to address the topic of..." is formal, well-structured, and appropriate for a presentation. The other options are too informal, vague, or poorly constructed.', grammarTip: 'Formal presentation openings: state a greeting + name + topic clearly. Avoid filler words like "OK so basically" or "Hi guys."', vocabNote: '"I would like to address / discuss / explore / examine the topic of..." — all excellent formal opening phrases for HKDSE oral tasks.' },
  'dr1-q1': { why: 'The passage explains that governments face competing pressures between economic growth and environmental protection — this "conflict of priorities" is presented as the primary obstacle.', grammarTip: 'In comprehension, the PRIMARY or MAIN reason is usually stated in the topic sentence of a paragraph, or supported by the most evidence in the text.', vocabNote: '"Conflicting priorities", "competing interests", "a tension between X and Y" — these phrases signal the central challenge in argumentative passages.' },
  'dr1-q2': { why: '"A double-edged sword" is a fixed metaphor meaning something that has both advantages AND disadvantages simultaneously — both positive and negative effects.', grammarTip: 'Figurative language: when asked about a metaphor or idiom\'s meaning, look at the context surrounding it for clues — what TWO aspects is the author comparing?', vocabNote: 'Similar expressions: "a blessing in disguise", "a mixed blessing", "cuts both ways". All suggest dual positive/negative nature.' },
  'dr1-q3': { why: 'The passage argues for "sustainable development" — balancing economic needs with environmental care. It explicitly rejects "technology alone" and "individual actions have no impact" as oversimplifications.', grammarTip: '"Best summarises the MAIN argument" questions require you to find the thesis — the central claim the entire passage supports. Look for the most comprehensive option.', vocabNote: '"Sustainable development" = meeting present needs without compromising future generations\' ability to meet their needs (Brundtland Report definition).' },
  'dr1-q4': { why: '"Mitigate" means to make less severe, serious, or painful — to reduce or lessen. It\'s commonly used with "risk", "damage", "impact", "effects". "Worsen" is the opposite; "ignore" and "celebrate" are unrelated.', grammarTip: 'For vocabulary-in-context questions, try substituting each option back into the sentence. The one that preserves the sentence\'s meaning is correct.', vocabNote: '"Mitigate" collocations: mitigate the risk/damage/impact/effects/consequences. High-frequency in environmental, legal, and policy texts.' },
  'dw1-q1': { why: '"I am writing to express my concern regarding..." is the standard formal letter opening — clear purpose, formal register, polite tone. Other options are emotional, informal, or accusatory.', grammarTip: 'Formal letter conventions: "I am writing to..." (purpose), "I am writing with reference to..." (referencing), "I would like to bring to your attention..." (raising issues).', vocabNote: 'Formal complaint phrases: "I am writing to express my dissatisfaction / concern / disappointment regarding..." — neutral and professional.' },
  'dw1-q2': { why: '"Admittedly, there are those who argue that..." is the standard academic formula for introducing a counterargument in a concessive, fair-minded way. The other options are dismissive or biased.', grammarTip: 'Counterargument patterns: "Admittedly...", "Some may argue that...", "While it is true that...", "Critics of this view contend that..."', vocabNote: '"Admittedly" signals you are temporarily conceding a point before countering it — an essential academic writing skill for HKDSE.' },
  'dw1-q3': { why: '"Not only does... but it also..." is a correlative conjunction structure that creates sophisticated cohesion. Option A is a list of short sentences (choppy); C overuses "and"; D is fragmented.', grammarTip: '"Not only...but also..." requires inversion: "Not only DOES pollution harm health, but it ALSO damages..." — note the auxiliary verb comes before the subject.', vocabNote: 'Cohesive connectives: "furthermore", "moreover", "in addition", "not only...but also", "what is more" — all useful for formal writing.' },
  'dw1-q4': { why: '"It is imperative that authorities implement comprehensive measures" uses formal vocabulary (imperative, authorities, implement, comprehensive) and an impersonal structure appropriate for formal essays.', grammarTip: '"It is + adjective + that + subject + verb": It is essential/imperative/crucial/vital that the government takes/take action. (Subjunctive: "take" not "takes"))', vocabNote: 'Formal register markers: imperative (must), authorities (government/officials), implement (carry out/introduce), comprehensive (thorough/wide-ranging).' },
}

void _DEMO_SETS
void _DEMO_QUESTIONS
void _DEMO_ANSWERS
void _DEMO_EXPLANATIONS

// ─── ABCD letter colours ──────────────────────────────────────────────────────
const LETTER_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  B: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  C: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  D: { bg: '#fff1f2', text: '#dc2626', border: '#fecdd3' },
}

type GamePhase = 'idle' | 'playing' | 'results'

// ─── AI Tutor Analysis Panel ─────────────────────────────────────────────────
const SUBJECT_ICON: Record<string, string> = {
  listening: '👂', speaking: '🎙️', reading: '📖', writing: '✍️',
}

function AIAnalysisPanel({
  qId, isCorrect, correctAnswer, subject, color, analysis,
}: {
  qId: string
  isCorrect: boolean
  correctAnswer: string
  subject: string
  color: string
  analysis?: AIExplanation | null
}) {
  const ex = analysis ?? null

  return (
    <div style={{
      borderRadius: 20,
      overflow: 'hidden',
      border: `1.5px solid ${isCorrect ? '#6ee7b7' : '#fca5a5'}`,
      boxShadow: `0 6px 28px ${isCorrect ? '#10b98118' : '#ef444418'}`,
      animation: 'aiPanelIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px',
        background: isCorrect
          ? 'linear-gradient(135deg, #064e3b, #065f46)'
          : 'linear-gradient(135deg, #7f1d1d, #991b1b)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>🤖</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>
              AI Tutor Analysis
            </div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.72)', fontFamily: 'monospace' }}>
              {SUBJECT_ICON[subject]} {subject.charAt(0).toUpperCase() + subject.slice(1)} · Question {qId.split('-q')[1]}
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 20,
          background: isCorrect ? 'rgba(52,211,153,0.25)' : 'rgba(252,165,165,0.25)',
          border: `1px solid ${isCorrect ? 'rgba(52,211,153,0.5)' : 'rgba(252,165,165,0.5)'}`,
          fontSize: 12.5, fontWeight: 800, color: isCorrect ? '#6ee7b7' : '#fca5a5',
        }}>
          {isCorrect ? '✓ Correct' : `✗ Answer: ${correctAnswer}`}
        </div>
      </div>

      {/* Body */}
      <div style={{
        background: 'linear-gradient(160deg, rgba(255,252,247,0.98), rgba(248,241,228,0.95))',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>

        {/* Why explanation */}
        <div style={{
          padding: '12px 15px', borderRadius: 12,
          background: '#fff', border: '1px solid #f0ece4',
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 900, color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            💡 Why this answer?
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
            {ex?.why ?? `The correct answer is ${correctAnswer}. Study the question again to understand the key concept.`}
          </p>
        </div>

        {/* Grammar + Vocab in two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{
            padding: '12px 13px', borderRadius: 12,
            background: '#eff6ff', border: '1px solid #bfdbfe',
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              📐 Grammar Tip
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#1e40af', lineHeight: 1.65 }}>
              {ex?.grammarTip ?? 'Review the grammatical structure of this type of question.'}
            </p>
          </div>
          <div style={{
            padding: '12px 13px', borderRadius: 12,
            background: '#fdf4ff', border: '1px solid #e9d5ff',
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              📚 Vocabulary Note
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#5b21b6', lineHeight: 1.65 }}>
              {ex?.vocabNote ?? 'Pay attention to word choice and register in context.'}
            </p>
          </div>
        </div>

        {/* Performance indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 13px', borderRadius: 10,
          background: isCorrect ? '#ecfdf5' : '#fff7ed',
          border: `1px solid ${isCorrect ? '#a7f3d0' : '#fed7aa'}`,
          fontSize: 13, color: isCorrect ? '#065f46' : '#92400e',
        }}>
          <span>{isCorrect ? '⭐' : '💪'}</span>
          <span style={{ fontWeight: 800 }}>
            {isCorrect
              ? 'Great work! You understood the concept correctly.'
              : 'Keep going! Review the explanation above and try similar questions to reinforce your understanding.'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main QuizPage ────────────────────────────────────────────────────────────
export default function QuizPage({ subject }: { subject: Subject }) {
  const cfg = SUBJECT_CFG[subject]
  const { Icon, color, bg, border } = cfg

  const savedChar = getSavedCharacter()
  const charClass = savedChar ? CHARACTER_CLASSES.find(c => c.id === savedChar.classId) : null
  const classId = charClass?.id ?? 'knight'

  // ── Difficulty selection (fixed: Easy, Medium, Hard) ──────────────────────
  const [selectedDifficulty, setSelectedDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Easy')
  
  // ── Set list ──────────────────────────────────────────────────────────────
  const [sets, setSets] = useState<QuestionSet[]>([])
  const [setsLoading, setSetsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedSet, setSelectedSet] = useState<QuestionSet | null>(null)

  // Use selectedDifficulty (fixed frontend choice) instead of selectedSet.difficulty
  const bossDifficulty = selectedDifficulty
  // bossType encodes BOTH subject AND difficulty → each combo has a unique model
  const bossType: BossType = getBossType(subject, bossDifficulty)

  // ── Questions ─────────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<Question[]>([])
  const [qLoading, setQLoading] = useState(false)

  // ── Game state ────────────────────────────────────────────────────────────
  const [gamePhase, setGamePhase] = useState<GamePhase>('idle')
  const [currentQIdx, setCurrentQIdx] = useState(0)
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [locked, setLocked] = useState(false)
  const [sessionScore, setSessionScore] = useState(0)
  const [sessionResults, setSessionResults] = useState<{ correct: boolean; correctAnswer: string }[]>([])
  const [answersSoFar, setAnswersSoFar] = useState<Record<string, string>>({})
  const [currentAnalysis, setCurrentAnalysis] = useState<AIExplanation | null>(null)

  const { addGold, syncInventory } = useInventory()
  const battleRef = useRef<BossChallengeRef>(null)

  // ── Load sets for selected difficulty ────────────────────────────────────
  const loadSets = useCallback(async () => {
    setSetsLoading(true)
    setLoadError(null)
    setSelectedSet(null) // Clear selection when difficulty changes
    try {
      const data = await fetchQuestionSets(subject, selectedDifficulty)
      setSets(data)
    } catch {
      setSets([])
      setLoadError('Failed to load question sets. Please try again later.')
    } finally {
      setSetsLoading(false)
    }
  }, [subject, selectedDifficulty])

  useEffect(() => { loadSets() }, [loadSets])

  // ── Load questions when set changes ──────────────────────────────────────
  useEffect(() => {
    if (!selectedSet) return
    setQLoading(true)
    setGamePhase('idle')
    setCurrentQIdx(0)
    setSessionResults([])
    setSessionScore(0)
    setLocked(false)
    setFeedback(null)
    setSelectedLetter(null)
    setAnswersSoFar({})
    setCurrentAnalysis(null)

    fetchQuestions(selectedSet.id)
      .then(setQuestions)
      .catch(() => setQuestions([]))
      .finally(() => setQLoading(false))
  }, [selectedSet])

  // ── Start game ────────────────────────────────────────────────────────────
  const handleStart = () => {
    setGamePhase('playing')
    setCurrentQIdx(0)
    setSessionScore(0)
    setSessionResults([])
    setFeedback(null)
    setSelectedLetter(null)
    setLocked(false)
    setAnswersSoFar({})
    setCurrentAnalysis(null)
  }

  // ── Answer a question ─────────────────────────────────────────────────────
  const handlePickAnswer = async (letter: string) => {
    if (locked || feedback !== null) return
    const q = questions[currentQIdx]
    if (!q) return

    let correct = letter
    let isCorrect = false
    let analysis: AIExplanation | null = null
    let goldEarned: number | undefined
    let bossDamage: number | undefined
    let charDamage: number | undefined
    let updatedInventory: Inventory | undefined

    setLocked(true)

    const nextAnswers = { ...answersSoFar, [q.id]: letter }
    setAnswersSoFar(nextAnswers)

    try {
      const payload = {
        setId: selectedSet!.id,
        subject,
        answers: nextAnswers,
      }

      const resp = await submitAnswers(payload)
      updatedInventory = resp.updatedInventory
      const r = resp.results.find(rr => rr.questionId === q.id) ?? resp.results[0]

      isCorrect = !!r?.isCorrect
      correct = r?.correctAnswer ?? 'A'
      analysis = r?.analysis ?? null
      goldEarned = r?.goldEarned
      bossDamage = r?.bossDamage
      charDamage = r?.charDamage
    } catch (e) {
      // Backend unavailable — show correct answer without saving progress
      console.error(e)
      isCorrect = false
      correct = 'A'
      analysis = null
      goldEarned = undefined
      bossDamage = undefined
      charDamage = undefined
      updatedInventory = undefined
    }

    const normalizedCorrectAnswer = normalizeCorrectAnswer(correct)
    setSelectedLetter(letter)
    setCorrectAnswer(normalizedCorrectAnswer)
    setCurrentAnalysis(analysis)
    setFeedback(isCorrect ? 'correct' : 'wrong')

    if (isCorrect) {
      setSessionScore(s => s + 1)
      if (updatedInventory) {
        syncInventory(updatedInventory)
      } else {
        const toAdd = typeof goldEarned === 'number' ? goldEarned : 0
        if (toAdd > 0) await addGold(toAdd)
      }
    }
    setSessionResults(prev => [...prev, { correct: isCorrect, correctAnswer: normalizedCorrectAnswer }])
    battleRef.current?.triggerVerdict({ isCorrect, bossDamage, charDamage })

    const nextIdx = currentQIdx + 1
    const isLastQuestion = nextIdx >= questions.length
    if (isLastQuestion) {
      setTimeout(() => {
        battleRef.current?.resolveBattleEndByHealth()
      }, 1200)
    }

    // Auto-advance after verdict shown (7 seconds for better user feedback)
    setTimeout(() => {
      if (nextIdx >= questions.length) {
        setGamePhase('results')
        setCurrentAnalysis(null)
      } else {
        setCurrentQIdx(nextIdx)
        setSelectedLetter(null)
        setCorrectAnswer(null)
        setCurrentAnalysis(null)
        setFeedback(null)
        setLocked(false)
      }
    }, 7000)
  }

  const handleReplay = () => {
    setGamePhase('idle')
    setCurrentQIdx(0)
    setSessionScore(0)
    setSessionResults([])
    setFeedback(null)
    setSelectedLetter(null)
    setLocked(false)
    setAnswersSoFar({})
    setCurrentAnalysis(null)
  }

  const currentQ = questions[currentQIdx] ?? null
  const totalQ = questions.length
  const xpEarned = sessionScore * 15

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1500px] mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-5">
      <style>{`
        @keyframes aiPanelIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 animate-fade-in">

        {/* ── Left: Difficulty selector + Set list ──────────────────────────── */}
        <div
          className="lg:col-span-3 rounded-[24px] p-4 space-y-3 self-start animate-fade-left"
          style={{
            background: 'linear-gradient(160deg, rgba(255,252,247,0.96), rgba(248,241,228,0.92))',
            border: '1px solid rgba(111,78,55,0.13)',
            boxShadow: '0 4px 20px rgba(83,57,37,0.07), inset 0 1px 0 rgba(255,255,255,0.6)',
          }}
        >
          {/* Subject header */}
          <div className="flex items-center gap-2.5 mb-3 pb-3" style={{ borderBottom: '1px solid rgba(111,78,55,0.10)' }}>
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${bg}, white)`, border: `1.5px solid ${border}` }}
            >
              <Icon size={17} color={color} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: '#1c1917' }}>{cfg.label}</div>
              <div className="text-xs font-mono-ui" style={{ color: 'rgba(111,78,55,0.50)', lineHeight: 1.3 }}>DSE Paper</div>
              {loadError && (
                <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: '#cb4b2f' }}>
                  <FlaskConical size={10} /> {loadError}
                </div>
              )}
            </div>
          </div>

          {/* Fixed difficulty buttons (Easy, Medium, Hard) */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(111,78,55,0.50)', letterSpacing: '0.10em' }}>
              Difficulty
            </div>
            {(['Easy', 'Medium', 'Hard'] as const).map((diff, i) => {
              const isSelected = selectedDifficulty === diff
              const diffColors = {
                Easy:   { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0', glow: '#05966920', label: '⚔ Easy' },
                Medium: { bg: '#fffbeb', text: '#d97706', border: '#fde68a', glow: '#d9770620', label: '🛡 Medium' },
                Hard:   { bg: '#fff1f2', text: '#dc2626', border: '#fecdd3', glow: '#dc262620', label: '💀 Hard' },
              }
              const dc = diffColors[diff]
              return (
                <button
                  key={diff}
                  onClick={() => setSelectedDifficulty(diff)}
                  className="w-full text-left px-3 py-2.5 rounded-2xl transition-all font-semibold text-sm"
                  style={{
                    animationDelay: `${i * 0.06}s`,
                    backgroundColor: isSelected ? dc.bg : 'rgba(255,255,255,0.45)',
                    border: `1.5px solid ${isSelected ? dc.border : 'rgba(111,78,55,0.10)'}`,
                    color: isSelected ? dc.text : '#78716c',
                    boxShadow: isSelected ? `0 3px 12px ${dc.glow}, inset 0 1px 0 rgba(255,255,255,0.7)` : 'none',
                    transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                  }}
                >
                  {dc.label}
                </button>
              )
            })}
          </div>

          {/* Question sets for selected difficulty */}
          <div className="space-y-1.5" style={{ borderTop: '1px solid rgba(111,78,55,0.10)', paddingTop: 12 }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(111,78,55,0.50)', letterSpacing: '0.10em' }}>
              Question Sets
            </div>
            {setsLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={18} color={color} className="animate-spin" />
              </div>
            )}

            {!setsLoading && sets.length === 0 && (
              <div className="text-xs text-center py-5 rounded-2xl" style={{ color: '#a8a29e', background: 'rgba(0,0,0,0.03)' }}>
                No question sets available for {selectedDifficulty} difficulty
              </div>
            )}

            {!setsLoading && sets.map(set => {
              const isActive = selectedSet?.id === set.id
              return (
                <button
                  key={set.id}
                  onClick={() => setSelectedSet(set)}
                  className="w-full text-left p-3 rounded-2xl transition-all card-lift"
                  style={{
                    background: isActive
                      ? `linear-gradient(135deg, ${bg}, rgba(255,255,255,0.7))`
                      : 'rgba(255,255,255,0.45)',
                    border: `1.5px solid ${isActive ? border : 'rgba(111,78,55,0.09)'}`,
                    boxShadow: isActive ? `0 2px 12px ${color}18, inset 0 1px 0 rgba(255,255,255,0.7)` : 'none',
                  }}
                >
                  <div className="text-sm font-semibold" style={{ color: '#1c1917' }}>{set.type}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#78716c' }}>{set.title}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-xs font-mono-ui" style={{ color }}>{set.questionCount}Q</span>
                    {set.duration && (
                      <>
                        <span className="text-xs" style={{ color: '#d6cfc8' }}>·</span>
                        <span className="text-xs" style={{ color: '#a8a29e' }}>{set.duration}</span>
                      </>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Right: Game view ─────────────────────────────────────────────── */}
        <div className="lg:col-span-9 space-y-0 flex flex-col">

          {/* Battle arena */}
          <div
            className="rounded-t-[24px] overflow-hidden"
            style={{ border: `1.5px solid ${border}`, borderBottom: 'none', boxShadow: `0 8px 32px ${color}18` }}
          >
            <BossChallenge
              ref={battleRef}
              classId={classId}
              bossType={bossType}
              difficulty={bossDifficulty}
              arenaHeight="clamp(360px, 62vw, 620px)"
              bossScaleOverride={0.8}
            />
          </div>

          {/* Game area below arena */}
          <div
            className="rounded-b-[24px]"
            style={{
              background: 'linear-gradient(160deg, rgba(255,252,247,0.97), rgba(248,241,228,0.93))',
              border: `1.5px solid ${border}`,
              borderTop: `1px solid rgba(111,78,55,0.08)`,
              boxShadow: `0 8px 32px ${color}08, inset 0 1px 0 rgba(255,255,255,0.65)`,
            }}
          >

            {/* ── No set selected ──────────────────────────────────── */}
            {!selectedSet && !setsLoading && (
              <div className="p-6 sm:p-10 lg:p-12 flex flex-col items-center justify-center text-center gap-3 animate-fade-up">
                <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-1"
                  style={{ background: `linear-gradient(135deg, ${bg}, rgba(255,255,255,0.6))`, border: `1.5px solid ${border}` }}>
                  <Icon size={28} color={color} />
                </div>
                <p className="text-base font-bold" style={{ color: '#78716c' }}>Choose a practice set on the left</p>
                <p className="text-sm sm:text-base" style={{ color: '#a8a29e' }}>Select a difficulty, then pick a question set to begin your battle</p>
              </div>
            )}

            {/* ── Set selected, idle ────────────────────────────────── */}
            {selectedSet && gamePhase === 'idle' && (
              <div className="p-6 flex flex-col items-center text-center gap-5 animate-scale-in">
                {qLoading ? (
                  <div className="flex items-center gap-2 py-4">
                    <Loader2 size={18} color={color} className="animate-spin" />
                    <span className="text-sm" style={{ color: '#78716c' }}>Loading questions…</span>
                  </div>
                ) : (
                  <>
                    <div>
                      <h2 className="text-lg font-bold" style={{ color: '#1c1917' }}>{selectedSet.type}</h2>
                      <p className="text-sm mt-1" style={{ color: '#78716c' }}>{selectedSet.title}</p>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="text-center">
                        <div className="text-2xl font-black font-mono-ui" style={{ color }}>{selectedSet.questionCount}</div>
                        <div className="text-xs font-semibold" style={{ color: '#a8a29e' }}>Questions</div>
                      </div>
                      <div className="w-px h-10" style={{ backgroundColor: 'rgba(111,78,55,0.12)' }} />
                      <div className="text-center">
                        <div className="text-2xl font-black font-mono-ui" style={{ color: '#c77a1a' }}>{selectedSet.duration}</div>
                        <div className="text-xs font-semibold" style={{ color: '#a8a29e' }}>Duration</div>
                      </div>
                      <div className="w-px h-10" style={{ backgroundColor: 'rgba(111,78,55,0.12)' }} />
                      <div className="text-center">
                        <div className="text-2xl font-black" style={{ color: '#0f8a67' }}>{selectedDifficulty}</div>
                        <div className="text-xs font-semibold" style={{ color: '#a8a29e' }}>Difficulty</div>
                      </div>
                    </div>
                    <button
                      onClick={handleStart}
                      disabled={questions.length === 0}
                      className="flex items-center gap-2 px-8 py-3.5 rounded-[16px] text-base font-bold transition-all active:scale-95 disabled:opacity-40"
                      style={{
                        background: `linear-gradient(135deg, #2957c8, ${color} 78%)`,
                        color: 'white',
                        boxShadow: `0 6px 20px ${color}40`,
                      }}
                    >
                      <Play size={18} /> Start Battle
                    </button>
                    {charClass && (
                      <p className="text-xs" style={{ color: '#a8a29e' }}>
                        Fighting as {charClass.emoji} {charClass.name}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Playing: one question at a time ──────────────────── */}
            {selectedSet && gamePhase === 'playing' && currentQ && (
              <div className="p-5 space-y-4 animate-fade-up">

                {/* Progress bar + counter */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold font-mono-ui flex-shrink-0" style={{ color }}>
                    Q {currentQIdx + 1} / {totalQ}
                  </span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: bg }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${((currentQIdx) / totalQ) * 100}%`,
                        background: `linear-gradient(90deg, ${color}88, ${color})`,
                      }}
                    />
                  </div>
                  {/* Dot indicators */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {questions.map((_, i) => (
                      <div
                        key={i}
                        className="rounded-full transition-all duration-300"
                        style={{
                          width: i === currentQIdx ? 18 : 8,
                          height: 8,
                          backgroundColor: i < currentQIdx
                            ? sessionResults[i]?.correct ? '#059669' : '#dc2626'
                            : i === currentQIdx ? color : '#f0ece4',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Question text */}
                <div
                  className="rounded-[18px] p-4"
                  style={{
                    background: `linear-gradient(135deg, ${bg}, rgba(255,255,255,0.6))`,
                    border: `1.5px solid ${border}`,
                    boxShadow: `0 2px 10px ${color}0c, inset 0 1px 0 rgba(255,255,255,0.7)`,
                  }}
                >
                  <p className="text-base font-semibold leading-relaxed" style={{ color: '#1c1917' }}>
                    {currentQ.text}
                  </p>
                </div>

                {/* Feedback banner */}
                {feedback && (
                  <div
                    className="rounded-[14px] px-4 py-3 flex items-center gap-3 text-sm font-bold animate-slide-down"
                    style={{
                      background: feedback === 'correct'
                        ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
                        : 'linear-gradient(135deg, #fff1f2, #ffe4e6)',
                      border: `1.5px solid ${feedback === 'correct' ? '#6ee7b7' : '#fca5a5'}`,
                      color: feedback === 'correct' ? '#059669' : '#dc2626',
                      boxShadow: feedback === 'correct' ? '0 2px 10px #05966918' : '0 2px 10px #dc262618',
                    }}
                  >
                    {feedback === 'correct'
                      ? <><CheckCircle size={16} /> Correct! +15 XP — Boss takes damage ⚔</>
                      : <><XCircle size={16} /> Wrong! Correct answer: <strong style={{ color: '#b91c1c' }}>{correctAnswer}</strong> — Boss strikes back 🛡</>
                    }
                  </div>
                )}

                {/* ABCD Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {currentQ.options.map((opt, idx) => {
                    const letter = getOptionLetter(idx)
                    const lc = LETTER_COLOR[letter] ?? LETTER_COLOR['A']
                    const isSelected = selectedLetter === letter
                    const isCorrectOpt = feedback !== null && letter === correctAnswer
                    const isWrongSelected = isSelected && feedback === 'wrong'

                    let cardBg = 'rgba(255,255,255,0.55)'
                    let cardBorder = 'rgba(111,78,55,0.10)'
                    let textColor = '#57534e'
                    if (isCorrectOpt)       { cardBg = 'linear-gradient(135deg,#ecfdf5,#d1fae5)'; cardBorder = '#6ee7b7'; textColor = '#065f46' }
                    else if (isWrongSelected){ cardBg = 'linear-gradient(135deg,#fff1f2,#ffe4e6)'; cardBorder = '#fca5a5'; textColor = '#9f1239' }
                    else if (isSelected)    { cardBg = `linear-gradient(135deg,${bg},rgba(255,255,255,0.7))`; cardBorder = border; textColor = color }

                    return (
                      <button
                        key={`${currentQ.id}-${idx}-${letter}`}
                        onClick={() => handlePickAnswer(letter)}
                        disabled={locked}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-[16px] text-left transition-all text-sm font-medium disabled:cursor-default"
                        style={{
                          background: cardBg,
                          border: `1.5px solid ${cardBorder}`,
                          color: textColor,
                          boxShadow: isSelected ? `0 3px 12px ${cardBorder}60, inset 0 1px 0 rgba(255,255,255,0.7)` : 'inset 0 1px 0 rgba(255,255,255,0.5)',
                          transform: isSelected ? 'scale(0.99)' : 'scale(1)',
                        }}
                        onMouseEnter={e => { if (!locked) (e.currentTarget.style.background = 'rgba(255,255,255,0.78)') }}
                        onMouseLeave={e => { if (!locked && !isSelected) (e.currentTarget.style.background = 'rgba(255,255,255,0.55)') }}
                      >
                        {/* Letter badge */}
                        <span
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{
                            backgroundColor: isCorrectOpt ? '#059669' : isWrongSelected ? '#dc2626' : isSelected ? color : lc.bg,
                            color: (isCorrectOpt || isWrongSelected || isSelected) ? 'white' : lc.text,
                          }}
                        >
                          {isCorrectOpt ? '✓' : isWrongSelected ? '✗' : letter}
                        </span>
                        <span className="leading-snug">{String(opt ?? '').trim()}</span>
                      </button>
                    )
                  })}
                </div>

                {/* ── AI Tutor Analysis (shown after answering) ── */}
                {feedback && currentQ && (
                  <AIAnalysisPanel
                    qId={currentQ.id}
                    isCorrect={feedback === 'correct'}
                    correctAnswer={correctAnswer ?? ''}
                    subject={subject}
                    color={color}
                    analysis={currentAnalysis}
                  />
                )}
              </div>
            )}

            {/* ── Results ──────────────────────────────────────────── */}
            {selectedSet && gamePhase === 'results' && (
              <div className="p-6 space-y-5 animate-scale-in">
                {/* Score banner */}
                <div
                  className="rounded-[22px] p-6 text-center"
                  style={{
                    background: sessionScore === totalQ
                      ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
                      : sessionScore >= totalQ / 2
                      ? 'linear-gradient(135deg, #fffbeb, #fef3c7)'
                      : 'linear-gradient(135deg, #fff1f2, #ffe4e6)',
                    border: `1.5px solid ${sessionScore === totalQ ? '#6ee7b7' : sessionScore >= totalQ / 2 ? '#fde68a' : '#fecdd3'}`,
                    boxShadow: sessionScore === totalQ
                      ? '0 6px 24px #05966920'
                      : sessionScore >= totalQ / 2
                      ? '0 6px 24px #d9770620'
                      : '0 6px 24px #dc262620',
                  }}
                >
                  <div className="text-5xl font-black font-mono-ui" style={{ color: sessionScore === totalQ ? '#059669' : sessionScore >= totalQ / 2 ? '#d97706' : '#dc2626' }}>
                    {sessionScore}<span className="text-2xl opacity-50">/{totalQ}</span>
                  </div>
                  <div className="text-sm font-bold mt-2" style={{ color: '#78716c' }}>
                    {sessionScore === totalQ ? '⚔ Perfect Score! Boss Defeated!' : sessionScore >= totalQ / 2 ? '🛡 Good effort! Keep practicing.' : '💀 Boss won this round! Try again.'}
                  </div>
                  <div className="inline-flex items-center gap-1.5 mt-3 px-4 py-1.5 rounded-full text-sm font-bold" style={{ background: 'rgba(217,150,43,0.12)', color: '#c77a1a', border: '1px solid rgba(217,150,43,0.25)' }}>
                    <Zap size={13} /> +{xpEarned} XP earned
                  </div>
                </div>

                {/* Per-question breakdown */}
                <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                  {sessionResults.map((r, i) => (
                    <div key={i} className="flex flex-col items-center gap-1 p-2 rounded-2xl"
                      style={{
                        background: r.correct
                          ? 'linear-gradient(135deg,#ecfdf5,#d1fae5)'
                          : 'linear-gradient(135deg,#fff1f2,#ffe4e6)',
                        border: `1px solid ${r.correct ? '#a7f3d0' : '#fecdd3'}`,
                      }}>
                      <span className="text-xs font-bold font-mono-ui" style={{ color: '#78716c' }}>Q{i + 1}</span>
                      {r.correct
                        ? <CheckCircle size={16} color="#059669" />
                        : <XCircle size={16} color="#dc2626" />}
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleReplay}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[16px] text-sm font-bold transition-all active:scale-95"
                    style={{
                      background: `linear-gradient(135deg, ${bg}, rgba(255,255,255,0.6))`,
                      color,
                      border: `1.5px solid ${border}`,
                      boxShadow: `0 2px 10px ${color}18`,
                    }}
                  >
                    <RotateCcw size={15} /> Try Again
                  </button>
                  <button
                    onClick={() => { setSelectedSet(null); setGamePhase('idle') }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[16px] text-sm font-bold transition-all active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #2957c8, #d9962b 78%)',
                      color: 'white',
                      boxShadow: '0 6px 20px rgba(41,87,200,0.30)',
                    }}
                  >
                    <BookOpen size={15} /> Next Set <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
