// ============================================================
// 4housing · Gestión de Diseño — app.js
// ============================================================
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);

let PERFIL = null;
let PROYECTOS = [];
let activo = null;      // proyecto abierto
let TAREAS = [];        // tareas del proyecto abierto (planas)
let tab = "proj";

const esCoord = () => PERFIL && PERFIL.rol === "coordinador";
const puedeEditar = () => PERFIL && ["coordinador", "diseno"].includes(PERFIL.rol);

const ESTADO_LBL = { sin_iniciar:"Sin iniciar", en_ejecucion:"En ejecución", terminado:"Terminado", pausado:"Pausado" };

// ---------- AUTH ----------
async function init() {
  const { data:{ session } } = await sb.auth.getSession();
  if (!session) return mostrarLogin();
  await cargarPerfil(session.user);
  $("#login").style.display = "none";
  $("#app").style.display = "flex";
  await cargarProyectos();
  render();
}
async function cargarPerfil(user) {
  const { data } = await sb.from("perfiles").select("*").eq("id", user.id).single();
  PERFIL = data || { id:user.id, nombre:user.email, rol:"lectura" };
  $("#user-name").textContent = PERFIL.nombre;
  $("#user-rol").textContent = PERFIL.rol;
}
function mostrarLogin(){ $("#login").style.display="flex"; $("#app").style.display="none"; }
async function login() {
  $("#login-error").textContent = "";
  const { error } = await sb.auth.signInWithPassword({
    email: $("#email").value.trim(), password: $("#password").value });
  if (error) { $("#login-error").textContent = error.message; return; }
  init();
}
async function logout(){ await sb.auth.signOut(); location.reload(); }

// ---------- DATOS ----------
async function cargarProyectos() {
  const { data } = await sb.from("v_proyectos").select("*").order("creado_en",{ascending:false});
  PROYECTOS = data || [];
}
async function cargarTareas(proyectoId) {
  const { data } = await sb.from("tareas").select("*")
    .eq("proyecto_id", proyectoId).eq("eliminada", false)
    .order("etapa").order("orden");
  TAREAS = data || [];
}

// ---------- CREAR PROYECTO (clona la plantilla) ----------
async function crearProyecto(campos) {
  const { data:proy, error } = await sb.from("proyectos").insert(campos).select().single();
  if (error) throw error;
  // construir filas de tareas desde la plantilla
  const filas = [];
  function pushTarea(t, etapa, parentRef, orden, nivel) {
    const fila = {
      _ref: crypto.randomUUID(),       // ref local para enlazar hijos
      proyecto_id: proy.id, etapa, orden, nivel,
      tipo: t.tipo === "modelado" ? "modelado" : "normal",
      nombre: t.nombre, responsable: t.responsable || null, nota: t.nota || null,
      _parentRef: parentRef,
    };
    filas.push(fila);
    if (t.subitems) t.subitems.forEach((s,i)=>pushTarea(s, etapa, fila._ref, i, "subitem"));
    if (t.rubros)   t.rubros.forEach((r,i)=>pushTarea(r, etapa, fila._ref, i, "rubro"));
  }
  window.PLANTILLA.forEach(et => et.tareas.forEach((t,i)=>pushTarea(t, et.etapa, null, i, "tarea")));

  // insertar en dos pasos para resolver parent_id reales
  // 1) insertar todas sin parent, mapeando _ref -> id real
  const sinParent = filas.map(f => ({
    proyecto_id:f.proyecto_id, etapa:f.etapa, orden:f.orden, nivel:f.nivel,
    tipo:f.tipo, nombre:f.nombre, responsable:f.responsable, nota:f.nota }));
  const { data:inserted, error:e2 } = await sb.from("tareas").insert(sinParent).select("id,nombre,nivel,etapa,orden");
  if (e2) throw e2;
  // mapear por (nombre,nivel,etapa,orden) -> id  (único en la plantilla)
  const idDe = {};
  inserted.forEach(r => { idDe[`${r.etapa}|${r.nivel}|${r.orden}|${r.nombre}`] = r.id; });
  // 2) actualizar parent_id de los que tienen _parentRef
  const refToKey = {};
  filas.forEach(f => { refToKey[f._ref] = `${f.etapa}|${f.nivel}|${f.orden}|${f.nombre}`; });
  for (const f of filas) {
    if (!f._parentRef) continue;
    const childId  = idDe[`${f.etapa}|${f.nivel}|${f.orden}|${f.nombre}`];
    const parentId = idDe[refToKey[f._parentRef]];
    if (childId && parentId) await sb.from("tareas").update({ parent_id: parentId }).eq("id", childId);
  }
  await cargarProyectos();
}

