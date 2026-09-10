/* ============================================================
   موسوعة خصائص الجداول — 2000 خاصية
   المنطق التفاعلي: بحث، تصنيف، درج أقسام، حالات تنفيذ، تصدير
   ============================================================ */
(function(){
"use strict";

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ---------- البيانات ---------- */
const DATA = [
  ...(window.TABLE_DATA_PART1 || []),
  ...(window.TABLE_DATA_PART2 || []),
  ...(window.TABLE_DATA_PART3 || []),
  ...(window.TABLE_DATA_PART4 || [])
];
const TOTAL = DATA.reduce((n,s)=>n+s.f.length,0);

const CATS = {
  structure:  {label:"البنية والأعمدة",            color:"#38bdf8"},
  rows:       {label:"الصفوف والخلايا",            color:"#2dd4bf"},
  selection:  {label:"التحديد",                    color:"#a78bfa"},
  navigation: {label:"التنقل والعرض والمظهر",       color:"#818cf8"},
  dataops:    {label:"الفرز والفلترة والبحث",      color:"#e879f9"},
  editing:    {label:"التحرير والمحررات",          color:"#fb7185"},
  quality:    {label:"التحقق وجودة البيانات",       color:"#f59e0b"},
  analysis:   {label:"المعادلات والتحليل",         color:"#f97316"},
  viz:        {label:"الرسوم ولوحات المتابعة",     color:"#60a5fa"},
  hierarchy:  {label:"الهرم والعلاقات",             color:"#34d399"},
  governance: {label:"القوالب والعروض",             color:"#4ade80"},
  dataio:     {label:"الاستيراد والتصدير والطباعة", color:"#06b6d4"},
  api:        {label:"واجهات التكامل والأتمتة",     color:"#6366f1"},
  reliability:{label:"الأداء والاعتمادية",         color:"#94a3b8"},
  collab:     {label:"التعاون وسير العمل",         color:"#f472b6"},
  security:   {label:"الأمان والخصوصية والتدقيق",  color:"#ef4444"},
  i18n:       {label:"العربية وتعدد اللغات",       color:"#22d3ee"},
  a11y:       {label:"الإتاحة والجوال والمتجاوب",   color:"#a3e635"},
  devops:     {label:"المطور والمراقبة والتشغيل",   color:"#facc15"},
  domain:     {label:"جداول المجالات",             color:"#fbbf24"}
};

const ROADMAP = [
  {title:"تثبيت أول عمودين",        secs:[1],  why:"يبقي أهم المعلومات (المعرف، الاسم، الحالة) ظاهرة أثناء التمرير الأفقي لباقي الأعمدة."},
  {title:"إدارة الأعمدة",           secs:[2],  why:"إخفاء وإظهار وإعادة ترتيب الأعمدة حسب ما يحتاجه كل مستخدم."},
  {title:"التحديد المتعدد",         secs:[7],  why:"العمل على صفوف دفعة واحدة: حذف، تصدير، تغيير حالة، إسناد."},
  {title:"التنقل بلوحة المفاتيح",   secs:[9,10],why:"سرعة حقيقية للمستخدمين الثقيلين: أسهم، Tab، Enter، Escape، وأوامر سريعة."},
  {title:"الفرز والفلترة والبحث",   secs:[12,13,17],why:"الوصول لأي سجل من آلاف السجلات في ثوانٍ، مع بحث شامل وتجاهل التشكيل."},
  {title:"التحرير والتحقق",         secs:[20,27],why:"تحرير مريح داخل الخلية مع قواعد تحقق تمنع البيانات غير الصالحة."},
  {title:"النسخ واللصق",             secs:[30], why:"التعاون مع Excel ولصق نطاقات كبيرة دون استبدال الممتلئ بالخطأ."},
  {title:"حفظ العروض",               secs:[48], why:"كل فريق يرى الجدول بالأعمدة والفرز والتجميع التي تناسبه."},
  {title:"التصدير",                 secs:[53], why:"تصدير النتائج المفلترة أو المحددة إلى CSV وJSON وExcel وغيرها."},
  {title:"الصلاحيات",               secs:[65,66],why:"أدوار أساسية (مشاهدة، إدخال، تحرير، مراجعة، إدارة) وصلاحيات على مستوى الصف والعمود."},
  {title:"الأداء مع البيانات الكبيرة", secs:[41,70,71],why:"تحميل تدريجي، وافتراضي للصفوف، وفرز وفلترة بالخادم مع فهرسة."}
];

/* ---------- تطبيع النص العربي للبحث ---------- */
function norm(s){
  return String(s)
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g,"")
    .replace(/[أإآٱ]/g,"ا")
    .replace(/ة/g,"ه")
    .replace(/[ىئ]/g,"ي")
    .replace(/ؤ/g,"و")
    .replace(/\s+/g," ")
    .trim();
}
function esc(s){
  return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

/* فهرس مسطّح لكل الخصائص */
const FLAT = [];
const TITLE_NORM = [];
DATA.forEach((s,si)=>{
  TITLE_NORM.push(norm(s.t));
  s.f.forEach((f,i)=>FLAT.push({sec:si, idx:i, g:si*20+i, text:f, norm:norm(f)}));
});

/* ---------- حالة المستخدم (localStorage) ---------- */
const LS_STATUS="tf2000.status";
const LS_THEME ="tf2000.theme";
let status={};
try{ status = JSON.parse(localStorage.getItem(LS_STATUS)||"{}") || {}; }catch(e){ status={}; }
function saveStatus(){ try{ localStorage.setItem(LS_STATUS, JSON.stringify(status)); }catch(e){} }
function setStat(g,st){ if(st==="none") delete status[g]; else status[g]=st; saveStatus(); }
function cycleStat(g){
  const cur = status[g]||"none";
  const next = {none:"plan", plan:"done", done:"skip", skip:"none"}[cur];
  setStat(g,next);
  return next;
}
const STATE_LABELS = {none:"—", plan:"مخطّط", done:"✓ مُنفّذ", skip:"✕ مستبعد"};

function secCounts(si){
  let plan=0,done=0,skip=0;
  for(let i=0;i<DATA[si].f.length;i++){
    const st=status[si*20+i];
    if(st==="plan")plan++; else if(st==="done")done++; else if(st==="skip")skip++;
  }
  return {plan,done,skip};
}
function overallDone(){
  let n=0; for(const k in status) if(status[k]==="done") n++;
  return n;
}

/* ---------- عناصر ---------- */
const grid=$("#grid"), chipsWrap=$("#catChips"), qInput=$("#q"),
      resultsBox=$("#searchResults"), searchMeta=$("#searchMeta"),
      drawer=$("#drawer"), backdrop=$("#backdrop"),
      dList=$("#dList"), dNum=$("#dNum"), dTitle=$("#dTitle"), dCat=$("#dCat"),
      dBar=$("#dBar"), dProgress=$("#dProgress"), toast=$("#toast"), toTop=$("#toTop");

let activeCat="all";
let query="";
let curWords=[];
let searchHits=[];
let curSec=-1;
let lastFocus=null;
let firstGridRender=true;

/* ---------- شرائح المجالات ---------- */
function catCounts(){
  const c={all:DATA.length};
  DATA.forEach(s=>{ c[s.c]=(c[s.c]||0)+1; });
  return c;
}
function renderChips(){
  const counts=catCounts();
  let html=`<button type="button" class="chip ${activeCat==="all"?"active":""}" data-cat="all" style="--cat:#818cf8">
      <span class="dot"></span>الكل <span class="cnt">${DATA.length}</span></button>`;
  for(const [k,c] of Object.entries(CATS)){
    html+=`<button type="button" class="chip ${activeCat===k?"active":""}" data-cat="${k}" style="--cat:${c.color}">
      <span class="dot"></span>${c.label} <span class="cnt">${counts[k]||0}</span></button>`;
  }
  chipsWrap.innerHTML=html;
}
chipsWrap.addEventListener("click",e=>{
  const chip=e.target.closest(".chip");
  if(!chip) return;
  activeCat=chip.dataset.cat;
  renderChips(); renderGrid();
});

/* ---------- شبكة الأقسام ---------- */
function cardStatesHtml(cnt){
  let h="";
  if(cnt.done) h+=`<span class="s-ok" title="منفّذ">✓ ${cnt.done}</span>`;
  if(cnt.plan) h+=`<span class="s-plan" title="مخطّط">◔ ${cnt.plan}</span>`;
  if(cnt.skip) h+=`<span title="مستبعد">✕ ${cnt.skip}</span>`;
  return h;
}
function cardHtml(s,si){
  const c=CATS[s.c], cnt=secCounts(si);
  const pct=Math.round(cnt.done/s.f.length*100);
  return `<article class="card${firstGridRender?" reveal":""}" data-sec="${si}" style="--cat:${c.color}"
      tabindex="0" role="button" aria-label="قسم ${si+1}: ${esc(s.t)}">
    <div class="card-top">
      <span class="card-num">${String(si+1).padStart(3,"0")}</span>
      <span class="card-cat">${esc(c.label)}</span>
    </div>
    <h3 class="card-title">${esc(s.t)}</h3>
    <div class="card-foot">
      <span class="card-count">${s.f.length} خاصية</span>
      <span class="card-states">${cardStatesHtml(cnt)}</span>
    </div>
    <div class="card-bar"><i style="width:${pct}%"></i></div>
  </article>`;
}
function renderGrid(){
  const words=curWords;
  let html="", shown=0;
  DATA.forEach((s,si)=>{
    if(activeCat!=="all" && s.c!==activeCat) return;
    if(words.length){
      const hit = words.every(w=>TITLE_NORM[si].includes(w))
        || s.f.some((_,i)=>words.every(w=>FLAT[si*20+i].norm.includes(w)));
      if(!hit) return;
    }
    html+=cardHtml(s,si); shown++;
  });
  grid.innerHTML=html;
  $("#gridEmpty").hidden = shown>0;
  if(firstGridRender){ firstGridRender=false; watchReveals(grid); }
}
function updateCard(si){
  const card=grid.querySelector(`.card[data-sec="${si}"]`);
  if(!card) return;
  const cnt=secCounts(si), n=DATA[si].f.length;
  const bar=card.querySelector(".card-bar i");
  if(bar) bar.style.width=Math.round(cnt.done/n*100)+"%";
  const st=card.querySelector(".card-states");
  if(st) st.innerHTML=cardStatesHtml(cnt);
}
grid.addEventListener("click",e=>{
  const card=e.target.closest(".card");
  if(card) openDrawer(+card.dataset.sec);
});
grid.addEventListener("keydown",e=>{
  if(e.key==="Enter"||e.key===" "){
    const card=e.target.closest(".card");
    if(card){ e.preventDefault(); openDrawer(+card.dataset.sec); }
  }
});

/* ---------- الظهور عند التمرير ---------- */
const io=new IntersectionObserver(es=>{
  es.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); } });
},{threshold:.06,rootMargin:"0px 0px -20px 0px"});
function watchReveals(scope){
  (scope||document).querySelectorAll(".reveal:not(.in)").forEach(el=>io.observe(el));
}

