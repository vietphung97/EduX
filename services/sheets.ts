// Service để fetch dữ liệu từ Google Sheets

import { Question, Difficulty, QuestionType } from '../types';

// ============ SHEET TOPICS (Chủ đề theo khối) ============
const TOPICS_SHEET_ID = '1KSTiTTzG45MgZ73fcnZRJUxoLjNS-Inb6zwNMIPm6Ro';

const TOPICS_GRADE_GIDS: Record<number, string> = {
  3: '1451534250',
  4: '980028236',
  5: '281356666',
  6: '1770621906',
  7: '299014818',
  8: '1718613195',
  9: '1902366496',
  10: '1455176414',
  11: '682147348',
  12: '350477893'
};

// ============ SHEET CÂU HỎI (Ngân hàng câu hỏi) ============
const QUESTIONS_SHEET_ID = '1nW-c4Y6mR3dp--E6bVSmByZRFYuP7d5dOzwtyUIAQpU';

const QUESTIONS_GRADE_GIDS: Record<number, string> = {
  3: '0',
  4: '1412989170',
  5: '322046913',
  6: '928355237',
  7: '602934265',
  8: '816455603',
  9: '1053274111',
  10: '428548091',
  11: '405620606',
  12: '1291225555'
};

// URL để export CSV từ sheet topics theo khối
const getTopicsSheetUrl = (grade: number) => {
  const gid = TOPICS_GRADE_GIDS[grade] || '0';
  return `https://docs.google.com/spreadsheets/d/${TOPICS_SHEET_ID}/export?format=csv&gid=${gid}`;
};

// URL để export CSV từ sheet câu hỏi theo khối
const getQuestionsSheetUrl = (grade: number) => {
  const gid = QUESTIONS_GRADE_GIDS[grade] || '0';
  return `https://docs.google.com/spreadsheets/d/${QUESTIONS_SHEET_ID}/export?format=csv&gid=${gid}`;
};

export interface TopicsByGrade {
  [grade: number]: string[];
}

/**
 * Parse CSV với multiline fields (fields có thể chứa newline trong quotes)
 * Trả về mảng các rows, mỗi row là mảng các cột
 */
function parseCSVWithMultiline(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];

    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        // Escaped quote ""
        currentField += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (char === '\n' && !inQuotes) {
      // End of row
      currentRow.push(currentField.trim());
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else if (char === '\r') {
      // Skip carriage return
      continue;
    } else {
      currentField += char;
    }
  }

  // Don't forget last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Chuyển string về Title Case (viết hoa chữ cái đầu mỗi từ)
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parse cột A (Chủ đề) từ CSV của một sheet khối
 * Trả về mảng các topic unique, đã chuẩn hóa về Title Case
 */
function parseTopicsFromGradeSheet(csvText: string): string[] {
  const rows = parseCSVWithMultiline(csvText);
  const topics: string[] = [];

  // Bỏ qua header row (dòng đầu tiên)
  for (let i = 1; i < rows.length; i++) {
    const rawTopic = rows[i][0]?.trim(); // Cột A là Chủ đề

    if (rawTopic && rawTopic.length > 0) {
      // Chuẩn hóa về Title Case
      const topic = toTitleCase(rawTopic);

      // Chỉ thêm nếu chưa có trong danh sách
      if (!topics.includes(topic)) {
        topics.push(topic);
      }
    }
  }

  return topics;
}

/**
 * Fetch danh sách chủ đề từ Google Sheets
 * Lấy topics từ các sheet "Khối 3", "Khối 4", ..., "Khối 12"
 * Trả về TopicsByGrade hoặc null nếu có lỗi
 */
export async function fetchTopicsFromSheet(): Promise<TopicsByGrade | null> {
  try {
    const result: TopicsByGrade = {};
    const gradesToFetch = Object.keys(TOPICS_GRADE_GIDS).map(k => parseInt(k, 10));

    // Fetch song song tất cả các khối
    const fetchPromises = gradesToFetch.map(async (grade) => {
      try {
        const url = getTopicsSheetUrl(grade);

        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'text/csv' }
        });

        if (!response.ok) {
          console.warn(`Failed to fetch grade ${grade}:`, response.status);
          return { grade, topics: [] };
        }

        const csvText = await response.text();
        const topics = parseTopicsFromGradeSheet(csvText);
        return { grade, topics };
      } catch (err) {
        console.warn(`Error fetching grade ${grade}:`, err);
        return { grade, topics: [] };
      }
    });

    const results = await Promise.all(fetchPromises);

    // Gom kết quả
    for (const { grade, topics } of results) {
      if (topics.length > 0) {
        result[grade] = topics;
      }
    }

    // Validate có ít nhất 1 grade
    if (Object.keys(result).length === 0) {
      console.error('No valid topics found in Google Sheets');
      return null;
    }

    return result;
  } catch (error) {
    console.error('Error fetching topics from Google Sheets:', error);
    return null;
  }
}

