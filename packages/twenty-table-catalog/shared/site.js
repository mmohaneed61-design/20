/*
 * twenty-table-catalog / shared/site.js
 * هيكل تطبيق Twenty: شريط جانبي + شريط علوي (بحث + مسار) + محتوى الصفحة
 * مطابقة لتخطيط twenty-front (sidebar / top bar / content)
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';

  var ICONS = {
    home: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    people: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    zap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };

  var PAGES = [
    { id: 'index', href: 'index.html', icon: ICONS.home, label: 'الرئيسية' },
    { id: 'people', href: 'people.html', icon: ICONS.people, label: 'جهات الاتصال' },
    { id: 'projects', href: 'projects.html', icon: ICONS.folder, label: 'المشاريع' },
    { id: 'features', href: 'features.html', icon: ICONS.check, label: 'الخصائص الـ800' },
    { id: 'stress', href: 'stress.html', icon: ICONS.zap, label: 'اختبار الأداء' }
  ];

  function themeIcon(t) { return t === 'dark' ? ICONS.sun : ICONS.moon; }

  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    document.querySelectorAll('.ttc-theme-btn').forEach(function (b) {
      b.innerHTML = themeIcon(t);
      b.setAttribute('aria-label', t === 'dark' ? 'التبديل للثيم الفاتح' : 'التبديل للثيم الداكن');
      b.title = t === 'dark' ? 'الثيم الفاتح' : 'الثيم الداكن';
    });
    try { localStorage.setItem('ttc-theme', t); } catch (e) { }
  }

  function currentPage() {
    var p = document.body.dataset.page || 'index';
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i].id === p) return PAGES[i];
    return PAGES[0];
  }

  function buildSidebar() {
    var page = currentPage();
    var sidebar = document.createElement('aside');
    sidebar.className = 'ttc-sidebar';
    sidebar.setAttribute('aria-label', 'التنقل الرئيسي');
    sidebar.innerHTML =
      '<div class="ttc-side-brand">' +
      '<div class="ttc-side-logo" aria-hidden="true">20</div>' +
      '<div class="ttc-side-brand-name">Twenty<span class="ttc-side-brand-sub">نسخة عرض</span></div>' +
      '</div>' +
      '<nav class="ttc-side-nav" aria-label="الأقسام">' +
      PAGES.map(function (p) {
        return '<a href="' + p.href + '" class="ttc-side-item' + (p.id === page.id ? ' active" aria-current="page' : '') + '">' +
          '<span class="ttc-side-icon" aria-hidden="true">' + p.icon + '</span>' +
          '<span class="ttc-side-label">' + p.label + '</span></a>';
      }).join('') +
      '</nav>' +
      '<div class="ttc-side-bottom">' +
      '<button class="t-btn t-btn--ghost ttc-theme-btn" title="تبديل الثيم" aria-label="تبديل الثيم">' + themeIcon(currentTheme()) + '</button>' +
      '<div class="ttc-side-user" title="مستخدم تجريبي"><div class="ttc-side-avatar" aria-hidden="true">م</div><span>مستخدم تجريبي</span></div>' +
      '</div>';
    return sidebar;
  }

  function buildTopBar() {
    var page = currentPage();
    var topbar = document.createElement('header');
    topbar.className = 'ttc-topbar';
    topbar.innerHTML =
      '<div class="ttc-crumbs" aria-label="الموقع الحالي">' +
      '<span class="ttc-crumbs-icon" aria-hidden="true">' + page.icon + '</span>' +
      '<span class="ttc-crumbs-title">' + page.label + '</span>' +
      '</div>' +
      '<div class="ttc-topbar-search" role="search">' +
      '<span class="ttc-topbar-search-icon" aria-hidden="true">' + ICONS.search + '</span>' +
      '<input type="search" placeholder="بحث في السجلات…" aria-label="بحث عام" />' +
      '</div>';
    var input = topbar.querySelector('input');
    var t;
    input.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var eng = window.TTC_ENGINES && window.TTC_ENGINES[0];
        if (eng) eng.setGlobal(input.value);
      }, 150);
    });
    return topbar;
  }

  function currentTheme() {
    try {
      var t = localStorage.getItem('ttc-theme');
      if (t) return t;
    } catch (e) { }
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function insertFirst(parent, child) {
    if (parent && typeof parent.prepend === 'function') parent.prepend(child);
    else if (parent && parent.parentNode) parent.parentNode.insertBefore(child, parent);
    else if (parent) parent.appendChild(child);
  }

  function build() {
    var page = document.body.dataset.page || 'index';
    var main = document.querySelector('main.ttc-page') || document.body;

    var sidebar = buildSidebar();
    var topbar = buildTopBar();

    if (main && main.parentNode && typeof main.parentNode.insertBefore === 'function') {
      main.parentNode.insertBefore(sidebar, main);
      if (typeof main.prepend === 'function') main.prepend(topbar);
      else if (main.firstChild) main.insertBefore(topbar, main.firstChild);
      else main.appendChild(topbar);
    } else {
      insertFirst(document.body, sidebar);
      insertFirst(document.body, topbar);
    }

    sidebar.querySelector('.ttc-theme-btn').addEventListener('click', function () {
      var t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(t);
      (window.TTC_ENGINES || []).forEach(function (e) { e.setTheme(t); });
    });

    applyTheme(currentTheme());
  }

  function chip(value, label, cls) {
    var el = document.createElement('span');
    el.className = 'ttc-chip' + (cls ? ' ' + cls : '');
    el.innerHTML =
      '<span class="ttc-chip-value">' + value + '</span>' +
      '<span class="ttc-chip-label">' + label + '</span>';
    return el;
  }

  window.TTC = {
    engines: [],

    /* زر الإضافة الرئيسي في ترويسة الصفحة (نمط Object Page في Twenty) */
    addPageAction: function (eng, label) {
      var tb = eng._el && eng._el('.tt-titlebar');
      if (!tb) return null;
      var btn = document.createElement('button');
      btn.className = 't-btn t-btn--primary ttc-add-btn';
      btn.innerHTML = '+ ' + label;
      btn.addEventListener('click', function () {
        var row = eng.addRow(null);
        if (row) {
          eng._focusRow(row._id);
          eng.startEdit(row._id);
        }
        if (eng.toast) eng.toast('تمت إضافة صف جديد — انقر على أي خلية للتحرير', 'success');
      });
      tb.appendChild(btn);
      return btn;
    },

    /* شرائح ملخص في ترويسة الصفحة (نمط Twenty) */
    addSummary: function (eng, chips) {
      var tb = eng._el && eng._el('.tt-titlebar');
      if (!tb) return null;
      var box = document.createElement('span');
      box.className = 'ttc-summary ttc-summary--inline';
      chips.forEach(function (c) { box.appendChild(chip(c.n, c.l, c.cls)); });
      tb.appendChild(box);
      return box;
    },

    registerEngine: function (eng) {
      window.TTC_ENGINES = window.TTC_ENGINES || [];
      window.TTC_ENGINES.push(eng);
      try {
        var t = localStorage.getItem('ttc-theme');
        if (t) { eng.setTheme(t); return; }
      } catch (e) { }
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) eng.setTheme('dark');
      eng.on('themeChanged', function (p) { applyTheme(p.theme); });
    },
    theme: function () { return document.documentElement.dataset.theme; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
