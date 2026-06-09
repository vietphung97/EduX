
import { GoogleGenAI, Type } from "@google/genai";
import { GameResult, Question, Difficulty } from "../types";

export const generateQuestions = async (grade: number, topics: string[], difficulty: Difficulty): Promise<Question[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Generate exactly 15 English quiz questions for Grade ${grade} students in Vietnam.
  Topics: ${topics.join(", ")}.
  Difficulty: ${difficulty}.
  Format: JSON array of objects with id, type (complete, word-form, odd-one, quiz, error-finding, reorder, puzzle), question, options (array of 4), correctAnswer, funExplanation, seriousExplanation, category.
  
  CORE SAFETY RULES (MUST FOLLOW):
  - NO mention or allusion to: Romance, crushes, love, dating, exes, or adult content.
  - NO mention of: Violence, weapons, fighting, or bullying.
  - NO mention of: Alcohol, cigarettes, drugs, or illegal substances.
  - NO mention of: Politics, religion, or social conflict.
  - Focus exclusively on: School life, hobbies, environment, technology, and learning.

  Constraints for explanations:
  1. funExplanation (Arena Mode): 
     - TONE: Cheerful, witty, and encouraging.
     - STYLE: Use school-related puns or relatable student situations. 
     - Example: "Mặc 'uniform' (Đồng phục) đúng quy định là trông 'ngầu' nhất trường luôn đó!"
     
  2. seriousExplanation (Study Review):
     - TONE: SERIOUS and educational.
     - PURPOSE: Explain the logic/grammar rule fully.
     - FORMAT: EXACTLY ONE SENTENCE.
     - Example: "Từ 'uniform' là danh từ đếm được, thường dùng với mạo từ 'a' vì âm đầu được phát âm là phụ âm /j/."
  
  General Constraints:
  - Use Global Success textbook themes.
  - Exactly one correct answer.
  - Avoid duplicate questions.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING },
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.STRING },
              funExplanation: { type: Type.STRING },
              seriousExplanation: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ["id", "type", "question", "options", "correctAnswer", "funExplanation", "seriousExplanation", "category"]
          }
        }
      }
    });

    const questions = JSON.parse(response.text || "[]");
    return questions.map((q: any) => ({
      ...q,
      grade,
      difficulty
    }));
  } catch (error) {
    console.error("Question Generation Error:", error);
    return [];
  }
};

export interface AdvisorAnalysis {
  advice: string;
  strengths: string[];
  weaknesses: string[];
  tips: Array<{ label: string; content: string; type: 'topic' | 'question-type' | 'time' | 'streak' | 'difficulty' }>;
}

const TYPE_LABELS: Record<string, string> = {
  'complete': 'Điền vào chỗ trống',
  'word-form': 'Word Form',
  'odd-one': 'Từ lạc loài',
  'image-quiz': 'Nhận diện hình ảnh',
  'quiz': 'Trắc nghiệm',
  'error-finding': 'Tìm lỗi sai',
  'reorder': 'Sắp xếp câu',
  'puzzle': 'Ghép câu',
};

