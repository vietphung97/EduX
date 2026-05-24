/**
 * Script: enrich-questions.mjs
 *
 * Mục đích:
 *   Sinh funExplanation + seriousExplanation cho câu hỏi bằng Gemini AI.
 *   Hỗ trợ 2 nguồn:
 *     1. Google Sheet (export CSV) → output CSV để paste lại vào sheet
 *     2. public/data/k9_questions.json → ghi thẳng vào file JSON
 *
 * Cách dùng:
 *   # Enrich Google Sheet (khối 6-12)
 *   node scripts/enrich-questions.mjs --mode sheet --grade 9
 *   node scripts/enrich-questions.mjs --mode sheet --grade 9 --output output/grade9.csv
 *
 *   # Enrich file K9 JSON
 *   node scripts/enrich-questions.mjs --mode k9
 *   node scripts/enrich-questions.mjs --mode k9 --limit 50   # chỉ sinh 50 câu đầu
 *   node scripts/enrich-questions.mjs --mode k9 --dry-run
 *
 * Options:
 *   --mode sheet|k9     Nguồn dữ liệu (bắt buộc)
 *   --grade <số>        Khối lớp, dùng với --mode sheet (3-12)
 *   --output <path>     File output, dùng với --mode sheet
 *   --limit <số>        Giới hạn số câu sinh (để test)
 *   --dry-run           In ra không ghi file
 *
 * Yêu cầu: GEMINI_API_KEY trong file .env.local
 *
 * Cấu trúc cột Google Sheet (0-indexed):
 *   0:Id  1:Dạng bài  2:Khối  3:Chủ đề  4:Câu hỏi
 *   5:ĐA-A  6:ĐA-B  7:ĐA-C  8:ĐA-D  9:Đáp án đúng
 *   10:Giải thích  11:Cấp độ  12:Ảnh(IMAGE)  13:Check  14:Check đã sửa  15:imgUrl
 *   16:funExplanation  ← CỘT MỚI
 *   17:seriousExplanation ← CỘT MỚI
 */

import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// ─── Config ───────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(ROOT, '.env.local');
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  } catch {
    console.error('Không tìm thấy .env.local');
    process.exit(1);
  }
}

const QUESTIONS_SHEET_ID = '1nW-c4Y6mR3dp--E6bVSmByZRFYuP7d5dOzwtyUIAQpU';
const QUESTIONS_GRADE_GIDS = {
  3: '0', 4: '1412989170', 5: '322046913', 6: '928355237',
  7: '602934265', 8: '816455603', 9: '1053274111',
  10: '428548091', 11: '405620606', 12: '1291225555'
};

// Header đầy đủ của CSV output (sheet mode)
const CSV_HEADER = [
  'Id', 'Dạng bài', 'Khối', 'Chủ đề', 'Câu hỏi',
  'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án đúng',
  'Giải thích', 'Cấp độ', 'Ảnh (IMAGE)', 'Check', 'Check đã sửa', 'imgUrl',
  'funExplanation', 'seriousExplanation'
];

// ─── CSV Parser / Serializer ──────────────────────────────────────────────────

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(field.trim()); field = '';
    } else if (ch === '\n' && !inQuotes) {
      row.push(field.trim());
      if (row.some(c => c.length > 0)) rows.push(row);
      row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some(c => c.length > 0)) rows.push(row);
  }
  return rows;
}