/* ---------- البحث ---------- */
let searchTimer=null;
qInput.addEventListener("input",()=>{
  query=qInput.value;
  clearTimeout(searchTimer);
  searchTimer=setTimeout(doSearch,110);
});
function doSearch(){
  const q=norm(query);
  curWords = q ? q.split(" ").filter(Boolean) : [];
  searchHits=[];
  if(curWords.length){
    for(const f of FLAT){
      const hay=f.norm;
      if(curWords.every(w=>hay.includes(w)||TITLE_NORM[f.sec].includes(w))){
        searchHits.push(f);
        if(searchHits.length>=400) break;
      }
    }
  }
  renderResults();
  renderGrid();
}
function hl(text){
  if(!curWords.length) return esc(text);
  const ntext=norm(text);
  const marks=[];
  for(const w of curWords){
    let i=0;
    while((i=ntext.indexOf(w,i))>=0 && marks.length<6){
      let dup=false;
      for(const m of marks){ if(i<m[1] && i+w.length>m[0]){ dup=true; break; } }
      if(!dup) marks.push([i,i+w.length]);
      i+=w.length;
    }
  }
  if(!marks.length) return esc(text);
  marks.sort((a,b)=>a[0]-b[0]);
  let out="",p=0;
  for(const [s,e] of marks){
    out+=esc(text.slice(p,s))+"<mark>"+esc(text.slice(s,e))+"</mark>";
    p=e;
  }
  out+=esc(text.slice(p));
  return out;
}
function renderResults(){
  if(!query.trim()){
    resultsBox.innerHTML=""; searchMeta.innerHTML="";
    return;
  }
  if(!searchHits.length){
    searchMeta.innerHTML=`<b>0</b> نتيجة`;
    resultsBox.innerHTML='<div class="search-empty">لا نتائج — جرّب كلمة أبسط مثل «فرز» أو «فلتر» أو «تصدير».</div>';
    return;
  }
  const shown=searchHits.slice(0,60);
  const secs=new Set(shown.map(h=>h.sec)).size;
  searchMeta.innerHTML=`<b>${searchHits.length}</b> خاصية مطابقة (أول 60 معروضة) في <b>${secs}</b> قسم`;
  resultsBox.innerHTML=shown.map(h=>{
    const s=DATA[h.sec];
    return `<button type="button" class="res" data-sec="${h.sec}" data-g="${h.g}">
      <span class="res-num">#${h.g+1}</span>
      <span class="res-body">
        <span class="res-text">${hl(h.text)}</span>
        <span class="res-sec">قسم ${h.sec+1} · ${esc(s.t)}</span>
      </span>
      <span class="res-dot" style="background:${CATS[s.c].color}"></span>
    </button>`;
  }).join("");
}
resultsBox.addEventListener("click",e=>{
  const res=e.target.closest(".res");
  if(!res) return;
  openDrawer(+res.dataset.sec, +res.dataset.g);
});

