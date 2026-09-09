/*
 * twenty-table-catalog / shared/site.js
 * هيكل الموقع المشترك: شريط التنقل، الثيم، التذييل — جميع الصفحات
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  var PAGES = [
    { id: 'index', href: 'index.html', icon: '🏠', label: 'الرئيسية' },
    { id: 'people', href: 'people.html', icon: '👥', label: 'جهات الاتصال' },
    { id: 'projects', href: 'projects.html', icon: '📁', label: 'المشاريع' },
    { id: 'features', href: 'features.html', icon: '✅', label: 'الخصائص الـ800' },
    { id: 'stress', href: 'stress.html', icon: '⚡', label: 'اختبار الأداء' }
  ];

  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    document.querySelectorAll('.ttc-theme-btn').forEach(function (b) {
      b.textContent = t === 'dark' ? '☀️' : '🌙';
      b.setAttribute('aria-label', t === 'dark' ? 'التبديل للثيم الفاتح' : 'التبديل للثيم الداكن');
    });
    try { localStorage.setItem('ttc-theme', t); } catch (e) { }
  }

  function build() {
    var page = document.body.dataset.page || 'index';
    var nav = document.createElement('nav');
    nav.className = 'ttc-nav';
    nav.setAttribute('aria-label', 'التنقل الرئيسي');
    nav.innerHTML =
      '<div class="ttc-nav-inner">' +
      '<a class="ttc-brand" href="index.html" style="text-decoration:none;color:inherit">' +
      '<div class="ttc-logo">20</div>' +
      '<div><div class="ttc-brand-name">نظام Twenty للجدول المتقدم</div><div class="ttc-brand-sub">800 خاصية · MIT · ديزاين سيستم Twenty</div></div></a>' +
      '<div class="ttc-links">' +
      PAGES.map(function (p) {
        return '<a href="' + p.href + '"' + (p.id === page ? ' class="active" aria-current="page"' : '') + '>' + p.icon + ' ' + p.label + '</a>';
      }).join('') +
      '</div>' +
      '<button class="t-btn t-btn--icon ttc-theme-btn" title="تبديل الثيم">🌙</button>' +
      '</div>';
    document.body.prepend(nav);
    nav.querySelector('.ttc-theme-btn').addEventListener('click', function () {
      var t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(t);
      // sync all engines on the page
      (window.TTC_ENGINES || []).forEach(function (e) { e.setTheme(t); });
    });

    var footer = document.createElement('footer');
    footer.className = 'ttc-footer';
    footer.innerHTML =
      '<p>مرخص بموجب <a href="LICENSE">MIT License</a> — حزمة <code>twenty-table-catalog</code> ضمن نظام Twenty · ديزاين سيستم <code>twenty-ui</code> (MIT)</p>' +
      '<p>نظام الجدول المتقدم · 800 خاصية · 14 مجموعة · ' + new Date().getFullYear() + '</p>';
    document.body.appendChild(footer);

    // initial theme
    var t = 'light';
    try { t = localStorage.getItem('ttc-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { }
    applyTheme(t);
  }

  window.TTC = {
    engines: [],
    registerEngine: function (eng) {
      window.TTC_ENGINES = window.TTC_ENGINES || [];
      window.TTC_ENGINES.push(eng);
      // sync theme from site
      try {
        var t = localStorage.getItem('ttc-theme');
        if (t) { eng.setTheme(t); return; }
      } catch (e) { }
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) eng.setTheme('dark');
      eng.on('themeChanged', function (p) { applyTheme(p.theme); });
    },
    theme: function () { return document.documentElement.dataset.theme; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
