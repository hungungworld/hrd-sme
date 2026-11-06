/* 외부 연결 — Google 시트, Google 폼(Forms API), 시스템 API(JSON)에서 원본 가져오기
   온보딩 대시보드(../onboarding_dashborad/js/connect.js)와 같은 방식이다.
   연결 정보는 이 브라우저(localStorage)에만 저장하고, 데이터와 따로 둬서 예시 데이터로 되돌려도 남는다. */
(function () {
  'use strict';
  const KEY = 'hrd-sme-connections';
  const CONN = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  CONN.google = CONN.google || { clientId: '' };
  CONN.sources = CONN.sources || {}; // { 원본: { kind: 'sheet'|'api'|'form', url, header, path, map: {키: 열 이름}, at } }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(CONN)); } catch (e) { /* 저장 불가 */ } };

  /* ───────── Google 로그인 (Google Identity Services, 무료) ───────── */
  const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/forms.body.readonly https://www.googleapis.com/auth/forms.responses.readonly';
  let TOKEN = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = ok; s.onerror = () => no(new Error('Google 로그인 스크립트를 불러오지 못했어요. 인터넷 연결을 확인하세요.'));
      document.head.appendChild(s);
    });
  }
  if (CONN.google.clientId) loadGis().catch(() => {}); // 버튼을 누를 때 팝업이 막히지 않게 미리 불러 둔다
  function token(force) {
    if (!force && TOKEN && TOKEN.exp > Date.now() + 60000) return Promise.resolve(TOKEN.token);
    if (!CONN.google.clientId) return Promise.reject(new Error('Google이 연결되어 있지 않아요. 설정 → 연결에서 Client ID를 넣어 주세요.'));
    return loadGis().then(() => new Promise((ok, no) => {
      google.accounts.oauth2.initTokenClient({
        client_id: CONN.google.clientId, scope: SCOPES,
        callback: (r) => {
          if (r.error) return no(new Error('Google 연결이 거절됐어요 (' + r.error + ').'));
          TOKEN = { token: r.access_token, exp: Date.now() + Number(r.expires_in || 3600) * 1000 };
          CONN.google.ok = new Date().toISOString().slice(0, 10); save(); ok(r.access_token);
        },
        error_callback: (e) => no(new Error(e && e.type === 'popup_closed' ? 'Google 로그인 창이 닫혔어요.' : 'Google 로그인 창을 열지 못했어요. 팝업 차단을 풀어 주세요.')),
      }).requestAccessToken();
    }));
  }
  const gget = (url) => token().then((tk) => fetch(url, { headers: { Authorization: 'Bearer ' + tk } }))
    .then((r) => r.json().catch(() => ({})).then((j) => { if (!r.ok || j.error) throw new Error((j.error && j.error.message) || String(r.status)); return j; }));

  /* ───────── Google 시트 ───────── */
  function sheetIds(url) {
    const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url), g = /[#&?]gid=(\d+)/.exec(url);
    return m ? { id: m[1], gid: g ? g[1] : '0' } : null;
  }
  function fetchSheet(url) {
    const ids = sheetIds(url);
    if (!ids) return Promise.reject(new Error('Google 시트 주소가 아니에요. 시트를 열었을 때 주소창의 주소를 그대로 붙여넣으세요.'));
    // 1) "링크가 있는 모든 사용자" 공유 시트는 로그인 없이 CSV로 읽는다
    const pub = `https://docs.google.com/spreadsheets/d/${ids.id}/gviz/tq?tqx=out:csv&gid=${ids.gid}`;
    return fetch(pub).then((r) => { if (!r.ok) throw new Error('private'); return r.text(); })
      .then((t) => { if (/^\s*<!DOCTYPE|<html/i.test(t)) throw new Error('private'); return window.HRD.parseCSV(t); })
      .catch(() => {
        // 2) 회사 안에서만 공유한 시트는 Google 연결(Sheets API)로 읽는다
        if (!CONN.google.clientId) throw new Error('시트를 읽을 수 없어요. 설정 → 연결에서 Google을 연결하면 회사 계정 안에서만 공유한 시트도 읽을 수 있어요.');
        const api = `https://sheets.googleapis.com/v4/spreadsheets/${ids.id}`;
        return gget(api + '?fields=sheets.properties').then((j) => {
          const sh = (j.sheets || []).find((x) => String(x.properties.sheetId) === ids.gid) || j.sheets[0];
          return gget(api + '/values/' + encodeURIComponent(sh.properties.title) + '?valueRenderOption=FORMATTED_VALUE');
        }).then((j) => j.values || []).catch((e) => { throw new Error('Google 시트를 읽지 못했어요: ' + e.message); });
      });
  }

  /* ───────── Google 폼 (Forms API): 응답을 문항 제목을 머리글로 한 표로 ───────── */
  function formId(v) {
    const m = /\/forms\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/.exec(v);
    if (m && /\/forms\/d\/e\//.test(v)) return { err: '응답자용 링크(/d/e/…)예요. 폼 편집 화면 주소(/forms/d/…/edit)를 붙여넣으세요.' };
    return m ? { id: m[1] } : /^[a-zA-Z0-9-_]{20,}$/.test(v.trim()) ? { id: v.trim() } : { err: 'Google 폼 주소가 아니에요. 폼 편집 화면의 주소를 붙여넣으세요.' };
  }
  async function fetchForm(url) {
    const f = formId(url);
    if (f.err) throw new Error(f.err);
    const base = 'https://forms.googleapis.com/v1/forms/' + f.id;
    try {
      const form = await gget(base);
      const qs = (form.items || []).filter((it) => it.questionItem).map((it) => ({ id: it.questionItem.question.questionId, title: it.title || '' }));
      let list = [], next = '';
      do {
        const j = await gget(base + '/responses' + (next ? '?pageToken=' + encodeURIComponent(next) : ''));
        list = list.concat(j.responses || []); next = j.nextPageToken || '';
      } while (next);
      const val = (r, id) => { const a = r.answers && r.answers[id]; return a && a.textAnswers ? a.textAnswers.answers.map((x) => x.value).join(', ') : ''; };
      const hasMail = list.some((r) => r.respondentEmail);
      const head = ['타임스탬프', ...(hasMail ? ['이메일'] : []), ...qs.map((q) => q.title)];
      return [head, ...list.map((r) => [(r.lastSubmittedTime || r.createTime || '').slice(0, 10), ...(hasMail ? [r.respondentEmail || ''] : []), ...qs.map((q) => val(r, q.id))])];
    } catch (e) { throw new Error('Google 폼을 읽지 못했어요: ' + e.message); }
  }

  /* ───────── 시스템 API (JSON) ───────── */
  function fetchApi(cfg) {
    const headers = {};
    String(cfg.header || '').split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) headers[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    return fetch(cfg.url, { headers })
      .catch(() => { throw new Error('API에 접속하지 못했어요. 주소가 맞는지, 그 시스템이 브라우저 호출(CORS)을 허용하는지 확인하세요. 막혀 있으면 시스템 관리자에게 이 대시보드 주소(' + location.origin + ') 허용을 요청하거나, Google 시트로 내보내 연결하세요.'); })
      .then((r) => { if (!r.ok) throw new Error('API가 오류를 돌려줬어요 (' + r.status + '). 주소와 인증 헤더를 확인하세요.'); return r.json(); })
      .then((j) => {
        let list = j;
        String(cfg.path || '').split('.').filter(Boolean).forEach((k) => { list = list == null ? list : list[k]; });
        if (!Array.isArray(list)) {
          // 목록 위치를 비워 두면 응답 안에서 가장 먼저 나오는 목록을 찾는다
          const find = (o, d) => { if (Array.isArray(o)) return o; if (!o || typeof o !== 'object' || d > 3) return null; for (const k of Object.keys(o)) { const x = find(o[k], d + 1); if (x) return x; } return null; };
          list = cfg.path ? null : find(j, 0);
        }
        if (!Array.isArray(list)) throw new Error('응답에서 목록을 찾지 못했어요. "목록 위치"에 목록이 들어 있는 항목 이름(예: data 또는 data.items)을 넣어 주세요.');
        if (!list.length) return [];
        if (Array.isArray(list[0])) return list;
        // 값이 안쪽에 들어 있는 응답(예: dept.name)은 점으로 이은 열 이름으로 펼친다
        const flat = (o, pre, out) => { Object.keys(o || {}).forEach((k) => { const v = o[k], key = pre ? pre + '.' + k : k;
          if (v && typeof v === 'object' && !Array.isArray(v) && key.split('.').length < 4) flat(v, key, out);
          else out[key] = Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.name || x.value || JSON.stringify(x) : x)).join(', ') : v; }); return out; };
        const rows = list.map((o) => flat(o, '', {}));
        const keys = [...new Set(rows.flatMap((o) => Object.keys(o)))];
        return [keys, ...rows.map((o) => keys.map((k) => (o[k] == null ? '' : o[k])))];
      });
  }

  function pull(cfg) {
    const job = cfg.kind === 'api' ? fetchApi(cfg) : cfg.kind === 'form' ? fetchForm(cfg.url) : fetchSheet(cfg.url);
    return job.then((grid) => {
      // 오른쪽의 빈 열은 잘라 낸다
      let w = Math.max(0, ...grid.map((r) => r.length));
      while (w > 0 && grid.every((r) => String(r[w - 1] == null ? '' : r[w - 1]).trim() === '')) w--;
      return grid.map((r) => r.slice(0, w));
    });
  }
  const KIND = { sheet: 'Google 시트', form: 'Google 폼', api: '시스템 API' };

  window.HRDC = { CONN, save, token, pull, sheetIds, formId, KIND };
})();