/**
 * Lấy danh sách grades có sẵn từ TopicsByGrade
 */
export function getAvailableGrades(topics: TopicsByGrade): number[] {
  return Object.keys(topics)
    .map(k => parseInt(k, 10))
    .sort((a, b) => a - b);
}

/**
 * Map tên độ khó từ sheet sang enum Difficulty
 */
function mapDifficulty(diffStr: string): Difficulty {
  const normalized = diffStr.trim().toLowerCase();
  if (normalized.includes('dễ') || normalized === 'easy') return Difficulty.EASY;
  if (normalized.includes('trung bình') || normalized === 'medium') return Difficulty.MEDIUM;
  if (normalized.includes('khó') || normalized === 'hard') return Difficulty.HARD;
  if (normalized.includes('chuyên gia') || normalized === 'expert') return Difficulty.EXPERT;
  return Difficulty.MEDIUM; // Default
}

/**
 * Trích xuất URL từ công thức =IMAGE("url") của Google Sheets
 * Nếu không phải công thức IMAGE thì trả về string gốc (có thể đã là URL)
 */
function extractImageUrl(imageFormula: string | undefined): string | undefined {
  if (!imageFormula) return undefined;

  const trimmed = imageFormula.trim();
  if (!trimmed) return undefined;

  // Bỏ qua placeholder
  if (trimmed === '[PENDING_IMAGE]') return undefined;

  let url = trimmed;

  // Pattern: =IMAGE("url") hoặc =IMAGE('url')
  const imageMatch = trimmed.match(/^=IMAGE\s*\(\s*["'](.+?)["']\s*\)$/i);
  if (imageMatch) {
    url = imageMatch[1];
  }

  // Nếu không phải URL, return undefined
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return undefined;
  }

  // Chuyển đổi Google Drive URL sang format có thể embed
  // Pattern: https://drive.google.com/uc?id=FILE_ID
  const driveUcMatch = url.match(/drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/);
  if (driveUcMatch) {
    return `https://lh3.googleusercontent.com/d/${driveUcMatch[1]}`;
  }

  // Pattern: https://drive.google.com/file/d/FILE_ID/view
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch) {
    return `https://lh3.googleusercontent.com/d/${driveFileMatch[1]}`;
  }

  return url;
}

/**
 * Map loại câu hỏi từ sheet sang QuestionType
 */
function mapQuestionType(typeStr: string): QuestionType {
  const normalized = typeStr.trim().toLowerCase();
  if (normalized.includes('complete') || normalized.includes('điền từ')) return 'complete';
  if (normalized.includes('word-form') || normalized.includes('chia dạng')) return 'word-form';
  if (normalized.includes('odd') || normalized.includes('khác loại')) return 'odd-one';
  if (normalized.includes('image') || normalized.includes('hình ảnh')) return 'image-quiz';
  if (normalized.includes('error') || normalized.includes('tìm lỗi')) return 'error-finding';
  if (normalized.includes('reorder') || normalized.includes('sắp xếp')) return 'reorder';
  if (normalized.includes('puzzle') || normalized.includes('ghép')) return 'puzzle';
  // synonym/antonym → vẫn là 'quiz', instruction sẽ được set riêng
  return 'quiz'; // Default
}

/**
 * Tạo instruction (đề bài dẫn nhập) dựa trên loại câu hỏi raw từ sheet.
 * Dùng cho các dạng bài mà câu hỏi chỉ là 1 từ/cụm từ (đồng nghĩa, trái nghĩa).
 */
function buildInstruction(rawType: string): string | undefined {
  const normalized = rawType.trim().toLowerCase();
  if (normalized.includes('đồng nghĩa') || normalized.includes('synonym')) {
    return 'Chọn từ đồng nghĩa với:';
  }
  if (normalized.includes('trái nghĩa') || normalized.includes('antonym')) {
    return 'Chọn từ trái nghĩa với:';
  }
  return undefined;
}

/**
 * Interface cho raw question data từ sheet
 * Cấu trúc: Id | Dạng bài | Khối | Chủ đề | Câu hỏi | Đáp án A-D | Đáp án đúng | Giải thích | Cấp độ | Ảnh | Check | Check đã sửa | imgUrl | funExplanation | seriousExplanation
 */
interface RawQuestionRow {
  id: string;
  type: string;
  grade: string;
  topic: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  explanation: string;
  difficulty: string;
  imageUrl?: string;
  check: string;
  checkFixed: string;
  funExplanation: string;
  seriousExplanation: string;
}

/**
 * Parse CSV thành mảng câu hỏi raw
 * Cấu trúc cột:
 * 0:Id | 1:Dạng bài | 2:Khối | 3:Chủ đề | 4:Câu hỏi | 5-8:Đáp án A-D | 9:Đáp án đúng
 * 10:Giải thích | 11:Cấp độ | 12:Ảnh(IMAGE) | 13:Check | 14:Check đã sửa | 15:imgUrl
 * 16:funExplanation | 17:seriousExplanation
 */
function parseQuestionsCSV(csvText: string): RawQuestionRow[] {
  const result: RawQuestionRow[] = [];
  const rows = parseCSVWithMultiline(csvText);

  if (rows.length < 2) return result; // Cần ít nhất header + 1 dòng

  // Đọc header để tìm index cột fun/serious (phòng trường hợp thứ tự thay đổi)
  const header = rows[0].map(h => h.trim().toLowerCase());
  const funIdx = header.findIndex(h => h.includes('fun'));
  const seriousIdx = header.findIndex(h => h.includes('serious'));

  // Bỏ qua header row
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];

    // Cần ít nhất 12 cột
    if (cols.length < 12) continue;

    result.push({
      id: cols[0] || '',
      type: cols[1] || '',
      grade: cols[2] || '',
      topic: cols[3] || '',
      question: cols[4] || '',
      optionA: cols[5] || '',
      optionB: cols[6] || '',
      optionC: cols[7] || '',
      optionD: cols[8] || '',
      correctAnswer: cols[9] || '',
      explanation: cols[10] || '',
      difficulty: cols[11] || '',
      imageUrl: cols[15] || undefined,  // Cột P (index 15) - imgUrl text
      check: cols[13] || '',
      checkFixed: cols[14] || '',
      funExplanation: (funIdx !== -1 ? cols[funIdx] : cols[16]) || '',
      seriousExplanation: (seriousIdx !== -1 ? cols[seriousIdx] : cols[17]) || '',
    });
  }

  return result;
}

