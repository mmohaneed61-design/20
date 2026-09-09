/*
 * twenty-table-catalog / engine/engine-io.js
 * محرك الجدول المتقدم — التصدير والاستيراد (481-540)
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';
  var esc = window.TableEngine._internals.esc;

  /* ================= EXPORT ================= */
  TableEngine.prototype.export = function (format, opts) {
    opts = opts || {};
    var self = this;
    var scope = opts.scope || 'filtered'; // filtered | all | selected | page
    var filename = opts.filename || ('twenty-table-' + (scope) + '-' + Date.now() + extOf(format));
    var rows;
    if (scope === 'all') rows = this.rows;
    else if (scope === 'selected') rows = this.rows.filter(function (r) { return this._isSel(r); }, this);
    else if (scope === 'page') rows = this.visibleRows.filter(function (v) { return v.kind === 'data'; }).map(function (v) { return v.row; });
    else rows = this._filterAndSort(true);

    var cols = this.visibleCols.filter(function (c) {
      return c.id !== '__select';
    });
    var flat = rows.map(function (r) {
      return cols.map(function (c) {
        if (c.id === '__rownum') return '';
        var v = r[c.id];
        if (v === null || v === undefined) return '';
        if (typeof v === 'string' && v.indexOf('=') === 0) return self_eval(self, v, r._id);
        if (Array.isArray(v)) return v.join(', ');
        return v;
      });
    });
    var head = cols.map(function (c) { return c.title; });
    var data = { head: head, rows: flat };

    var out = null, mime = 'text/plain';
    switch (format) {
      case 'csv': out = toDelimited(data, ','); mime = 'text/csv;charset=utf-8'; break;
      case 'tsv': out = toDelimited(data, '\t'); mime = 'text/tab-separated-values;charset=utf-8'; break;
      case 'json':
        out = JSON.stringify(rows.map(function (r) {
          var o = { id: r._id };
          cols.forEach(function (c) { if (c.id !== '__rownum') o[c.id] = r[c.id]; });
          o._modifiedAt = r._modifiedAt; o._modifiedBy = r._modifiedBy;
          return o;
        }, this), null, 2);
        mime = 'application/json;charset=utf-8';
        break;
      case 'xml':
        out = '<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n' +
          rows.map(function (r) {
            return '  <row id="' + esc(r._id) + '">' + cols.map(function (c) {
              if (c.id === '__rownum') return '';
              var v = r[c.id];
              return '<' + c.id + '>' + esc(v === null || v === undefined ? '' : (Array.isArray(v) ? v.join(', ') : v)) + '</' + c.id + '>';
            }).join('') + '</row>';
          }).join('\n') + '\n</rows>';
        mime = 'application/xml;charset=utf-8';
        break;
      case 'html':
        out = '<!DOCTYPE html><html dir="' + this.direction + '"><head><meta charset="utf-8"><title>' + esc(this.config.title || 'Table') + '</title></head><body><table border="1" cellspacing="0" cellpadding="6">' +
          '<thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          flat.map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') +
          '</tbody></table></body></html>';
        mime = 'text/html;charset=utf-8';
        break;
      case 'markdown':
        out = '| ' + head.join(' | ') + ' |\n|' + head.map(function () { return '---|'; }).join('') + '\n' +
          flat.map(function (r) { return '| ' + r.map(function (v) { return String(v).replace(/\|/g, '\\|'); }).join(' | ') + ' |'; }).join('\n');
        mime = 'text/markdown;charset=utf-8';
        break;
      case 'txt':
        out = head.join('\t') + '\n' + flat.map(function (r) { return r.join('\t'); }).join('\n');
        mime = 'text/plain;charset=utf-8';
        break;
      case 'sql': {
        var tableName = (this.config.tableName || 'table_data').replace(/[^\w]/g, '_');
        out = '-- Exported from Twenty Table Catalog\n' +
          'CREATE TABLE IF NOT EXISTS ' + tableName + ' (\n' +
          cols.map(function (c) {
            if (c.id === '__rownum') return '';
            var t = c.type === 'number' || c.type === 'currency' || c.type === 'percent' || c.type === 'progress' ? 'DOUBLE' : c.type === 'date' || c.type === 'datetime' ? 'DATETIME' : c.type === 'boolean' ? 'BOOLEAN' : 'TEXT';
            return '  "' + c.id + '" ' + t;
          }).filter(Boolean).join(',\n') + '\n);\n\n' +
          'INSERT INTO ' + tableName + ' (' + cols.filter(function (c) { return c.id !== '__rownum'; }).map(function (c) { return '"' + c.id + '"'; }).join(', ') + ') VALUES\n' +
          rows.map(function (r) {
            return '(' + cols.filter(function (c) { return c.id !== '__rownum'; }).map(function (c) {
              var v = r[c.id];
              if (v === null || v === undefined) return 'NULL';
              if (typeof v === 'number' || typeof v === 'boolean') return String(v);
              if (Array.isArray(v)) return "'" + v.join(', ').replace(/'/g, "''") + "'";
              return "'" + String(v).replace(/'/g, "''") + "'";
            }).join(', ') + ')';
          }).join(',\n') + ';';
        mime = 'text/plain;charset=utf-8';
        break;
      }
      case 'svg':
        out = toSVG(data, this);
        mime = 'image/svg+xml;charset=utf-8';
        break;
      case 'xls':
        out = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>' + toTableHTML(data) + '</body></html>';
        mime = 'application/vnd.ms-excel';
        break;
      case 'doc':
        out = '<html><head><meta charset="utf-8"></head><body>' + toTableHTML(data) + '</body></html>';
        mime = 'application/msword';
        break;
      case 'png':
        toPNG(data, this, function (url) { downloadURL(url, filename); });
        this.emit('exported', { format: format, count: rows.length });
        return;
      case 'pdf':
        window.print();
        this.emit('exported', { format: 'pdf', count: rows.length });
        return;
    }
    if (out === null) return;
    var blob = new Blob(format === 'csv' || format === 'tsv' ? ['\uFEFF' + out] : [out], { type: mime });
    if (window._ttDownloadBlob) window._ttDownloadBlob(blob, filename);
    else downloadBlob(blob, filename);
    this.emit('exported', { format: format, count: rows.length });
    this.toast('تم تصدير ' + rows.length + ' صف بصيغة ' + format.toUpperCase(), 'success');
  };
  function self_eval(eng, v, id) { return eng.evaluateFormula ? eng.evaluateFormula(v, id) : v; }
  function extOf(f) { return { csv: '.csv', tsv: '.tsv', json: '.json', xml: '.xml', html: '.html', markdown: '.md', txt: '.txt', sql: '.sql', svg: '.svg', xls: '.xls', doc: '.doc', png: '.png' }[f] || '.txt'; }
  function toDelimited(data, sep) {
    var q = function (s) { s = String(s == null ? '' : s); return s.indexOf(sep) !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [data.head.map(q).join(sep)].concat(data.rows.map(function (r) { return r.map(q).join(sep); })).join('\n');
  }
  function toTableHTML(data) {
    return '<table><thead><tr>' + data.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      data.rows.map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function toSVG(data, eng) {
    var rowH = 22, headH = 26, pad = 10;
    var colW = data.head.map(function (h) {
      var m = h.length;
      data.rows.slice(0, 50).forEach(function (r) { if (String(r[data.head.indexOf(h)] || '').length > m) m = String(r[data.head.indexOf(h)] || '').length; });
      return Math.min(260, Math.max(90, m * 8 + 20));
    });
    var w = colW.reduce(function (a, b) { return a + b; }, 0) + pad * 2;
    var h = rowH * data.rows.length + headH + pad * 2;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" font-family="Arial, sans-serif" font-size="12">';
    s += '<rect width="' + w + '" height="' + h + '" fill="#ffffff"/>';
    var y = pad;
    s += '<rect x="' + pad + '" y="' + y + '" width="' + colW.reduce(function (a, b) { return a + b; }, 0) + '" height="' + headH + '" fill="#0057FF"/>';
    var x = pad;
    data.head.forEach(function (hh, i) {
      s += '<text x="' + (x + 6) + '" y="' + (y + 17) + '" fill="#fff" font-weight="bold">' + esc(hh.slice(0, 28)) + '</text>';
      x += colW[i];
    });
    y += headH;
    data.rows.forEach(function (r, ri) {
      if (ri % 2 === 1) s += '<rect x="' + pad + '" y="' + y + '" width="' + colW.reduce(function (a, b) { return a + b; }, 0) + '" height="' + rowH + '" fill="#f5f7fa"/>';
      var xx = pad;
      r.forEach(function (v, i) {
        s += '<text x="' + (xx + 6) + '" y="' + (y + 15) + '" fill="#333">' + esc(String(v == null ? '' : v).slice(0, 32)) + '</text>';
        xx += colW[i];
      });
      s += '<line x1="' + pad + '" y1="' + (y + rowH) + '" x2="' + (w - pad) + '" y2="' + (y + rowH) + '" stroke="#e0e0e0"/>';
      y += rowH;
    });
    s += '</svg>';
    return s;
  }
  function toPNG(data, eng, cb) {
    var canvas = document.createElement('canvas');
    var rowH = 22, headH = 26, pad = 10, font = '12px Arial';
    var ctx = canvas.getContext('2d');
    var colW = data.head.map(function (hh) {
      var m = ctx2w(ctx, font, hh);
      data.rows.slice(0, 100).forEach(function (r) { var w2 = ctx2w(ctx, font, String(r[data.head.indexOf(hh)] || '')); if (w2 > m) m = w2; });
      return Math.min(260, m + 20);
    });
    var w = colW.reduce(function (a, b) { return a + b; }, 0) + pad * 2;
    var h = rowH * Math.min(data.rows.length, 300) + headH + pad * 2;
    canvas.width = w; canvas.height = h;
    var c2 = canvas.getContext('2d');
    c2.fillStyle = '#fff'; c2.fillRect(0, 0, w, h);
    var y = pad;
    c2.fillStyle = '#0057FF';
    c2.fillRect(pad, y, w - pad * 2, headH);
    c2.fillStyle = '#fff'; c2.font = 'bold ' + font;
    var x = pad;
    data.head.forEach(function (hh, i) { c2.fillText(hh.slice(0, 30), x + 6, y + 17); x += colW[i]; });
    y += headH;
    c2.font = font;
    data.rows.slice(0, 300).forEach(function (r, ri) {
      if (ri % 2 === 1) { c2.fillStyle = '#f5f7fa'; c2.fillRect(pad, y, w - pad * 2, rowH); c2.fillStyle = '#333'; }
      var xx = pad;
      r.forEach(function (v, i) { c2.fillText(String(v == null ? '' : v).slice(0, 34), xx + 6, y + 15); xx += colW[i]; });
      y += rowH;
    });
    cb(canvas.toDataURL('image/png'));
  }
  function ctx2w(ctx, font, s) { ctx.font = font; return ctx.measureText(s).width; }
  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function downloadURL(url, name) {
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  window._ttDownloadBlob = downloadBlob;

  /* ================= IMPORT ================= */
  TableEngine.prototype.importFile = function (file, cb) {
    var self = this;
    var isJSON = /\.json$/i.test(file.name) || (file.type || '').indexOf('json') !== -1;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var parsed;
        if (isJSON) {
          var arr = JSON.parse(String(rd.result));
          if (!Array.isArray(arr)) throw new Error('JSON يجب أن يكون مصفوفة كائنات');
          parsed = arr;
        } else {
          parsed = parseDelimited(String(rd.result).replace(/^\uFEFF/, ''));
        }
        cb(parsed, { source: file.name, errors: [] });
      } catch (e) {
        cb(null, { source: file.name, errors: [e.message] });
      }
    };
    rd.readAsText(file, 'utf-8');
  };
  function parseDelimited(text) {
    var lines = text.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return null;
    var sep = lines[0].split('\t').length > lines[0].split(',').length ? '\t' : ',';
    var head = splitLine(lines[0], sep);
    return lines.slice(1).map(function (l) {
      var vals = splitLine(l, sep);
      var o = {};
      head.forEach(function (h, i) { o[h] = vals[i] !== undefined ? vals[i] : ''; });
      return o;
    });
  }
  function splitLine(line, sep) {
    var out = [];
    var cur = '';
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === sep) { out.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }
  TableEngine.prototype.importData = function (items, opts) {
    // items: array of objects; opts: {mode: 'append'|'replace'|'upsert', mapping: {targetCol: sourceKey}}
    opts = opts || {};
    var mode = opts.mode || 'append';
    var mapping = opts.mapping || {};
    var errors = [];
    var count = 0;
    if (mode === 'replace') {
      this._normalizeData(items.map(function (it) { return remap(it, mapping); }));
    } else {
      items.forEach(function (it, i) {
        var rec = remap(it, mapping);
        if (mode === 'upsert' && (rec.id || it.id)) {
          var ex = null;
          this.rows.forEach(function (r) { if (r._id === (rec.id || it.id)) ex = r; });
          if (ex) {
            Object.keys(rec).forEach(function (k) { if (this.columns.some(function (c) { return c.id === k; }) || k[0] !== '_') { ex[k] = rec[k]; } }, this);
            ex._modifiedAt = window.TableEngine._internals.nowISO ? nowISO2() : new Date().toISOString();
            count++;
            return;
          }
        }
        var row = this.addRow(rec);
        count++;
        if (this.validate && Object.keys(mapping).length === 0) {
          this.columns.forEach(function (c) {
            var e = this.validate(c, row[c.id]);
            if (e) errors.push('صف ' + (i + 1) + ' / ' + c.title + ': ' + e);
          }, this);
        }
      }, this);
    }
    this.render(true);
    this.emit('imported', { count: count, errors: errors, mode: mode });
    this.toast('تم استيراد ' + count + ' صف' + (errors.length ? ' (' + errors.length + ' تحذير)' : ''), errors.length ? 'warning' : 'success');
    return { count: count, errors: errors };
  };
  function remap(it, mapping) {
    var o = {};
    Object.keys(it).forEach(function (k) {
      o[mapping[k] || k] = it[k];
    });
    return o;
  }
  function nowISO2() { return new Date().toISOString(); }
})();
