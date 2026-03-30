import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function decodeXml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractParagraphs(xml) {
  const paragraphs = [];
  const paragraphRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let paragraphMatch;

  while ((paragraphMatch = paragraphRegex.exec(xml)) !== null) {
    const block = paragraphMatch[1];
    const textMatches = [...block.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
    const text = textMatches.map(match => decodeXml(match[1])).join('').trim();
    if (text) paragraphs.push(text);
  }

  return paragraphs;
}

function parseOptionLine(line) {
  const normalized = line.replace(/^Options:\s*/, '').trim();
  const match = normalized.match(/^A\s+(.*?)\s+B\s+(.*?)\s+C\s+(.*?)\s+D\s+(.*)$/);
  if (!match) return null;
  return {
    option_a: match[1].trim(),
    option_b: match[2].trim(),
    option_c: match[3].trim(),
    option_d: match[4].trim(),
  };
}

function parseSourceQuestions(paragraphs) {
  const entries = [];
  let current = null;

  for (const paragraph of paragraphs) {
    if (paragraph.startsWith('Q: ')) {
      if (current?.text && current?.options && current?.answer) {
        entries.push(current);
      }
      current = {
        text: paragraph.slice(3).trim(),
        options: null,
        answer: null,
        explanation: null,
      };
      continue;
    }

    if (!current) continue;

    if (paragraph.startsWith('Options: ')) {
      current.options = parseOptionLine(paragraph);
      continue;
    }

    if (paragraph.startsWith('Answer: ')) {
      current.answer = paragraph.slice(8).trim();
      continue;
    }

    if (paragraph.startsWith('Explain: ')) {
      current.explanation = paragraph.slice(9).trim();
      continue;
    }
  }

  if (current?.text && current?.options && current?.answer) {
    entries.push(current);
  }

  return entries;
}

async function main() {
  const xmlPath = path.join(process.cwd(), 'tmp-docx-extract', 'word', 'document.xml');
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const paragraphs = extractParagraphs(xml);
  const parsedEntries = parseSourceQuestions(paragraphs).filter(entry => entry.options);

  console.log(`Parsed ${parsedEntries.length} source questions from document.xml`);

  const { data: dbQuestions, error: fetchError } = await supabase
    .from('questions')
    .select('id, question_text');

  if (fetchError) throw fetchError;

  const dbByText = new Map();
  for (const row of dbQuestions ?? []) {
    const key = row.question_text.trim();
    const existing = dbByText.get(key) ?? [];
    existing.push(row.id);
    dbByText.set(key, existing);
  }

  let matchedEntries = 0;
  let updatedRows = 0;
  let missing = 0;

  for (const entry of parsedEntries) {
    const ids = dbByText.get(entry.text);
    if (!ids || ids.length === 0) {
      missing += 1;
      continue;
    }

    matchedEntries += 1;

    for (const id of ids) {
      const { error: updateError } = await supabase
        .from('questions')
        .update({
          option_a: entry.options.option_a,
          option_b: entry.options.option_b,
          option_c: entry.options.option_c,
          option_d: entry.options.option_d,
          correct_answer: entry.answer,
          explanation: entry.explanation,
        })
        .eq('id', id);

      if (updateError) {
        console.error(`Failed to update ${id}:`, updateError.message);
        continue;
      }
      updatedRows += 1;
    }
  }

  console.log(`Matched source questions: ${matchedEntries}`);
  console.log(`Updated database rows: ${updatedRows}`);
  console.log(`Missing source matches: ${missing}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
