// ============================================================
// 4housing · Gestión de Diseño — lógica del front
// Vanilla JS + supabase-js (cargado por CDN en index.html)
// ============================================================

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const ETAPAS = [
  { id:1, fase:1, nombre:"Análisis general de proyecto" },
  { id:2, fase:1, nombre:"Asignación de responsable de diseño" },
  { id:3, fase:1, nombre:"Planificación de proyecto" },
  { id:4, fase:2, nombre:"Reunión inicial de traspaso de información" },
  { id:5, fase:2, nombre:"Revisión de planificación" },
  { id:6, fase:2, nombre:"Modelado 3D" },
];

let PERFIL = null;     // { id, nombre, rol }
let PROYECTOS = [];    // vista v_proyectos
let activo = null;     // proyecto seleccionado

const $ = (s) => document.querySelector(s);
const esDiseno = () => PERFIL && PERFIL.rol === "diseno";
const esVentas = () => PERFIL && PERFIL.rol === "ventas";

// ---------- AUTH ----------
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return mostrarLogin();
  await cargarPerfil(session.user);
  mostrarApp();
  await cargarProyectos();
  setTab("proj");
}

async function cargarPerfil(user) {
  const { data } = await sb.from("perfiles").select("*").eq("id", user.id).single();
  PERFIL = data || { id: user.id, nombre: user.email, rol: "lectura" };
  $("#user-info").textContent = `${PERFIL.nombre} · ${PERFIL.rol}`;
}

function mostrarLogin() {
  $("#login").style.display = "block";
  $("#app").style.display = "none";
}
function mostrarApp() {
  $("#login").style.display = "none";
  $("#app").style.display = "block";
}

async function login() {
  const email = $("#email").value.trim();
  const pass = $("#password").value;
  $("#login-error").textContent = "";
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { $("#login-error").textContent = error.message; return; }
  init();
}
async function logout() { await sb.auth.signOut(); location.reload(); }

// ---------- DATOS ----------
async function cargarProyectos() {
  const { data, error } = await sb.from("v_proyectos").select("*").order("creado_en", { ascending: false });
  if (error) { console.error(error); return; }
  PROYECTOS = data || [];
}

async function cargarChecklist(proyectoId) {
  const { data } = await sb.from("proyecto_checklist")
    .select("*").eq("proyecto_id", proyectoId).order("etapa_id");
  return data || [];
}

async function toggleCheck(rowId, valor) {
  await sb.from("proyecto_checklist")
    .update({ cumplido: valor, cumplido_en: valor ? new Date().toISOString() : null })
    .eq("id", rowId);
}

async function guardarPlan(proyectoId, campos) {
  await sb.from("proyectos").update(campos).eq("id", proyectoId);
}

// ---------- HELPERS ----------
const HOY = new Date();
function parseD(s){ return s ? new Date(s + "T00:00:00") : null; }
function fmt(s){ return s ? new Date(s+"T00:00:00").toLocaleDateString("es-AR") : "—"; }
const ESTADO_LABEL = { sin_iniciar:"Sin iniciar", en_ejecucion:"En ejecución", terminado:"Terminado", pausado:"Pausado" };
const ESTADO_COLOR = {
  en_ejecucion:["#E6F1FB","#185FA5"], terminado:["#E1F5EE","#0F6E56"],
  sin_iniciar:["#F1EFE8","#5F5E5A"], pausado:["#FAEEDA","#854F0B"]
};
function badge(estado){
  const [bg,col]=ESTADO_COLOR[estado]||ESTADO_COLOR.sin_iniciar;
  return `<span class="pill" style="background:${bg};color:${col}">${ESTADO_LABEL[estado]||estado}</span>`;
}
function pill(txt,col,bg){ return `<span class="pill" style="background:${bg};color:${col}">${txt}</span>`; }

function salud(p){
  if(!p.plan_inicio || !p.plan_fin_f2) return {txt:"Sin planificar",col:"#5F5E5A",bg:"#F1EFE8",esp:null};
  if(p.estado==="terminado") return {txt:"Entregado",col:"#0F6E56",bg:"#E1F5EE",esp:100};
  const ini=parseD(p.plan_inicio), fin=parseD(p.plan_fin_f2);
  const esp=Math.min(100,Math.max(0,Math.round((HOY-ini)/(fin-ini)*100)));
  const gap=p.avance_pct-esp;
  if(gap>=5) return {txt:"Adelantado",col:"#0F6E56",bg:"#E1F5EE",esp};
  if(gap>=-10) return {txt:"En fecha",col:"#185FA5",bg:"#E6F1FB",esp};
  return {txt:"Atrasado",col:"#A32D2D",bg:"#FCEBEB",esp};
}
function diasRest(p){ if(!p.plan_fin_f2) return null; return Math.round((parseD(p.plan_fin_f2)-HOY)/86400000); }
function barra(real,esp){
  const mark = esp!=null?`<div class="mark" style="left:${esp}%"></div>`:"";
  return `<div class="track"><div class="fill" style="width:${real}%"></div>${mark}</div>`;
}

