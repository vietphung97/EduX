/**
 * Service lấy câu hỏi K9 từ file JSON external (public/data/k9_questions.json)
 * File được serve tĩnh — cập nhật câu hỏi chỉ cần upload lại file JSON, không cần build lại.
 */

import { Question, Difficulty, QuestionType } from '../types';

interface K9RawQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options: string[];
  correctAnswer: string;
  funExplanation: string;
  seriousExplanation: string;
  category: string;
  grade: number;
  difficulty: string;
  subType: string;
  instruction: string;
}

function mapDifficulty(diff: string): Difficulty {
  if (diff === 'Dễ') return Difficulty.EASY;
  if (diff === 'Khó') return Difficulty.HARD;
  return Difficulty.MEDIUM;
}

// Cache sau lần fetch đầu tiên
let _cache: Question[] | null = null;

async function loadAll(): Promise<Question[]> {
  if (_cache) return _cache;

  const res = await fetch(`${import.meta.env.BASE_URL}data/k9_questions.json`);
  if (!res.ok) throw new Error(`Không tải được k9_questions.json: ${res.status}`);

  const rawData: K9RawQuestion[] = await res.json();
  _cache = rawData.map(q => ({
    id: q.id,
    type: q.type,
    question: q.question,
    ...(q.instruction ? { instruction: q.instruction } : {}),
    options: q.options,
    correctAnswer: q.correctAnswer,
    funExplanation: q.funExplanation,
    seriousExplanation: q.seriousExplanation,
    category: q.category,
    grade: q.grade,
    difficulty: mapDifficulty(q.difficulty),
  }));
  return _cache;
}

/**
 * Lấy câu hỏi K9 theo chủ đề và độ khó.
 */
export async function fetchK9Questions(
  topics: string[],
  difficulty: Difficulty,
  count: number = 15
): Promise<Question[]> {
  const all = await loadAll();

  let filtered = all.filter(q => {
    if (q.difficulty !== difficulty) return false;
    if (topics.length > 0) {
      const qTopic = q.category.toLowerCase();
      return topics.some(
        t => qTopic === t.toLowerCase()
      );
    }
    return true;
  });

  filtered = filtered.sort(() => Math.random() - 0.5);
  return filtered.slice(0, count);
}

/**
 * Trả về danh sách chủ đề K9 unique.
 */
export async function getK9Topics(): Promise<string[]> {
  const all = await loadAll();
  const seen = new Set<string>();
  for (const q of all) seen.add(q.category);
  return Array.from(seen).sort();
}