// ---------- TILDAR (con regla de bloqueo) ----------
function hijosDe(id){ return TAREAS.filter(t => t.parent_id === id); }
function gateBloqueado(tarea) {
  // una tarea está bloqueada si existe, antes que ella (mismo padre/nivel),
  // un grupo de modelado con rubros sin completar.
  const hermanos = TAREAS.filter(t => t.parent_id === tarea.parent_id).sort((a,b)=>a.orden-b.orden);
  const idx = hermanos.findIndex(h => h.id === tarea.id);
  for (let i=0; i<idx; i++) {
    const h = hermanos[i];
    if (h.tipo === "modelado") {
      const rubros = hijosDe(h.id);
      if (rubros.some(r => !r.cumplido)) return h.nombre; // bloqueada por este modelado
    }
  }
  return null;
}
async function toggleCheck(t) {
  const blo = gateBloqueado(t);
  if (blo && !t.cumplido) { toast(`Bloqueado: completá primero ${blo}`); return; }
  const nuevo = !t.cumplido;
  await sb.from("tareas").update({ cumplido:nuevo, cumplido_en: nuevo?new Date().toISOString():null }).eq("id", t.id);
  await cargarTareas(activo.id); await cargarProyectos();
  activo = PROYECTOS.find(p=>p.id===activo.id);
  render();
}

// ---------- CAMBIO DE RESPONSABLE (motivo obligatorio + historial) ----------
let pendienteResp = null; // {tarea, nuevo}
function pedirMotivo(tarea, nuevo) {
  pendienteResp = { tarea, nuevo };
  $("#motivo-tarea").textContent = tarea.nombre;
  $("#motivo-de").textContent = tarea.responsable || "(sin asignar)";
  $("#motivo-a").textContent = nuevo || "(sin asignar)";
  $("#motivo-text").value = "";
  $("#motivo-err").textContent = "";
  $("#modal-motivo").classList.add("open");
}
async function confirmarMotivo() {
  const motivo = $("#motivo-text").value.trim();
  if (!motivo) { $("#motivo-err").textContent = "El motivo es obligatorio."; return; }
  const { tarea, nuevo } = pendienteResp;
  await sb.from("historial_responsable").insert({
    tarea_id: tarea.id, proyecto_id: activo.id,
    resp_anterior: tarea.responsable, resp_nuevo: nuevo, motivo,
    cambiado_por: PERFIL.id });
  await sb.from("tareas").update({ responsable: nuevo || null }).eq("id", tarea.id);
  $("#modal-motivo").classList.remove("open");
  await cargarTareas(activo.id);
  render();
}

// ---------- ELIMINAR / PLANIFICAR TAREA ----------
async function eliminarTarea(t) {
  if (!esCoord()) { toast("Solo el coordinador puede eliminar tareas"); return; }
  if (!confirm(`¿Eliminar "${t.nombre}"? No se podrá ejecutar en este proyecto.`)) return;
  // eliminar también descendientes
  const ids = [t.id]; let frente=[t.id];
  while (frente.length){ const h = TAREAS.filter(x=>frente.includes(x.parent_id)).map(x=>x.id); ids.push(...h); frente=h; }
  await sb.from("tareas").update({ eliminada:true }).in("id", ids);
  await cargarTareas(activo.id); await cargarProyectos();
  activo = PROYECTOS.find(p=>p.id===activo.id);
  render();
}
async function guardarFechas(t, ini, fin) {
  await sb.from("tareas").update({ fecha_inicio: ini||null, fecha_fin: fin||null }).eq("id", t.id);
  await cargarTareas(activo.id);
}

// ---------- RENDER ----------
function render() {
  document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  const c = $("#content");
  if (tab==="proj")  c.innerHTML = activo ? "" : renderLista(), activo && renderDetalle();
  if (tab==="dash")  c.innerHTML = renderDash();
  if (tab==="audit") c.innerHTML = renderAudit();
  bind();
}

function barra(pct){
  return `<div class="kpi-prog-bar"><div class="kpi-prog-fill" style="width:${pct}%;background:var(--olive-deep)"></div></div>`;
}
function etapaActualDe(p){
  // primer hoja no cumplida en orden de etapa
  if (p.id !== (activo&&activo.id)) return "";
  return "";
}