// ---------- NAV ----------
function setTab(tab){
  document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  const s = $("#screen");
  if(tab==="proj"){
    if(activo){ renderDetalle(); return; }
    s.innerHTML = renderProj();
  }
  if(tab==="dash") s.innerHTML = renderDash();
  if(tab==="audit") s.innerHTML = renderAudit();
  bind();
}

// ---------- PROYECTOS ----------
function renderProj(){
  if(!PROYECTOS.length) return `<p class="muted">No hay proyectos todavía. Aparecen cuando Ventas pasa una cotización a “Ganada”.</p>`;
  const rows = PROYECTOS.map((p,i)=>{
    const s=salud(p), dr=diasRest(p);
    const drTxt = dr==null?"":(dr<0?`${Math.abs(dr)}d vencido`:`${dr}d restantes`);
    return `<div class="card row-card" data-idx="${i}">
      <div class="row-head">
        <div><p class="title">${p.nombre}</p><p class="muted sm">${p.nro_if} · ${p.cliente}</p></div>
        <div class="pills">${badge(p.estado)}${pill(s.txt,s.col,s.bg)}</div>
      </div>
      <div class="row-meta">
        <span class="chip"><i class="ti ti-map-pin"></i>Etapa: <b>${p.etapa_actual}</b></span>
        <span class="muted sm"><i class="ti ti-user"></i> ${p.responsable||"Sin asignar"}</span>
      </div>
      <div class="row-prog">
        <div class="prog-wrap">${barra(p.avance_pct,s.esp)}<span class="pct">${p.avance_pct}%</span></div>
        <span class="sm" style="color:${dr!=null&&dr<0?'#A32D2D':'var(--mut)'}">${drTxt}</span>
      </div>
    </div>`;
  }).join("");
  return `<div class="legend">
      <span><span class="lg-bar"></span> avance real</span>
      <span><span class="lg-mark"></span> avance esperado por plazo</span>
    </div>${rows}`;
}

async function renderDetalle(){
  const p = activo;
  const s = salud(p);
  const checks = await cargarChecklist(p.id);
  const editable = esDiseno();

  const fasesHTML = [1,2].map(fase=>{
    const items = ETAPAS.filter(e=>e.fase===fase).map(e=>{
      const row = checks.find(c=>c.etapa_id===e.id) || {cumplido:false};
      const done = row.cumplido;
      return `<label class="chk ${editable?'':'ro'}" data-rowid="${row.id||''}" data-val="${done?1:0}">
        <span class="box ${done?'on':''}">${done?'<i class="ti ti-check"></i>':''}</span>
        <span class="${done?'tachado':''}">${e.nombre}</span></label>`;
    }).join("");
    const fechaPlan = fase===1 ? fmt(p.plan_fin_f1) : fmt(p.plan_fin_f2);
    return `<div class="fase">
      <div class="fase-head"><span class="fase-tit">Fase ${fase}</span>
        <span class="muted sm"><i class="ti ti-flag"></i> fin plan.: ${fechaPlan}</span></div>${items}</div>`;
  }).join("");

  const planForm = `
    <div class="plan-box">
      <p class="sec-tit">Planificación (Fase 1)</p>
      <div class="plan-grid">
        <label>Inicio<input type="date" id="pl-ini" value="${p.plan_inicio||''}" ${editable?'':'disabled'}></label>
        <label>Fin Fase 1<input type="date" id="pl-f1" value="${p.plan_fin_f1||''}" ${editable?'':'disabled'}></label>
        <label>Fin Fase 2<input type="date" id="pl-f2" value="${p.plan_fin_f2||''}" ${editable?'':'disabled'}></label>
        <label>Responsable<input type="text" id="pl-resp" value="${p.responsable||''}" ${editable?'':'disabled'}></label>
        <label>Estado<select id="pl-estado" ${editable?'':'disabled'}>
          ${Object.keys(ESTADO_LABEL).map(k=>`<option value="${k}" ${p.estado===k?'selected':''}>${ESTADO_LABEL[k]}</option>`).join('')}
        </select></label>
      </div>
      ${editable?`<button id="save-plan" class="btn-primary">Guardar planificación</button>`:''}
    </div>`;

  $("#screen").innerHTML = `
    <button id="back" class="btn-link"><i class="ti ti-arrow-left"></i> Volver</button>
    <div class="detalle">
      <div class="card">
        <p class="title">${p.nombre}</p>
        <div class="pills mb">${badge(p.estado)}${pill(s.txt,s.col,s.bg)}</div>
        <table class="kv">
          <tr><td>Nro. IF</td><td>${p.nro_if}</td></tr>
          <tr><td>Cliente</td><td>${p.cliente}</td></tr>
          <tr><td>Responsable</td><td>${p.responsable||'Sin asignar'}</td></tr>
          <tr><td>Etapa actual</td><td><b>${p.etapa_actual}</b></td></tr>
          <tr><td>Plazo cliente</td><td>${fmt(p.plazo_entrega)}</td></tr>
          <tr><td>Ficha</td><td class="ficha">${p.ficha||'—'}</td></tr>
        </table>
        ${planForm}
      </div>
      <div class="card">
        <p class="title sm-tit"><i class="ti ti-route"></i> Hoja de ruta</p>
        ${fasesHTML}
      </div>
    </div>`;
  bind();
}

