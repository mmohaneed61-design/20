/*
 * twenty-table-catalog — app.js
 * نظام الجدول المتقدم — منطق العرض: بحث، فلترة، ترتيب، ترقيم، ثيم، تصدير
 * MIT License — see LICENSE
 */
'use strict';

const GROUPS = window.TTC_GROUPS;
const FEATURES = [].concat(window.TTC_F1, window.TTC_F2, window.TTC_F3).map(
  ([num, ar, en]) => {
    const gi = GROUPS.findIndex((g) => num >= g.from && num <= g.to);
    return { num, ar, en, g: gi + 1 };
  }
);
const MAX_GROUP_COUNT = Math.max(...GROUPS.map((g) => g.count));

const $ = (s) => document.querySelector(s);
const tbody = $('#tbody');
const searchInput = $('#searchInput');

const state = {
  q: '',
  group: 0,
  sortKey: 'num',
  sortDir: 1,
  page: 1,
  perPage: Number(localStorage.getItem('ttc-perpage')) || 50,
  density: localStorage.getItem('ttc-density') || 'comfortable',
  printing: false
};

/* ---------- أدوات ---------- */

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function hl(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const qe = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!qe) return safe;
  return safe.replace(new RegExp(qe, 'gi'), (m) => `<mark>${m}</mark>`);
}

function announce(msg) {
  $('#announcer').textContent = msg;
}

/* ---------- البيانات المفلترة والمترتبة ---------- */

function getFiltered() {
  const q = state.q.trim().toLowerCase();
  const rows = FEATURES.filter((f) => {
    if (state.group && f.g !== state.group) return false;
    if (!q) return true;
    const g = GROUPS[f.g - 1];
    return (
      f.ar.toLowerCase().includes(q) ||
      f.en.toLowerCase().includes(q) ||
      String(f.num).includes(q) ||
      g.name.toLowerCase().includes(q) ||
      g.en.toLowerCase().includes(q)
    );
  });
  const k = state.sortKey;
  const d = state.sortDir;
  rows.sort((a, b) => {
    let r = 0;
    if (k === 'num') r = a.num - b.num;
    else if (k === 'name') r = a.ar.localeCompare(b.ar, 'ar');
    else if (k === 'en') r = a.en.localeCompare(b.en);
    else r = a.g - b.g || a.num - b.num;
    return r * d;
  });
  return rows;
}

/* ---------- العرض ---------- */

function render() {
  const rows = getFiltered();
  const total = rows.length;
  const pages = state.printing ? 1 : Math.max(1, Math.ceil(total / state.perPage));
  if (state.page > pages) state.page = pages;
  const start = (state.page - 1) * state.perPage;
  const slice = state.printing ? rows : rows.slice(start, start + state.perPage);

  $('#statVisible').textContent = total;
  $('#resultCount').textContent = total
    ? `عرض ${total} من ${FEATURES.length} خاصية`
    : 'لا توجد نتائج مطابقة';

  renderChips();
  renderGroupCards();

  tbody.innerHTML = slice
    .map((f) => {
      const g = GROUPS[f.g - 1];
      return `<tr>
        <td class="c-num">${f.num}</td>
        <td class="c-name">${hl(f.ar, state.q)}</td>
        <td class="c-en">${hl(f.en, state.q)}</td>
        <td class="c-group"><span class="gdot" style="background:${g.color}"></span><span class="glabel">${g.name}</span></td>
      </tr>`;
    })
    .join('');

  $('#emptyState').hidden = total > 0;
  renderSortIndicators();
  renderPagination(total, pages);
  document.title = `نظام Twenty — الجدول المتقدم | ${total} خاصية`;
}

