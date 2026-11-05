// 원본 샘플(data/raw)로 계산한 결과가 예전 숫자(_source/legacy)와 같은지 확인합니다.
// 실행: node _source/scripts/verify.js   (hrd-sme 폴더에서)
const fs = require('fs');
const path = require('path');
const HRD = require('../../assets/hrd-data.js');

const root = path.resolve(__dirname, '../..');
const csv = (p) => { const g = HRD.parseCSV(fs.readFileSync(p, 'utf8')); return g.slice(1).map((r) => Object.fromEntries(g[0].map((h, i) => [h, r[i]]))); };
const competencies = csv(path.join(root, 'data/competencies.csv'));

const st = { sample: true, rows: {}, at: HRD.SAMPLE_AT };
for (const k of [...HRD.ORDER, 'notices']) {
  const grid = HRD.parseCSV(fs.readFileSync(path.join(root, 'data/raw', HRD.SOURCES[k].file), 'utf8'));
  const map = HRD.guessMap(HRD.fieldsOf(k, competencies), grid[0]);
  const { rows, skip } = HRD.readRows(k, grid, map, competencies);
  st.rows[k] = rows;
  console.log(k.padEnd(11), rows.length, '줄', skip.length ? `건너뜀 ${skip.length}` : '');
}
const out = HRD.derive(st, competencies);
let bad = 0;
const same = (name, keyCols, cols) => {
  const old = csv(path.join(root, '_source/legacy', name + '.csv'));
  const mine = new Map(out[name].map((r) => [keyCols.map((k) => r[k]).join('|'), r]));
  const diffs = [];
  old.forEach((o) => {
    const k = keyCols.map((c) => o[c]).join('|'), m = mine.get(k);
    if (!m) return diffs.push(`${k}: 없음`);
    cols.forEach((c) => { if (String(Number(o[c]) || o[c]) !== String(Number(m[c]) || m[c])) diffs.push(`${k} ${c}: 예전 ${o[c]} / 지금 ${m[c]}`); });
  });
  if (old.length !== out[name].length) diffs.push(`줄 수: 예전 ${old.length} / 지금 ${out[name].length}`);
  console.log(diffs.length ? '✗' : '✓', name, diffs.length ? diffs.slice(0, 8).join('\n    ') : '');
  bad += diffs.length;
};
same('depts', ['dept'], ['headcount', 'legal_done']);
same('employees', ['emp_id'], ['dept', 'work_type', 'legal_hours', 'miss_harass', 'miss_privacy', 'miss_safety', 'miss_disability', 'miss_pension', 'last_notice']);
same('training', ['dept', 'course'], ['category', 'target', 'done', 'hours', 'cost']);
same('legal_weekly', ['week', 'dept'], ['missing']);
same('refund', ['course'], ['delivery', 'approved', 'status', 'expected', 'paid']);
same('comp_levels', ['dept', 'competency'], ['required', 'current']);

// 만족도: 응답이 1~2명인 칸은 정수 점수로 예전 평균(예: 4.4)을 만들 수 없어 조금 다르다
const oldT = csv(path.join(root, '_source/legacy/training.csv'));
const satOff = oldT.filter((o) => { const m = out.training.find((t) => t.dept === o.dept && t.course === o.course); return m && Math.abs(m.satisfaction - o.satisfaction) > 0.05; });
console.log('· 만족도가 예전과 다른 칸', satOff.length, '/', oldT.length, satOff.map((o) => `${o.dept} ${o.course}(이수 ${o.done}명)`).join(', '));
// 다르게 나와도 되는 것: 계산 방식이 원본 기준으로 바뀐 숫자
const sum = (a, f) => a.reduce((x, r) => x + Number(r[f]), 0);
const oldM = csv(path.join(root, '_source/legacy/monthly.csv'));
console.log('· monthly 시간 합계', sum(oldM, 'hours'), '→', sum(out.monthly, 'hours'), '/ 비용 합계', sum(oldM, 'cost'), '→', sum(out.monthly, 'cost'), '/ 교육비(training) 합계', sum(out.training, 'cost'));
const under = (es) => es.filter((e) => Number(e.other_hours) < 8).length;
console.log('· 사각지대(법정 외 8시간 미만)', under(csv(path.join(root, '_source/legacy/employees.csv'))), '명 →', under(out.employees), '명');
console.log('· 미인정 과정 놓친 금액', out.refund.filter((r) => r.approved === '미인정').map((r) => `${r.course} ${r.missed}`).join(', '));
console.log('· meta', JSON.stringify(out.meta[0]));
process.exit(bad ? 1 : 0);
