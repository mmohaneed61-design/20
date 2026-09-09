/*
 * twenty-table-catalog / test/smoke.js
 * اختبار smoke بدون متصفح (Node vm + DOM stub)
 * MIT License — see ../LICENSE
 */
const fs=require('fs'), vm=require('vm');
function makeEl(id){
  const listeners={};
  const el={
    id, innerHTML:'', textContent:'', value:'', hidden:false, disabled:false, dir:'',
    dataset:{}, style:{}, title:'', className:'', _children:[],
    classList:{ _s:new Set(),
      toggle(c,f){ if(f===undefined){ this._s.has(c)?this._s.delete(c):this._s.add(c);} else if(f) this._s.add(c); else this._s.delete(c); return this._s.has(c);},
      add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)} },
    setAttribute(k,v){ this[k]=v; },
    getAttribute(k){ return this[k]||null; },
    addEventListener(t,fn){ (listeners[t]=listeners[t]||[]).push(fn); },
    removeEventListener(){},
    focus(){}, blur(){}, click(){}, select(){},
    appendChild(c){ this._children.push(c); c.parentNode=this; return c; },
    remove(){}, removeChild(){},
    closest(){ return null; },
    contains(){ return false; },
    querySelector(sel){ const cache=this._qcache||(this._qcache={}); if(!cache[sel]) cache[sel]=makeEl(this.id+'::'+sel); cache[sel].parentNode=this; return cache[sel]; },
    querySelectorAll(sel){ const c=this.querySelector(sel); return [c]; },
    getBoundingClientRect(){ return {top:0,bottom:0,left:0,right:0,width:0,height:0}; },
    offsetWidth:100, offsetHeight:30, scrollTop:0, clientHeight:600, clientWidth:800,
    parentNode:null
  };
  return el;
}
const g={ console, setTimeout, clearTimeout,
  performance:{ now:()=>Date.now() },
  requestAnimationFrame:(fn)=>0, cancelAnimationFrame(){},
  matchMedia:()=>({matches:false}),
  navigator:{ clipboard:null },
  localStorage:{ _s:{}, getItem(k){return Object.prototype.hasOwnProperty.call(this._s,k)?this._s[k]:null}, setItem(k,v){this._s[k]=String(v)}, removeItem(k){delete this._s[k]} },
  document:null,
  fetch:()=>Promise.reject(new Error('no net')),
  URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},
  Blob:function(parts,opts){this.type=opts&&opts.type; this.text=Array.isArray(parts)?parts.join(''):String(parts);},
  FileReader:function(){ this.readAsText=()=>{ this.onload&&this.onload(); }; },
  scrollTo(){}, prompt:()=>'test', confirm:()=>true,
  addEventListener(){}, removeEventListener(){},
  _capturedBlob:null, _ttDownloadBlob:null
};
g.document={
  title:'', documentElement:{dataset:{}},
  body:{appendChild(c){return c;}, removeChild(){}, contains(){return true;}},
  createElement:()=>makeEl('dyn'),
  querySelector(s){ if(!g.document._els[s]) g.document._els[s]=makeEl('doc::'+s); return g.document._els[s]; },
  querySelectorAll:(s)=>{ const e=g.document.querySelector(s); return [e]; },
  addEventListener(){}, removeEventListener(){},
  activeElement:null, execCommand(){return true}
};
g.document._els={};
g.window=g; g.self=g; g.top=g; g.globalThis=g;
vm.createContext(g);
['engine/engine-core.js','engine/engine-formula.js','engine/engine-io.js','engine/engine-edit.js','engine/engine-ui.js'].map(f=>require('path').join(__dirname,'..',f)).forEach(f=>vm.runInContext(fs.readFileSync(f,'utf8'),g));
g.TTC_F1=[[1,'اختبار واحد','One'],[2,'قيمة 100','Val 100'],[3,'قيمة 200','Val 200']];
g.TTC_F2=[]; g.TTC_F3=[];
const engine=g.TableEngine.create({
  id:'t', el:'#app', rowNumber:true, showSelection:true, pageSize:2, autoSave:false, footer:true,
  data:[
    {name:'أحمد', num:100, status:'نشط', date:'2026-01-01', tags:['a','b']},
    {name:'سارة', num:50,  status:'موقوف', date:'2026-02-01'},
    {name:'خالد', num:300, status:'نشط', date:'2026-03-01'},
    {name:'نورة', num:20,  status:'متأخر', date:'2026-04-01', note:'مهم'},
    {name:'فهد',  num:90,  status:'نشط', date:'2026-05-01'}
  ],
  columns:[
    {id:'name',title:'الاسم',type:'text',width:150},
    {id:'num',title:'القيمة',type:'number',width:120,agg:'sum',validators:[{min:0,max:500}]},
    {id:'status',title:'الحالة',type:'select',width:120,options:['نشط','موقوف','متأخر']},
    {id:'date',title:'التاريخ',type:'date',width:120},
    {id:'tags',title:'التصنيفات',type:'multiselect',width:150}
  ],
  conditional:[{col:'num',type:'threshold',op:'gt',value:100,bg:'rgba(0,0,0,.1)'}]
});
let fails=0;
const assert=(c,m)=>{ if(!c){ console.error('ASSERT FAIL:',m); fails++; } else console.log('ok -',m); };
assert(engine.visibleRows.length===2, 'page 1 shows 2 rows (pagination slice)');
assert(engine.dataRowCount()===5, 'filtered total 5');
engine.setSort('num','desc');
assert(engine.visibleDataRows[0].name==='خالد', 'sort desc by num');
engine.setSort('num','asc');
assert(engine.visibleDataRows[0].name==='نورة', 'sort asc by num');
engine.setFilter('status',{op:'equals',values:['نشط']});
assert(engine.dataRowCount()===3, 'filter equals 3 rows');
engine.setFilter('num',{op:'gt',values:['100']});
assert(engine.dataRowCount()===1, 'filter + gt 1 row (خالد 300)');
engine.clearFilters();
assert(engine.dataRowCount()===5, 'clear filters back to 5');
engine.filterLogic='OR';
engine.setFilter('status',{op:'equals',values:['نشط']});
engine.setFilter('num',{op:'lt',values:['60']});
console.log('OR rows:', engine.dataRowCount(), engine.visibleDataRows.map(r=>r.name+':'+r.num+':'+r.status));
assert(engine.dataRowCount()===5, 'OR logic 5 rows (union)');
engine.filterLogic='AND'; engine.clearFilters();
engine.setGlobal('أحمد');
assert(engine.dataRowCount()===1, 'global search finds 1');
engine.setGlobal('');
engine.setGroupBy(['status']);
const groups=engine.visibleRows.filter(v=>v.kind==='group');
console.log('kinds:', engine.visibleRows.map(v=>v.kind+':'+(v.kind==='group'?v.node.key:'')).slice(0,12));
assert(groups.length===3, 'group by status -> 3 groups');
assert(groups[0].node.count+groups[1].node.count+groups[2].node.count===5, 'group counts sum to 5');
engine.setGroupBy([]);
const row1=engine.rows[0];
let r=engine.updateCell(row1._id,'num',600);
assert(r.ok===false, 'validation rejects >max 500');
r=engine.updateCell(row1._id,'num',150);
assert(r.ok===true, 'valid edit accepted');
engine.undo();
assert(engine.rows[0].num===100, 'undo reverts edit');
engine.redo();
assert(engine.rows[0].num===150, 'redo re-applies edit');
const before=engine.rows.length;
engine.addRow({name:'جديد',num:10,status:'جديد'});
assert(engine.rows.length===before+1, 'add row');
engine.deleteRow(engine.rows[engine.rows.length-1]._id, true);
assert(engine.rows.length===before, 'delete row');
const expected=engine.rows.reduce((a,r2)=>a+(parseFloat(r2.num)||0),0)+10;
const val=engine.evaluateFormula('=SUM(B1:B'+engine.rows.length+')+10', row1._id);
assert(val===expected, 'formula SUM(B1:Bn) works ('+val+'='+expected+')');
const v2=engine.evaluateFormula('=IF(B1>50,"كبير","صغير")', row1._id);
assert(v2==='كبير', 'IF cell-ref works (num='+row1.num+' -> '+v2+')');
const v3b=engine.evaluateFormula('=B1+B5', row1._id);
assert(v3b===parseFloat(row1.num)+parseFloat(engine.rows[4].num), 'binary cell refs: '+v3b);
const v3=engine.evaluateFormula('=ROUND(2.567,2)');
assert(v3===2.57, 'ROUND works: '+v3);
g._ttDownloadBlob=(b)=>{ g._capturedBlob=b; };
engine.export('csv',{scope:'all'});
assert(g._capturedBlob && g._capturedBlob.text.indexOf('الاسم')!==-1, 'CSV export has headers');
engine.export('json',{scope:'all'});
assert(g._capturedBlob.text.indexOf('name')!==-1, 'JSON export has fields');
engine.export('markdown',{scope:'all'});
assert(g._capturedBlob.text.indexOf('| ')!==-1, 'Markdown export table');
engine.export('sql',{scope:'all'});
assert(g._capturedBlob.text.indexOf('INSERT INTO')!==-1, 'SQL export');
const cpy=engine._serialize('tsv');
assert(cpy.split('\n').length===2, 'copy focused row = header+1 line');
assert(cpy.split('\n')[1].indexOf(engine.visibleDataRows[0].name)!==-1, 'copied row contains focused name');
console.log('copied line2:', cpy.split('\n')[1].slice(0,60));
assert(typeof engine.getData()==='object' && engine.getData().length===before, 'getData api');
engine.setSelection([engine.rows[0]._id]);
assert(Object.keys(engine.selection).length===1, 'setSelection api');
const st=engine.exportState();
assert(Array.isArray(st.columnOrder) && st.columnOrder.length===5, 'exportState api');
console.log(fails? 'SMOKE TEST FAILED ('+fails+')' : 'ALL SMOKE TESTS PASSED');
process.exit(fails?1:0);
