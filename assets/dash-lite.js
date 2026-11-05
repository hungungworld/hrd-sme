// 대시보드 페이지가 쓰는 dash API를 브라우저만으로 돌리는 작은 런타임입니다.
// 각 페이지는 window.DASH_SOURCES = { 데이터id: 'CSV 경로' } 를 먼저 정의합니다.
(function () {
  const sources = window.DASH_SOURCES || {};
  const store = {};      // 데이터id → { status, data, columns }
  const calcs = {};      // 계산id → { inputs, fn }
  const memo = {};       // 계산 결과
  const draws = {};      // 이름 → [fn]
  const dataFns = [];
  const widths = new WeakMap();
  const KEY = 'dash-params:' + location.pathname;

  let params = {};
  try { params = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { params = {}; }

  const pending = () => ({ status: 'loading', data: [], columns: [], refreshing: false, meta: [] });
  // 계산해서 넣을 데이터(window.DASH_PENDING)는 들어올 때까지 '불러오는 중'으로 둡니다.
  (window.DASH_PENDING || []).forEach((id) => { store[id] = pending(); });

  Object.keys(sources).forEach((id) => {
    store[id] = pending();
    fetch(sources[id])
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then((text) => {
        const rows = d3.csvParse(text.replace(/^﻿/, ''));
        store[id] = { status: 'ok', data: rows.slice(), columns: rows.columns, refreshing: false, meta: [] };
        Object.keys(memo).forEach((k) => delete memo[k]);
        schedule();
      })
      .catch((err) => {
        store[id] = { status: 'error', data: [], columns: [], message: String(err), refreshing: false, meta: [] };
        schedule();
      });
  });

  const data = (id) => {
    if (store[id]) return store[id];
    const c = calcs[id];
    if (!c) return { status: 'missing', data: [], columns: [], refreshing: false, meta: [] };
    if (memo[id]) return memo[id];
    const ins = c.inputs.map(data);
    if (ins.some((d) => d.status === 'error')) return { status: 'error', data: [], columns: [], refreshing: false, meta: [] };
    if (!ins.every((d) => d.status === 'ok')) return pending();
    let out;
    try {
      const v = c.fn(...ins.map((d) => d.data));
      const cols = Array.isArray(v) && v.length && typeof v[0] === 'object' ? Object.keys(v[0]) : [];
      out = { status: 'ok', data: v, columns: cols, refreshing: false, meta: [] };
    } catch (err) {
      console.error('계산 실패:', id, err);
      out = { status: 'error', data: [], columns: [], message: String(err), refreshing: false, meta: [] };
    }
    memo[id] = out;
    return out;
  };

  const visible = (el) => el.isConnected && !el.closest('[hidden]');

  const runDraw = (name, el) => {
    (draws[name] || []).forEach((fn) => {
      try { fn(el); } catch (err) { console.error('그리기 실패:', name, err); }
    });
    widths.set(el, el.clientWidth);
  };

  const drawAll = (only) => {
    const names = only ? [only] : Object.keys(draws);
    names.forEach((name) => {
      document.querySelectorAll(`[data-draw="${CSS.escape(name)}"]`).forEach((el) => {
        if (!visible(el)) return;
        ro.observe(el);
        runDraw(name, el);
      });
    });
  };

  let busy = false;
  const render = () => {
    busy = true;
    dataFns.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
    drawAll();
    busy = false;
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  };

  // 너비가 바뀐 그림만 다시 그립니다.
  const ro = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => {
      if (!visible(target) || widths.get(target) === target.clientWidth) return;
      runDraw(target.getAttribute('data-draw'), target);
    });
  });

  // 숨겨져 있던 화면(탭)이 열리면 그 안의 그림을 그립니다.
  new MutationObserver((records) => {
    if (busy) return;
    if (records.some((r) => (r.oldValue !== null) !== r.target.hasAttribute('hidden'))) schedule();
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });

  window.dash = {
    data,
    calc: (id, def) => { calcs[id] = { inputs: def.inputs || [], fn: def.fn }; },
    loader: () => {},
    onData: (fn) => { dataFns.push(fn); schedule(); },
    draw: (name, fn) => {
      if (fn === undefined) { drawAll(name); return; }
      const f = typeof fn === 'function' ? fn : (el) => fn.update ? fn.update(el, fn.mount && fn.mount(el)) : fn.mount && fn.mount(el);
      (draws[name] = draws[name] || []).push(f);
      schedule();
    },
    params: () => ({ ...params }),
    setParams: (next) => {
      Object.entries(next).forEach(([k, v]) => { if (v === null || v === undefined) delete params[k]; else params[k] = v; });
      try { localStorage.setItem(KEY, JSON.stringify(params)); } catch (e) { /* 저장 불가: 이번 방문에만 유지 */ }
      schedule();
    },
    resetParams: () => { params = {}; try { localStorage.removeItem(KEY); } catch (e) {} schedule(); },
    setLink: (name) => { try { history.replaceState(null, '', name ? `#${name}` : location.pathname); } catch (e) {} },
    refresh: () => {},
    // 브라우저에서 계산한 데이터를 넣습니다. 넣을 때마다 모든 그림을 다시 그립니다.
    put: (id, rows) => {
      store[id] = { status: 'ok', data: rows.slice(), columns: rows.length ? Object.keys(rows[0]) : [], refreshing: false, meta: [] };
      Object.keys(memo).forEach((k) => delete memo[k]);
      schedule();
    },
    fail: (id, message) => {
      store[id] = { status: 'error', data: [], columns: [], message: String(message), refreshing: false, meta: [] };
      Object.keys(memo).forEach((k) => delete memo[k]);
      schedule();
    },
    colors: ['#2f6fdb', '#e0902a', '#1f9e89', '#9b5de5', '#d6457a', '#6b8e23', '#5c6bc0', '#8d6e63'],
  };

  window.addEventListener('resize', schedule);
  document.addEventListener('DOMContentLoaded', schedule);
})();
