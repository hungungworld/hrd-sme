"""Employee-level, weekly-deadline and refund sample data, consistent with gen_hrd.py output."""
import csv, random, sys
from datetime import date, timedelta
from pathlib import Path

out = Path(sys.argv[1])
rng = random.Random(42)
D = ["해외영업1팀", "해외영업2팀", "트레이딩팀", "물류팀", "구매팀", "경영기획팀", "재무회계팀", "인사총무팀"]
HEAD = [38, 34, 26, 42, 22, 16, 18, 14]
MISS_ALL = [3, 4, 1, 13, 2, 0, 1, 0]
# dept hours from training.csv
dept_hours = {}
with open(out / "training.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        dept_hours[r["dept"]] = dept_hours.get(r["dept"], 0) + int(r["done"]) * int(r["hours"])

LEGAL = [  # (column, course, hours)
    ("miss_harass", "직장 내 성희롱 예방교육", 1),
    ("miss_privacy", "개인정보보호 교육", 1),
    ("miss_safety", "산업안전보건 교육", 6),
    ("miss_disability", "장애인 인식개선 교육", 1),
    ("miss_pension", "퇴직연금 교육", 1),
]
legal_miss = {
    "miss_harass": [1, 1, 0, 6, 1, 0, 0, 0],
    "miss_privacy": [2, 2, 0, 9, 1, 0, 0, 0],
    "miss_safety": [2, 3, 1, 10, 1, 0, 1, 0],
    "miss_disability": [1, 1, 0, 4, 0, 0, 1, 0],
    "miss_pension": [1, 2, 1, 7, 1, 0, 0, 0],
}
TYPES = {  # work type counts per dept
    0: [("사무직", 22), ("출장 잦은 직무", 16)],
    1: [("사무직", 20), ("출장 잦은 직무", 14)],
    2: [("사무직", 20), ("출장 잦은 직무", 6)],
    3: [("현장직", 28), ("사무직", 14)],
    4: [("사무직", 18), ("출장 잦은 직무", 4)],
    5: [("사무직", 16)], 6: [("사무직", 18)], 7: [("사무직", 14)],
}
TW = {"사무직": 1.0, "출장 잦은 직무": 0.6, "현장직": 0.35}


def split(total, weights):
    w = sum(weights)
    raw = [total * x / w for x in weights]
    base = [int(r) for r in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - base[i], reverse=True)[: total - sum(base)]:
        base[i] += 1
    return base


AS_OF = date(2026, 11, 2)
NOTICE = ["", "", "2026-10-12", "2026-10-19", "2026-10-26", "2026-10-30"]
emps, eid = [], 1001
for di, dept in enumerate(D):
    people = [{"dept": dept, "work_type": t} for t, k in TYPES[di] for _ in range(k)]
    rng.shuffle(people)
    # missing people: prefer field / travel-heavy staff
    order = sorted(range(len(people)), key=lambda i: (people[i]["work_type"] == "사무직", rng.random()))
    missing = order[: MISS_ALL[di]]
    for p in people:
        for col, _, _ in LEGAL:
            p[col] = 0
    assigned = {i: 0 for i in missing}
    for col, _, _ in sorted(LEGAL, key=lambda c: -legal_miss[c[0]][di]):
        for i in sorted(missing, key=lambda i: (assigned[i], missing.index(i)))[: legal_miss[col][di]]:
            people[i][col] = 1
            assigned[i] += 1
    for i, p in enumerate(people):
        p["legal_hours"] = 10 - sum(h for col, _, h in LEGAL if p[col])
        p["last_notice"] = rng.choice(NOTICE) if i in assigned else ""
    other_total = dept_hours[dept] - sum(p["legal_hours"] for p in people)
    weights = [TW[p["work_type"]] * rng.lognormvariate(0, 0.55) * (0.4 if p["legal_hours"] < 10 else 1) for p in people]
    for p, h in zip(people, split(other_total, weights)):
        p["other_hours"] = h
    for p in people:
        p["emp_id"] = f"E{eid}"
        eid += 1
    emps += people

cols = ["emp_id", "dept", "work_type", "legal_hours", "other_hours"] + [c for c, _, _ in LEGAL] + ["last_notice"]
with open(out / "employees.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    w.writerows(emps)

# weekly count of people still missing at least one legal course, falling to today's count
weeks = [AS_OF - timedelta(weeks=8 - k) for k in range(9)]
with open(out / "legal_weekly.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["week", "dept", "missing"])
    for di, dept in enumerate(D):
        start = round(HEAD[di] * rng.uniform(0.5, 0.75))
        end = MISS_ALL[di]
        vals = [round(end + (start - end) * (1 - k / 8) ** 1.6) for k in range(9)]
        for wk, v in zip(weeks, vals):
            w.writerow([wk.isoformat(), dept, v])

with open(out / "refund.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["course", "eligible", "status", "expected", "paid"])
    w.writerows([
        ["직장 내 성희롱 예방교육", "대상 아님", "대상 아님", 0, 0],
        ["개인정보보호 교육", "대상 아님", "대상 아님", 0, 0],
        ["산업안전보건 교육", "대상 아님", "대상 아님", 0, 0],
        ["장애인 인식개선 교육", "대상 아님", "대상 아님", 0, 0],
        ["퇴직연금 교육", "대상 아님", "대상 아님", 0, 0],
        ["무역실무·인코텀즈 2020", "대상", "지급 완료", 420, 420],
        ["수출입 통관·FTA 원산지", "대상", "지급 완료", 300, 300],
        ["해외영업 협상 스킬", "대상", "승인", 260, 0],
        ["생성형 AI 업무 활용", "대상", "신청", 580, 0],
        ["엑셀 데이터 분석", "대상", "지급 완료", 210, 210],
        ["신임 팀장 리더십", "대상", "미신청", 180, 0],
        ["비즈니스 영문 이메일", "대상", "지급 완료", 120, 120],
    ])

for dept in D:
    ps = [p for p in emps if p["dept"] == dept]
    print(dept, len(ps), sum(p["legal_hours"] + p["other_hours"] for p in ps), dept_hours[dept],
          sum(p["other_hours"] < 8 for p in ps), sum(p["legal_hours"] < 10 for p in ps))