/**
 * Fetch câu hỏi từ Google Sheet theo khối, chủ đề, mức độ
 * Chỉ lấy các câu có check = "Đúng"
 * @param grade Khối lớp (6-12)
 * @param topics Danh sách chủ đề cần lấy
 * @param difficulty Mức độ khó
 * @param count Số câu hỏi cần lấy (mặc định 15)
 */
export async function fetchQuestionsFromSheet(
  grade: number,
  topics: string[],
  difficulty: Difficulty,
  count: number = 15
): Promise<Question[]> {
  try {
    const url = getQuestionsSheetUrl(grade);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'text/csv' }
    });

    if (!response.ok) {
      console.error('Failed to fetch questions from Google Sheets:', response.status);
      return [];
    }

    const csvText = await response.text();
    const rawQuestions = parseQuestionsCSV(csvText);

    // Lọc câu hỏi theo điều kiện
    const filteredQuestions = rawQuestions.filter(q => {
      // Chỉ lấy câu có Check = "ĐÚNG"
      const checkVal = q.check.trim().toUpperCase();
      if (checkVal !== 'ĐÚNG') return false;

      // Lọc theo chủ đề (nếu có chọn)
      if (topics.length > 0) {
        const questionTopic = q.topic.trim().toLowerCase();
        const matchTopic = topics.some(t =>
          questionTopic.includes(t.toLowerCase()) ||
          t.toLowerCase().includes(questionTopic)
        );
        if (!matchTopic) return false;
      }

      // Lọc theo mức độ
      const questionDifficulty = mapDifficulty(q.difficulty);
      if (questionDifficulty !== difficulty) return false;

      return true;
    });

    // Shuffle và lấy số câu cần thiết
    const shuffled = filteredQuestions.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    // Convert sang Question interface
    const questions: Question[] = selected.map((q, index) => {
      const options = [q.optionA, q.optionB, q.optionC, q.optionD].filter(o => o);

      // Map đáp án đúng từ A/B/C/D sang nội dung thực tế
      let correctAnswer = q.correctAnswer.trim().toUpperCase();
      if (correctAnswer === 'A') correctAnswer = q.optionA;
      else if (correctAnswer === 'B') correctAnswer = q.optionB;
      else if (correctAnswer === 'C') correctAnswer = q.optionC;
      else if (correctAnswer === 'D') correctAnswer = q.optionD;

      const instruction = buildInstruction(q.type);
      return {
        id: q.id || `sheet-${grade}-${index}-${Date.now()}`,
        type: mapQuestionType(q.type),
        question: q.question,
        ...(instruction ? { instruction } : {}),
        options,
        correctAnswer,
        funExplanation: q.funExplanation || q.explanation || '',
        seriousExplanation: q.seriousExplanation || q.explanation || '',
        imageUrl: extractImageUrl(q.imageUrl),
        category: q.topic || 'General',
        grade: grade,
        difficulty: difficulty
      };
    });

    return questions;

  } catch (error) {
    console.error('Error fetching questions from Google Sheets:', error);
    return [];
  }
}