function buildLocalTips(result: GameResult): AdvisorAnalysis['tips'] {
  const tips: AdvisorAnalysis['tips'] = [];
  const accuracy = result.correctCount / result.totalQuestions;
  const avgTimePerQ = result.timeSpent / result.totalQuestions;

  // --- Time tips ---
  if (avgTimePerQ > 25) {
    tips.push({
      label: 'Tốc độ làm bài',
      content: `Thời gian trung bình ${Math.round(avgTimePerQ)}s/câu — khá chậm. Luyện đọc nhanh đề bài bằng cách gạch chân từ khóa trước khi xét đáp án.`,
      type: 'time',
    });
  } else if (avgTimePerQ < 8 && accuracy < 0.7) {
    tips.push({
      label: 'Tốc độ làm bài',
      content: `Bạn trả lời rất nhanh (${Math.round(avgTimePerQ)}s/câu) nhưng độ chính xác thấp — hãy đọc kỹ đáp án nhiễu trước khi chọn.`,
      type: 'time',
    });
  }

  // --- Streak tips ---
  if (result.maxStreak < 3 && result.totalQuestions >= 10) {
    tips.push({
      label: 'Chuỗi câu đúng',
      content: `Streak cao nhất chỉ ${result.maxStreak} — dấu hiệu mất tập trung giữa chừng. Thử kỹ thuật "2 phút thiền" trước khi bắt đầu để giữ focus.`,
      type: 'streak',
    });
  }

  // --- Question type tips ---
  const weakTypes = Object.entries(result.typeBreakdown)
    .filter(([, s]) => s.total > 0 && s.correct / s.total < 0.5)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);

  for (const [type, stats] of weakTypes.slice(0, 2)) {
    const pct = Math.round((stats.correct / stats.total) * 100);
    const label = TYPE_LABELS[type] || type;
    const tipMap: Record<string, string> = {
      'word-form': `Word Form chỉ đúng ${pct}% — học từng loại hậu tố: -tion/-sion (danh từ), -ful/-less (tính từ), -ly (trạng từ), -ize/-ify (động từ).`,
      'error-finding': `Tìm lỗi sai chỉ đúng ${pct}% — tập thói quen đọc lại câu 1 lần theo thứ tự: chủ ngữ → động từ → tân ngữ → trạng từ.`,
      'reorder': `Sắp xếp câu chỉ đúng ${pct}% — nhớ công thức S + V + O + (Adv) và đặt trạng từ thời gian vào cuối câu.`,
      'complete': `Điền vào chỗ trống chỉ đúng ${pct}% — xác định loại từ cần điền trước (danh từ/tính từ/động từ) rồi mới xét nghĩa.`,
      'odd-one': `Từ lạc loài chỉ đúng ${pct}% — tìm điểm chung của 3 từ còn lại (chủ đề, loại từ, âm thanh) để loại từ khác biệt.`,
    };
    tips.push({
      label: `Dạng bài: ${label}`,
      content: tipMap[type] || `Dạng ${label} chỉ đúng ${pct}% — cần luyện thêm dạng này.`,
      type: 'question-type',
    });
  }

  // --- Topic tips ---
  const weakTopics = Object.entries(result.categoryBreakdown)
    .filter(([, s]) => s.total > 0 && s.correct / s.total < 0.6)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);

  for (const [topic, stats] of weakTopics.slice(0, 2)) {
    const pct = Math.round((stats.correct / stats.total) * 100);
    tips.push({
      label: `Chủ đề: ${topic}`,
      content: `Chủ đề "${topic}" chỉ đúng ${pct}% — tạo flashcard 10 từ vựng/ngày cho chủ đề này, ôn lại sau 1 ngày, 3 ngày, 7 ngày theo Spaced Repetition.`,
      type: 'topic',
    });
  }

  // --- Difficulty tips ---
  const weakDiffs = Object.entries(result.difficultyBreakdown)
    .filter(([, s]) => s.total > 0 && s.correct / s.total < 0.5)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);

  for (const [diff, stats] of weakDiffs.slice(0, 1)) {
    const pct = Math.round((stats.correct / stats.total) * 100);
    tips.push({
      label: `Cấp độ: ${diff}`,
      content: `Câu ${diff} chỉ đúng ${pct}% — thử làm bài ở cấp độ này riêng 10 phút mỗi ngày để làm quen dần với độ khó.`,
      type: 'difficulty',
    });
  }

  return tips;
}