function escapeCSV(val) {
  const s = String(val ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function serializeCSV(rows) {
  return rows.map(r => r.map(escapeCSV).join(',')).join('\n');
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

/**
 * Sinh cả 2 loại giải thích cho một câu hỏi.
 * Trả về { fun, serious }
 */
async function generateExplanations(ai, q) {
  const prompt = `Bạn là chuyên gia giáo dục tiếng Anh cho học sinh THCS/THPT Việt Nam.

Câu hỏi: "${q.question}"
Các lựa chọn: ${q.options.map((o, i) => `${['A','B','C','D'][i]}. ${o}`).join(' | ')}
Đáp án đúng: ${q.correctAnswerLetter}. "${q.correctAnswer}"
Dạng bài: ${q.type}
Chủ đề: ${q.category}
Cấp độ: ${q.difficulty}

Hãy sinh ra 2 loại giải thích bằng tiếng Việt:

1. funExplanation (dùng trong Arena Mode - khi vừa trả lời xong):
   - Ngắn gọn 1-2 câu, vui vẻ, hóm hỉnh như bạn thân "mách nước"
   - Có thể chen tiếng Anh từ khóa, dùng wordplay/pun nếu được
   - Kết bằng 1 emoji phù hợp
   - KHÔNG giải thích ngữ pháp khô khan

2. seriousExplanation (dùng trong Study Review - ôn tập):
   - Đúng 1 câu, nghiêm túc, đầy đủ cấu trúc ngữ pháp
   - Nêu rõ: quy tắc/cấu trúc được dùng là gì, tại sao đáp án này đúng
   - Ngôn ngữ học thuật, chính xác

Quy tắc an toàn (bắt buộc): KHÔNG đề cập tình yêu lãng mạn, bạo lực, chất kích thích, chính trị, tôn giáo.

Trả về JSON object với đúng 2 key: "fun" và "serious". Không thêm gì khác.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            fun: { type: 'string' },
            serious: { type: 'string' }
          },
          required: ['fun', 'serious']
        }
      }
    });
    const parsed = JSON.parse(response.text || '{}');
    return {
      fun: (parsed.fun || '').trim(),
      serious: (parsed.serious || '').trim()
    };
  } catch (err) {
    console.error(`  Lỗi Gemini: ${err.message}`);
    return { fun: '', serious: '' };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAnswerText(cols, letter) {
  const map = { A: cols[5], B: cols[6], C: cols[7], D: cols[8] };
  return map[(letter || '').trim().toUpperCase()] || letter;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { mode: null, grade: null, output: null, limit: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode') result.mode = args[++i];
    else if (args[i] === '--grade') result.grade = parseInt(args[++i], 10);
    else if (args[i] === '--output') result.output = args[++i];
    else if (args[i] === '--limit') result.limit = parseInt(args[++i], 10);
    else if (args[i] === '--dry-run') result.dryRun = true;
  }
  return result;
}

function printProgress(current, total, id) {
  const pct = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r[${bar}] ${pct}% (${current}/${total}) ${id.slice(0, 20).padEnd(20)}`);
}

// ─── Mode: Sheet ──────────────────────────────────────────────────────────────

async function enrichSheet(ai, args) {
  const { grade, output, limit, dryRun } = args;

  if (!grade || !QUESTIONS_GRADE_GIDS[grade]) {
    console.error('--mode sheet yêu cầu --grade <3-12>');
    process.exit(1);
  }

  const gid = QUESTIONS_GRADE_GIDS[grade];
  const url = `https://docs.google.com/spreadsheets/d/${QUESTIONS_SHEET_ID}/export?format=csv&gid=${gid}`;
  console.log(`\nFetching Google Sheet khối ${grade}...`);

  let csvText;
  try {
    const res = await fetch(url, { headers: { Accept: 'text/csv' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csvText = await res.text();
  } catch (err) {
    console.error('Lỗi fetch sheet:', err.message);
    process.exit(1);
  }

  const rows = parseCSV(csvText);
  if (rows.length < 2) { console.error('Sheet trống'); process.exit(1); }

  const headerRow = rows[0];
  const dataRows = rows.slice(1);

  // Tìm cột fun/serious nếu đã có
  const funColIdx = headerRow.findIndex(h => /fun/i.test(h));
  const seriousColIdx = headerRow.findIndex(h => /serious/i.test(h));

  const validRows = dataRows.filter(cols =>
    (cols[14] || '').trim().toUpperCase() === 'ĐÚNG'
  );
  console.log(`Tổng dòng: ${dataRows.length} | Hợp lệ: ${validRows.length}`);

  // Câu cần sinh: thiếu fun HOẶC thiếu serious
  let toEnrich = validRows.filter(cols => {
    const fun = funColIdx !== -1 ? (cols[funColIdx] || '').trim() : '';
    const serious = seriousColIdx !== -1 ? (cols[seriousColIdx] || '').trim() : '';
    return fun === '' || serious === '';
  });

  if (limit) toEnrich = toEnrich.slice(0, limit);
  console.log(`Cần sinh: ${toEnrich.length} câu${limit ? ` (giới hạn ${limit})` : ''}`);

  if (toEnrich.length === 0) {
    console.log('Tất cả câu đã có đủ giải thích.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Mẫu câu đầu tiên:');
    const s = toEnrich[0];
    console.log(`  Id: ${s[0]}, Câu: "${s[4]?.slice(0, 60)}..."`);
    process.exit(0);
  }

  // Enrich
  const resultMap = new Map(); // id → { fun, serious }
  let ok = 0, fail = 0;
  console.log('');

  for (let i = 0; i < toEnrich.length; i++) {
    const cols = toEnrich[i];
    const id = cols[0] || `row_${i}`;
    printProgress(i + 1, toEnrich.length, id);

    const correctLetter = (cols[9] || '').trim().toUpperCase();
    const q = {
      question: cols[4] || '',
      options: [cols[5], cols[6], cols[7], cols[8]].filter(Boolean),
      correctAnswerLetter: correctLetter,
      correctAnswer: getAnswerText(cols, correctLetter),
      type: cols[1] || '',
      category: cols[3] || '',
      difficulty: cols[11] || '',
    };

    const { fun, serious } = await generateExplanations(ai, q);
    resultMap.set(id, {
      fun: fun || (funColIdx !== -1 ? (cols[funColIdx] || '') : ''),
      serious: serious || (seriousColIdx !== -1 ? (cols[seriousColIdx] || '') : ''),
    });

    if (fun && serious) ok++; else fail++;
    if (i < toEnrich.length - 1) await sleep(250);
  }

  console.log(`\n\nHoàn thành: ${ok} OK, ${fail} lỗi`);

  // Merge kết quả vào tất cả dòng
  const outputRows = [CSV_HEADER];
  for (const cols of dataRows) {
    const id = cols[0] || '';
    const merged = resultMap.get(id);
    const base = Array.from({ length: 16 }, (_, i) => cols[i] || '');
    outputRows.push([
      ...base,
      merged?.fun ?? (funColIdx !== -1 ? (cols[funColIdx] || '') : ''),
      merged?.serious ?? (seriousColIdx !== -1 ? (cols[seriousColIdx] || '') : ''),
    ]);
  }

  const outputPath = output
    ? resolve(ROOT, output)
    : resolve(ROOT, 'output', `enriched_grade${grade}.csv`);

  const dir = dirname(outputPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outputPath, '\uFEFF' + serializeCSV(outputRows), 'utf-8');
  console.log(`\nFile output: ${outputPath}`);
  console.log('Paste cột funExplanation (cột Q) và seriousExplanation (cột R) vào Google Sheet.');
}

// ─── Mode: K9 JSON ────────────────────────────────────────────────────────────

async function enrichK9(ai, args) {
  const { limit, dryRun } = args;
  const jsonPath = resolve(ROOT, 'public', 'data', 'k9_questions.json');

  console.log('\nĐọc k9_questions.json...');
  let data;
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (err) {
    console.error('Không đọc được file:', err.message);
    process.exit(1);
  }

  console.log(`Tổng câu: ${data.length}`);

  // Câu thiếu fun HOẶC serious
  let toEnrich = data.filter(q => !q.funExplanation || !q.seriousExplanation);
  if (limit) toEnrich = toEnrich.slice(0, limit);

  console.log(`Cần sinh: ${toEnrich.length} câu${limit ? ` (giới hạn ${limit})` : ''}`);

  if (toEnrich.length === 0) {
    console.log('Tất cả câu đã có đủ giải thích.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Mẫu câu đầu tiên:');
    const s = toEnrich[0];
    console.log(`  Id: ${s.id}, Câu: "${s.question?.slice(0, 60)}..."`);
    process.exit(0);
  }

  // Tạo index nhanh để ghi lại vào data gốc
  const idxMap = new Map(data.map((q, i) => [q.id, i]));

  let ok = 0, fail = 0;
  console.log('');

  for (let i = 0; i < toEnrich.length; i++) {
    const q = toEnrich[i];
    printProgress(i + 1, toEnrich.length, q.id);

    // Tìm đáp án đúng theo nội dung (K9 lưu trực tiếp correctAnswer = text)
    const correctIdx = q.options.findIndex(o => o === q.correctAnswer);
    const correctLetter = ['A', 'B', 'C', 'D'][correctIdx] || '?';

    const input = {
      question: q.question,
      options: q.options,
      correctAnswerLetter: correctLetter,
      correctAnswer: q.correctAnswer,
      type: q.type,
      category: q.category,
      difficulty: q.difficulty,
    };

    const { fun, serious } = await generateExplanations(ai, input);

    const dataIdx = idxMap.get(q.id);
    if (dataIdx !== undefined) {
      if (fun) data[dataIdx].funExplanation = fun;
      if (serious) data[dataIdx].seriousExplanation = serious;
    }

    if (fun && serious) ok++; else fail++;

    // Ghi file mỗi 50 câu để tránh mất data nếu bị gián đoạn
    if ((i + 1) % 50 === 0) {
      writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
      process.stdout.write(` [saved]`);
    }

    if (i < toEnrich.length - 1) await sleep(250);
  }

  // Ghi file lần cuối
  writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n\nHoàn thành: ${ok} OK, ${fail} lỗi`);
  console.log(`File đã cập nhật: ${jsonPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();
  const args = parseArgs();

  if (!args.mode) {
    console.log('Cách dùng:');
    console.log('  node scripts/enrich-questions.mjs --mode sheet --grade 9');
    console.log('  node scripts/enrich-questions.mjs --mode k9');
    console.log('  node scripts/enrich-questions.mjs --mode k9 --limit 50 --dry-run');
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Thiếu GEMINI_API_KEY trong .env.local');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  if (args.mode === 'sheet') {
    await enrichSheet(ai, args);
  } else if (args.mode === 'k9') {
    await enrichK9(ai, args);
  } else {
    console.error(`Mode không hợp lệ: "${args.mode}". Dùng "sheet" hoặc "k9"`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nLỗi không xử lý được:', err);
  process.exit(1);
});