function renderLista() {
  const btn = puedeEditar()
    ? `<button class="btn" id="nuevo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Nuevo proyecto</button>` : "";
  let cards = PROYECTOS.map(p => `
    <div class="proj-card" data-id="${p.id}">
      <div class="pc-top">
        <div><div class="pc-name">${p.nombre}</div><div class="pc-sub">${p.nro_if} · ${p.cliente}</div></div>
        <span class="badge badge-${p.estado}">${ESTADO_LBL[p.estado]}</span>
      </div>
      <div class="pc-meta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg> ${p.responsable||"Sin asignar"}</div>
      <div class="pc-prog">${barra(p.avance_pct)}<span class="pc-pct">${p.avance_pct}%</span></div>
    </div>`).join("");
  if (!PROYECTOS.length) cards = `<p class="empty">No hay proyectos todavía. Creá uno con “Nuevo proyecto”.</p>`;
  return `<div class="lista-top">${btn}</div>${cards}`;
}

function nodoTarea(t, depth) {
  const hijos = hijosDe(t.id).sort((a,b)=>a.orden-b.orden);
  const tieneHijos = hijos.length > 0;
  const blo = gateBloqueado(t);
  const editable = puedeEditar();
  const esGate = t.tipo === "modelado";

  // check solo en hojas (sin hijos). Las que tienen hijos muestran progreso.
  let checkHTML = "";
  if (!tieneHijos) {
    const lock = blo && !t.cumplido;
    checkHTML = `<button class="chk ${t.cumplido?'on':''} ${lock?'lock':''}" data-id="${t.id}" ${lock?'title="Bloqueado: '+blo+'"':''}>
      ${t.cumplido?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 6"/></svg>':(lock?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>':'')}
    </button>`;
  } else {
    const tot = hijos.filter(h=>true).length;
    const hechos = hijos.filter(h=>h.cumplido).length;
    checkHTML = `<span class="grp-count ${esGate?'gate':''}">${hechos}/${tot}</span>`;
  }

  // selector de responsable
  const respSel = editable
    ? `<select class="resp-sel" data-id="${t.id}">
         <option value="">(sin asignar)</option>
         ${window.RESPONSABLES.map(r=>`<option ${t.responsable===r?'selected':''}>${r}</option>`).join("")}
       </select>`
    : `<span class="resp-ro">${t.responsable||"(sin asignar)"}</span>`;

  // fechas por tarea (no en rubros para no saturar; sí en tareas y subitems)
  const fechasHTML = (t.nivel !== "rubro")
    ? `<div class="fechas">
         <input type="date" class="f-ini" data-id="${t.id}" value="${t.fecha_inicio||''}" ${editable?'':'disabled'} title="Inicio">
         <span class="f-sep">→</span>
         <input type="date" class="f-fin" data-id="${t.id}" value="${t.fecha_fin||''}" ${editable?'':'disabled'} title="Fin">
       </div>` : "";

  const delBtn = esCoord()
    ? `<button class="del-tarea" data-id="${t.id}" title="Eliminar tarea">×</button>` : "";

  const histBtn = `<button class="hist-btn" data-id="${t.id}" title="Historial de responsable"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/></svg></button>`;

  let html = `
    <div class="tnode lvl-${t.nivel} ${esGate?'is-gate':''}" style="margin-left:${depth*18}px">
      <div class="tnode-row">
        ${checkHTML}
        <div class="tnode-name">${t.nombre}${esGate?' <span class="gate-tag">gate · 6 rubros</span>':''}
          ${t.nota?`<div class="tnode-note">${t.nota}</div>`:''}
        </div>
        ${respSel}
        ${histBtn}
        ${delBtn}
      </div>
      ${fechasHTML}
    </div>`;
  if (tieneHijos) html += hijos.map(h=>nodoTarea(h, depth+1)).join("");
  return html;
}