function renderChips() {
  const chips = [];
  if (state.q.trim())
    chips.push(
      `<span class="chip">بحث: “${esc(state.q.trim())}”<button data-clear="q" aria-label="مسح البحث">✕</button></span>`
    );
  if (state.group) {
    const g = GROUPS[state.group - 1];
    chips.push(
      `<span class="chip" style="--cc:${g.color}">المجموعة: ${g.name}<button data-clear="g" aria-label="مسح فلتر المجموعة">✕</button></span>`
    );
  }
  if (chips.length === 0)
    chips.push('<span class="chip ghost">عرض كامل الفهرس — انقر مجموعة لتصفية</span>');
  $('#activeChips').innerHTML = chips.join('');
}

function renderGroupCards() {
  document.querySelectorAll('.gcard').forEach((card) => {
    const g = Number(card.dataset.g);
    const active = g === state.group;
    card.classList.toggle('active', active);
    card.setAttribute('aria-pressed', String(active));
  });
}

function renderSortIndicators() {
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    const k = th.dataset.sort;
    const active = k === state.sortKey;
    th.classList.toggle('sorted', active);
    th.setAttribute(
      'aria-sort',
      active ? (state.sortDir === 1 ? 'ascending' : 'descending') : 'none'
    );
    th.querySelector('.arrow').textContent = active ? (state.sortDir === 1 ? '▲' : '▼') : '';
  });
}

function renderPagination(total, pages) {
  const el = $('#pagination');
  if (state.printing || total === 0) {
    el.innerHTML = '';
    return;
  }
  let html = `<button class="pbtn" data-p="prev" ${state.page === 1 ? 'disabled' : ''}>‹ السابق</button>`;
  for (const n of pageList(state.page, pages)) {
    if (n === '…') html += '<span class="pdots">…</span>';
    else
      html += `<button class="pbtn ${n === state.page ? 'active' : ''}" data-p="${n}" ${n === state.page ? 'aria-current="page"' : ''}>${n}</button>`;
  }
  html += `<button class="pbtn" data-p="next" ${state.page === pages ? 'disabled' : ''}>التالي ›</button>`;
  html += `<span class="pinfo">صفحة ${state.page} من ${pages}</span>`;
  el.innerHTML = html;
}

function pageList(cur, total) {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, total - 1, total, cur - 1, cur, cur + 1]);
  const arr = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    if (i > 0 && arr[i] - arr[i - 1] > 1) out.push('…');
    out.push(arr[i]);
  }
  return out;
}

/* ---------- بناء بطاقات المجموعات ---------- */

function buildGroupCards() {
  $('#groups').innerHTML = GROUPS.map(
    (g) => `<button class="gcard" data-g="${g.id}" style="--gc:${g.color}" aria-pressed="false">
      <div class="gcard-top">
        <span class="gicon" aria-hidden="true">${g.icon}</span>
        <span class="gcount">${g.count}</span>
      </div>
      <div class="gname">${g.name}</div>
      <div class="gen">${g.en}</div>
      <div class="gbar" aria-hidden="true"><i style="width:${Math.round((g.count / MAX_GROUP_COUNT) * 100)}%"></i></div>
    </button>`
  ).join('');
}

