/*
 * twenty-table-catalog / test/pages.js
 * اختبار smoke بدون متصفح (Node vm + DOM stub)
 * MIT License — see ../LICENSE
 */
const fs=require('fs'), vm=require('vm');
function makeEl(id){
  const listeners={};
  const el={
    id, innerHTML:'', textContent:'', value:'', hidden:false, disabled:false, dir:'',
    dataset:{}, style:{}, title:'', className:'', _children:[], _qcache:{},
    classList:{ _s:new Set(),
      toggle(c,f){ if(f===undefined){ this._s.has(c)?this._s.delete(c):this._s.add(c);} else if(f) this._s.add(c); else this._s.delete(c); return this._s.has(c);},
      add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)} },
    setAttribute(k,v){ this[k]=v; },
    getAttribute(k){ return this[k]||null; },
    addEventListener(t,fn){ (listeners[t]=listeners[t]||[]).push(fn); },
    removeEventListener(){},
    focus(){ this._focused=true; }, blur(){}, click(){}, select(){},
    appendChild(c){ this._children.push(c); c.parentNode=this; return c; },
    prepend(c){ this._children.unshift(c); c.parentNode=this; return c; },
    remove(){}, removeChild(){},
    closest(){ return null; },
    contains(){ return false; },
    querySelector(sel){ const cache=this._qcache; if(!cache[sel]) cache[sel]=makeEl(this.id+'::'+sel); cache[sel].parentNode=this; return cache[sel]; },
    querySelectorAll(sel){ const c=this.querySelector(sel); return [c]; },
    getBoundingClientRect(){ return {top:0,bottom:0,left:0,right:0,width:0,height:0}; },
    offsetWidth:100, offsetHeight:30, scrollTop:0, clientHeight:600, clientWidth:800,
    parentNode:null
  };
  return el;
}
function buildCtx(){
  const g={ console, setTimeout:(fn,ms)=>0, clearTimeout(){},
    performance:{ now:()=>Date.now() },
    requestAnimationFrame:(fn)=>0, cancelAnimationFrame(){},
    matchMedia:()=>({matches:false}),
    navigator:{ clipboard:null },
    _ls:{},
    document:null,
    fetch:()=>Promise.reject(new Error('no net')),
    URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},
    Blob:function(parts,opts){this.type=opts&&opts.type; this.text=Array.isArray(parts)?parts.join(''):String(parts);},
    FileReader:function(){ this.readAsText=()=>{ this.onload&&this.onload(); }; },
    scrollTo(){}, prompt:()=>'test', confirm:()=>true,
    addEventListener(){}, removeEventListener(){},
    _capturedBlob:null, _ttDownloadBlob:null
  };
  const doc={
    title:'', documentElement:{dataset:{}},
    readyState:'loading', _dcl:[],
    body:makeEl('body'),
    createElement:()=>makeEl('dyn'),
    _els:{},
    querySelector(s){ if(!this._els[s]) this._els[s]=makeEl('doc::'+s); return this._els[s]; },
    querySelectorAll(s){ const e=this.querySelector(s); return [e]; },
    addEventListener(t,fn){ if(t==='DOMContentLoaded') this._dcl.push(fn); },
    removeEventListener(){},
    activeElement:null, execCommand(){return true},
    getElementById(id){ if(!this._els['#'+id]) this._els['#'+id]=makeEl(id); return this._els['#'+id]; }
  };
  g.document=doc; g.window=g; g.self=g; g.top=g; g.globalThis=g;
  g.localStorage={ getItem(k){return Object.prototype.hasOwnProperty.call(g._ls,k)?g._ls[k]:null}, setItem(k,v){g._ls[k]=String(v);}, removeItem(k){delete g._ls[k];} };
  return {g, doc};
}
const PAGES={
  index:['data-groups.js','data-features-1.js','data-features-2.js','data-features-3.js','data/feature-status.js','engine/engine-core.js','engine/engine-formula.js','engine/engine-io.js','engine/engine-edit.js','engine/engine-ui.js','shared/site.js','pages/catalog-table.js','pages/index.js'],
  people:['data/sample-people.js','engine/engine-core.js','engine/engine-formula.js','engine/engine-io.js','engine/engine-edit.js','engine/engine-ui.js','shared/site.js','pages/people.js'],
  projects:['data/sample-projects.js','engine/engine-core.js','engine/engine-formula.js','engine/engine-io.js','engine/engine-edit.js','engine/engine-ui.js','shared/site.js','pages/projects.js'],
  features:['data-groups.js','data-features-1.js','data-features-2.js','data-features-3.js','data/feature-status.js','engine/engine-core.js','engine/engine-formula.js','engine/engine-io.js','engine/engine-edit.js','engine/engine-ui.js','shared/site.js','pages/catalog-table.js','pages/features.js'],
  stress:['engine/engine-core.js','engine/engine-formula.js','engine/engine-io.js','engine/engine-edit.js','engine/engine-ui.js','shared/site.js','pages/stress.js']
};
let fails=0;
const assert=(c,m)=>{ if(!c){ console.error('  ASSERT FAIL:',m); fails++; } else console.log('  ok -',m); };
for(const [page, files] of Object.entries(PAGES)){
  console.log('== page:', page);
  const {g, doc}=buildCtx();
  doc.body.dataset.page=page;
  vm.createContext(g);
  for(const f of files){
    try { vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..',f),'utf8'), g, {filename:f}); }
    catch(e){ console.error('  LOAD FAIL', f, ':', e.message); fails++; }
  }
  // fire DOMContentLoaded
  try { doc._dcl.forEach(fn=>fn()); } catch(e){ console.error('  DCL FAIL:', e.message); fails++; }
  const engines=g.TTC_ENGINES||[];
  assert(engines.length===1, page+' registered 1 engine (got '+engines.length+')');
  if(engines[0]){
    const eng=engines[0];
    const rc=eng.dataRowCount();
    console.log('  engine id='+eng.id, 'rows='+eng.rows.length, 'visible='+eng.visibleRows.length);
    if(page==='index'||page==='features') assert(rc===800, '800 feature rows');
    if(page==='people') assert(rc===48, '48 people');
    if(page==='projects') assert(rc===20, '20 projects');
    if(page==='stress') assert(rc===100000, '100k rows');
    if(page==='projects'){
      // live formula column check
      const val=eng.evaluateFormula(eng.rows[0].consumption, eng.rows[0]._id);
      const expected=Math.round((eng.rows[0].spent/eng.rows[0].budget)*100);
      assert(val===expected, 'consumption formula '+val+' == '+expected);
    }
  }
}
console.log(fails? 'PAGE TESTS FAILED ('+fails+')' : 'ALL PAGE TESTS PASSED');
process.exit(fails?1:0);