/* ---------- درج القسم ---------- */
function renderDrawerList(){
  const s=DATA[curSec];
  dList.innerHTML=s.f.map((f,i)=>{
    const g=curSec*20+i;
    const st=status[g]||"none";
    return `<li class="ditem st-${st}" id="fi-${g}">
      <span class="dnum">${i+1}</span>
      <span class="dtext">${esc(f)}</span>
      <button type="button" class="dstate" data-g="${g}"
        title="تبديل الحالة: لا شيء ← مخطّط ← مُنفّذ ← مُستبعد">${STATE_LABELS[st]}</button>
    </li>`;
  }).join("");
}
function updateDrawerProgress(){
  const cnt=secCounts(curSec), n=DATA[curSec].f.length;
  dBar.style.width=Math.round(cnt.done/n*100)+"%";
  dProgress.textContent=`${cnt.done} من ${n} منفّذ · ${cnt.plan} مخطّط · ${cnt.skip} مستبعد`;
}
function updateRing(){
  const pct=TOTAL? overallDone()/TOTAL : 0;
  const C=116.2;
  $("#ringFg").style.strokeDashoffset=(C*(1-pct)).toFixed(1);
  $("#ringText").textContent=Math.round(pct*100)+"%";
}
function openDrawer(si,focusG){
  curSec=si;
  const s=DATA[si], c=CATS[s.c];
  dNum.textContent=String(si+1).padStart(3,"0");
  dTitle.textContent=s.t;
  dCat.innerHTML=`<span class="dot" style="background:${c.color}"></span>${esc(c.label)}`;
  renderDrawerList();
  updateDrawerProgress();
  lastFocus=document.activeElement;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden","false");
  backdrop.hidden=false;
  requestAnimationFrame(()=>backdrop.classList.add("open"));
  document.body.style.overflow="hidden";
  if(focusG!=null){
    const li=document.getElementById("fi-"+focusG);
    if(li){
      if(typeof li.scrollIntoView==="function") li.scrollIntoView({block:"center"});
      li.classList.add("flash");
      setTimeout(()=>li.classList.remove("flash"),1400);
    }
  }else{
    dList.scrollTop=0;
  }
  $("#closeDrawer").focus();
}
function closeDrawer(){
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden","true");
  backdrop.classList.remove("open");
  document.body.style.overflow="";
  setTimeout(()=>{ backdrop.hidden=true; },320);
  if(lastFocus && lastFocus.focus) lastFocus.focus();
}
backdrop.addEventListener("click",closeDrawer);
$("#closeDrawer").addEventListener("click",closeDrawer);
dList.addEventListener("click",e=>{
  const btn=e.target.closest(".dstate");
  if(!btn) return;
  const g=+btn.dataset.g;
  const next=cycleStat(g);
  const li=document.getElementById("fi-"+g);
  if(li){
    li.className="ditem st-"+next;
    btn.textContent=STATE_LABELS[next];
  }
  updateDrawerProgress();
  updateCard(g/20|0);
  updateRing();
});
$("#dReset").addEventListener("click",()=>{
  if(curSec<0) return;
  for(let i=0;i<20;i++) delete status[curSec*20+i];
  saveStatus();
  renderDrawerList();
  updateDrawerProgress();
  updateCard(curSec);
  updateRing();
});