/* ---------- التصدير ---------- */

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportCSV() {
  const rows = getFiltered();
  const head = ['#', 'الخاصية', 'English', 'المجموعة'];
  const lines = rows.map((f) =>
    [f.num, f.ar, f.en, GROUPS[f.g - 1].name]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const blob = new Blob(['\uFEFF' + [head.join(','), ...lines].join('\r\n')], {
    type: 'text/csv;charset=utf-8'
  });
  download(blob, `twenty-table-features-${rows.length}.csv`);
  announce(`تم تصدير ${rows.length} خاصية بصيغة CSV`);
}

function exportJSON() {
  const rows = getFiltered().map((f) => ({
    num: f.num,
    feature: f.ar,
    english: f.en,
    group: GROUPS[f.g - 1].name,
    groupId: f.g
  }));
  const blob = new Blob([JSON.stringify({ total: rows.length, license: 'MIT', features: rows }, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  download(blob, `twenty-table-features-${rows.length}.json`);
  announce(`تم تصدير ${rows.length} خاصية بصيغة JSON`);
}

/* ---------- الثيم والكثافة ---------- */

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#themeBtn').textContent = theme === 'dark' ? '☀️' : '🌙';
  $('#themeBtn').setAttribute('aria-label', theme === 'dark' ? 'التبديل للثيم الفاتح' : 'التبديل للثيم الداكن');
  localStorage.setItem('ttc-theme', theme);
}

function setDensity(d) {
  state.density = d;
  $('#tableWrap').classList.toggle('compact', d === 'compact');
  document.querySelectorAll('#densitySeg button').forEach((b) =>
    b.classList.toggle('active', b.dataset.density === d)
  );
  localStorage.setItem('ttc-density', d);
}

/* ---------- الأحداث ---------- */

let deb;
searchInput.addEventListener('input', (e) => {
  clearTimeout(deb);
  deb = setTimeout(() => {
    state.q = e.target.value;
    state.page = 1;
    render();
    const total = getFiltered().length;
    announce(`تم العثور على ${total} خاصية`);
  }, 120);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    state.q = '';
    state.page = 1;
    render();
    searchInput.blur();
  }
});

document.querySelectorAll('th[data-sort]').forEach((th) =>
  th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (state.sortKey === k) state.sortDir *= -1;
    else {
      state.sortKey = k;
      state.sortDir = 1;
    }
    state.page = 1;
    render();
  })
);

$('#groups').addEventListener('click', (e) => {
  const b = e.target.closest('.gcard');
  if (!b) return;
  const g = Number(b.dataset.g);
  state.group = state.group === g ? 0 : g;
  state.page = 1;
  render();
  announce(state.group ? `تم الفلترة على مجموعة ${GROUPS[g - 1].name}` : 'تم إلغاء الفلترة');
});

$('#activeChips').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-clear]');
  if (!b) return;
  if (b.dataset.clear === 'q') {
    searchInput.value = '';
    state.q = '';
  } else {
    state.group = 0;
  }
  state.page = 1;
  render();
});

$('#pagination').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-p]');
  if (!b || b.disabled) return;
  const p = b.dataset.p;
  state.page = p === 'prev' ? state.page - 1 : p === 'next' ? state.page + 1 : Number(p);
  render();
  const panel = $('.panel');
  const top = panel.getBoundingClientRect().top + window.scrollY - 80;
  if (top < window.scrollY) window.scrollTo({ top, behavior: 'smooth' });
});

$('#pageSizeSel').addEventListener('change', (e) => {
  state.perPage = Number(e.target.value);
  state.page = 1;
  localStorage.setItem('ttc-perpage', String(state.perPage));
  render();
});

$('#densitySeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-density]');
  if (b) setDensity(b.dataset.density);
});

$('#themeBtn').addEventListener('click', () =>
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
);

$('#csvBtn').addEventListener('click', exportCSV);
$('#jsonBtn').addEventListener('click', exportJSON);
$('#printBtn').addEventListener('click', () => window.print());

$('#clearAllBtn').addEventListener('click', () => {
  searchInput.value = '';
  state.q = '';
  state.group = 0;
  state.page = 1;
  render();
  announce('تم مسح كل الفلاتر');
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
});

/* ---------- الطباعة: عرض كل النتائج المفلترة ---------- */

window.addEventListener('beforeprint', () => {
  state.printing = true;
  render();
});
window.addEventListener('afterprint', () => {
  state.printing = false;
  render();
});

/* ---------- التهيئة ---------- */

(function init() {
  const savedTheme = localStorage.getItem('ttc-theme');
  const theme =
    savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(theme);
  setDensity(state.density);
  const sel = $('#pageSizeSel');
  sel.innerHTML = [25, 50, 100].map((n) => `<option value="${n}" ${n === state.perPage ? 'selected' : ''}>${n} / صفحة</option>`).join('');
  buildGroupCards();
  render();
})();
