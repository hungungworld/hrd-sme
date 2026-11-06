"""예시 API 응답(data/api/*.json)을 만듭니다. 설정 → 데이터 가져오기 → 시스템 API에서 "예시 API 주소 넣기"로 시험해 볼 수 있어요.

인사 시스템과 위탁기관 LMS가 흔히 돌려주는 모양을 흉내 냅니다.
- 값이 안쪽에 들어 있고(department.name), 목록이 data.employees 아래에 있습니다.
- 수료 여부가 true/false, 날짜가 ISO 형식입니다.

실행: python -I _source/scripts/gen_api.py   (hrd-sme 폴더에서, gen_raw.py 다음에)
"""
import csv, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW, OUT = ROOT / "data" / "raw", ROOT / "data" / "api"
OUT.mkdir(parents=True, exist_ok=True)


def rows(name):
    with open(RAW / name, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


people = [{
    "employee_no": r["사번"], "name": r["성명"], "department": {"code": f"D{i:02d}", "name": r["소속"]},
    "job_type": r["근무 형태"], "hire_date": r["입사일"], "status": "ACTIVE" if r["재직 구분"] == "재직" else "퇴직",
    "resign_date": r["퇴직일"] or None, "email": r["이메일"],
} for i, r in enumerate(rows("people.csv"))]
(OUT / "people.json").write_text(json.dumps({"result": "success", "data": {"total": len(people), "employees": people}}, ensure_ascii=False, indent=1), encoding="utf-8")

legal = [{
    "user_id": r["수강생ID"], "user_name": r["이름"], "course": {"title": r["과정명"]},
    "progress": int(r["진도율(%)"]), "completed": r["이수여부"] == "수료", "completed_at": (r["이수일"] + "T18:00:00+09:00") if r["이수일"] else None,
} for r in rows("legal.csv")]
(OUT / "legal.json").write_text(json.dumps({"items": legal, "page": 1, "has_next": False}, ensure_ascii=False, indent=1), encoding="utf-8")
print("people.json", len(people), "/ legal.json", len(legal))