/* ---------- خارطة الطريق ---------- */
function renderRoadmap(){
  let items=ROADMAP.map((r,i)=>{
    const secs=r.secs.map(si=>
      `<button type="button" class="step-sec" data-sec="${si}">${String(si+1).padStart(3,"0")} · ${esc(DATA[si].t)}</button>`
    ).join("");
    return `<li class="reveal">
      <div class="step-num">${String(i+1).padStart(2,"0")}</div>
      <h3>${esc(r.title)}</h3>
      <p>${esc(r.why)}</p>
      <div class="step-secs">${secs}</div>
    </li>`;
  }).join("");
  const domainSecs=[88,89,90,91,93,95].map(si=>
    `<button type="button" class="step-sec" data-sec="${si}">${String(si+1).padStart(3,"0")} · ${esc(DATA[si].t)}</button>`
  ).join("");
  items+=`<li class="reveal" style="border-color:rgba(52,211,153,.4)">
      <div class="step-num" style="color:#34d399;background:rgba(52,211,153,.12);border-color:rgba(52,211,153,.4)">✦</div>
      <h3>ثم خصائص المجال حسب الاحتياج</h3>
      <p>بعد تثبيت الأساس، أضف ما يناسب مستخدميك: المالية، المخزون، المشاريع والمهام، المبيعات، الحجوزات، وغيرها — واجعلها <b>اختيارية</b>.</p>
      <div class="step-secs">${domainSecs}</div>
      <div class="step-note">تذكير: القائمة ليست توصية بتنفيذها كلها — اختر المناسب، واجعل الخصائص المتقدمة اختيارية حتى لا تصبح الواجهة معقدة.</div>
    </li>`;
  $("#roadmapGrid").innerHTML=items;
}
$("#roadmapGrid").addEventListener("click",e=>{
  const b=e.target.closest(".step-sec");
  if(b) openDrawer(+b.dataset.sec);
});