export const getExpertAnalysis = async (result: GameResult, grade: number): Promise<AdvisorAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const accuracy = Math.round((result.correctCount / result.totalQuestions) * 100);
  const avgTime = Math.round(result.timeSpent / result.totalQuestions);

  const typeBreakdownText = Object.entries(result.typeBreakdown)
    .filter(([, s]) => s.total > 0)
    .map(([t, s]) => `${TYPE_LABELS[t] || t}: ${s.correct}/${s.total}`)
    .join(', ');

  const catBreakdownText = Object.entries(result.categoryBreakdown)
    .filter(([, s]) => s.total > 0)
    .map(([c, s]) => `${c}: ${s.correct}/${s.total}`)
    .join(', ');

  const sortedCats = Object.entries(result.categoryBreakdown)
    .filter(([, s]) => s.total > 0)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
  const weakestCat = sortedCats[0]?.[0] || 'N/A';
  const strongestCat = sortedCats[sortedCats.length - 1]?.[0] || 'N/A';

  const sortedTypes = Object.entries(result.typeBreakdown)
    .filter(([, s]) => s.total > 0)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
  const weakestType = sortedTypes[0] ? (TYPE_LABELS[sortedTypes[0][0]] || sortedTypes[0][0]) : 'N/A';

  const localTips = buildLocalTips(result);

  // Compute strengths and weaknesses from data directly (no AI needed for these)
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (accuracy >= 80) strengths.push(`Độ chính xác xuất sắc: ${accuracy}% — phản xạ từ vựng rất tốt.`);
  else if (accuracy >= 60) strengths.push(`Độ chính xác ổn định ${accuracy}% — nền tảng khá vững chắc.`);

  if (result.maxStreak >= 5) strengths.push(`Streak ${result.maxStreak} câu liên tiếp — khả năng tập trung tốt.`);
  if (avgTime <= 15 && accuracy >= 70) strengths.push(`Tốc độ làm bài nhanh (${avgTime}s/câu) với độ chính xác cao.`);
  // Chỉ hiện strongest/weakest khi có >= 2 chủ đề khác nhau và tỉ lệ khác nhau
  if (strongestCat !== 'N/A' && strongestCat !== weakestCat) strengths.push(`Nổi bật ở chủ đề "${strongestCat}".`);

  if (accuracy < 60) weaknesses.push(`Độ chính xác tổng thể còn thấp (${accuracy}%) — cần ôn lại từ vựng cơ bản.`);
  if (weakestCat !== 'N/A' && weakestCat !== strongestCat) weaknesses.push(`Còn yếu ở chủ đề "${weakestCat}".`);
  if (weakestType !== 'N/A' && sortedTypes[0] && sortedTypes[0][1].correct / sortedTypes[0][1].total < 0.5) {
    weaknesses.push(`Dạng bài "${weakestType}" cần luyện thêm.`);
  }
  if (avgTime > 25) weaknesses.push(`Tốc độ đọc đề còn chậm (${avgTime}s/câu).`);

  try {
    const prompt = `
      Bạn là "Cố vấn X" - chuyên gia tiếng Anh hóm hỉnh cho học sinh khối ${grade}.
      Nhiệm vụ: Phân tích kết quả và đưa ra lời khuyên có chiều sâu, cá nhân hóa.

      HÀNH VI VÀ GIỌNG VĂN:
      - Hài hước, gần gũi nhưng PHẢI có kiến thức chuyên môn thực tế.
      - Tránh các câu nhận xét sáo rỗng.

      TUYỆT ĐỐI KHÔNG NHẮC ĐẾN: Tình yêu, bạo lực, chất kích thích, chính trị, tôn giáo.

      NỘI DUNG CẦN CÓ (3 đề mục rõ ràng):
      1. NHẬN XÉT CHIẾN THUẬT: Nhận xét về tốc độ (${avgTime}s/câu), độ chính xác (${accuracy}%), streak (${result.maxStreak}).
      2. MẸO HỌC CỤ THỂ: Mẹo cho dạng bài yếu nhất "${weakestType}" hoặc chủ đề "${weakestCat}".
      3. HÀNH ĐỘNG HÔM NAY: 1 bài tập cụ thể học sinh nên làm ngay.

      DỮ LIỆU TRẬN ĐẤU:
      - Điểm: ${result.score}/150, Đúng: ${result.correctCount}/${result.totalQuestions}, Streak tốt nhất: ${result.maxStreak}
      - Thời gian: ${result.timeSpent}s tổng (${avgTime}s/câu trung bình)
      - Theo chủ đề: ${catBreakdownText}
      - Theo dạng bài: ${typeBreakdownText}

      Độ dài: ~150-200 từ. Markdown sạch đẹp.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    const advice = response.text || "Kết quả rất tiềm năng! Hãy cùng Cố vấn X chinh phục đỉnh cao mới nhé.";
    return { advice, strengths, weaknesses, tips: localTips };
  } catch (error) {
    const fallback = "Cố vấn X đang bận nghiên cứu tài liệu mới. Hãy xem biểu đồ phân tích bên dưới nhé!";
    return { advice: fallback, strengths, weaknesses, tips: localTips };
  }
};