// ---------- DASHBOARD ----------
function renderDash(){
  const total = PROYECTOS.length || 1;
  const enEjec = PROYECTOS.filter(p=>p.estado==="en_ejecucion").length;
  const atrasados = PROYECTOS.filter(p=>salud(p).txt==="Atrasado").length;
  const enFecha = PROYECTOS.filter(p=>["En fecha","Adelantado"].includes(salud(p).txt)).length;
  const prom = Math.round(PROYECTOS.reduce((a,p)=>a+(p.avance_pct||0),0)/total);
  const cards = [
    ["En ejecución",enEjec,"ti-player-play","var(--txt)"],
    ["En fecha",enFecha,"ti-circle-check","#0F6E56"],
    ["Atrasados",atrasados,"ti-clock-exclamation","#A32D2D"],
    ["Avance prom.",prom+"%","ti-chart-bar","var(--txt)"],
  ].map(([l,v,ic,c])=>`<div class="metric"><p class="m-lbl"><i class="ti ${ic}"></i>${l}</p><p class="m-val" style="color:${c}">${v}</p></div>`).join("");
  const rows = PROYECTOS.map(p=>{
    const s=salud(p);
    return `<div class="dash-row">
      <span class="dr-name">${p.nombre}</span>
      <span class="dr-etapa muted sm">${p.etapa_actual}</span>
      <div class="dr-bar">${barra(p.avance_pct,s.esp)}</div>${pill(s.txt,s.col,s.bg)}</div>`;
  }).join("");
  return `<div class="metrics">${cards}</div>
    <div class="card"><p class="title sm-tit">Etapa, avance y estado de plazo</p>${rows||'<p class="muted">Sin datos</p>'}</div>`;
}

// ---------- AUDITORÍA IA ----------
function renderAudit(){
  return `<div class="card">
    <p class="title sm-tit"><i class="ti ti-robot"></i> Auditoría asistida por IA</p>
    <p class="muted">Subí los planos (DXF / DWG / PDF) para detectar inconsistencias e interferencias.</p>
    <div class="drop"><i class="ti ti-upload"></i><p>Arrastrá los planos acá o hacé clic para subir</p>
      <input type="file" id="planos" multiple style="display:none"></div>
    <p class="sec-tit">Resultado de ejemplo</p>
    <div class="hall hall-r"><i class="ti ti-alert-triangle"></i><div><p class="h-t">Interferencia · Sanitaria vs Estructura</p><p class="h-d">Cañería cruza correa PGC120 en módulo M2 sin pase.</p></div></div>
    <div class="hall hall-a"><i class="ti ti-alert-circle"></i><div><p class="h-t">Inconsistencia · Capas</p><p class="h-d">Columna sin bloque asignado en plano 01-01-07.</p></div></div>
    <div class="hall hall-g"><i class="ti ti-circle-check"></i><div><p class="h-t">Sin observaciones · Revestimientos</p><p class="h-d">12 módulos verificados, m² consistente con cómputo.</p></div></div>
    <p class="muted sm" style="margin-top:10px">El motor de auditoría (lectura de DXF y detección geométrica) corre como servicio aparte; esta pantalla registra cargas y hallazgos.</p>
  </div>`;
}

// ---------- BIND ----------
function bind(){
  document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>{ if(b.dataset.tab==="proj") activo=null; setTab(b.dataset.tab); });
  $("#logout") && ($("#logout").onclick = logout);

  document.querySelectorAll(".row-card").forEach(c=>c.onclick=async()=>{
    activo = PROYECTOS[+c.dataset.idx]; await renderDetalle();
  });
  const back = $("#back"); if(back) back.onclick = async()=>{ activo=null; await cargarProyectos(); setTab("proj"); };

  document.querySelectorAll(".chk:not(.ro)").forEach(l=>l.onclick=async(e)=>{
    e.preventDefault();
    const rowId=l.dataset.rowid; if(!rowId) return;
    const nuevo = l.dataset.val==="1" ? false : true;
    await toggleCheck(rowId, nuevo);
    await cargarProyectos();
    activo = PROYECTOS.find(p=>p.id===activo.id);
    await renderDetalle();
  });

  const save = $("#save-plan");
  if(save) save.onclick = async()=>{
    await guardarPlan(activo.id, {
      plan_inicio: $("#pl-ini").value || null,
      plan_fin_f1: $("#pl-f1").value || null,
      plan_fin_f2: $("#pl-f2").value || null,
      responsable: $("#pl-resp").value || null,
      estado: $("#pl-estado").value,
    });
    await cargarProyectos();
    activo = PROYECTOS.find(p=>p.id===activo.id);
    await renderDetalle();
  };

  const drop = $(".drop");
  if(drop) drop.onclick = ()=> $("#planos") && $("#planos").click();
}

// ---------- LOGIN BIND ----------
window.addEventListener("DOMContentLoaded", ()=>{
  $("#btn-login").onclick = login;
  $("#password").addEventListener("keydown", e=>{ if(e.key==="Enter") login(); });
  init();
});