/* ---------- عن القائمة (المجالات) ---------- */
function renderAboutCats(){
  const counts=catCounts();
  $("#aboutCats").innerHTML=Object.entries(CATS).map(([k,c])=>
    `<li data-cat="${k}"><span class="dot" style="background:${c.color}"></span>${esc(c.label)}<span class="cnt">${counts[k]||0}</span></li>`
  ).join("");
}
$("#aboutCats").addEventListener("click",e=>{
  const li=e.target.closest("li[data-cat]");
  if(!li) return;
  activeCat=li.dataset.cat;
  renderChips(); renderGrid();
  document.getElementById("sections").scrollIntoView({behavior:"smooth"});
});

/* ---------- عدّادات الواجهة ---------- */
let counted=false;
function animateCounters(){
  if(counted) return; counted=true;
  $$(".stat-num").forEach(el=>{
    const target=+el.dataset.count;
    const t0=performance.now(), dur=1500;
    (function tick(t){
      const p=Math.min(1,((t||performance.now())-t0)/dur);
      const e=1-Math.pow(1-p,3);
      el.textContent=Math.round(target*e).toLocaleString("en-US");
      if(p<1) requestAnimationFrame(tick);
    })(t0);
  });
}
const statsEl=document.querySelector(".stats");
if(statsEl){
  const sio=new IntersectionObserver(es=>{
    es.forEach(en=>{ if(en.isIntersecting){ animateCounters(); sio.disconnect(); } });
  },{threshold:.3});
  sio.observe(statsEl);
}

