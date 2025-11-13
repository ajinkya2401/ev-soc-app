
// Fixed app.js — custom keypad enforced for SOC & kWh; improved stability
const KEY = "ev_v2_session";
const KEY_META = "ev_v2_meta";
const CAP = 80;

function el(id){ return document.getElementById(id); }
const carModel = el("carModel"), carReg = el("carReg");
const socBig = el("socBig"), gaugeFill = el("gaugeFill"), subLine = el("subLine"), timestamp = el("timestamp");
const card = el("card");
const tabPrimary = el("tabPrimary"), tabSecondary = el("tabSecondary");
const primaryActions = el("primaryActions"), secondaryActions = el("secondaryActions");
const startBtn = el("startBtn"), setSocBtn = el("setSocBtn"), historyBtn = el("historyBtn");
const addKwhBtn = el("addKwhBtn"), endBtn = el("endBtn");
const editBtn = el("editBtn");
const keypadModal = el("keypadModal"), kpGrid = el("kpGrid"), kpDisplay = el("kpDisplay");
const kpTitle = el("kpTitle"), kpDone = el("kpDone"), kpCancel = el("kpCancel");
const editModal = el("editModal"), editModel = el("editModel"), editReg = el("editReg"), editSave = el("editSave"), editCancel = el("editCancel");
const historyModal = el("historyModal"), histBody = el("histBody"), histClose = el("histClose");

