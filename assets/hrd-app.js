/* 원본을 불러와 계산해 화면에 넣고, 설정 → 데이터 가져오기 화면을 그린다.
   가져온 데이터는 이 브라우저(localStorage)에만 저장한다. 어디로도 보내지 않는다. */
(function () {
  'use strict';
  const H = window.HRD, SRC = H.SOURCES, C = window.HRDC;
  const OUT = ['depts', 'employees', 'training', 'monthly', 'legal_weekly', 'refund', 'comp_levels', 'meta'];
  const $ = (q, el = document) => el.querySelector(q);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (iso) => (iso ? `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일` : '');
  const fmt = (n) => Number(n).toLocaleString('ko-KR');

  let ST = null;           // { sample, rows, at, files, log }
  let COMPS = [];          // 역량 정의 (data/competencies.csv)
  let IMP = null;          // 가져오는 중인 파일 { src, file, grid, head, hi, map, plan }
  let CUR = 'people';      // 고른 원본
  let SUB = 'import';      // 설정 안의 탭: import(데이터 가져오기) | connect(연결)
  let ERR = '';            // 연결에서 가져오지 못한 이유

  /* ───────── 불러오기·저장 ───────── */
  const objects = (grid) => grid.slice(1).map((r) => Object.fromEntries(grid[0].map((h, i) => [h, r[i]])));
  const text = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.text(); });
  function loadSaved() { try { const v = JSON.parse(localStorage.getItem(H.KEY)); return v && v.rows ? v : null; } catch (e) { return null; } }
  function save() {
    if (ST.sample) { try { localStorage.removeItem(H.KEY); } catch (e) { /* 저장 불가 */ } return true; }
    try { localStorage.setItem(H.KEY, JSON.stringify(ST)); return true; } catch (e) { return false; }
  }
  async function sampleState() {
    const st = { sample: true, rows: {}, at: { ...H.SAMPLE_AT }, files: {}, log: [] };
    await Promise.all([...H.ORDER, 'notices'].map(async (k) => {
      const grid = H.parseCSV(await text('data/raw/' + SRC[k].file));
      st.rows[k] = H.readRows(k, grid, H.guessMap(H.fieldsOf(k, COMPS), grid[0]), COMPS).rows;
      st.files[k] = '예시 데이터';
    }));
    return st;
  }
  function compute() {
    let out;
    try { out = H.derive(ST, COMPS); } catch (e) { console.error(e); OUT.forEach((id) => window.dash.fail(id, e)); return; }
    window.dash.put('competencies', COMPS);
    OUT.forEach((id) => window.dash.put(id, out[id]));
    fresh();
  }
  async function boot() {
    try {
      COMPS = objects(H.parseCSV(await text('data/competencies.csv')));
      ST = loadSaved() || await sampleState();
      compute();
    } catch (e) {
      console.error(e);
      ['competencies', ...OUT].forEach((id) => window.dash.fail(id, e));
    }
    render();
  }

  /* ───────── 기준일 줄 ───────── */
  function fresh() {
    const el = $('#hr-fresh'); if (!el || !ST) return;
    const old = H.stale(ST).filter((x) => x.old);
    el.innerHTML = old.length
      ? old.map((x) => `<button type="button" class="hr-stale" data-go="${x.src}"><span>${esc(SRC[x.src].name)} ${x.at ? `<span class="nw">${x.age}일 전</span>` : '가져온 적 없음'}</span><u>${C.CONN.sources[x.src] ? '지금 가져오기' : '새로 가져오기'}</u></button>`).join('')
      : `<button type="button" class="hr-fresh-ok" data-go="">데이터 모두 최신</button>`;
  }
  function go(src) {
    if (src) { CUR = src; IMP = null; } SUB = 'import'; ERR = '';
    window.hrShowPage('setup'); render(); window.scrollTo({ top: 0 });
    if (src && C.CONN.sources[src]) pullLinked(src); // 연결된 원본은 바로 가져온다
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });

  /* ───────── 설정 → 데이터 가져오기 ───────── */
  function render() {
    const el = $('#setup'); if (!el || !ST) return;
    const nav = `<nav class="im-subtabs" aria-label="설정">${[['import', '데이터 가져오기'], ['connect', '연결']].map(([k, l]) => `<button type="button" data-sub="${k}"${k === SUB ? ' aria-current="page"' : ''}>${l}</button>`).join('')}</nav>`;
    if (SUB === 'connect') { el.innerHTML = nav + connectView(); bind(el); return; }
    const t = H.today(ST), stale = new Map(H.stale(ST).map((x) => [x.src, x]));
    const cards = H.ORDER.map((k) => {
      const m = SRC[k], x = stale.get(k), at = ST.at[k];
      return `<button type="button" class="im-src${k === CUR ? ' is-on' : ''}" data-src="${k}" aria-pressed="${k === CUR}">
        <span class="im-src-name">${m.no} ${esc(m.name)}</span>
        <span class="im-src-meta">${at ? `${md(at)} 가져옴` : '가져온 적 없음'}${ST.files[k] === '예시 데이터' ? ' · 예시' : ''}${C.CONN.sources[k] ? ` · ${C.KIND[C.CONN.sources[k].kind]} 연결` : ''}</span>
        ${x && x.old ? '<span class="im-src-warn">새로 가져오기</span>' : ''}</button>`;
    }).join('');
    el.innerHTML = nav + `
      <div class="hr-takes"><p class="hr-take">
        <span class="hr-line">이미 쓰고 있는 시스템에서 가져와요.</span>
        <span class="hr-line">API·구글 시트·구글 폼은 연결하고,</span>
        <span class="hr-line">나머지는 엑셀을 올려요.</span>
        <span class="hr-line">열 이름이 달라도 <b>자동으로 맞춰요.</b></span>
      </p></div>
      <div class="im-grid">
        <nav class="im-srcs" aria-label="가져올 데이터">${cards}</nav>
        <section class="hr-card im-panel" aria-live="polite">${panel(CUR)}</section>
      </div>
      <section class="hr-card">
        <h2>가져온 기록</h2>
        ${ST.log.length ? `<div class="hr-tablewrap"><table class="hr-table"><thead><tr><th>날짜</th><th>데이터</th><th>파일</th><th class="wrap">결과</th></tr></thead><tbody>
          ${ST.log.slice().reverse().slice(0, 12).map((x) => `<tr><td>${md(x.at)}</td><td>${esc(SRC[x.src].name)}</td><td>${esc(x.file)}</td><td class="wrap">${esc(x.summary)}</td></tr>`).join('')}
          </tbody></table></div>` : `<p class="hr-note"><span class="hr-lead">아직 가져온 파일이 없어요.</span>지금 화면은 예시 데이터로 계산했어요.</p>`}
        <p class="hr-note"><span class="hr-lead">가져온 데이터는 이 브라우저에만 저장돼요.</span>서버로 보내지 않아요. 기준일 ${md(t)}.</p>
        ${ST.sample ? '' : '<div class="im-act"><button type="button" class="im-btn" data-act="reset">예시 데이터로 되돌리기</button></div>'}
      </section>`;
    bind(el);
  }

  function panel(src) {
    const m = SRC[src];
    if (!IMP || IMP.src !== src) IMP = { src };
    const step = !IMP.grid ? 1 : !IMP.plan ? 2 : 3;
    const req = H.fieldsOf(src, COMPS).filter((f) => f[2]).map((f) => `<i>${esc(f[1])}</i>`).join('');
    return `
      <h2>${m.no} ${esc(m.name)}</h2>
      <dl class="im-kv"><dt>어디서</dt><dd>${esc(m.from)}</dd><dt>누가</dt><dd>${esc(m.who)}</dd><dt>언제</dt><dd>${esc(m.when)}</dd>
        <dt>같은 사람 판단</dt><dd>${esc(m.match)}</dd><dt>반영되는 것</dt><dd>${esc(m.does)}</dd></dl>
      <ol class="im-steps"><li class="${step >= 1 ? 'is-on' : ''}">파일 올리기</li><li class="${step >= 2 ? 'is-on' : ''}">열 맞추기</li><li class="${step >= 3 ? 'is-on' : ''}">바뀌는 내용 확인</li></ol>
      ${ERR ? `<p class="im-err" role="alert">${esc(ERR)}</p>` : ''}
      ${step === 1 ? `
        ${linkedBar(src)}
        <p class="im-req">꼭 있어야 하는 열 ${req}</p>
        <label class="im-drop" id="im-drop" for="im-file">
          <input type="file" id="im-file" class="im-sr" accept=".xlsx,.xls,.csv,.tsv,.txt">
          <span class="im-drop-title">엑셀 파일을 여기에 끌어다 놓으세요</span>
          <span class="im-drop-sub">또는 <u>눌러서 파일 고르기</u> <span class="nw">(.xlsx, .csv)</span></span>
        </label>
        <div class="im-alts">
          <button type="button" class="im-alt" data-act="sample"><b>샘플 엑셀 받기</b><span>지금 화면 숫자와 맞물린 파일이에요. 고쳐서 올리면 숫자가 바뀌어요.</span></button>
          <button type="button" class="im-alt" data-act="paste-toggle" aria-expanded="false" aria-controls="im-paste-box"><b>엑셀에서 복사해 붙여넣기</b><span>파일 없이 표를 복사해서 바로 넣어요.</span></button>
          ${m.links.length ? `<button type="button" class="im-alt" data-act="link-toggle" aria-expanded="false" aria-controls="im-link-box"><b>${m.links.map((k) => C.KIND[k]).join('·')}로 연결</b><span>한 번 연결하면 다음부터 버튼 한 번으로 가져와요.</span></button>` : ''}
        </div>
        ${m.links.length ? linkBox(src) : `<p class="hr-note"><span class="hr-lead">연결할 수 있는 API가 없어요.</span>${esc(m.linkNote || '')}</p>`}
        <div id="im-paste-box" class="im-paste" hidden>
          <textarea id="im-paste" rows="6" placeholder="엑셀에서 머리글 줄까지 선택해 복사(Ctrl+C)한 뒤 여기에 붙여넣으세요(Ctrl+V)"></textarea>
          <div class="im-act"><button type="button" class="im-btn is-primary" data-act="paste">붙여넣은 내용 읽기</button></div>
        </div>`
      : step === 2 ? mapping(src) : planView()}`;
  }

  /* ───────── 연결 (Google 시트, Google 폼, 시스템 API) ───────── */
  function linkedBar(src) {
    const c = C.CONN.sources[src]; if (!c) return '';
    const url = c.url.length > 64 ? c.url.slice(0, 61) + '…' : c.url;
    return `<div class="im-linked"><div><b>${C.KIND[c.kind]}에 연결됨</b><span class="im-src-meta">${esc(url)}${c.at ? ` · 마지막 ${md(c.at)}` : ''}</span></div>
      <div class="im-act"><button type="button" class="im-btn is-primary" data-act="link-pull">지금 가져오기</button><button type="button" class="im-btn" data-act="link-cut">연결 끊기</button></div></div>`;
  }
  const URL_LABEL = { sheet: '시트 주소', form: '폼 편집 화면 주소', api: 'API 주소' };
  function linkBox(src) {
    const m = SRC[src], k0 = m.links[0];
    const PH = { sheet: 'https://docs.google.com/spreadsheets/d/…', form: 'https://docs.google.com/forms/d/…/edit', api: 'https://hr.회사.com/api/v1/employees' };
    return `<div id="im-link-box" class="im-link" hidden>
      <p class="hr-note">${esc(m.linkNote || '')}</p>
      ${m.links.length > 1 ? `<div class="im-seg" role="radiogroup" aria-label="연결 방식">${m.links.map((k) => `<label><input type="radio" name="im-kind" value="${k}"${k === k0 ? ' checked' : ''}>${C.KIND[k]}</label>`).join('')}</div>` : `<input type="hidden" name="im-kind" value="${k0}">`}
      <label class="im-fld"><span id="im-url-label">${URL_LABEL[k0]}</span><input id="im-url" autocomplete="off" spellcheck="false" placeholder="${PH[k0]}" data-ph="${esc(JSON.stringify(PH))}"></label>
      <div class="im-api"${k0 === 'api' ? '' : ' hidden'}>
        <label class="im-fld"><span>인증 헤더</span><textarea id="im-header" rows="2" placeholder="Authorization: Bearer 발급받은-키"></textarea></label>
        <label class="im-fld"><span>목록 위치 <span class="hr-sec">(비우면 자동으로 찾아요)</span></span><input id="im-path" placeholder="예: data.employees"></label>
        ${m.demo ? '<div class="im-act"><button type="button" class="im-btn" data-act="link-demo">예시 API 주소 넣기</button></div>' : ''}
      </div>
      <p class="hr-note im-hint" data-kind="sheet"${k0 === 'sheet' ? '' : ' hidden'}><span class="hr-lead">회사 계정 안에서만 공유한 시트도 읽을 수 있어요.</span>설정 → 연결에서 Google을 먼저 연결하세요.</p>
      <p class="hr-note im-hint" data-kind="form"${k0 === 'form' ? '' : ' hidden'}><span class="hr-lead">폼 응답은 Google 연결이 있어야 읽을 수 있어요.</span>설정 → 연결에서 Google을 먼저 연결하세요.</p>
      <label class="im-check"><input type="checkbox" id="im-keep" checked> 연결 저장 <span class="hr-sec">(다음부터 버튼 한 번)</span></label>
      <div class="im-act"><button type="button" class="im-btn is-primary" data-act="link-load">가져오기</button></div>
    </div>`;
  }
  function pullLinked(src, cfg, keep) {
    cfg = cfg || C.CONN.sources[src];
    ERR = ''; IMP = { src, linking: true }; toast('불러오는 중이에요…');
    return C.pull(cfg).then((grid) => {
      if (keep) { C.CONN.sources[src] = { ...(C.CONN.sources[src] || {}), ...cfg, at: H.today({}) }; C.save(); }
      else if (C.CONN.sources[src]) { C.CONN.sources[src].at = H.today({}); C.save(); }
      IMP.saved = (C.CONN.sources[src] || {}).map;
      loadGrid(grid, C.KIND[cfg.kind]);
    }).catch((e) => { ERR = e.message; IMP = { src }; render(); });
  }
  function connectView() {
    const g = C.CONN.google;
    const rows = H.ORDER.map((k) => { const c = C.CONN.sources[k], m = SRC[k];
      return `<tr><td>${m.no} ${esc(m.name)}</td><td>${c ? `${C.KIND[c.kind]}${c.at ? ` · ${md(c.at)} 가져옴` : ''}` : '<span class="hr-sec">파일로 올림</span>'}</td><td class="wrap">${m.links.length ? m.links.map((x) => C.KIND[x]).join(', ') : '파일만 (API 없음)'}</td></tr>`; }).join('');
    return `
      <div class="hr-takes"><p class="hr-take">
        <span class="hr-line">Google을 연결하면</span>
        <span class="hr-line">회사 안에서만 공유한 시트와</span>
        <span class="hr-line">구글 폼 응답을 <b>바로 읽어요.</b></span>
      </p></div>
      <section class="hr-card">
        <h2>Google <span class="im-tag${g.ok ? ' is-ok' : ''}">${g.clientId ? (g.ok ? '연결됨' : 'Client ID 저장됨') : '연결 안 됨'}</span></h2>
        <p class="hr-note"><span class="hr-lead">구글 시트와 구글 폼 응답을 읽는 데 써요.</span>읽기 권한만 요청해요. 시트나 폼을 고치지 않아요.</p>
        <label class="im-fld"><span>OAuth Client ID</span><input id="im-gclient" value="${esc(g.clientId)}" placeholder="1234-abcd.apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label>
        <div class="im-act"><button type="button" class="im-btn is-primary" data-act="g-save">저장하고 로그인 시험</button></div>
        <details class="im-howto"><summary>Client ID 만드는 법</summary><ol>
          <li>Google Cloud 콘솔에서 프로젝트를 만들고 <b>Google Sheets API</b>와 <b>Google Forms API</b>를 사용 설정해요.</li>
          <li>OAuth 동의 화면을 만들고, 테스트 사용자에 본인 계정을 넣어요.</li>
          <li>사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션을 골라요.</li>
          <li>승인된 JavaScript 원본에 <code>${esc(location.origin)}</code>를 넣고, 만들어진 Client ID를 붙여넣어요.</li>
        </ol><p class="hr-note">비밀 키(Client Secret)는 필요 없어요.</p></details>
      </section>
      <section class="hr-card">
        <h2>원본별 연결</h2>
        <div class="hr-tablewrap"><table class="hr-table"><thead><tr><th>원본</th><th>지금</th><th class="wrap">연결할 수 있는 곳</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="hr-note"><span class="hr-lead">연결은 데이터 가져오기 탭에서 원본마다 해요.</span>연결 정보는 이 브라우저에만 저장되고, 예시 데이터로 되돌려도 남아요.</p>
      </section>`;
  }

  /* 2단계: 열 맞추기 */
  function pickHeader(src, grid) { // 제목 줄이 위에 있는 파일도 있어서, 앞 10줄 중 가장 많이 맞는 줄을 머리글로 본다
    const fields = H.fieldsOf(src, COMPS);
    let best = 0, score = -1;
    grid.slice(0, 10).forEach((r, i) => { const n = Object.keys(H.guessMap(fields, r.map((c) => String(c)))).length; if (n > score) { score = n; best = i; } });
    return best;
  }
  function loadGrid(grid, name) {
    grid = grid.filter((r) => r.some((c) => String(c == null ? '' : c).trim() !== ''));
    const hi = grid.length ? pickHeader(IMP.src, grid) : 0;
    grid = grid.slice(hi);
    if (grid.length < 2) { toast('머리글 줄과 데이터가 있어야 해요.'); return; }
    Object.assign(IMP, { file: name, grid, head: grid[0].map((c) => String(c == null ? '' : c)), map: null, plan: null });
    IMP.map = H.guessMap(H.fieldsOf(IMP.src, COMPS), IMP.head);
    // 연결에서 가져올 때 지난번에 맞춘 열 이름이 그대로 있으면 열 맞추기를 건너뛴다
    const saved = IMP.saved;
    if (saved) {
      Object.entries(saved).forEach(([k, h]) => { const i = IMP.head.indexOf(h); if (i >= 0) IMP.map[k] = i; });
      const ok = H.fieldsOf(IMP.src, COMPS).every((f) => !f[2] || IMP.map[f[0]] !== undefined);
      if (ok) { makePlan(); return; }
    }
    render();
  }
  function mapping(src) {
    const fields = H.fieldsOf(src, COMPS), first = IMP.grid[1] || [];
    const cell = (v) => (v instanceof Date ? H.date(v) : String(v == null ? '' : v));
    return `<p class="hr-note"><span class="hr-lead"><b>${esc(IMP.file)}</b> · ${fmt(IMP.grid.length - 1)}줄을 읽었어요.</span>각 항목이 파일의 어느 열인지 확인하세요. 자동으로 맞춘 결과예요.</p>
      <div class="hr-tablewrap"><table class="hr-table im-map"><thead><tr><th>대시보드 항목</th><th>파일의 열</th><th class="hr-sec">첫 줄 값</th></tr></thead><tbody>
      ${fields.map(([k, l, req]) => { const i = IMP.map[k]; return `<tr><th scope="row">${esc(l)}${req ? ' <span class="hr-bad">*</span>' : ''}</th>
        <td><select data-map="${esc(k)}"><option value="">— 없음 —</option>${IMP.head.map((h, j) => `<option value="${j}"${i === j ? ' selected' : ''}>${esc(h)}</option>`).join('')}</select></td>
        <td class="hr-sec">${i === undefined ? '' : esc(cell(first[i]))}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="im-act"><button type="button" class="im-btn" data-act="again">다른 파일</button><span class="im-grow"></span><button type="button" class="im-btn is-primary" data-act="plan">바뀌는 내용 보기</button></div>`;
  }

  /* 3단계: 바뀌는 내용 */
  function makePlan() {
    const src = IMP.src, fields = H.fieldsOf(src, COMPS);
    const miss = fields.filter((f) => f[2] && IMP.map[f[0]] === undefined).map((f) => f[1]);
    if (miss.length) { toast('꼭 있어야 하는 열을 골라 주세요: ' + miss.join(', ')); return; }
    const { rows, skip } = H.readRows(src, IMP.grid, IMP.map, COMPS);
    const before = H.derive(ST, COMPS);
    const next = { ...ST, rows: { ...ST.rows, [src]: rows }, at: { ...ST.at, [src]: src === 'legal' ? H.today({}) : ST.at[src] } };
    const after = H.derive(next, COMPS);
    const p = { rows, skip, groups: [] };
    const G = (title, list, cls) => { if (list.length) p.groups.push({ title, list, cls }); };
    const people = new Map((ST.rows.people || []).map((r) => [r.emp, r]));
    const empB = new Map(before.employees.map((e) => [e.emp_id, e])), empA = new Map(after.employees.map((e) => [e.emp_id, e]));
    if (src === 'people') {
      G('새 직원', after.employees.filter((e) => !empB.has(e.emp_id)).map((e) => `${e.emp_id} · ${e.dept} · 법정 5과목 대상에 추가`), 'is-add');
      G('퇴사·명단에서 빠짐', before.employees.filter((e) => !empA.has(e.emp_id)).map((e) => `${e.emp_id} · ${e.dept} · 남은 안내 종료`), 'is-bad');
      G('부서 이동', after.employees.filter((e) => empB.has(e.emp_id) && empB.get(e.emp_id).dept !== e.dept).map((e) => `${e.emp_id} · ${empB.get(e.emp_id).dept} → ${e.dept}`));
    }
    if (src === 'legal') {
      const done = [], undone = [];
      after.employees.forEach((e) => { const b = empB.get(e.emp_id); if (!b) return; H.LEGAL.forEach((l) => { if (b[l.col] && !e[l.col]) done.push(`${e.emp_id} · ${l.short}`); if (!b[l.col] && e[l.col]) undone.push(`${e.emp_id} · ${l.short}`); }); });
      G('새로 수료', done, 'is-add');
      G('수료가 사라짐', undone, 'is-bad');
      const active = new Set(after.employees.map((e) => e.emp_id));
      G('인사 명단에 없는 수강생 ID', [...new Set(rows.filter((r) => !active.has(r.emp)).map((r) => r.emp + (people.get(r.emp) && /퇴/.test(people.get(r.emp).state) ? ' · 퇴사자라 빠져요' : ' · 사번이 맞는지 확인하세요')))], 'is-skip');
      p.note = `반영하면 마감 대응의 기준일이 오늘(${md(H.today({}))})로 바뀌고, 미이수자는 ${fmt(after.employees.filter((e) => H.LEGAL.some((l) => e[l.col])).length)}명이 돼요.`;
    }
    if (src === 'ledger') {
      const sig = (r) => [r.emp, r.course, r.at, H.yes(r.result), r.cost].join('|');
      const old = new Set((ST.rows.ledger || []).map(sig)), now = new Set(rows.map(sig));
      G('새로 생긴 줄', rows.filter((r) => !old.has(sig(r))).map((r) => `${r.emp || '과정 비용'} · ${r.course} · ${md(r.at)}${r.cost ? ` · ${fmt(r.cost)}만원` : ''}`), 'is-add');
      G('없어진 줄', (ST.rows.ledger || []).filter((r) => !now.has(sig(r))).map((r) => `${r.emp || '과정 비용'} · ${r.course} · ${md(r.at)}`), 'is-bad');
      const sum = (o, f) => o.training.reduce((a, t) => a + Number(t[f]) * (f === 'hours' ? Number(t.done) : 1), 0);
      p.note = `교육시간 ${fmt(sum(before, 'hours'))} → ${fmt(sum(after, 'hours'))}시간, 교육비 ${fmt(sum(before, 'cost'))} → ${fmt(sum(after, 'cost'))}만원이 돼요.`;
    }
    if (src === 'survey') {
      const known = new Set(after.training.map((t) => t.course));
      p.note = `응답 ${fmt((ST.rows.survey || []).length)} → ${fmt(rows.length)}건이 돼요.`;
      G('대장에 없는 과정명', [...new Set(rows.filter((r) => !known.has(r.course) && !H.legalOf(r.course)).map((r) => r.course))], 'is-skip');
    }
    if (src === 'refund') {
      G('환급 상태 바뀜', after.refund.filter((r) => { const b = before.refund.find((x) => x.course === r.course); return b && (b.status !== r.status || b.paid !== r.paid); })
        .map((r) => { const b = before.refund.find((x) => x.course === r.course); return `${r.course} · ${b.status} → ${r.status}${r.paid !== b.paid ? ` · 지급 ${fmt(r.paid)}만원` : ''}`; }), 'is-add');
    }
    if (src === 'competency') {
      const mails = new Set((ST.rows.people || []).map((r) => String(r.email).toLowerCase()));
      p.note = `응답 ${fmt(rows.length)}건으로 부서 × 역량 ${fmt(after.comp_levels.length)}칸을 계산해요.`;
      G('인사 명단에 없는 이메일', [...new Set(rows.filter((r) => !mails.has(String(r.email).toLowerCase())).map((r) => r.email))], 'is-skip');
    }
    IMP.plan = p;
    render();
  }
  function planView() {
    const p = IMP.plan, cut = 40;
    const sec = (g) => `<details class="im-group ${g.cls || ''}"${g.list.length <= 8 ? ' open' : ''}><summary><b>${esc(g.title)}</b> <span class="nw">${fmt(g.list.length)}건</span></summary>
      <ul>${g.list.slice(0, cut).map((x) => `<li>${esc(x)}</li>`).join('')}${g.list.length > cut ? `<li class="hr-note">외 ${fmt(g.list.length - cut)}건</li>` : ''}</ul></details>`;
    return `<p class="hr-note"><span class="hr-lead">아직 반영하지 않았어요.</span>${IMP.linking ? '가져온 데이터가' : '올린 파일이'} 이 데이터 전체를 바꿔요. 아래 내용을 확인하고 반영하기를 누르세요.</p>
      ${p.note ? `<p class="im-sum">${esc(p.note)}</p>` : ''}
      ${p.groups.map(sec).join('')}
      ${p.skip.length ? sec({ title: '건너뜀', list: p.skip.map((x) => `${x.row} · ${x.why}`), cls: 'is-skip' }) : ''}
      ${!p.groups.length && !p.note ? '<p class="hr-note">화면 숫자가 바뀌는 내용은 없어요.</p>' : ''}
      <div class="im-act"><button type="button" class="im-btn" data-act="back">열 다시 맞추기</button><span class="im-grow"></span>
        <button type="button" class="im-btn is-primary" data-act="apply"${p.rows.length ? '' : ' disabled'}>반영하기 <span class="nw">(${fmt(p.rows.length)}줄)</span></button></div>`;
  }
  function apply() {
    const { src, file } = IMP, p = IMP.plan;
    const keep = JSON.stringify(ST);
    ST.sample = false;
    ST.rows[src] = p.rows; ST.at[src] = H.today({}); ST.files[src] = file;
    const summary = [`${fmt(p.rows.length)}줄 반영`, ...p.groups.map((g) => `${g.title} ${fmt(g.list.length)}`), p.skip.length ? `건너뜀 ${fmt(p.skip.length)}` : ''].filter(Boolean).join(' · ');
    ST.log.push({ at: H.today({}), src, file, summary });
    if (!save()) { ST = JSON.parse(keep); toast('이 브라우저에 저장할 수 없어서 반영하지 못했어요.'); return; }
    if (IMP.linking && C.CONN.sources[src]) { C.CONN.sources[src].map = Object.fromEntries(Object.entries(IMP.map).map(([k, i]) => [k, IMP.head[i]])); C.save(); }
    IMP = null; compute(); render();
    toast(`${SRC[src].name}을 반영했어요.`);
  }

  /* 파일 읽기 */
  function readFile(file) {
    const isCsv = /\.(csv|tsv|txt)$/i.test(file.name), reader = new FileReader();
    reader.onload = () => {
      try {
        let grid;
        if (!isCsv && window.XLSX) {
          const wb = window.XLSX.read(reader.result, { type: 'array', cellDates: true });
          grid = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
        } else grid = H.parseCSV(typeof reader.result === 'string' ? reader.result : new TextDecoder('utf-8').decode(reader.result));
        loadGrid(grid, file.name);
      } catch (e) { console.error(e); toast('파일을 읽지 못했어요. 엑셀(.xlsx)이나 CSV인지 확인하세요.'); }
    };
    if (!isCsv && window.XLSX) reader.readAsArrayBuffer(file); else reader.readAsText(file, 'utf-8');
  }
  async function downloadSample(src) {
    const m = SRC[src];
    try {
      const raw = await text('data/raw/' + m.file);
      if (window.XLSX) {
        const ws = window.XLSX.utils.aoa_to_sheet(H.parseCSV(raw));
        const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, m.name.slice(0, 30));
        window.XLSX.writeFile(wb, m.sample);
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + raw.replace(/^﻿/, '')], { type: 'text/csv' }));
        a.download = m.sample.replace(/\.xlsx$/, '.csv'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } catch (e) { toast('샘플 파일을 받지 못했어요.'); }
  }

  function bind(el) {
    el.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => { CUR = b.dataset.src; IMP = null; ERR = ''; render(); }));
    el.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { SUB = b.dataset.sub; ERR = ''; render(); }));
    el.querySelectorAll('[name=im-kind]').forEach((r) => r.addEventListener('change', () => {
      const k = r.value, ph = JSON.parse($('#im-url', el).dataset.ph);
      $('#im-url', el).placeholder = ph[k];
      $('#im-url-label', el).textContent = { sheet: '시트 주소', form: '폼 편집 화면 주소', api: 'API 주소' }[k];
      $('.im-api', el).hidden = k !== 'api';
      el.querySelectorAll('.im-hint').forEach((h) => { h.hidden = h.dataset.kind !== k; });
    }));
    const f = $('#im-file', el), drop = $('#im-drop', el);
    if (f) f.addEventListener('change', () => f.files[0] && readFile(f.files[0]));
    if (drop) {
      ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-hover'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-hover')));
      drop.addEventListener('drop', (e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) readFile(file); });
    }
    el.querySelectorAll('[data-map]').forEach((s) => s.addEventListener('change', () => {
      if (s.value === '') delete IMP.map[s.dataset.map]; else IMP.map[s.dataset.map] = Number(s.value);
      render();
    }));
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'sample') downloadSample(IMP.src);
      if (a === 'paste-toggle') { const box = $('#im-paste-box', el); box.hidden = !box.hidden; b.setAttribute('aria-expanded', String(!box.hidden)); if (!box.hidden) $('#im-paste', el).focus(); }
      if (a === 'link-toggle') { const box = $('#im-link-box', el); box.hidden = !box.hidden; b.setAttribute('aria-expanded', String(!box.hidden)); if (!box.hidden) $('#im-url', el).focus(); }
      if (a === 'link-demo') { $('#im-url', el).value = new URL(SRC[IMP.src].demo, location.href).href; $('#im-header', el).value = 'Authorization: Bearer demo-key'; }
      if (a === 'link-load') {
        const kind = (el.querySelector('[name=im-kind]:checked') || el.querySelector('[name=im-kind]')).value, url = $('#im-url', el).value.trim();
        if (!url) { toast('주소를 넣어 주세요.'); return; }
        const cfg = { kind, url, header: kind === 'api' ? $('#im-header', el).value : '', path: kind === 'api' ? $('#im-path', el).value.trim() : '' };
        pullLinked(IMP.src, cfg, $('#im-keep', el).checked);
      }
      if (a === 'link-pull') pullLinked(IMP.src);
      if (a === 'link-cut') { delete C.CONN.sources[IMP.src]; C.save(); render(); fresh(); toast('연결을 끊었어요. 파일로 올리는 방법은 그대로 쓸 수 있어요.'); }
      if (a === 'g-save') {
        C.CONN.google.clientId = $('#im-gclient', el).value.trim(); delete C.CONN.google.ok; C.save();
        if (!C.CONN.google.clientId) { render(); toast('Client ID를 지웠어요.'); return; }
        C.token(true).then(() => { render(); toast('Google에 연결됐어요.'); }, (e) => { render(); toast(e.message); });
      }
      if (a === 'paste') { const v = $('#im-paste', el).value; if (!v.trim()) { toast('붙여넣은 내용이 없어요.'); return; } loadGrid(H.parseCSV(v), '붙여넣은 표'); }
      if (a === 'again') { IMP = { src: IMP.src }; render(); }
      if (a === 'plan') makePlan();
      if (a === 'back') { IMP.plan = null; render(); }
      if (a === 'apply') apply();
      if (a === 'reset') {
        if (!window.confirm('가져온 데이터를 모두 지우고 예시 데이터로 되돌릴까요?')) return;
        try { localStorage.removeItem(H.KEY); } catch (e) { /* 무시 */ }
        sampleState().then((st) => { ST = st; IMP = null; compute(); render(); toast('예시 데이터로 되돌렸어요.'); });
      }
    }));
  }

  let tt;
  function toast(msg) {
    let t = $('#hr-toast');
    if (!t) { t = document.createElement('div'); t.id = 'hr-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('is-on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('is-on'), 3200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
