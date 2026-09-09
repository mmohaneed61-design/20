/*
 * twenty-table-catalog / engine/engine-formula.js
 * محرك الجدول المتقدم — الصيغ والحسابات (541-590) + التنسيق المشروط (401-439)
 * يدعم: =SUM, =AVERAGE, =COUNT, =IF, =SUMIF, =VLOOKUP-like INDEX/MATCH, مراجع خلايا A1، نطاقات A1:A10
 * MIT License — see ../LICENSE
 */
(function () {
  'use strict';

  /* ================= tokenizer ================= */
  function tokenize(src) {
    var tokens = [];
    var i = 0;
    while (i < src.length) {
      var ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"' || ch === "'") {
        var q = ch; var j = i + 1; var s = '';
        while (j < src.length) {
          if (src[j] === q) { if (src[j + 1] === q) { s += q; j += 2; continue; } break; }
          s += src[j]; j++;
        }
        tokens.push({ t: 'str', v: s });
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i));
        tokens.push({ t: 'num', v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_أ-ي]/.test(ch)) {
        var m2 = /^[A-Za-z_أ-ي]+/.exec(src.slice(i));
        var name = m2[0];
        i += name.length;
        // cell ref: NAME + digits (latin letters only)
        var m3 = /^[0-9]+/.exec(src.slice(i));
        if (/^[A-Za-z]+$/.test(name) && m3) {
          var rowNum = parseInt(m3[0], 10);
          i += m3[0].length;
          // range? (confirm the full target before consuming the colon)
          if (src[i] === ':') {
            var rest = src.slice(i + 1);
            var m4 = /^[A-Za-z]+/.exec(rest);
            if (m4) {
              var after = rest.slice(m4[0].length);
              var m5 = /^[0-9]+/.exec(after);
              var endRow = m5 ? parseInt(m5[0], 10) : null;
              i = i + 1 + m4[0].length + (m5 ? m5[0].length : 0);
              tokens.push({ t: 'range', col: name, start: rowNum, end: endRow });
              continue;
            }
          }
          tokens.push({ t: 'ref', col: name, row: rowNum });
          continue;
        }
        tokens.push({ t: 'ident', v: name.toUpperCase() });
        continue;
      }
      if (ch === '(' || ch === ')' || ch === ',') { tokens.push({ t: ch }); i++; continue; }
      var two = src.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') { tokens.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/^&<>=%'.indexOf(ch) !== -1) { tokens.push({ t: 'op', v: ch }); i++; continue; }
      i++; // skip unknown
    }
    return tokens;
  }

  /* ================= parser (recursive descent) ================= */
  function parse(tokens) {
    var pos = 0;
    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    function expect(v) { var t = next(); if (!t || (t.t !== v && t.v !== v)) throw new Error('expected ' + v); return t; }

    function comparison() {
      var left = additive();
      var t = peek();
      if (t && t.t === 'op' && ['=', '<', '>', '<=', '>=', '<>'].indexOf(t.v) !== -1) {
        next();
        var right = additive();
        return { kind: 'cmp', op: t.v, l: left, r: right };
      }
      return left;
    }
    function additive() {
      var left = multiplicative();
      while (peek() && peek().t === 'op' && ['+', '-', '&'].indexOf(peek().v) !== -1) {
        var op = next().v;
        var right = multiplicative();
        left = { kind: 'bin', op: op, l: left, r: right };
      }
      return left;
    }
    function multiplicative() {
      var left = unary();
      while (peek() && peek().t === 'op' && ['*', '/', '%'].indexOf(peek().v) !== -1) {
        var op = next().v;
        var right = unary();
        left = { kind: 'bin', op: op, l: left, r: right };
      }
      return left;
    }
    function unary() {
      var t = peek();
      if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) {
        next();
        var a = unary();
        return t.v === '-' ? { kind: 'neg', a: a } : a;
      }
      return power();
    }
    function power() {
      var left = primary();
      var t = peek();
      if (t && t.t === 'op' && t.v === '^') {
        next();
        return { kind: 'bin', op: '^', l: left, r: unary() };
      }
      return left;
    }
    function primary() {
      var t = peek();
      if (!t) throw new Error('unexpected end');
      if (t.t === 'num') { next(); return { kind: 'num', v: t.v }; }
      if (t.t === 'str') { next(); return { kind: 'str', v: t.v }; }
      if (t.t === 'ref') { next(); return { kind: 'ref', col: t.col, row: t.row }; }
      if (t.t === 'range') { next(); return { kind: 'range', col: t.col, start: t.start, end: t.end }; }
      if (t.t === 'ident') {
        var name = t.v;
        if (name === 'TRUE' || name === 'FALSE') { next(); return { kind: 'bool', v: name === 'TRUE' }; }
        if (name === 'NULL' || name === 'NA') { next(); return { kind: 'nullv' }; }
        if (peekAfter() && peekAfter().t === '(') {
          next(); // ident
          next(); // (
          var args = [];
          if (!(peek() && peek().t === ')')) {
            args.push(comparison());
            while (peek() && peek().t === ',') { next(); args.push(comparison()); }
          }
          expect(')');
          return { kind: 'call', fn: name, args: args };
        }
        next();
        return { kind: 'nullv' };
      }
      if (t.t === '(') {
        next();
        var e = comparison();
        expect(')');
        return e;
      }
      throw new Error('unexpected token');
    }
    function peekAfter() { return tokens[pos + 1]; }
    var ast = comparison();
    if (pos < tokens.length) throw new Error('trailing tokens');
    return ast;
  }

  /* ================= evaluator ================= */
  var FUNC = {
    SUM: function (a) { return numArr(a).reduce(function (x, y) { return x + y; }, 0); },
    AVERAGE: function (a) { var n = numArr(a); return n.length ? n.reduce(function (x, y) { return x + y; }, 0) / n.length : 0; },
    COUNT: function (a) { return numArr(a).length; },
    COUNTA: function (a) { return allArr(a).filter(function (v) { return v !== null && v !== undefined && String(v) !== ''; }).length; },
    COUNTBLANK: function (a) { return allArr(a).filter(function (v) { return v === null || v === undefined || String(v) === ''; }).length; },
    MIN: function (a) { var n = numArr(a); return n.length ? Math.min.apply(null, n) : 0; },
    MAX: function (a) { var n = numArr(a); return n.length ? Math.max.apply(null, n) : 0; },
    IF: function (a) { return truthy(a[0]) ? (a[1] !== undefined ? a[1] : true) : (a[2] !== undefined ? a[2] : false); },
    IFS: function (a) { for (var i = 0; i + 1 < a.length; i += 2) if (truthy(a[i])) return a[i + 1]; return '#NA!'; },
    SUMIF: function (a) { return a.length >= 3 ? condSum(a, 'sum') : 0; },
    COUNTIF: function (a) { return a.length >= 2 ? condCount(a) : 0; },
    AVERAGEIF: function (a) {
      if (a.length < 2) return 0;
      var vals = rangeValues(a[0]);
      var range2 = a[1].kind === 'range' ? a[1] : a[0];
      var vals2 = rangeValues(range2);
      var sum = 0, n = 0;
      vals.forEach(function (v, i) {
        if (matchCond(v, a[1])) { var w = typeof vals2[i] === 'number' ? vals2[i] : parseFloat(vals2[i]); if (!isNaN(w)) { sum += w; n++; } }
      });
      return n ? sum / n : 0;
    },
    CONCAT: function (a) { return a.map(function (v) { return v === null || v === undefined ? '' : String(v); }).join(''); },
    LEFT: function (a) { return String(a[0] == null ? '' : a[0]).slice(0, a[1] | 0 || 1); },
    RIGHT: function (a) { var s = String(a[0] == null ? '' : a[0]); return s.slice(-(a[1] | 0 || 1)); },
    MID: function (a) { return String(a[0] == null ? '' : a[0]).slice((a[1] | 0) - 1, (a[1] | 0) - 1 + (a[2] | 0)); },
    LEN: function (a) { return String(a[0] == null ? '' : a[0]).length; },
    UPPER: function (a) { return String(a[0] == null ? '' : a[0]).toUpperCase(); },
    LOWER: function (a) { return String(a[0] == null ? '' : a[0]).toLowerCase(); },
    PROPER: function (a) { return String(a[0] == null ? '' : a[0]).replace(/\S+/g, function (w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); }); },
    TRIM: function (a) { return String(a[0] == null ? '' : a[0]).replace(/\s+/g, ' ').trim(); },
    ROUND: function (a) { var d = a[1] | 0; return Math.round((a[0] + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d); },
    ROUNDUP: function (a) { var d = a[1] | 0; var f = Math.pow(10, d); return (a[0] >= 0 ? Math.ceil(a[0] * f) : Math.floor(a[0] * f)) / f; },
    ROUNDDOWN: function (a) { var d = a[1] | 0; var f = Math.pow(10, d); return (a[0] >= 0 ? Math.floor(a[0] * f) : Math.ceil(a[0] * f)) / f; },
    ABS: function (a) { return Math.abs(a[0] || 0); },
    POWER: function (a) { return Math.pow(a[0] || 0, a[1] || 0); },
    SQRT: function (a) { return Math.sqrt(a[0] || 0); },
    MOD: function (a) { return (a[0] || 0) % (a[1] || 1); },
    AND: function (a) { return a.every(truthy); },
    OR: function (a) { return a.some(truthy); },
    NOT: function (a) { return !truthy(a[0]); },
    INDEX: function (a) {
      var r = rangeValues(a[0]);
      var idx = (a[1] | 0) - 1;
      return r[idx] !== undefined ? r[idx] : '';
    },
    MATCH: function (a) {
      var r = rangeValues(a[0]);
      var s = String(a[1]);
      for (var i = 0; i < r.length; i++) if (String(r[i]) === s) return i + 1;
      return '#N/A';
    },
    TODAY: function () { return new Date().toISOString().slice(0, 10); },
    NOW: function () { return new Date().toISOString().slice(0, 16).replace('T', ' '); },
    YEAR: function (a) { var d = toDate(a[0]); return d ? d.getFullYear() : new Date().getFullYear(); },
    MONTH: function (a) { var d = toDate(a[0]); return d ? d.getMonth() + 1 : new Date().getMonth() + 1; },
    DAY: function (a) { var d = toDate(a[0]); return d ? d.getDate() : new Date().getDate(); },
    DATEDIF: function (a) {
      var d1 = toDate(a[0]), d2 = toDate(a[1]);
      if (!d1 || !d2) return 0;
      var unit = String(a[2] || 'D').toUpperCase();
      var diff = (d2 - d1) / 86400000;
      if (unit === 'Y') return Math.floor((d2.getFullYear() - d1.getFullYear()));
      if (unit === 'M') return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
      return Math.floor(diff);
    }
  };

  function numArr(args) {
    var out = [];
    args.forEach(function (a) {
      if (a.kind === 'range') {
        rangeValues(a).forEach(function (v) {
          var n = typeof v === 'number' ? v : parseFloat(v);
          if (!isNaN(n)) out.push(n);
        });
      } else {
        var n2 = typeof a === 'number' ? a : parseFloat(a);
        if (!isNaN(n2) && a.kind !== 'range') { if (a.kind === 'num' || typeof a === 'number') out.push(n2); }
      }
    });
    return out;
  }
  function allArr(args) {
    var out = [];
    args.forEach(function (a) {
      if (a.kind === 'range') out = out.concat(rangeValues(a));
      else if (a.kind !== 'call') out.push(a.kind === 'nullv' ? null : a);
    });
    return out;
  }
  function rangeValues(node) {
    var eng = node._eng;
    var col = eng._letterToCol(node.col);
    if (!col) return [];
    var rows = eng.rows;
    var end = node.end === null ? rows.length : node.end;
    var out = [];
    for (var i = node.start - 1; i < end && i < rows.length; i++) {
      out.push(rows[i] ? rows[i][col.id] : null);
    }
    return out;
  }
  function condSum(args, mode) {
    var range1 = args[0].kind === 'range' ? args[0] : { kind: 'range', col: args[0].col, start: args[0].row, end: args[0].row, _eng: args[0]._eng };
    var vals = rangeValues(range1);
    var vals2 = args[1].kind === 'range' ? rangeValues(args[1]) : vals;
    var sum = 0;
    vals.forEach(function (v, i) {
      if (matchCond(v, args[2])) { var w = typeof vals2[i] === 'number' ? vals2[i] : parseFloat(vals2[i]); if (!isNaN(w)) sum += w; }
    });
    return sum;
  }
  function condCount(args) {
    var range1 = args[0].kind === 'range' ? args[0] : null;
    var vals = rangeValues(range1 || { col: args[0].col, start: args[0].row, end: args[0].row, _eng: args[0]._eng });
    var n = 0;
    vals.forEach(function (v) { if (matchCond(v, args[1])) n++; });
    return n;
  }
  function matchCond(v, condNode) {
    if (condNode.kind === 'bin' && (condNode.op === '=' || condNode.op === '<>' || condNode.op === '<' || condNode.op === '>' || condNode.op === '<=' || condNode.op === '>=')) {
      var lv = v, rv = condNode.r.kind === 'str' ? condNode.r.v : (condNode.r.kind === 'num' ? condNode.r.v : null);
      if (condNode.op === '=') return String(lv) === String(rv);
      if (condNode.op === '<>') return String(lv) !== String(rv);
      var a = parseFloat(lv), b = parseFloat(rv);
      if (isNaN(a) || isNaN(b)) return String(lv) < String(rv);
      if (condNode.op === '<') return a < b;
      if (condNode.op === '>') return a > b;
      if (condNode.op === '<=') return a <= b;
      if (condNode.op === '>=') return a >= b;
    }
    if (condNode.kind === 'str') return String(v) === condNode.v;
    return false;
  }
  function truthy(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v !== '' && v !== 'FALSE' && v !== '#N/A' && v !== '#NA!';
    return !!v;
  }
  function toDate(v) {
    if (!v) return null;
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function evalNode(node, eng, depth) {
    depth = depth || 0;
    if (depth > 64) return '#CIRC!';
    switch (node.kind) {
      case 'num': return node.v;
      case 'str': return node.v;
      case 'bool': return node.v;
      case 'nullv': return null;
      case 'neg': return -(evalNode(node.a, eng, depth + 1) || 0);
      case 'ref': {
        var col = eng._letterToCol(node.col);
        if (!col) return null;
        var row = eng.rows[node.row - 1];
        if (!row) return null;
        var v = row[col.id];
        if (typeof v === 'string' && v.indexOf('=') === 0) return evalFormulaInternal(v, eng, node.row - 1, depth + 1);
        return v;
      }
      case 'range': return { kind: 'range', col: node.col, start: node.start, end: node.end, _eng: eng };
      case 'bin': {
        var l = evalNode(node.l, eng, depth + 1);
        var r = evalNode(node.r, eng, depth + 1);
        switch (node.op) {
          case '+': return (parseFloat(l) || 0) + (parseFloat(r) || 0);
          case '-': return (parseFloat(l) || 0) - (parseFloat(r) || 0);
          case '*': return (parseFloat(l) || 0) * (parseFloat(r) || 0);
          case '/': return (parseFloat(l) || 0) / ((parseFloat(r) || 0) || 1e-12);
          case '%': return (parseFloat(l) || 0) % ((parseFloat(r) || 0) || 1e-12);
          case '^': return Math.pow(parseFloat(l) || 0, parseFloat(r) || 0);
          case '&': return String(l == null ? '' : l) + String(r == null ? '' : r);
        }
        return null;
      }
      case 'cmp': {
        var lv = evalNode(node.l, eng, depth + 1);
        var rv = evalNode(node.r, eng, depth + 1);
        var la = parseFloat(lv), ra = parseFloat(rv);
        var bothNum = !isNaN(la) && !isNaN(ra) && String(lv) !== '' && String(rv) !== '';
        var a2 = bothNum ? la : String(lv == null ? '' : lv).toLowerCase();
        var b2 = bothNum ? ra : String(rv == null ? '' : rv).toLowerCase();
        switch (node.op) {
          case '=': return a2 === b2;
          case '<>': return a2 !== b2;
          case '<': return a2 < b2;
          case '>': return a2 > b2;
          case '<=': return a2 <= b2;
          case '>=': return a2 >= b2;
        }
        return false;
      }
      case 'call': {
        var fn = node.fn;
        var custom = eng.plugins && eng.plugins.functions[fn];
        var args = node.args.map(function (a) { return evalNode(a, eng, depth + 1); });
        if (custom) return custom.apply(null, args);
        var f = FUNC[fn];
        if (!f) return '#NAME?';
        try { return f(args); } catch (e) { return '#ERROR'; }
      }
    }
    return null;
  }

  function evalFormulaInternal(expr, eng, rowIdx, depth) {
    try {
      var tokens = tokenize(expr.slice(1));
      if (!tokens.length) return null;
      var ast = parse(tokens);
      var val = evalNode(ast, eng, depth);
      return val;
    } catch (e) {
      return '#ERROR';
    }
  }
  TableEngine.prototype._letterToCol = function (letter) {
    var ids = this.columnOrder.filter(function (id) { return !this.hidden[id]; }, this);
    // include leading meta cols in letter mapping? keep letters for real columns only, A = first visible real column
    var i = 0;
    for (var c = 1; c <= letter.length; c++) i = i * 26 + (letter.charCodeAt(c - 1) - 64);
    i--;
    return ids[i] ? this.colById(ids[i]) : null;
  };
  TableEngine.prototype.evaluateFormula = function (expr, rowId) {
    var rowIdx = -1;
    this.rows.forEach(function (r, i) { if (r._id === rowId) rowIdx = i; });
    var cached = this._formulaCache[rowIdx + ':' + expr];
    if (cached !== undefined) return cached;
    var v = evalFormulaInternal(expr, this, rowIdx, 0);
    this._formulaCache[rowIdx + ':' + expr] = v;
    return v === '#ERROR' || v === '#NAME?' || v === '#CIRC!' ? String(v) : v;
  };
  // register custom formula functions
  TableEngine.prototype.registerFunction = TableEngine.prototype.registerFunction;

  /* ================= conditional formatting ================= */
  TableEngine.prototype._conditionalStyle = function (row, c, v) {
    var self = this;
    var rules = this.config.conditional || [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.row && r.type === 'row') {
        var val = self.evaluateFormula(r.expr, row._id);
        if (val && val !== false) return { bg: r.bg || null, color: r.color || null, rowBg: r.rowBg || null };
        continue;
      }
      if (r.col && r.col !== c.id) continue;
      switch (r.type) {
        case 'threshold': {
          var a = parseFloat(v), b = parseFloat(r.value);
          if (isNaN(a) || isNaN(b)) continue;
          var ok = r.op === 'gt' ? a > b : r.op === 'lt' ? a < b : r.op === 'gte' ? a >= b : r.op === 'lte' ? a <= b : a === b;
          if (ok) return { bg: r.bg || null, color: r.color || null };
          break;
        }
        case 'equals':
          if (String(v) === String(r.value)) return { bg: r.bg || null, color: r.color || null };
          break;
        case 'contains':
          if (String(v == null ? '' : v).toLowerCase().indexOf(String(r.text).toLowerCase()) !== -1) return { bg: r.bg || null, color: r.color || null };
          break;
        case 'isBlank':
          if (v === null || v === undefined || v === '') return { bg: r.bg || null };
          break;
        case 'notBlank':
          if (v !== null && v !== undefined && v !== '') return { bg: r.bg || null, color: r.color || null };
          break;
        case 'colorScale': {
          if (v === null || v === undefined || isNaN(parseFloat(v))) continue;
          var nums = self.rows.map(function (x) { return parseFloat(x[c.id]); }).filter(function (n) { return !isNaN(n); });
          if (!nums.length) continue;
          var mn = Math.min.apply(null, nums), mx = Math.max.apply(null, nums);
          var t = mx === mn ? 0.5 : (parseFloat(v) - mn) / (mx - mn);
          return { bg: colorScale(t, r.direction || 'red-green') };
        }
        case 'dataBar': {
          if (v === null || v === undefined || isNaN(parseFloat(v))) continue;
          var nums2 = self.rows.map(function (x) { return parseFloat(x[c.id]); }).filter(function (n) { return !isNaN(n); });
          var mx2 = r.max || Math.max.apply(null, nums2.length ? nums2 : [1]);
          var w = clampPct((parseFloat(v) / (mx2 || 1)) * 100);
          return { prefix: '<span class="cf-databar" style="width:' + w + '%;background:' + (r.color || 'var(--t-brand)') + '"></span>' };
        }
        case 'iconSet': {
          if (v === null || v === undefined || isNaN(parseFloat(v))) continue;
          var nums3 = self.rows.map(function (x) { return parseFloat(x[c.id]); }).filter(function (n) { return !isNaN(n); });
          if (!nums3.length) continue;
          var mn3 = Math.min.apply(null, nums3), mx3 = Math.max.apply(null, nums3);
          var t3 = mx3 === mn3 ? 0.5 : (parseFloat(v) - mn3) / (mx3 - mn3);
          var th = r.thresholds || [0.33, 0.66];
          var icons = r.icons || ['🔻', '🟡', '🔺'];
          var icon = icons[0];
          if (t3 >= th[1]) icon = icons[2];
          else if (t3 >= th[0]) icon = icons[1];
          return { prefix: '<span class="cf-icon">' + icon + '</span> ' };
        }
        case 'formula': {
          var val2 = self.evaluateFormula(r.expr, row._id);
          if (val2 && val2 !== false) return { bg: r.bg || null, color: r.color || null };
          break;
        }
      }
    }
    return null;
  };
  function clampPct(v) { return Math.max(0, Math.min(100, v)); }
  function colorScale(t, dir) {
    // t: 0..1
    var r, g, b;
    if (dir === 'red-green') {
      r = Math.round(255 - t * (255 - 54));
      g = Math.round(80 + t * (179 - 80));
      b = Math.round(80 + t * (126 - 80));
    } else if (dir === 'green-red') {
      r = Math.round(54 + t * (255 - 54));
      g = Math.round(179 - t * (179 - 80));
      b = Math.round(126 - t * (126 - 80));
    } else {
      r = 0; g = Math.round(87 + (1 - t) * 100); b = 255;
    }
    var a = 0.28;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ================= sparkline renderer (plugin) ================= */
  TableEngine.sparklineRenderer = function (v, row, c) {
    var arr = Array.isArray(v) ? v.map(Number).filter(function (n) { return !isNaN(n); }) : [];
    if (arr.length < 2) return '';
    var w = 90, h = 26, pad = 2;
    var mn = Math.min.apply(null, arr), mx = Math.max.apply(null, arr);
    var pts = arr.map(function (n, i) {
      var x = pad + (i / (arr.length - 1)) * (w - pad * 2);
      var y = h - pad - (mx === mn ? 0.5 : (n - mn) / (mx - mn)) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var color = c.sparkColor || 'var(--t-brand)';
    return '<svg class="cf-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" points="' + pts.join(' ') + '"></polyline></svg>';
  };
  TableEngine.progressRenderer = function (v, row, c) {
    var n = parseFloat(v);
    if (isNaN(n)) return '';
    n = Math.max(0, Math.min(100, n));
    var color = n < 40 ? 'var(--t-danger)' : n < 75 ? 'var(--t-warning)' : 'var(--t-success)';
    return '<span class="cf-progress"><i style="width:' + n + '%;background:' + color + '"></i></span><span class="cf-progress-label">' + n + '%</span>';
  };
  TableEngine.badgeRenderer = function (v, row, c) {
    if (v === null || v === undefined || v === '') return '';
    var color = c.colors && c.colors[v] ? c.colors[v] : (typeof v === 'string' ? hashColor(v) : null);
    return '<span class="cf-badge" style="' + (color ? 'background:' + hexA2(color, 0.15) + ';color:' + color + ';' : '') + '">' + String(v) + '</span>';
  };
  TableEngine.ratingRenderer = function (v, row) {
    var n = Math.round(parseFloat(v) || 0);
    var out = '';
    for (var i = 1; i <= 5; i++) out += '<span class="' + (i <= n ? 'star-on' : 'star-off') + '">★</span>';
    return out;
  };
  function hashColor(s) {
    var palette = ['#0057FF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }
  function hexA2(hex, a) {
    var m = String(hex).replace('#', '');
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    var r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
})();
