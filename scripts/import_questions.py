import openpyxl
import json
import re

MISTAKE_RE = re.compile(r'mistake|correction', re.IGNORECASE)
IMG_RE = re.compile(r'^(https?://|/Files/).*\.(jpg|jpeg|png|gif)$', re.IGNORECASE)

def classify_type(question_title, instruction):
    title = (question_title or '').strip()
    instr = (instruction or '').strip()
    if IMG_RE.match(title):
        return 'image-quiz'
    if MISTAKE_RE.search(instr):
        return 'error-finding'
    return 'quiz'

def build_image_url(title, grade):
    if not title:
        return ''
    if title.startswith('http'):
        return title
    if title.startswith('/Files/'):
        return 'https://eduso.vn' + title
    return title

def load_rows(path, sheet):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[sheet]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    return [r for r in rows if r[0]]  # must have Chủ đề (category)

def process(rows, grade, start_id):
    out = []
    idx = start_id
    letter_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
    for r in rows:
        category = r[0]
        qtitle = r[1]
        opt1, opt2, opt3, opt4 = r[2], r[3], r[4], r[5]
        correct_letter = (r[6] or '').strip().upper()
        instruction = r[7] or ''
        difficulty = r[9] if len(r) > 9 and r[9] else (r[8] if len(r) > 8 else '')
        # k8 sheet has Đề bài at [7], Cáp độ at [8], but k6/k7 have Đề bài[7], Giải thích[8], Cấp độ[9]
        options = [opt1, opt2, opt3, opt4]
        if any(o is None for o in options):
            continue
        options = [str(o) for o in options]
        li = letter_map.get(correct_letter)
        if li is None:
            continue
        correct_answer = options[li]

        qtype = classify_type(qtitle, instruction)
        if qtype == 'image-quiz':
            question_text = ''
            image_url = build_image_url(str(qtitle), grade)
        else:
            question_text = str(qtitle).strip() if qtitle else ''
            image_url = ''

        out.append({
            "id": f"k{grade}_{idx}",
            "type": qtype,
            "question": question_text,
            "options": options,
            "correctAnswer": correct_answer,
            "funExplanation": "",
            "seriousExplanation": "",
            "category": str(category).strip(),
            "grade": grade,
            "difficulty": str(difficulty).strip() if difficulty else "Dễ",
            "instruction": str(instruction).strip(),
            "imageUrl": image_url,
        })
        idx += 1
    return out, idx

def main():
    base = "public/data"

    # K6
    with open(f"{base}/k6_questions.json", encoding="utf-8") as f:
        k6_existing = json.load(f)
    k6_max = max(int(d["id"].split("_")[1]) for d in k6_existing)
    k6_rows = load_rows("quiz/dau-truong-x-k6 U3,4.xlsx", "Dữ liệu chuẩn hóa")
    k6_new, _ = process(k6_rows, 6, k6_max + 1)
    k6_existing.extend(k6_new)
    with open(f"{base}/k6_questions.json", "w", encoding="utf-8") as f:
        json.dump(k6_existing, f, ensure_ascii=False, indent=2)
    print(f"K6: added {len(k6_new)} questions, total {len(k6_existing)}")

    # K7
    with open(f"{base}/k7_questions.json", encoding="utf-8") as f:
        k7_existing = json.load(f)
    k7_max = max(int(d["id"].split("_")[1]) for d in k7_existing)
    k7_rows = load_rows("quiz/dau-truong-x-k7 U3 4 .xlsx", "Data_Chuan_Hoa")
    k7_new, _ = process(k7_rows, 7, k7_max + 1)
    k7_existing.extend(k7_new)
    with open(f"{base}/k7_questions.json", "w", encoding="utf-8") as f:
        json.dump(k7_existing, f, ensure_ascii=False, indent=2)
    print(f"K7: added {len(k7_new)} questions, total {len(k7_existing)}")

    # K8 - different column layout: Đề bài[7], Cáp độ[8], Chi tiết[9] (no Giải thích column)
    with open(f"{base}/k8_questions.json", encoding="utf-8") as f:
        k8_existing = json.load(f)
    k8_max = max(int(d["id"].split("_")[1]) for d in k8_existing)
    k8_rows = load_rows("quiz/dau-truong-x-k8 U3,4.xlsx", "Data chuẩn hóa")
    k8_new, _ = process_k8(k8_rows, 8, k8_max + 1)
    k8_existing.extend(k8_new)
    with open(f"{base}/k8_questions.json", "w", encoding="utf-8") as f:
        json.dump(k8_existing, f, ensure_ascii=False, indent=2)
    print(f"K8: added {len(k8_new)} questions, total {len(k8_existing)}")


def process_k8(rows, grade, start_id):
    out = []
    idx = start_id
    letter_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
    for r in rows:
        category = r[0]
        qtitle = r[1]
        opt1, opt2, opt3, opt4 = r[2], r[3], r[4], r[5]
        correct_letter = (r[6] or '').strip().upper()
        instruction = r[7] or ''
        difficulty = r[8] or 'Dễ'
        options = [opt1, opt2, opt3, opt4]
        if any(o is None for o in options):
            continue
        options = [str(o) for o in options]
        li = letter_map.get(correct_letter)
        if li is None:
            continue
        correct_answer = options[li]

        qtype = classify_type(qtitle, instruction)
        if qtype == 'image-quiz':
            question_text = ''
            image_url = build_image_url(str(qtitle), grade)
        else:
            question_text = str(qtitle).strip() if qtitle else ''
            image_url = ''

        out.append({
            "id": f"k{grade}_{idx}",
            "type": qtype,
            "question": question_text,
            "options": options,
            "correctAnswer": correct_answer,
            "funExplanation": "",
            "seriousExplanation": "",
            "category": str(category).strip(),
            "grade": grade,
            "difficulty": str(difficulty).strip(),
            "instruction": str(instruction).strip(),
            "imageUrl": image_url,
        })
        idx += 1
    return out, idx

if __name__ == "__main__":
    main()