function save(key, obj){ localStorage.setItem(key, JSON.stringify(obj)); }
function load(key){ try{ const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch(e){ return null; } }
function removeKey(key){ localStorage.removeItem(key); }
function clamp(n, a=0, b=100){ return Math.max(a, Math.min(b, n)); }
function fmtTime(ts){ if(!ts) return ""; return new Date(ts).toLocaleTimeString(); }

// ensure defaults
(function ensureDefaults(){
  const meta = load(KEY_META) || {};
  meta.car = meta.car || {};
  if(!meta.car.model) meta.car.model = "Hyundai KONA EV";
  if(!meta.car.reg) meta.car.reg = "191D37789";
  save(KEY_META, meta);
})();

function render(){
  const sess = load(KEY);
  const meta = load(KEY_META) || {};
  carModel.textContent = meta.car?.model ?? "Hyundai KONA EV";
  carReg.textContent = meta.car?.reg ?? "191D37789";
  card.classList.toggle("active", !!sess);

  let socVal = null;
  let sub = "Tap actions below";
  if(sess){
    socVal = Math.round(sess.startSOC + ((sess.kwhAdded||0)/CAP)*100);
    socVal = clamp(socVal);
    sub = `Start ${sess.startSOC}% · +${sess.kwhAdded||0} kWh`;
    timestamp.textContent = sess.tsUpdate ? `Updated ${fmtTime(sess.tsUpdate)}` : `Started ${fmtTime(sess.tsStart)}`;
  } else {
    socVal = (meta.lastSOC !== undefined && meta.lastSOC !== null) ? meta.lastSOC : null;
    sub = socVal !== null ? "Last known SOC" : "Tap actions below";
    timestamp.textContent = "";
  }

  socBig.textContent = socVal !== null ? `${socVal}%` : "--%";
  const pct = socVal !== null ? socVal : 0;
  gaugeFill.style.width = `${pct}%`;
  subLine.textContent = sub;
}

// tabs
tabPrimary.onclick = ()=>{ tabPrimary.classList.add("active"); tabSecondary.classList.remove("active"); primaryActions.classList.remove("hidden"); secondaryActions.classList.add("hidden"); }
tabSecondary.onclick = ()=>{ tabSecondary.classList.add("active"); tabPrimary.classList.remove("active"); primaryActions.classList.add("hidden"); secondaryActions.classList.remove("hidden"); }

// actions
startBtn.onclick = ()=>{
  const meta = load(KEY_META) || {};
  const assumed = (meta.lastSOC !== undefined && meta.lastSOC !== null) ? clamp(Math.round(meta.lastSOC),0,100) : 20;
  const sess = { startSOC: assumed, kwhAdded: 0, tsStart: Date.now() };
  save(KEY, sess);
  delete meta.lastSOC; save(KEY_META, meta);
  render(); showToast(`Session started — ${assumed}%`);
};

setSocBtn.onclick = async ()=>{
  const meta = load(KEY_META) || {};
  // Use custom keypad (integer)
  const chosen = await openKeypad({title:"Current SOC (%)", initial: String(meta.lastSOC ?? 50), integerOnly:true});
  if(chosen === null) return;
  meta.lastSOC = clamp(Math.round(chosen),0,100); save(KEY_META, meta); render(); showToast(`Saved ${meta.lastSOC}%`);
};

historyBtn.onclick = ()=>{ openHistory(); };

addKwhBtn.onclick = async ()=>{
  const sess = load(KEY);
  if(!sess){ showToast("No active session — start one first"); return; }
  const chosen = await openKeypad({title:"Total kWh added", initial: String(sess.kwhAdded || 0), integerOnly:false});
  if(chosen === null) return;
  sess.kwhAdded = chosen; sess.tsUpdate = Date.now(); save(KEY, sess); render(); showToast(`Updated ${chosen} kWh`);
};

endBtn.onclick = ()=>{
  const sess = load(KEY);
  if(!sess){ showToast("No session to end"); return; }
  const newSOC = clamp(Math.round(sess.startSOC + (sess.kwhAdded / CAP) * 100),0,100);
  const meta = load(KEY_META) || {}; meta.lastSOC = newSOC; meta.history = meta.history || [];
  meta.history.unshift({ start: sess.startSOC, end: newSOC, kwh: sess.kwhAdded||0, ts: Date.now() });
  save(KEY_META, meta); removeKey(KEY); render(); showToast(`Ended — ${sess.startSOC}% → ${newSOC}%`);
};

// edit modal
editBtn.onclick = ()=>{
  const meta = load(KEY_META) || {};
  editModel.value = meta.car?.model ?? "Hyundai KONA EV";
  editReg.value = meta.car?.reg ?? "191D37789";
  editModal.classList.remove("hidden"); editModal.setAttribute("aria-hidden","false");
};
editSave.onclick = ()=>{
  const meta = load(KEY_META) || {}; meta.car = meta.car || {}; meta.car.model = editModel.value.trim(); meta.car.reg = editReg.value.trim();
  save(KEY_META, meta); editModal.classList.add("hidden"); render(); showToast("Saved");
};
editCancel.onclick = ()=>{ editModal.classList.add("hidden"); };

// history
function openHistory(){
  const meta = load(KEY_META) || {};
  const h = meta.history || [];
  histBody.innerHTML = "";
  if(h.length === 0){ histBody.textContent = "No history yet."; }
  else {
    h.forEach(item=>{
      const d = document.createElement("div"); d.className = "hist-item";
      d.innerHTML = `<div><strong>${item.start}% → ${item.end}%</strong></div>
                     <div>kWh: ${item.kwh}</div>
                     <small>${new Date(item.ts).toLocaleString()}</small>`;
      histBody.appendChild(d);
    });
  }
  historyModal.classList.remove("hidden");
}
histClose.onclick = ()=>{ historyModal.classList.add("hidden"); }

// keypad implementation
function openKeypad({title="Enter", initial="0", integerOnly=false}){
  return new Promise(resolve=>{
    kpTitle.textContent = title;
    kpDisplay.textContent = initial || "0";
    buildKeyGrid(integerOnly);
    keypadModal.classList.remove("hidden"); keypadModal.setAttribute("aria-hidden","false");
    kpCancel.onclick = ()=>{ keypadModal.classList.add("hidden"); resolve(null); };
    kpDone.onclick = ()=>{ keypadModal.classList.add("hidden"); const raw = kpDisplay.textContent.replace(",","."); const v = integerOnly ? parseInt(raw||"0",10) : parseFloat(raw||"0"); resolve(Number.isFinite(v) ? v : 0); };
  });
}

function buildKeyGrid(integerOnly){
  kpGrid.innerHTML = "";
  const keys = integerOnly ? ["1","2","3","4","5","6","7","8","9","","0","del"] : ["1","2","3","4","5","6","7","8","9",".","0","del"];
  keys.forEach(k=>{
    const btn = document.createElement("div"); btn.className = "kp-key";
    if(k === ""){ btn.classList.add("kp-key","hidden"); btn.textContent = ""; }
    else if(k === "del"){ btn.classList.add("kp-key","del"); btn.textContent = "⌫"; btn.onclick = ()=> onKeyPress("del", integerOnly); }
    else { btn.textContent = k; btn.onclick = ()=> onKeyPress(k, integerOnly); }
    kpGrid.appendChild(btn);
  });
}

function onKeyPress(key, integerOnly){
  let v = kpDisplay.textContent || "0";
  if(key === "del"){
    if(v.length <= 1) v = "0"; else v = v.slice(0,-1);
  } else if(key === "."){
    if(integerOnly) return;
    if(!v.includes(".")) v = v + ".";
  } else {
    if(v === "0") v = key; else v = v + key;
  }
  if(integerOnly){
    const n = parseInt(v||"0",10);
    if(Number.isFinite(n)) v = String(clamp(n,0,100));
  }
  kpDisplay.textContent = v;
}

// toast
function showToast(msg){
  try{ if(navigator.vibrate) navigator.vibrate(10); }catch(e){}
  const hud = document.createElement('div'); hud.textContent = msg;
  hud.style.position='fixed'; hud.style.bottom='18px'; hud.style.left='50%'; hud.style.transform='translateX(-50%)';
  hud.style.background='rgba(0,0,0,0.8)'; hud.style.color='#eaffef'; hud.style.padding='10px 14px'; hud.style.borderRadius='12px';
  hud.style.zIndex=9999; hud.style.fontSize='14px'; hud.style.boxShadow='0 10px 30px rgba(0,0,0,0.6)';
  document.body.appendChild(hud);
  setTimeout(()=>{ hud.style.transition='opacity .3s'; hud.style.opacity='0'; setTimeout(()=>hud.remove(),350); }, 1100);
}

// card click
card.onclick = ()=>{
  const sess = load(KEY);
  if(sess) addKwhBtn.click(); else setSocBtn.click();
};

// init
render();
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
