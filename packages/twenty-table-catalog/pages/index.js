/*
 * twenty-table-catalog / pages/index.js
 * الصفحة الرئيسية — لوحة التحكم + فهرس الخصائص
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    var c = window.FEATURE_STATUS_COUNTS;
    var pct = Math.round((c['2'] / 800) * 100);
    var stats = document.getElementById('statCards');
    if (stats) {
      stats.innerHTML =
        '<div class="ttc-stat"><div class="ttc-stat-value">800</div><div class="ttc-stat-label">خاصية احترافية</div></div>' +
        '<div class="ttc-stat"><div class="ttc-stat-value">14</div><div class="ttc-stat-label">مجموعة تصنيف</div></div>' +
        '<div class="ttc-stat"><div class="ttc-stat-value" style="color:var(--t-success)">' + c['2'] + ' (' + pct + '%)</div><div class="ttc-stat-label">خاصية مطبقة كاملة في المحرك</div></div>' +
        '<div class="ttc-stat"><div class="ttc-stat-value" style="color:var(--t-warning)">' + c['1'] + '</div><div class="ttc-stat-label">خاصية جزئية + ' + c['0'] + ' مخطط لها</div></div>';
    }
    window.TTCCatalog('#app', { id: 'home-catalog', pageSize: 50 });
  });
})();
