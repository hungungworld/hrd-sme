"""원본 샘플 파일 6개(+안내 기록)를 만듭니다.

대시보드는 이 원본만 읽고 모든 숫자를 브라우저에서 계산합니다 (assets/hrd-data.js).
처음 한 번, 예전에 쓰던 계산 결과 CSV(_source/legacy/)에 맞춰 원본을 거꾸로 만들었습니다.
부서 인원, 법정교육 미이수, 주간 추이, 과정별 대상·이수·비용, 역량 수준은 예전 숫자와 같게 나옵니다.

실행: python -I _source/scripts/gen_raw.py   (hrd-sme 폴더에서)
"""
import csv, random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OLD = ROOT / "_source" / "legacy"
OUT = ROOT / "data" / "raw"
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(7)


def read(name):
    with open(OLD / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write(name, head, rows):
    # 엑셀에서 바로 열리도록 BOM을 붙입니다.
    with open(OUT / name, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(head)
        w.writerows(rows)
    print(name, len(rows))


def split(total, weights):
    w = sum(weights)
    if not w:
        return [0] * len(weights)
    raw = [total * x / w for x in weights]
    base = [int(r) for r in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - base[i], reverse=True)[: total - sum(base)]:
        base[i] += 1
    return base


emps = read("employees.csv")
training = read("training.csv")
refund = read("refund.csv")
comp = read("comp_levels.csv")
weekly = read("legal_weekly.csv")
D = list(dict.fromkeys(e["dept"] for e in emps))

# ── ① 인사 명단 ──
SUR = list("김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부황보")
GIV = ["민준", "서연", "도윤", "하은", "지호", "수아", "예준", "지유", "시우", "서윤", "주원", "하린", "건우", "지아", "현우", "채원",
       "우진", "윤서", "선우", "다은", "연우", "소율", "정우", "예린", "승현", "가은", "지훈", "나연", "동현", "수빈", "태윤", "유진",
       "재민", "은서", "성민", "하윤", "준혁", "민서", "상훈", "보람", "영호", "미경", "정민", "혜진", "광수", "선영", "진우", "은지"]
names, used = {}, set()
for e in emps:
    while True:
        n = rng.choice(SUR[:30]) + rng.choice(GIV)
        if n not in used:
            used.add(n); names[e["emp_id"]] = n; break


def hired():
    return date(2012, 1, 1) + timedelta(days=rng.randrange(0, (date(2026, 6, 30) - date(2012, 1, 1)).days))


people = [[e["emp_id"], names[e["emp_id"]], e["dept"], e["work_type"], hired().isoformat(), "재직", "", f'{e["emp_id"].lower()}@example.com'] for e in emps]
# 올해 퇴사한 두 명: 수강 현황에는 남아 있지만 대시보드 대상에서 빠지는 것을 보여 줍니다.
gone = [["E1211", "백승호", "물류팀", "현장직", "2021-03-02", "퇴직", "2026-08-31", "e1211@example.com"],
        ["E1212", "문가영", "해외영업2팀", "사무직", "2024-07-01", "퇴직", "2026-10-15", "e1212@example.com"]]
write("people.csv", ["사번", "성명", "소속", "근무 형태", "입사일", "재직 구분", "퇴직일", "이메일"], people + gone)

# ── 법정교육 완료일: 주간 추이가 예전 숫자와 같도록 ──
AS_OF = date(2026, 11, 2)
weeks = [AS_OF - timedelta(weeks=8 - k) for k in range(9)]
ONLINE = [("miss_harass", "직장 내 성희롱 예방교육"), ("miss_privacy", "개인정보보호 교육"), ("miss_safety", "산업안전보건 교육"), ("miss_pension", "퇴직연금 교육")]
DIS_DAY = date(2026, 4, 15)  # 장애인 인식개선 사내 집합교육
vals = {d: [int(w["missing"]) for w in weekly if w["dept"] == d] for d in D}
last = {}  # 사번 → 마지막 법정 과목을 끝낸 날 (다 끝낸 사람만)
for d in D:
    done_all = [e for e in emps if e["dept"] == d and not any(int(e[c]) for c, _ in ONLINE + [("miss_disability", "")])]
    rng.shuffle(done_all)
    v, i = vals[d], 0
    # 첫 주에 아직 남아 있던 사람 중 다 끝낸 사람: 그 뒤 구간에서 마지막 과목을 끝냄
    for k in range(1, 9):
        for _ in range(v[k - 1] - v[k]):
            lo, hi = weeks[k - 1] + timedelta(days=1), min(weeks[k], date(2026, 10, 30))
            last[done_all[i]["emp_id"]] = lo + timedelta(days=rng.randrange(0, (hi - lo).days + 1)); i += 1
    for e in done_all[i:]:
        last[e["emp_id"]] = date(2026, 3, 9) + timedelta(days=rng.randrange(0, (weeks[0] - date(2026, 3, 9)).days))


def before(day):
    lo = date(2026, 3, 3)
    return lo + timedelta(days=rng.randrange(0, max(1, (day - lo).days)))


rows2 = []
for e in emps:
    eid, L = e["emp_id"], last.get(e["emp_id"])
    online = [c for c, _ in ONLINE]
    final = rng.choice(online) if L else None
    for col, course in ONLINE:
        if int(e[col]):
            rows2.append([eid, names[eid], course, rng.choice([0, 0, 10, 25, 40, 60, 80]), "미수료", ""])
        else:
            day = L if col == final else before(L or weeks[0])
            rows2.append([eid, names[eid], course, 100, "수료", day.isoformat()])
for g in gone:
    for _, course in ONLINE:
        rows2.append([g[0], g[1], course, 0, "미수료", ""])
write("legal.csv", ["수강생ID", "이름", "과정명", "진도율(%)", "이수여부", "이수일"], rows2)

# ── ③ 교육 운영 대장 ──
META = {}
for t in training:
    META.setdefault(t["course"], {"category": t["category"], "hours": int(t["hours"]), "cost": 0, "alloc": {}})
    META[t["course"]]["cost"] += int(t["cost"])
    META[t["course"]]["alloc"][t["dept"]] = (int(t["target"]), int(t["done"]))
DELIV = {r["course"]: r["delivery"] for r in refund}
SESS = {
    "직장 내 성희롱 예방교육": ["2026-03-02"], "개인정보보호 교육": ["2026-03-02"], "산업안전보건 교육": ["2026-03-02"], "퇴직연금 교육": ["2026-03-02"],
    "장애인 인식개선 교육": [DIS_DAY.isoformat()],
    "무역실무·인코텀즈 2020": ["2026-03-18", "2026-06-17"], "수출입 통관·FTA 원산지": ["2026-04-22", "2026-09-09"],
    "해외영업 협상 스킬": ["2026-05-20", "2026-10-14"], "생성형 AI 업무 활용": ["2026-07-15", "2026-08-19", "2026-09-23", "2026-10-21"],
    "엑셀 데이터 분석": ["2026-02-25", "2026-08-26"], "신임 팀장 리더십": ["2026-03-10"],
    "비즈니스 영문 이메일": ["2026-01-21", "2026-04-08", "2026-06-10", "2026-10-07"],
}
rows3 = []
# 과정 단위 비용 줄 (사번 비움): 위탁 계약금·강사료
for course, m in META.items():
    ss = SESS[course]
    for day, c in zip(ss, split(m["cost"], [1] * len(ss))):
        rows3.append(["", "", "", course, m["category"], DELIV[course], day, "", c, "", "과정 비용"])
# 장애인 인식개선: 사람마다 출석
for e in emps:
    ok = not int(e["miss_disability"])
    rows3.append([e["emp_id"], names[e["emp_id"]], e["dept"], "장애인 인식개선 교육", "법정의무", "인하우스", DIS_DAY.isoformat(), 1, "", "수료" if ok else "불참", ""])
# 법정 외 과정: 부서별 신청자·수료자
weight = {e["emp_id"]: (int(e["other_hours"]) + 2) * rng.uniform(0.7, 1.3) for e in emps}
for course, m in META.items():
    if m["category"] == "법정의무":
        continue
    ss = SESS[course]
    for d, (target, done) in m["alloc"].items():
        pool = sorted((e["emp_id"] for e in emps if e["dept"] == d), key=lambda x: -weight[x] * rng.random())
        picked = pool[:target]
        for j, eid in enumerate(picked):
            ok = j < done
            rows3.append([eid, names[eid], d, course, m["category"], DELIV[course], rng.choice(ss), m["hours"], "", "수료" if ok else "미수료", ""])
write("ledger.csv", ["사번", "이름", "부서", "과정명", "구분", "방식", "교육일", "시간", "비용(만원)", "수료 여부", "비고"], rows3)

# ── ④ 만족도 응답 (익명, 부서만) ──
rows4 = []
for t in training:
    done, sat = int(t["done"]), float(t["satisfaction"])
    if not done:
        continue
    n0 = max(1, round(done * 0.6))
    best = None
    for n in list(range(n0, done + 1)) + list(range(n0 - 1, 0, -1)):
        tot = round(sat * n)
        if n <= tot <= 5 * n and round(tot / n + 1e-9, 1) == sat:
            best = (n, tot); break
    n, tot = best or (n0, min(5 * n0, max(n0, round(sat * n0))))
    scores = [tot // n] * n
    for i in range(tot - sum(scores)):
        scores[i] += 1
    # 너무 고르지 않게 한 쌍씩 벌립니다 (합은 그대로)
    for i in range(0, n - 1, 2):
        if scores[i] < 5 and scores[i + 1] > 1 and rng.random() < 0.5:
            scores[i] += 1; scores[i + 1] -= 1
    day = SESS[t["course"]][-1] if t["category"] != "법정의무" else "2026-10-30"
    for s in scores:
        rows4.append([day + " 17:" + f"{rng.randrange(60):02d}", t["course"], t["dept"], s])
write("survey.csv", ["타임스탬프", "과정명", "부서", "만족도"], rows4)

# ── ⑤ 환급 내역 (고용24: 인정받은 과정만 나옴) ──
STATUS = {"지급 완료": "지급 완료", "지원금 신청": "지원금 신청", "수료 확인 중": "수료 확인 중"}
PAYDAY = {"무역실무·인코텀즈 2020": "2026-08-12", "수출입 통관·FTA 원산지": "2026-06-24", "엑셀 데이터 분석": "2026-04-08", "비즈니스 영문 이메일": "2026-07-15"}
rows5 = [[r["course"], "인정", r["status"], r["expected"], r["paid"], PAYDAY.get(r["course"], "")] for r in refund if r["approved"] == "인정"]
write("refund.csv", ["훈련과정명", "인정여부", "진행상태", "지원예정액(만원)", "지급액(만원)", "지급일"], rows5)

# ── ⑥ 역량 진단 응답 ──
COMPS = list(dict.fromkeys(c["competency"] for c in comp))
rows6 = []
for d in D:
    staff = [e["emp_id"] for e in emps if e["dept"] == d]
    rng.shuffle(staff)
    lead, rest = staff[0], staff[1:]
    lv = {c["competency"]: c for c in comp if c["dept"] == d}
    rows6.append(["2026-06-05 10:00", f"{lead.lower()}@example.com", "팀장"] + [int(lv[c]["required"]) for c in COMPS])
    resp = rest[: max(5, round(len(rest) * 0.8))]
    cols = []
    for c in COMPS:
        cur, n = float(lv[c]["current"]), len(resp)
        tot = round(cur * n)
        s = [tot // n] * n
        for i in range(tot - sum(s)):
            s[i] += 1
        for i in range(0, n - 1, 2):
            if s[i] < 5 and s[i + 1] > 1 and rng.random() < 0.6:
                s[i] += 1; s[i + 1] -= 1
        rng.shuffle(s)
        cols.append(s)
    for j, eid in enumerate(resp):
        rows6.append([f"2026-06-{rng.randrange(8, 20):02d} {rng.randrange(9, 18):02d}:{rng.randrange(60):02d}", f"{eid.lower()}@example.com", "직원"] + [cols[k][j] for k in range(len(COMPS))])
write("competency.csv", ["타임스탬프", "이메일", "응답자 구분"] + COMPS, rows6)

# ── 안내 기록 (보내기 창이 남기는 기록의 예시) ──
rows7 = [[e["emp_id"], e["last_notice"], "메일"] for e in emps if e["last_notice"]]
write("notices.csv", ["사번", "안내일", "방법"], rows7)
