"""Generate department-level HRD sample data (fictional trade company, 210 staff)."""
import csv, sys
from pathlib import Path

out = Path(sys.argv[1])
D = ["해외영업1팀", "해외영업2팀", "트레이딩팀", "물류팀", "구매팀", "경영기획팀", "재무회계팀", "인사총무팀"]
HEAD = [38, 34, 26, 42, 22, 16, 18, 14]
MISS_ALL = [3, 4, 1, 13, 2, 0, 1, 0]
# satisfaction offset per dept
OFF = [0.1, 0.0, 0.1, -0.2, 0.0, 0.1, 0.0, 0.1]

# course: (name, category, hours, base satisfaction, total cost, {dept index: (target, done)})
legal_miss = {
    "직장 내 성희롱 예방교육": [1, 1, 0, 6, 1, 0, 0, 0],
    "개인정보보호 교육": [2, 2, 0, 9, 1, 0, 0, 0],
    "산업안전보건 교육": [2, 3, 1, 10, 1, 0, 1, 0],
    "장애인 인식개선 교육": [1, 1, 0, 4, 0, 0, 1, 0],
    "퇴직연금 교육": [1, 2, 1, 7, 1, 0, 0, 0],
}
legal_meta = {
    "직장 내 성희롱 예방교육": (1, 4.1, 120),
    "개인정보보호 교육": (1, 3.9, 110),
    "산업안전보건 교육": (6, 3.6, 380),
    "장애인 인식개선 교육": (1, 4.2, 60),
    "퇴직연금 교육": (1, 3.8, 60),
}
courses = []
for name, miss in legal_miss.items():
    h, s, c = legal_meta[name]
    courses.append((name, "법정의무", h, s, c, {i: (HEAD[i], HEAD[i] - miss[i]) for i in range(8)}))
courses += [
    ("무역실무·인코텀즈 2020", "직무", 16, 4.5, 1150, {0: (20, 19), 1: (18, 17), 2: (12, 12), 3: (12, 10), 4: (10, 10)}),
    ("수출입 통관·FTA 원산지", "직무", 12, 4.4, 820, {3: (30, 20), 4: (14, 12), 2: (10, 10), 0: (6, 5), 1: (4, 4)}),
    ("해외영업 협상 스킬", "직무", 8, 4.6, 980, {0: (26, 20), 1: (24, 16), 2: (10, 8)}),
    ("생성형 AI 업무 활용", "AX·디지털", 8, 4.7, 1650,
     {i: (HEAD[i], d) for i, d in enumerate([26, 20, 20, 16, 14, 16, 14, 12])}),
    ("엑셀 데이터 분석", "AX·디지털", 12, 4.3, 640, {5: (14, 14), 6: (16, 16), 4: (12, 10), 2: (10, 10), 0: (10, 8), 1: (8, 6), 7: (10, 8)}),
    ("신임 팀장 리더십", "리더십", 24, 4.4, 760, {0: (2, 2), 1: (2, 2), 2: (2, 2), 3: (2, 2), 4: (1, 1), 5: (1, 1), 6: (1, 1), 7: (1, 1)}),
    ("비즈니스 영문 이메일", "어학", 4, 4.0, 340, {0: (30, 20), 1: (28, 16), 2: (16, 10), 4: (10, 4), 3: (6, 2)}),
]


def split(total, weights):
    """Largest-remainder split of an integer total by weights."""
    w = sum(weights)
    raw = [total * x / w for x in weights]
    base = [int(r) for r in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - base[i], reverse=True)[: total - sum(base)]:
        base[i] += 1
    return base


rows = []
dept_hours = [0] * 8
dept_cost = [0] * 8
for name, cat, h, s, cost, alloc in courses:
    idx = sorted(alloc)
    costs = split(cost, [alloc[i][1] for i in idx])
    for i, c in zip(idx, costs):
        t, d = alloc[i]
        sat = round(min(5.0, s + OFF[i]), 1)
        rows.append([D[i], name, cat, t, d, h, sat, c])
        dept_hours[i] += d * h
        dept_cost[i] += c

with open(out / "training.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["dept", "course", "category", "target", "done", "hours", "satisfaction", "cost"])
    w.writerows(rows)

with open(out / "depts.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["dept", "headcount", "legal_done"])
    for i in range(8):
        w.writerow([D[i], HEAD[i], HEAD[i] - MISS_ALL[i]])

PROFILE = [420, 510, 880, 760, 690, 640, 420, 380, 820, 946]
with open(out / "monthly_dept.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["month", "dept", "hours", "cost"])
    for i in range(8):
        hs, cs = split(dept_hours[i], PROFILE), split(dept_cost[i], PROFILE)
        for m in range(10):
            w.writerow([f"2026-{m + 1:02d}", D[i], hs[m], cs[m]])

for i in range(8):
    print(D[i], HEAD[i], dept_hours[i], round(dept_hours[i] / HEAD[i], 1), dept_cost[i])
print("total", sum(dept_hours), sum(dept_cost), len(rows))