/* ---------- توست ---------- */
let toastTimer=null;
function showToast(o){
  toast.innerHTML=`<span class="t-ico">${o.ico||"✨"}</span>
    <span class="t-body">
      <span class="t-title">${esc(o.title||"")}</span>
      <span class="t-main">${o.mainHtml||esc(o.main||"")}</span>
    </span>
    ${o.btn?`<button type="button" class="t-btn">${esc(o.btn)}</button>`:""}`;
  toast.hidden=false;
  requestAnimationFrame(()=>toast.classList.add("show"));
  if(o.btn) toast.querySelector(".t-btn").addEventListener("click",()=>{ hideToast(); o.onBtn&&o.onBtn(); });
  clearTimeout(toastTimer);
  toastTimer=setTimeout(hideToast,7000);
}
function hideToast(){
  toast.classList.remove("show");
  setTimeout(()=>{ toast.hidden=true; },350);
}

/* ---------- خاصية عشوائية ---------- */
function randomFeature(){
  const f=FLAT[Math.floor(Math.random()*FLAT.length)];
  const s=DATA[f.sec];
  showToast({
    ico:"🎲",
    title:`خاصية رقم ${f.g+1} من 2000 · قسم ${f.sec+1}: ${s.t}`,
    main:f.text,
    btn:"فتح القسم",
    onBtn:()=>openDrawer(f.sec,f.g)
  });
}
$("#randomBtn").addEventListener("click",randomFeature);

/* ---------- التصدير ---------- */
function download(name,content,mime){
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
$("#exportCsv").addEventListener("click",()=>{
  const rows=[["رقم القسم","القسم","المجال","رقم الخاصية","الخاصية"]];
  DATA.forEach((s,si)=>s.f.forEach((f,i)=>rows.push([si+1,s.t,CATS[s.c].label,i+1,f])));
  const csv="\uFEFF"+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  download("table-features-2000.csv",csv,"text/csv;charset=utf-8");
  showToast({ico:"⬇",title:"تم التصدير",main:"ملف CSV يضم الأقسام الـ100 والخصائص الـ2000."});
});
$("#exportStatus").addEventListener("click",()=>{
  const out={
    exportedAt:new Date().toISOString(),
    total:TOTAL,
    done:overallDone(),
    features:Object.keys(status).map(k=>{
      const g=+k, si=g/20|0;
      return {no:g+1, section:si+1, sectionTitle:DATA[si].t, feature:DATA[si].f[g%20], status:status[g]};
    }).sort((a,b)=>a.no-b.no)
  };
  download("table-features-status.json",JSON.stringify(out,null,2),"application/json");
  showToast({ico:"⬇",title:"تم التصدير",main:`علاماتك: ${Object.keys(status).length} خاصية (منها ${overallDone()} منفّذة).`});
});

/* ---------- المظهر ---------- */
const themeBtn=$("#themeBtn");
if(localStorage.getItem(LS_THEME)==="light") document.documentElement.dataset.theme="light";
themeBtn.addEventListener("click",()=>{
  const isLight=document.documentElement.dataset.theme==="light";
  if(isLight) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme="light";
  try{ localStorage.setItem(LS_THEME,isLight?"dark":"light"); }catch(e){}
});

/* ---------- لوحة المفاتيح ---------- */
document.addEventListener("keydown",e=>{
  const ae=document.activeElement;
  const typing=ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
  if(e.key==="Escape"){
    if(drawer.classList.contains("open")) closeDrawer();
    else if(typing) ae.blur();
    else if(query){ query=""; qInput.value=""; doSearch(); }
    return;
  }
  if(typing) return;
  if(e.key==="/"){ e.preventDefault(); qInput.focus(); qInput.select(); window.scrollTo({top:0,behavior:"smooth"}); }
  else if(e.key==="r"||e.key==="R"||e.key==="ر"){ randomFeature(); }
});

/* ---------- العودة للأعلى ---------- */
window.addEventListener("scroll",()=>{ toTop.classList.toggle("show",window.scrollY>700); },{passive:true});
toTop.addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));

/* ---------- بدء التشغيل ---------- */
renderChips();
renderGrid();
renderRoadmap();
renderAboutCats();
updateRing();
watchReveals();

})();