function renderDetalle() {
  const p = activo;
  const porEtapa = {};
  TAREAS.filter(t=>t.nivel==="tarea").forEach(t=>{
    (porEtapa[t.etapa] = porEtapa[t.etapa]||[]).push(t);
  });
  const etapasHTML = Object.keys(porEtapa).sort().map(e=>`
    <div class="etapa-block">
      <div class="etapa-head">Etapa ${e}</div>
      ${porEtapa[e].sort((a,b)=>a.orden-b.orden).map(t=>nodoTarea(t,0)).join("")}
    </div>`).join("");

  const estadoSel = puedeEditar()
    ? `<select id="estado-sel" class="inp">${Object.keys(ESTADO_LBL).map(k=>`<option value="${k}" ${p.estado===k?'selected':''}>${ESTADO_LBL[k]}</option>`).join("")}</select>`
    : `<span>${ESTADO_LBL[p.estado]}</span>`;

  $("#content").innerHTML = `
    <button class="btn ghost sm" id="volver">← Volver a proyectos</button>
    <div class="det-head">
      <div>
        <h2 class="det-title">${p.nombre}</h2>
        <div class="det-sub">${p.nro_if} · ${p.cliente}</div>
      </div>
      <div class="det-prog"><div class="det-pct">${p.avance_pct}%</div>${barra(p.avance_pct)}</div>
    </div>
    <div class="det-fields">
      <div class="fld"><label>Cliente</label><div class="val">${p.cliente}</div></div>
      <div class="fld"><label>Plazo de entrega</label><div class="val">${p.plazo_entrega||'—'}</div></div>
      <div class="fld"><label>Responsable</label><div class="val">${p.responsable||'Sin asignar'}</div></div>
      <div class="fld"><label>Estado</label>${estadoSel}</div>
      <div class="fld fld-full"><label>Requisitos / Ficha descriptiva</label><div class="val">${p.ficha||'—'}</div></div>
    </div>
    <div class="hoja-ruta">${etapasHTML}</div>`;
  bind();
}

