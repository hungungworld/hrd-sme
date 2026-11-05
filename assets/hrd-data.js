/* 중소기업 HRD 대시보드 — 원본 정의, 저장, 원본 → 화면 숫자 계산
   원본 6개(인사 명단, 법정교육 수강 현황, 교육 운영 대장, 만족도, 환급, 역량 진단)와 안내 기록을 받아
   화면이 쓰는 데이터 8개(depts, employees, training, monthly, legal_weekly, refund, comp_levels, meta)를 만든다.
   브라우저와 node(검증 스크립트) 양쪽에서 돈다. 계산 규칙은 PLANNING.md 5장과 같다. */
(function (root) {
  'use strict';

  /* ───────── 기준 (나중에 설정 → 기준 탭에서 바꾼다) ───────── */
  const LEGAL = [
    { col: 'miss_harass', course: '직장 내 성희롱 예방교육', short: '성희롱 예방', hours: 1, re: /성희롱/ },
    { col: 'miss_privacy', course: '개인정보보호 교육', short: '개인정보보호', hours: 1, re: /개인정보/ },
    { col: 'miss_safety', course: '산업안전보건 교육', short: '산업안전보건', hours: 6, re: /산업안전|안전보건/ },
    { col: 'miss_disability', course: '장애인 인식개선 교육', short: '장애인 인식개선', hours: 1, re: /장애인/ },
    { col: 'miss_pension', course: '퇴직연금 교육', short: '퇴직연금', hours: 1, re: /퇴직연금/ },
  ];
  const MIN_RESPONSES = 5; // 역량 진단: 부서 응답이 이보다 적으면 보유 수준을 숨긴다
  const SAMPLE_TODAY = '2026-11-02'; // 예시 데이터만 있을 때의 오늘

  /* ───────── 원본 정의 ─────────
     fields: [키, 화면 이름, 필수 여부, 흔히 쓰는 열 이름들] */
  const SOURCES = {
    people: {
      no: '①', name: '인사 명단', file: 'people.csv', sample: '샘플_인사명단.xlsx', cadence: 31,
      from: '인사·급여 프로그램 → 재직자 명단 → 엑셀 내려받기', who: '인사 담당 (본인)', when: '월 1회, 입·퇴사가 있을 때',
      match: '사번', does: '부서 인원, 근무 형태, 입사·퇴사 반영. 퇴사자는 모든 대상에서 빠져요.',
      fields: [['emp', '사번', 1, ['사번', '사원번호', '직원번호', '사원 번호', '사원id']], ['name', '이름', 0, ['성명', '이름', '직원명']],
        ['dept', '부서', 1, ['소속', '부서', '팀', '부서명', '소속부서']], ['type', '근무 형태', 0, ['근무 형태', '근무형태', '직군', '직무 구분']],
        ['start', '입사일', 0, ['입사일', '입사 일자', '그룹입사일']], ['state', '재직 상태', 0, ['재직 구분', '재직구분', '재직상태', '재직 상태', '상태']],
        ['leave', '퇴사일', 0, ['퇴직일', '퇴사일']], ['email', '이메일', 0, ['이메일', 'email', 'e-mail', '메일']]],
    },
    legal: {
      no: '②', name: '법정교육 수강 현황', file: 'legal.csv', sample: '샘플_법정교육_수강현황.xlsx', cadence: 7,
      from: '위탁 이러닝 기관 관리자 화면 → 수강생 진도·수료 현황 → 엑셀 내려받기', who: '본인', when: '9~12월 매주 월요일',
      match: '사번 (수강생 ID를 사번으로 등록)', does: '법정 과목별 수료 표시, 주간 미이수 추이. 올린 날이 마감 대응의 기준일이 돼요.',
      fields: [['emp', '수강생 ID (사번)', 1, ['수강생id', '수강자id', '아이디', 'id', '사번', '회원id']], ['name', '이름', 0, ['이름', '성명', '수강생명']],
        ['course', '과정명', 1, ['과정명', '과정', '강좌명', '교육과정']], ['progress', '진도율', 0, ['진도율(%)', '진도율', '진도']],
        ['result', '수료 여부', 1, ['이수여부', '수료여부', '수료 여부', '결과', '이수 여부']], ['at', '수료일', 0, ['이수일', '수료일', '완료일']]],
    },
    ledger: {
      no: '③', name: '교육 운영 대장', file: 'ledger.csv', sample: '샘플_교육운영대장.xlsx', cadence: 7,
      from: '담당자가 직접 쓰는 구글 시트 (교육 신청부터 수료까지 한 줄씩)', who: '본인', when: '교육이 있을 때마다',
      match: '사번 + 과정명', does: '교육시간, 교육비, 사내 집합교육 수료, 과정 구분·방식. 비용은 사번을 비운 “과정 비용” 줄에 적어요.',
      fields: [['emp', '사번', 0, ['사번', '사원번호']], ['name', '이름', 0, ['이름', '성명']], ['dept', '부서', 0, ['부서', '소속']],
        ['course', '과정명', 1, ['과정명', '과정', '교육명']], ['cat', '구분', 1, ['구분', '교육 구분', '분류']], ['way', '방식', 0, ['방식', '운영 방식', '위탁/인하우스']],
        ['at', '교육일', 1, ['교육일', '교육 일자', '시작일', '일자']], ['hours', '시간', 0, ['시간', '교육시간', '학습시간']],
        ['cost', '비용(만원)', 0, ['비용(만원)', '비용', '교육비', '금액']], ['result', '수료 여부', 0, ['수료 여부', '수료여부', '이수여부', '결과']]],
    },
    survey: {
      no: '④', name: '만족도 응답', file: 'survey.csv', sample: '샘플_만족도응답.xlsx', cadence: 31,
      from: '구글 폼 → 응답 → 스프레드시트 → 다운로드', who: '본인', when: '교육이 끝날 때',
      match: '과정명 + 부서 (익명)', does: '과정별·부서별 만족도',
      fields: [['at', '제출 시각', 0, ['타임스탬프', 'timestamp', '제출 시각']], ['course', '과정명', 1, ['과정명', '수강한 과정', '과정']],
        ['dept', '부서', 1, ['부서', '소속']], ['score', '만족도', 1, ['만족도', '전반적 만족도', '점수']]],
    },
    refund: {
      no: '⑤', name: '환급 내역', file: 'refund.csv', sample: '샘플_환급내역.xlsx', cadence: 31,
      from: '고용24 기업 서비스 → 훈련과정 인정·지원금 지급 내역', who: '본인', when: '월 1회',
      match: '과정명', does: '과정별 인정 여부와 환급 진행 상태, 예상·지급액. 목록에 없는 과정은 “환급 없음”이 돼요.',
      fields: [['course', '과정명', 1, ['훈련과정명', '과정명', '과정']], ['approved', '인정 여부', 1, ['인정여부', '인정 여부', '훈련과정 인정']],
        ['status', '진행 상태', 1, ['진행상태', '진행 상태', '처리상태', '상태']], ['expected', '지원 예정액(만원)', 0, ['지원예정액(만원)', '지원 예정액', '예상 지원금', '지원예정액']],
        ['paid', '지급액(만원)', 0, ['지급액(만원)', '지급액', '지급 금액']], ['payday', '지급일', 0, ['지급일', '지급 일자']]],
    },
    competency: {
      no: '⑥', name: '역량 진단 응답', file: 'competency.csv', sample: '샘플_역량진단응답.xlsx', cadence: 400,
      from: '구글 폼 (팀장: 요구 수준, 직원: 보유 수준) → 응답 시트 다운로드', who: '본인, 팀장', when: '연 1회',
      match: '이메일 → 인사 명단의 부서', does: `부서 × 역량 요구·보유 수준. 직원 응답이 ${MIN_RESPONSES}명 미만인 부서는 보유 수준을 숨겨요.`,
      fields: [['at', '제출 시각', 0, ['타임스탬프', 'timestamp']], ['email', '이메일', 1, ['이메일', '이메일 주소', 'email']],
        ['role', '응답자 구분', 1, ['응답자 구분', '응답자', '구분', '역할']]], // 역량별 점수 열은 역량 정의에서 더한다
    },
    notices: {
      no: '', name: '안내 기록', file: 'notices.csv', sample: '샘플_안내기록.xlsx', cadence: 0, hidden: true,
      from: '보내기 창이 남기는 기록', who: '자동', when: '안내를 보낼 때', match: '사번', does: '직원별 마지막 안내일',
      fields: [['emp', '사번', 1, ['사번']], ['at', '안내일', 1, ['안내일', '날짜']], ['how', '방법', 0, ['방법']]],
    },
  };
  const ORDER = ['people', 'legal', 'ledger', 'survey', 'refund', 'competency'];
  const SAMPLE_AT = { people: '2026-10-01', legal: '2026-11-02', ledger: '2026-10-30', survey: '2026-10-30', refund: '2026-10-15', competency: '2026-06-20', notices: '2026-10-30' };

  function fieldsOf(src, competencies) {
    const f = SOURCES[src].fields.slice();
    if (src === 'competency') (competencies || []).forEach((c) => f.push(['c:' + c.competency, '점수: ' + c.competency, 1, [c.competency]]));
    return f;
  }

  /* ───────── 값 읽기 ───────── */
  const s = (v) => (v == null ? '' : String(v)).trim();
  const num = (v) => { const t = s(v).replace(/[,\s원만]/g, ''); const x = Number(t); return t === '' || !isFinite(x) ? 0 : x; };
  const pad = (n) => String(n).padStart(2, '0');
  function date(v) {
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    if (typeof v === 'number' && v > 20000 && v < 80000) { // 엑셀 날짜 일련번호
      const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const m = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(s(v));
    return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : '';
  }
  const yes = (v) => { const t = s(v); if (!t) return false; if (/미|불|아니|결석|^n|^x|false|0$/i.test(t)) return false; return /수료|이수|완료|참석|합격|^y|^o|예|true|1$|pass/i.test(t); };
  const key = (v) => s(v).replace(/\s/g, '').toLowerCase();
  const empKey = (v) => s(v).toUpperCase();
  const legalOf = (course) => LEGAL.find((l) => l.re.test(s(course)));
  const r1 = (v) => Math.round(v * 10) / 10;
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

  function split(total, weights) { // 정수 합계를 비율대로 나눈다 (큰 나머지 순)
    const w = weights.reduce((a, b) => a + b, 0);
    if (!w) return weights.map(() => 0);
    const raw = weights.map((x) => total * x / w), base = raw.map(Math.floor);
    raw.map((r, i) => [r - base[i], i]).sort((a, b) => b[0] - a[0]).slice(0, Math.round(total - base.reduce((a, b) => a + b, 0))).forEach(([, i]) => { base[i]++; });
    return base;
  }

  /* ───────── 표 → 원본 행 ───────── */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    // 위에 제목 줄이 있을 수 있어서 앞 10줄을 보고 탭(엑셀 붙여넣기)인지 쉼표인지 정한다
    const head = text.split('\n').slice(0, 10).join('\n');
    const sep = (head.match(/\t/g) || []).length > (head.match(/,/g) || []).length ? '\t' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => s(c) !== ''));
  }
  function guessMap(fields, head) {
    const hs = head.map(key), map = {};
    fields.forEach(([k, , , syn]) => {
      let i = -1;
      syn.some((sy) => { i = hs.indexOf(key(sy)); return i >= 0; });
      if (i < 0) syn.some((sy) => { const y = key(sy); i = hs.findIndex((h) => h && y.length > 1 && (h.includes(y) || y.includes(h))); return i >= 0; });
      if (i >= 0 && !Object.values(map).includes(i)) map[k] = i;
    });
    return map;
  }
  // 열 맞춤(map)대로 읽고, 필수 값이 빠진 줄은 이유와 함께 건너뛴다
  function readRows(src, grid, map, competencies) {
    const fields = fieldsOf(src, competencies), rows = [], skip = [];
    const label = (r) => r.filter((c) => s(c)).slice(0, 3).map((c) => (c instanceof Date ? date(c) : s(c))).join(' / ');
    grid.slice(1).forEach((r) => {
      const o = {};
      fields.forEach(([k]) => { const i = map[k]; o[k] = i === undefined || i === '' ? '' : r[i]; });
      ['at', 'start', 'leave', 'payday'].forEach((k) => { if (k in o) o[k] = date(o[k]); });
      ['emp'].forEach((k) => { if (k in o) o[k] = empKey(o[k]); });
      Object.keys(o).forEach((k) => { if (typeof o[k] !== 'string') o[k] = o[k] instanceof Date ? date(o[k]) : s(o[k]); });
      const miss = fields.filter(([k, , req]) => req && !s(o[k])).map((f) => f[1]);
      // 대장의 "과정 비용" 줄은 사번이 비어 있어도 된다. 교육일이 날짜가 아니면 건너뛴다.
      if (miss.length) return skip.push({ row: label(r), why: miss.join(', ') + ' 없음' });
      if (src === 'ledger' && !o.at) return skip.push({ row: label(r), why: '교육일을 날짜로 읽을 수 없음' });
      rows.push(o);
    });
    return { rows, skip };
  }

  /* ───────── 원본 → 화면 데이터 ───────── */
  function derive(st, competencies) {
    const R = (k) => (st.rows && st.rows[k]) || [];
    const asOf = (st.at && st.at.legal) || today(st);
    const everyone = R('people');
    const active = everyone.filter((p) => !/퇴/.test(p.state) && !(p.leave && p.leave <= asOf));
    const depts = [...new Set(active.map((p) => p.dept))];
    const byEmp = new Map(active.map((p) => [p.emp, p]));
    const byEmail = new Map(everyone.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));

    // 사람 × 법정 과목 → 가장 이른 수료일 ('' = 미수료)
    const legalDone = new Map(); // emp → { col: date }
    const mark = (emp, l, at) => {
      if (!byEmp.has(emp)) return;
      const m = legalDone.get(emp) || {}; const d = at || asOf;
      if (!m[l.col] || d < m[l.col]) m[l.col] = d;
      legalDone.set(emp, m);
    };
    R('legal').forEach((r) => { const l = legalOf(r.course); if (l && yes(r.result)) mark(r.emp, l, r.at); });
    R('ledger').forEach((r) => { const l = legalOf(r.course); if (l && r.emp && yes(r.result)) mark(r.emp, l, r.at); });

    // 대장의 과정 정보 (구분, 방식, 시간)
    const info = new Map();
    LEGAL.forEach((l) => info.set(l.course, { course: l.course, category: '법정의무', way: '', hours: l.hours, legal: l }));
    R('ledger').forEach((r) => {
      const l = legalOf(r.course), name = l ? l.course : s(r.course);
      const c = info.get(name) || { course: name, category: s(r.cat), way: '', hours: 0 };
      if (!c.way && r.way) c.way = s(r.way);
      if (!c.hours && !l && num(r.hours)) c.hours = num(r.hours);
      if (!c.category) c.category = s(r.cat);
      info.set(name, c);
    });
    R('legal').forEach((r) => { const l = legalOf(r.course); if (l && !info.get(l.course).way) info.get(l.course).way = '위탁'; });
    const courses = [...info.values()];
    const other = courses.filter((c) => !c.legal);

    // 법정 외 과정: 사람 × 과정 신청·수료
    const enroll = new Map(); // course → Map(emp → { done, at })
    R('ledger').forEach((r) => {
      if (!r.emp || legalOf(r.course) || !byEmp.has(r.emp)) return;
      const m = enroll.get(r.course) || new Map(); const e = m.get(r.emp) || { done: false, at: r.at };
      if (yes(r.result)) { e.done = true; e.at = r.at; }
      m.set(r.emp, e); enroll.set(r.course, m);
    });

    // employees
    const notice = new Map();
    R('notices').forEach((n) => { if (n.at && (!notice.get(n.emp) || n.at > notice.get(n.emp))) notice.set(n.emp, n.at); });
    const employees = active.map((p) => {
      const m = legalDone.get(p.emp) || {};
      const o = { emp_id: p.emp, dept: p.dept, work_type: p.type || '미분류', legal_hours: 0, other_hours: 0 };
      LEGAL.forEach((l) => { o[l.col] = m[l.col] ? 0 : 1; if (m[l.col]) o.legal_hours += l.hours; });
      other.forEach((c) => { const e = enroll.get(c.course) && enroll.get(c.course).get(p.emp); if (e && e.done) o.other_hours += c.hours; });
      o.last_notice = notice.get(p.emp) || '';
      return o;
    });
    const empOf = new Map(employees.map((e) => [e.emp_id, e]));
    const allDone = (e) => LEGAL.every((l) => !e[l.col]);

    const deptsOut = depts.map((d) => {
      const es = employees.filter((e) => e.dept === d);
      return { dept: d, headcount: es.length, legal_done: es.filter(allDone).length };
    });

    // 만족도: 과정 × 부서 평균, 없으면 과정 평균
    const sat = new Map(), satC = new Map();
    R('survey').forEach((r) => {
      const l = legalOf(r.course), c = l ? l.course : s(r.course), v = num(r.score);
      if (!v) return;
      [[sat, c + '|' + s(r.dept)], [satC, c]].forEach(([m, k]) => { const a = m.get(k) || [0, 0]; a[0] += v; a[1]++; m.set(k, a); });
    });

    // 비용: 과정 비용 줄(사번 없음)은 부서별 수료 인원 비율로, 사람 줄의 비용은 그 사람 부서로
    const costRows = new Map(); // course → [{ at, cost, dept? }]
    R('ledger').forEach((r) => {
      const v = num(r.cost); if (!v) return;
      const l = legalOf(r.course), c = l ? l.course : s(r.course);
      const p = r.emp && byEmp.get(r.emp);
      (costRows.get(c) || costRows.set(c, []).get(c)).push({ at: r.at, cost: v, dept: p ? p.dept : '' });
    });

    const training = [], deptCost = new Map(); // course|dept → cost
    courses.forEach((c) => {
      const cell = depts.map((d) => {
        const es = employees.filter((e) => e.dept === d);
        if (c.legal) return { d, target: es.length, done: es.filter((e) => !e[c.legal.col]).length };
        const m = enroll.get(c.course) || new Map();
        const list = [...m].filter(([emp]) => empOf.get(emp).dept === d);
        return { d, target: list.length, done: list.filter(([, e]) => e.done).length };
      });
      const cr = costRows.get(c.course) || [];
      const pooled = cr.filter((x) => !x.dept).reduce((a, x) => a + x.cost, 0);
      const doneW = cell.map((x) => x.done), share = split(pooled, doneW.some(Boolean) ? doneW : cell.map((x) => x.target));
      cell.forEach((x, i) => {
        const direct = cr.filter((y) => y.dept === x.d).reduce((a, y) => a + y.cost, 0);
        deptCost.set(c.course + '|' + x.d, { pooled: share[i], direct });
        if (!x.target) return;
        const sv = sat.get(c.course + '|' + x.d) || satC.get(c.course);
        training.push({ dept: x.d, course: c.course, category: c.category, target: x.target, done: x.done, hours: c.hours,
          satisfaction: sv ? r1(sv[0] / sv[1]) : '', cost: share[i] + direct });
      });
    });
    // 만족도가 하나도 없는 칸은 전체 평균으로 채워 요약이 0으로 끌려 내려가지 않게 한다
    const sats = training.filter((t) => t.satisfaction !== '');
    const satAll = sats.length ? r1(sats.reduce((a, t) => a + t.satisfaction * t.done, 0) / Math.max(1, sats.reduce((a, t) => a + t.done, 0))) : 0;
    training.forEach((t) => { if (t.satisfaction === '') t.satisfaction = satAll; });

    // monthly: 수료한 달의 시간, 비용 줄의 달로 나눈 비용
    const mm = new Map(); const bump = (month, dept, k, v) => { const id = month + '|' + dept; const o = mm.get(id) || { month, dept, hours: 0, cost: 0 }; o[k] += v; mm.set(id, o); };
    employees.forEach((e) => {
      const m = legalDone.get(e.emp_id) || {};
      LEGAL.forEach((l) => { if (m[l.col]) bump(m[l.col].slice(0, 7), e.dept, 'hours', l.hours); });
    });
    other.forEach((c) => (enroll.get(c.course) || new Map()).forEach((x, emp) => { if (x.done && x.at) bump(x.at.slice(0, 7), empOf.get(emp).dept, 'hours', c.hours); }));
    courses.forEach((c) => {
      const cr = (costRows.get(c.course) || []).filter((x) => x.at);
      const pool = cr.filter((x) => !x.dept), months = [...new Set(pool.map((x) => x.at.slice(0, 7)))];
      const mw = months.map((m) => pool.filter((x) => x.at.startsWith(m)).reduce((a, x) => a + x.cost, 0));
      depts.forEach((d) => {
        const dc = deptCost.get(c.course + '|' + d); if (!dc) return;
        split(dc.pooled, mw).forEach((v, i) => { if (v) bump(months[i], d, 'cost', v); });
      });
      cr.filter((x) => x.dept).forEach((x) => bump(x.at.slice(0, 7), x.dept, 'cost', x.cost));
    });
    const allMonths = [...new Set([...mm.values()].map((o) => o.month))].sort();
    const monthly = [];
    if (allMonths.length) {
      const [y0, m0] = allMonths[0].split('-').map(Number), [y1, m1] = allMonths[allMonths.length - 1].split('-').map(Number);
      const span = [];
      for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, m = 1) : m++) span.push(`${y}-${pad(m)}`);
      depts.forEach((d) => span.forEach((month) => { const o = mm.get(month + '|' + d); monthly.push({ month, dept: d, hours: o ? o.hours : 0, cost: o ? o.cost : 0 }); }));
    }

    // legal_weekly: 기준일부터 1주씩 8주 전까지, 그날까지 하나라도 남은 사람 수
    const weeks = Array.from({ length: 9 }, (_, k) => addDays(asOf, -7 * (8 - k)));
    const legal_weekly = [];
    depts.forEach((d) => weeks.forEach((w) => {
      const n = employees.filter((e) => e.dept === d && LEGAL.some((l) => { const at = (legalDone.get(e.emp_id) || {})[l.col]; return !at || at > w; })).length;
      legal_weekly.push({ week: w, dept: d, missing: n });
    }));

    // refund
    const rf = new Map(R('refund').map((r) => { const l = legalOf(r.course); return [l ? l.course : s(r.course), r]; }));
    const costOf = (c) => training.filter((t) => t.course === c).reduce((a, t) => a + t.cost, 0);
    const okRefund = (r) => r && /인정|승인|^y|^o|대상/i.test(s(r.approved)) && !/미|불|아니|제외/.test(s(r.approved));
    const status = (v) => { v = s(v); return /지급/.test(v) ? '지급 완료' : /신청|심사|접수/.test(v) ? '지원금 신청' : '수료 확인 중'; };
    const rate = (way) => {
      const ok = other.filter((c) => okRefund(rf.get(c.course)) && (!way || c.way === way));
      const cost = ok.reduce((a, c) => a + costOf(c.course), 0);
      return cost ? ok.reduce((a, c) => a + num(rf.get(c.course).expected), 0) / cost : 0;
    };
    const refund = courses.map((c) => {
      if (c.legal) return { course: c.course, delivery: c.way, approved: '해당 없음', status: '대상 아님', expected: 0, paid: 0, missed: 0 };
      const r = rf.get(c.course);
      if (okRefund(r)) return { course: c.course, delivery: c.way, approved: '인정', status: status(r.status), expected: num(r.expected), paid: num(r.paid), missed: 0 };
      // 인정을 받았다면 받았을 금액: 같은 방식으로 인정받은 과정의 평균 환급률 × 교육비
      return { course: c.course, delivery: c.way, approved: '미인정', status: '환급 없음', expected: 0, paid: 0, missed: Math.round(costOf(c.course) * (rate(c.way) || rate(''))) };
    });

    // comp_levels
    const comps = (competencies || []).map((c) => c.competency);
    const acc = new Map();
    R('competency').forEach((r) => {
      const p = byEmail.get(s(r.email).toLowerCase()); if (!p) return;
      const role = /팀장|리더|관리자|요구/.test(r.role) ? 'req' : 'cur';
      comps.forEach((c) => { const v = num(r['c:' + c]); if (!v) return; const k = p.dept + '|' + c; const a = acc.get(k) || { req: [0, 0], cur: [0, 0] }; a[role][0] += v; a[role][1]++; acc.set(k, a); });
    });
    const comp_levels = [];
    depts.forEach((d) => comps.forEach((c) => {
      const a = acc.get(d + '|' + c);
      if (!a || !a.req[1] || a.cur[1] < MIN_RESPONSES) return;
      comp_levels.push({ dept: d, competency: c, required: r1(a.req[0] / a.req[1]), current: r1(a.cur[0] / a.cur[1]) });
    }));

    const dates = [...R('ledger').map((r) => r.at), ...R('legal').map((r) => r.at)].filter((d) => d && d <= asOf).sort();
    const meta = [{ as_of: asOf, period_start: dates.length ? dates[0].slice(0, 4) + '-01-01' : asOf, period_end: dates.length ? dates[dates.length - 1] : asOf, sample: st.sample ? 1 : 0 }];
    return { depts: deptsOut, employees, training, monthly, legal_weekly, refund, comp_levels, meta };
  }

  /* ───────── 저장 (이 브라우저에만) ───────── */
  const KEY = 'hrd-sme-data-v1';
  const realToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  function today(st) { return st && st.sample ? SAMPLE_TODAY : realToday(); }
  function stale(st) {
    const t = today(st);
    return ORDER.filter((k) => SOURCES[k].cadence).map((k) => {
      const at = st.at && st.at[k], age = at ? daysBetween(at, t) : null;
      return { src: k, at, age, old: age === null || age > SOURCES[k].cadence };
    });
  }

  root.HRD = { LEGAL, SOURCES, ORDER, SAMPLE_AT, SAMPLE_TODAY, KEY, fieldsOf, parseCSV, guessMap, readRows, derive, today, stale, date, yes, legalOf, daysBetween };
  if (typeof module !== 'undefined') module.exports = root.HRD;
})(typeof window !== 'undefined' ? window : globalThis);