function renderDash() {
  const t = PROYECTOS.length||1;
  const enEj = PROYECTOS.filter(p=>p.estado==="en_ejecucion").length;
  const term = PROYECTOS.filter(p=>p.estado==="terminado").length;
  const prom = Math.round(PROYECTOS.reduce((a,p)=>a+(p.avance_pct||0),0)/t);
  const cards = [
    ["En ejecución", enEj], ["Terminados", term],
    ["Avance prom.", prom+"%"], ["Total proyectos", PROYECTOS.length],
  ].map(([k,v])=>`<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
  const filas = PROYECTOS.map(p=>`
    <div class="dash-row"><span class="dr-n">${p.nombre}</span>${barra(p.avance_pct)}<span class="dr-p">${p.avance_pct}%</span></div>`).join("");
  return `<div class="stats">${cards}</div>
    <div class="card"><div class="card-h">Avance por proyecto</div><div class="card-b">${filas||'<p class="empty">Sin datos</p>'}</div></div>`;
}

function renderAudit() {
  return `<div class="card">
    <div class="card-h">Auditoría asistida por IA</div>
    <div class="card-b">
      <p class="help">Subí los planos (DXF / DWG / PDF) para detectar inconsistencias e interferencias.</p>
      <div class="drop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/></svg><p>Arrastrá los planos o hacé clic para subir</p></div>
      <div class="hall hall-r"><b>Interferencia · Sanitaria vs Estructura</b><span>Cañería cruza correa PGC120 en módulo M2 sin pase.</span></div>
      <div class="hall hall-a"><b>Inconsistencia · Capas</b><span>Columna sin bloque asignado en plano 01-01-07.</span></div>
      <div class="hall hall-g"><b>Sin observaciones · Revestimientos</b><span>12 módulos verificados, m² consistente con cómputo.</span></div>
      <p class="help" style="margin-top:10px">El motor que lee los DXF corre como servicio aparte; esta pantalla registra cargas y hallazgos.</p>
    </div></div>`;
}

// ---------- HISTORIAL (modal) ----------
async function verHistorial(tareaId) {
  const { data } = await sb.from("historial_responsable").select("*")
    .eq("tarea_id", tareaId).order("cambiado_en",{ascending:false});
  const filas = (data||[]).map(h=>`
    <div class="hist-item">
      <div class="hist-line"><b>${h.resp_anterior||'(sin asignar)'}</b> → <b>${h.resp_nuevo||'(sin asignar)'}</b></div>
      <div class="hist-motivo">${h.motivo}</div>
      <div class="hist-fecha">${new Date(h.cambiado_en).toLocaleString("es-AR")}</div>
    </div>`).join("") || '<p class="empty">Sin cambios registrados.</p>';
  $("#hist-body").innerHTML = filas;
  $("#modal-hist").classList.add("open");
}

// ---------- TOAST ----------
let toastTimer;
function toast(msg){
  let el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.classList.remove("show"), 2600);
}

// ---------- BIND ----------
function bind() {
  document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>{ if(b.dataset.tab==="proj") activo=null; tab=b.dataset.tab; render(); });
  $("#logout") && ($("#logout").onclick = logout);

  const nuevo = $("#nuevo");
  if (nuevo) nuevo.onclick = ()=> $("#modal-nuevo").classList.add("open");

  document.querySelectorAll(".proj-card").forEach(c=>c.onclick=async()=>{
    activo = PROYECTOS.find(p=>p.id===c.dataset.id);
    await cargarTareas(activo.id); render();
  });
  const volver = $("#volver");
  if (volver) volver.onclick = async()=>{ activo=null; await cargarProyectos(); render(); };

  document.querySelectorAll(".chk").forEach(b=>b.onclick=()=>{
    const t = TAREAS.find(x=>x.id===b.dataset.id); if(t) toggleCheck(t);
  });
  document.querySelectorAll(".resp-sel").forEach(s=>s.onchange=()=>{
    const t = TAREAS.find(x=>x.id===s.dataset.id);
    if (t && (s.value||"") !== (t.responsable||"")) pedirMotivo(t, s.value);
  });
  document.querySelectorAll(".del-tarea").forEach(b=>b.onclick=()=>{
    const t = TAREAS.find(x=>x.id===b.dataset.id); if(t) eliminarTarea(t);
  });
  document.querySelectorAll(".hist-btn").forEach(b=>b.onclick=()=> verHistorial(b.dataset.id));
  document.querySelectorAll(".f-ini").forEach(inp=>inp.onchange=()=>{
    const t=TAREAS.find(x=>x.id===inp.dataset.id);
    guardarFechas(t, inp.value, t.fecha_fin);
  });
  document.querySelectorAll(".f-fin").forEach(inp=>inp.onchange=()=>{
    const t=TAREAS.find(x=>x.id===inp.dataset.id);
    guardarFechas(t, t.fecha_inicio, inp.value);
  });
  const estadoSel = $("#estado-sel");
  if (estadoSel) estadoSel.onchange = async()=>{
    await sb.from("proyectos").update({ estado: estadoSel.value }).eq("id", activo.id);
    await cargarProyectos(); activo = PROYECTOS.find(p=>p.id===activo.id); render();
  };
  const drop = $(".drop"); if (drop) drop.onclick = ()=> toast("Carga de planos: pendiente de conectar el motor IA");
}

// ---------- MODAL NUEVO PROYECTO ----------
function bindModales() {
  $("#nuevo-guardar").onclick = async()=>{
    const nro = $("#n-if").value.trim(), cli = $("#n-cliente").value.trim(), nom = $("#n-nombre").value.trim();
    if (!nro||!cli||!nom){ $("#nuevo-err").textContent="Nro. IF, cliente y nombre son obligatorios."; return; }
    $("#nuevo-guardar").disabled = true; $("#nuevo-err").textContent = "Creando…";
    try {
      await crearProyecto({ nro_if:nro, cliente:cli, nombre:nom,
        ficha: $("#n-ficha").value.trim()||null, plazo_entrega: $("#n-plazo").value||null,
        responsable: $("#n-resp").value||null, estado: $("#n-estado").value });
      $("#modal-nuevo").classList.remove("open");
      ["n-if","n-cliente","n-nombre","n-ficha","n-plazo"].forEach(id=>$("#"+id).value="");
      tab="proj"; activo=null; render();
    } catch(e){ $("#nuevo-err").textContent = e.message || "Error al crear."; }
    $("#nuevo-guardar").disabled = false;
  };
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>{
    $("#"+b.dataset.close).classList.remove("open");
  });
  $("#motivo-guardar").onclick = confirmarMotivo;
  $("#motivo-cancelar").onclick = ()=>{ $("#modal-motivo").classList.remove("open"); render(); };
}

// fill responsables del modal nuevo
function fillNuevoResp(){
  const sel = $("#n-resp");
  sel.innerHTML = `<option value="">(sin asignar)</option>` +
    window.RESPONSABLES.map(r=>`<option>${r}</option>`).join("");
}

window.addEventListener("DOMContentLoaded", ()=>{
  $("#btn-login").onclick = login;
  $("#password").addEventListener("keydown", e=>{ if(e.key==="Enter") login(); });
  fillNuevoResp();
  bindModales();
  init();
});
