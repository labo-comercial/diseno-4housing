// ============================================================
// 4housing · Gestión de Diseño — app.js
// ============================================================
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);

let PERFIL = null;
let PROYECTOS = [];
let activo = null;      // proyecto abierto
let TAREAS = [];        // tareas del proyecto abierto (planas)
let TAREAS_ALL = [];    // tareas de todos los proyectos (para el dashboard)
let tab = "dash";

// "Coordinacion" = admin + coordinador (los que pueden editar/eliminar proyectos,
// cambiar responsables, cargar planificacion, etc.)
const esCoord = () => PERFIL && ["admin", "coordinador"].includes(PERFIL.rol);
const esAdmin = () => PERFIL && PERFIL.rol === "admin";
// puedeEditar: quien puede operar la app mas alla de solo lectura
const puedeEditar = () => PERFIL && ["admin", "coordinador", "diseno"].includes(PERFIL.rol);
// soyResponsable: la persona logueada es el responsable de ESTA tarea
const soyResponsable = (t) => PERFIL && t && t.responsable && t.responsable === PERFIL.nombre;
// puedeTildar: solo el responsable de la tarea, o coordinacion
const puedeTildar = (t) => esCoord() || soyResponsable(t);

const ESTADO_LBL = { sin_iniciar:"Sin iniciar", en_ejecucion:"En ejecución", terminado:"Terminado", pausado:"Pausado" };

// ---------- AUTH ----------
async function init() {
  const { data:{ session } } = await sb.auth.getSession();
  if (!session) return mostrarLogin();
  await cargarPerfil(session.user);
  $("#login").style.display = "none";
  $("#app").style.display = "flex";
  await cargarProyectos();
  await cargarTareasTodas();
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
async function cargarTareasTodas() {
  const { data } = await sb.from("tareas").select("*").eq("eliminada", false);
  TAREAS_ALL = data || [];
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

  // 1) aplanar la plantilla en filas, cada una con un _ref local único y
  //    _parentRef apuntando al _ref de su padre. Guardamos la profundidad
  //    (_depth) para insertar por capas: padres antes que hijos.
  const filas = [];
  function pushTarea(t, etapa, parentRef, orden, nivel, depth) {
    const ref = crypto.randomUUID();
    // responsable inicial: si la tarea tiene rol de proyecto y ese rol ya
    // esta asignado en el proyecto, usamos esa persona; si no, el responsable fijo.
    let resp = t.responsable || null;
    if (t.rol && campos[t.rol]) resp = campos[t.rol];
    filas.push({
      _ref: ref, _parentRef: parentRef, _depth: depth,
      proyecto_id: proy.id, etapa, orden, nivel,
      tipo: t.tipo === "modelado" ? "modelado" : "normal",
      nombre: t.nombre, responsable: resp, nota: t.nota || null,
      rol: t.rol || null,
      slug: t.slug || null,
      asigna_roles: !!t.asigna_roles,
      analisis_general: !!t.analisis_general,
      selecciona_modo3: !!t.selecciona_modo3,
      auto_ia: !!t.auto_ia,
    });
    if (t.subitems) t.subitems.forEach((s,i)=>pushTarea(s, etapa, ref, i, "subitem", depth+1));
    if (t.rubros)   t.rubros.forEach((r,i)=>pushTarea(r, etapa, ref, i, "rubro",   depth+1));
  }
  window.PLANTILLA.forEach(et => et.tareas.forEach((t,i)=>pushTarea(t, et.etapa, null, i, "tarea", 0)));

  // 2) insertar por CAPAS de profundidad (0, luego 1, luego 2...). Al insertar
  //    una capa ya conocemos el id real del padre (insertado en la capa
  //    anterior), asi que mandamos el parent_id correcto en el propio INSERT.
  //    NO dependemos del orden de retorno de un insert masivo (eso causaba
  //    que se cruzaran los parent_id y desaparecieran tareas del arbol).
  const idDeRef = {};
  const maxDepth = Math.max(...filas.map(f => f._depth));
  for (let d = 0; d <= maxDepth; d++) {
    const capa = filas.filter(f => f._depth === d);
    if (!capa.length) continue;
    const payload = capa.map(f => ({
      proyecto_id:f.proyecto_id, etapa:f.etapa, orden:f.orden, nivel:f.nivel,
      tipo:f.tipo, nombre:f.nombre, responsable:f.responsable, nota:f.nota,
      rol:f.rol, slug:f.slug, asigna_roles:f.asigna_roles,
      analisis_general:f.analisis_general, selecciona_modo3:f.selecciona_modo3,
      auto_ia:f.auto_ia,
      parent_id: f._parentRef ? idDeRef[f._parentRef] : null,
    }));
    const { data:ins, error:eIns } = await sb.from("tareas").insert(payload)
      .select("id, etapa, orden, nivel, parent_id");
    if (eIns) throw eIns;

    // emparejar cada fila enviada con su id real por clave compuesta
    // (etapa, orden, nivel, parent_id) — unica dentro de la capa. No usamos
    // el orden de retorno.
    capa.forEach(f => {
      const pid = f._parentRef ? idDeRef[f._parentRef] : null;
      const match = ins.find(r =>
        r.etapa === f.etapa && r.orden === f.orden && r.nivel === f.nivel &&
        (r.parent_id || null) === (pid || null) && !r._tomado);
      if (match) { match._tomado = true; idDeRef[f._ref] = match.id; }
    });
  }

  // 3) registro de creacion
  await sb.from("historial_proyecto").insert({
    proyecto_id: proy.id, proyecto_nombre: proy.nombre,
    accion: "crear", detalle: { campos }, hecho_por: PERFIL.id });
  await cargarProyectos();
}

// ---------- TILDAR (con regla de bloqueo) ----------
function hijosDe(id){ return TAREAS.filter(t => t.parent_id === id); }
// true si TODAS las hojas de una etapa estan cumplidas
function etapaCompleta(nEtapa){
  const idsConHijos = new Set(TAREAS.filter(x=>x.parent_id).map(x=>x.parent_id));
  const hojas = TAREAS.filter(t => t.etapa===nEtapa && !idsConHijos.has(t.id));
  if (!hojas.length) return false;
  return hojas.every(h => h.cumplido);
}
function gateBloqueado(tarea) {
  // Regla de etapa: no se puede arrancar Etapa 3 sin la Etapa 2 completa.
  if (tarea.etapa === 3 && !etapaCompleta(2)) return "Etapa 2 (completala primero)";
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
  if (!puedeTildar(t)) {
    toast(`Solo ${t.responsable||"el responsable asignado"} puede tildar esta tarea`);
    return;
  }
  if (t.auto_ia) {
    toast("Esta tarea se tilda sola cuando la auditoria IA no detecta inconsistencias ni interferencias");
    return;
  }
  const blo = gateBloqueado(t);
  if (blo && !t.cumplido) { toast(`Bloqueado: completa primero ${blo}`); return; }
  const nuevo = !t.cumplido;
  await sb.from("tareas").update({ cumplido:nuevo, cumplido_en: nuevo?new Date().toISOString():null }).eq("id", t.id);
  await cargarTareas(activo.id); await cargarProyectos();
  activo = PROYECTOS.find(p=>p.id===activo.id);
  render();
}

// ---------- ASIGNACION DE ROLES DE PROYECTO (cascada) ----------
// Cuando la coordinadora asigna una persona a un rol, se guarda en el
// proyecto y se propaga a TODAS las tareas (no eliminadas) que tengan
// ese rol y aun no tengan un responsable distinto fijado manualmente.
async function asignarRol(rolKey, persona) {
  if (!esCoord()) { toast("Solo la coordinacion puede asignar responsables"); return; }
  // 1) guardar en el proyecto
  await sb.from("proyectos").update({ [rolKey]: persona || null }).eq("id", activo.id);
  // 2) cascada: actualizar responsable de todas las tareas con ese rol
  await sb.from("tareas").update({ responsable: persona || null })
    .eq("proyecto_id", activo.id).eq("rol", rolKey).eq("eliminada", false);
  await sb.from("historial_proyecto").insert({
    proyecto_id: activo.id, proyecto_nombre: activo.nombre, accion: "editar",
    detalle: { rol: rolKey, asignado: persona }, hecho_por: PERFIL.id });
  await cargarTareas(activo.id); await cargarProyectos();
  activo = PROYECTOS.find(p=>p.id===activo.id);
  toast(`${window.ROL_LABEL[rolKey]}: ${persona||"(sin asignar)"} - propagado`);
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
  if (!esCoord()) { toast("Solo la coordinacion puede cambiar responsables"); return; }
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

// ---------- EDITAR / ELIMINAR PROYECTO (con registro) ----------
function abrirEditarProyecto(){
  if (!esCoord()) { toast("Solo la coordinacion puede editar proyectos"); return; }
  const p = activo;
  $("#e-if").value = p.nro_if||""; $("#e-cliente").value = p.cliente||"";
  $("#e-nombre").value = p.nombre||""; $("#e-ficha").value = p.ficha||"";
  $("#e-inicio").value = p.plan_inicio||"";
  $("#e-plazo").value = p.plazo_entrega||"";
  $("#edit-err").textContent = "";
  renderFichaInputs("efi-body", p.inputs || {});
  bindFichaToggle("efi-toggle", "efi-body");
  $("#modal-editar").classList.add("open");
}
async function guardarEdicionProyecto(){
  if (!esCoord()) { toast("Solo la coordinacion puede editar proyectos"); return; }
  const nro=$("#e-if").value.trim(), cli=$("#e-cliente").value.trim(), nom=$("#e-nombre").value.trim();
  if (!nro||!cli||!nom){ $("#edit-err").textContent="Nro. IF, cliente y nombre son obligatorios."; return; }
  const faltan = validarFichaInputs("efi-body");
  if (faltan.length){ $("#edit-err").textContent = "Completá marca Y modelo en: " + faltan.join(", "); return; }
  const antes = { nro_if:activo.nro_if, cliente:activo.cliente, nombre:activo.nombre, ficha:activo.ficha, plan_inicio:activo.plan_inicio, plazo_entrega:activo.plazo_entrega };
  const inicioNuevo = $("#e-inicio").value||null;
  const cambioInicio = inicioNuevo !== (activo.plan_inicio||null);
  const campos = { nro_if:nro, cliente:cli, nombre:nom, ficha:$("#e-ficha").value.trim()||null, plan_inicio:inicioNuevo, inputs: leerFichaInputs("efi-body") };
  await sb.from("proyectos").update(campos).eq("id", activo.id);
  await sb.from("historial_proyecto").insert({
    proyecto_id: activo.id, proyecto_nombre: nom, accion:"editar",
    detalle: { antes, despues: campos }, hecho_por: PERFIL.id });
  $("#modal-editar").classList.remove("open");
  await cargarProyectos(); activo = PROYECTOS.find(p=>p.id===activo.id);
  await cargarTareas(activo.id);
  if (cambioInicio && inicioNuevo) { await aplicarPlanificacion({ silencioso:true }); }
  render();
  toast(cambioInicio && inicioNuevo ? "Proyecto actualizado · plan recalculado" : "Proyecto actualizado");
}
async function eliminarProyecto(){
  if (!esCoord()) { toast("Solo la coordinacion puede eliminar proyectos"); return; }
  if (!confirm(`Eliminar el proyecto "${activo.nombre}"? Esta accion no se puede deshacer.`)) return;
  await sb.from("historial_proyecto").insert({
    proyecto_id: activo.id, proyecto_nombre: activo.nombre, accion:"eliminar",
    detalle: { nro_if:activo.nro_if, cliente:activo.cliente }, hecho_por: PERFIL.id });
  await sb.from("proyectos").delete().eq("id", activo.id);
  activo = null; await cargarProyectos(); tab="proj"; render();
  toast("Proyecto eliminado (queda registro)");
}

// ---------- CREAR DESVIO / NC manual ----------
async function crearDesvio(){
  if (!esCoord()) { toast("Solo la coordinacion puede cargar registros"); return; }
  const titulo = $("#nc-titulo").value.trim();
  if (!titulo){ $("#nc-err").textContent="El titulo es obligatorio."; return; }
  await sb.from("desvios_nc").insert({
    tipo: $("#nc-tipo").value,
    titulo,
    descripcion: $("#nc-desc").value.trim()||null,
    sector: $("#nc-sector").value.trim()||null,
    fecha_registro: $("#nc-fecha").value||null,
    estado: "pendiente",
  });
  $("#modal-nc").classList.remove("open");
  ["nc-titulo","nc-desc","nc-sector","nc-fecha"].forEach(id=>{ const e=$("#"+id); if(e) e.value=""; });
  await cargarDesvios(); render();
  toast("Registro cargado");
}
// ---------- PLANIFICACION: fechas con linea base + motivo de desvio ----------
// Regla: la PRIMERA vez que se carga una fecha, queda como linea base (base_inicio/base_fin).
// Cualquier cambio posterior exige justificar con motivo (Planificacion/Cliente/Desarrollo).
// Solo la coordinacion puede tocar fechas.
let pendienteFecha = null; // {tarea, campo, valorNuevo, valorViejo}

function intentarGuardarFecha(t, campo, valorNuevo) {
  if (!esCoord()) { toast("Solo la coordinacion carga la planificacion"); render(); return; }
  const baseCol = campo === "inicio" ? "base_inicio" : "base_fin";
  const vigCol  = campo === "inicio" ? "fecha_inicio" : "fecha_fin";
  const valorViejo = t[vigCol] || null;
  // sin linea base aun -> primera carga: guarda directo y fija base
  if (!t[baseCol]) {
    guardarFechaDirecto(t, campo, valorNuevo, true);
    return;
  }
  // ya hay base y no cambia nada -> nada
  if ((valorNuevo||null) === (valorViejo||null)) return;
  // cambio sobre algo planificado -> pedir motivo
  pendienteFecha = { tarea: t, campo, valorNuevo, valorViejo };
  $("#df-tarea").textContent = t.nombre;
  $("#df-campo").textContent = campo === "inicio" ? "Inicio" : "Fin";
  $("#df-de").textContent = valorViejo || "(vacio)";
  $("#df-a").textContent  = valorNuevo || "(vacio)";
  $("#df-motivo").value = "";
  $("#df-detalle").value = "";
  $("#df-err").textContent = "";
  $("#modal-fecha").classList.add("open");
}

async function guardarFechaDirecto(t, campo, valor, fijarBase) {
  const vigCol  = campo === "inicio" ? "fecha_inicio" : "fecha_fin";
  const baseCol = campo === "inicio" ? "base_inicio"  : "base_fin";
  const upd = { [vigCol]: valor || null };
  if (fijarBase) upd[baseCol] = valor || null;
  await sb.from("tareas").update(upd).eq("id", t.id);
  await cargarTareas(activo.id);
  render();
}

async function confirmarDesvioFecha() {
  const motivo = $("#df-motivo").value;
  if (!motivo) { $("#df-err").textContent = "Elegi un motivo."; return; }
  const { tarea, campo, valorNuevo, valorViejo } = pendienteFecha;
  const vigCol = campo === "inicio" ? "fecha_inicio" : "fecha_fin";
  await sb.from("historial_fechas").insert({
    tarea_id: tarea.id, proyecto_id: activo.id, campo,
    fecha_anterior: valorViejo, fecha_nueva: valorNuevo || null,
    motivo, detalle: $("#df-detalle").value.trim() || null,
    cambiado_por: PERFIL.id });
  await sb.from("tareas").update({ [vigCol]: valorNuevo || null }).eq("id", tarea.id);
  $("#modal-fecha").classList.remove("open");
  await cargarTareas(activo.id);
  render();
}

// ============================================================
// PLANIFICACION AUTOMATICA  (categoria -> dias habiles -> fechas)
// ============================================================
// Helpers de dias habiles (lun-vie; sin feriados por ahora).
function aFecha(s){ if(!s) return null; const d=new Date(s+"T00:00:00"); return isNaN(d)?null:d; }
function fmtFecha(d){ return d.toISOString().slice(0,10); }
function esFinde(d){ const w=d.getDay(); return w===0||w===6; }
// suma N dias habiles a una fecha (N>=0). dia 0 = la misma fecha si es habil,
// o el proximo habil. Devuelve Date.
function sumarHabiles(desde, n){
  let d = new Date(desde);
  // primero, asegurar que el punto de partida es habil
  while (esFinde(d)) d.setDate(d.getDate()+1);
  let restantes = n;
  while (restantes > 0){
    d.setDate(d.getDate()+1);
    if (!esFinde(d)) restantes--;
  }
  return d;
}
// proximo dia habil estricto despues de 'd'
function siguienteHabil(d){
  const x = new Date(d);
  do { x.setDate(x.getDate()+1); } while (esFinde(x));
  return x;
}

// Lee la categoria guardada del proyecto activo (o la calcula desde rubros).
function categoriaActiva(){
  if (activo && activo.categoria) return activo.categoria;
  const rub = (activo && activo.rubros_redibujar) || [];
  return window.categoriaPorRubros(rub.length);
}

// Construye el plan de duraciones (slug -> dias habiles) para el proyecto,
// combinando Etapa 2 (segun categoria) y Etapa 3 (segun modo).
function planDuraciones(){
  const cat = categoriaActiva();
  const e2 = window.REPARTO_CATEGORIA[cat] || {};
  const dur = { ...e2 };
  // Etapa 3 segun modo
  const modo = (activo && activo.modo_etapa3) || "ia";
  if (modo === "dwg") {
    dur["e3_ejecutiva"] = window.ETAPA3_DWG_EJECUTIVA;          // 19
    // el "1 dia para todo el resto" se reparte: damos el dia al control;
    // listado y computo quedan en 0 (mismo dia).
    dur["e3_listado"] = 0; dur["e3_control"] = 1; dur["e3_computo"] = 0;
  } else { // ia o bim: 1 dia total
    dur["e3_ejecutiva"] = 1; dur["e3_listado"] = 0; dur["e3_control"] = 0; dur["e3_computo"] = 0;
  }
  return dur;
}

// Aplica la planificacion automatica encadenando en dias habiles desde la
// FECHA DE INICIO del proyecto (plan_inicio).
//   - Etapa 1: arranca en plan_inicio, dura `duracion_dias` de la plantilla (2).
//   - Etapa 2: arranca al dia habil siguiente al fin de Etapa 1; reparte segun categoria.
//   - Etapa 3: arranca al dia habil siguiente al fin de Etapa 2; dias segun modo
//              (IA/BIM = 1 dia total; DWG = 20 = 19 ejecutiva + 1 resto).
//   - El PLAZO DE ENTREGA del proyecto se completa solo = fin de Etapa 3.
// La linea base (base_inicio/base_fin) de cada tarea se fija/actualiza con
// estos valores planificados, que es contra lo que luego se mide atraso/adelanto.
async function aplicarPlanificacion({ silencioso } = {}) {
  if (!esCoord()) { if(!silencioso) toast("Solo la coordinacion planifica"); return; }
  if (!activo) return;
  const dur = planDuraciones();

  // ANCLA: fecha de inicio del proyecto
  const inicio = aFecha(activo.plan_inicio);
  if (!inicio) {
    if(!silencioso) toast("Cargá primero la fecha de inicio del proyecto (Editar proyecto)");
    return;
  }

  const updates = []; // {id, inicio, fin}
  const bySlug = {};
  TAREAS.forEach(t=>{ if(t.slug) bySlug[t.slug]=t; });

  // ---- ETAPA 1: tareas hoja de etapa 1, dentro de la ventana de inicio ----
  // La etapa 1 ocupa `duracion_dias` (plantilla) dias habiles desde el inicio.
  const durE1 = (window.PLANTILLA.find(e=>e.etapa===1)||{}).duracion_dias || 2;
  const iniE1 = new Date(inicio);
  const finE1 = sumarHabiles(iniE1, Math.max(0, durE1-1));
  // marcamos inicio/fin de etapa 1 en sus tareas hoja (todas en la misma ventana)
  const idsConHijos = new Set(TAREAS.filter(x=>x.parent_id).map(x=>x.parent_id));
  TAREAS.filter(t=>t.etapa===1 && !idsConHijos.has(t.id)).forEach(t=>{
    updates.push({ id:t.id, inicio:fmtFecha(iniE1), fin:fmtFecha(finE1) });
  });

  // ---- ETAPA 2 (reparto por categoria) ----
  const ordenE2 = ["modelado_1","reunion_validacion_1","modelado_2","validacion_produccion","reunion_validacion_2","modelado_3","validacion_ia","presentacion_final"];
  let cursor = siguienteHabil(finE1);
  let finE2 = null;
  ordenE2.forEach(slug=>{
    const t = bySlug[slug]; if(!t) return;
    const dias = dur[slug] ?? 1;
    const ini = new Date(cursor);
    const fin = sumarHabiles(ini, Math.max(0, dias-1));
    updates.push({ id:t.id, inicio:fmtFecha(ini), fin:fmtFecha(fin) });
    finE2 = fin;
    cursor = siguienteHabil(fin);
  });

  // ---- ETAPA 3 (base estable: arranca al fin de Etapa 2, dias segun modo) ----
  let finE3 = finE2;
  if (finE2) {
    const ordenE3 = ["e3_listado","e3_ejecutiva","e3_control","e3_computo"];
    let cur3 = siguienteHabil(finE2);
    let prevFin = null;
    ordenE3.forEach(slug=>{
      const t = bySlug[slug]; if(!t) return;
      const dias = dur[slug] ?? 0;
      let ini = (prevFin && dias===0) ? new Date(prevFin) : new Date(cur3);
      const finReal = dias===0 ? new Date(ini) : sumarHabiles(ini, dias-1);
      updates.push({ id:t.id, inicio:fmtFecha(ini), fin:fmtFecha(finReal) });
      prevFin = finReal; finE3 = finReal;
      cur3 = siguienteHabil(finReal);
    });
  }

  // persistir tareas: la base se fija/actualiza con el plan (es la referencia de atraso)
  for (const u of updates) {
    const t = TAREAS.find(x=>x.id===u.id); if(!t) continue;
    await sb.from("tareas").update({
      fecha_inicio:u.inicio, fecha_fin:u.fin,
      base_inicio:u.inicio, base_fin:u.fin,
    }).eq("id", t.id);
  }

  // PLAZO DE ENTREGA automatico = fin de Etapa 3
  const plazo = finE3 ? fmtFecha(finE3) : null;
  await sb.from("proyectos").update({ plan_fin_f1:fmtFecha(finE1), plan_fin_f2:finE2?fmtFecha(finE2):null, plazo_entrega:plazo }).eq("id", activo.id);

  await sb.from("historial_proyecto").insert({
    proyecto_id: activo.id, proyecto_nombre: activo.nombre, accion:"editar",
    detalle:{ planificacion:"auto", inicio:activo.plan_inicio, categoria:categoriaActiva(), modo_etapa3:(activo.modo_etapa3||"ia"), plazo }, hecho_por: PERFIL.id });

  await cargarTareas(activo.id); await cargarProyectos();
  activo = PROYECTOS.find(p=>p.id===activo.id);
  if(!silencioso) toast(`Plan recalculado · Cat ${categoriaActiva()} · entrega ${plazo||'—'}`);
  render();
}

// Guarda los rubros a redibujar y deriva la categoria automaticamente.
// NO re-renderiza el panel completo (eso destildaba el checkbox antes de que
// llegara el dato de Supabase). Actualiza el estado local y refresca solo el
// indicador de categoria en el DOM.
async function guardarRubrosRedibujo(rubros) {
  if (!esCoord()) { toast("Solo la coordinacion edita el análisis general"); return; }
  const cat = window.categoriaPorRubros(rubros.length);
  // 1) estado local inmediato (para que el render siguiente no pise los checks)
  if (activo) { activo.rubros_redibujar = rubros; activo.categoria = cat; }
  // 2) refrescar solo el badge/info de categoria, sin tocar los checkboxes
  actualizarIndicadorCategoria(cat, rubros.length);
  // 3) persistir en segundo plano
  try {
    await sb.from("proyectos").update({ rubros_redibujar: rubros, categoria: cat }).eq("id", activo.id);
    const ix = PROYECTOS.findIndex(p=>p.id===activo.id);
    if (ix>=0){ PROYECTOS[ix].rubros_redibujar = rubros; PROYECTOS[ix].categoria = cat; }
  } catch(e){
    toast("No se pudo guardar: " + (e.message||e));
    return;
  }
  // 4) si ya hay fecha de inicio, recalcular todo el plan automaticamente.
  //    Debounce: esperamos a que el usuario deje de tildar (700ms) para no
  //    recalcular en cada click y no provocar re-render que destilde.
  if (activo.plan_inicio) {
    clearTimeout(window.__replanTO);
    window.__replanTO = setTimeout(async ()=>{
      await aplicarPlanificacion({ silencioso:true });
      toast(`Categoría ${cat} · plan recalculado`);
    }, 700);
  } else {
    toast(`Categoría ${cat} · cargá la fecha de inicio para calcular el plan`);
  }
}

// actualiza en el DOM el badge de categoria y el texto, sin redibujar el panel
function actualizarIndicadorCategoria(cat, n){
  const totalCat = { 1:20, 2:15, 3:10 }[cat];
  document.querySelectorAll(".ag-cat-b").forEach((el,i)=>{
    el.classList.toggle("on", (i+1)===cat);
  });
  const info = document.querySelector(".ag-cat-info");
  if (info) info.innerHTML = `Categoría <b>${cat}</b> · ${totalCat} días hábiles · ${n} rubro(s)`;
}

// Cambia el modo de la Etapa 3 (ia / bim / dwg) y recalcula las fechas.
async function guardarModoEtapa3(modo) {
  if (!esCoord()) { toast("Solo la coordinacion edita el modo de documentación"); return; }
  if (activo) activo.modo_etapa3 = modo;
  // resaltar la opcion elegida en el DOM
  document.querySelectorAll(".m3-opt").forEach(el=>{
    const r = el.querySelector(".m3-radio");
    el.classList.toggle("on", r && r.value===modo);
  });
  const lbl = (window.MODOS_ETAPA3.find(m=>m.key===modo)||{}).label || modo;
  const dias = (window.MODOS_ETAPA3.find(m=>m.key===modo)||{}).dias_total;
  try {
    await sb.from("proyectos").update({ modo_etapa3: modo }).eq("id", activo.id);
    const ix = PROYECTOS.findIndex(p=>p.id===activo.id);
    if (ix>=0) PROYECTOS[ix].modo_etapa3 = modo;
  } catch(e){
    toast("No se pudo guardar: " + (e.message||e));
    return;
  }
  // ¿hay ancla? (fin de Etapa 1 cargado). Si sí, recalculamos las fechas para
  // que el nuevo modo "sume" los días en la Etapa 3 sin tener que ir al botón.
  const hayAncla = TAREAS.some(t=>t.etapa===1 && t.fecha_fin);
  if (hayAncla) {
    await aplicarPlanificacion({ silencioso:true });
    toast(`Etapa 3: ${lbl} · ${dias} día${dias>1?'s':''} hábil${dias>1?'es':''} · fechas recalculadas`);
  } else {
    toast(`Etapa 3: ${lbl}. Cargá el fin de la Etapa 1 y recalculá para aplicar los días.`);
  }
}

// ---------- RENDER ----------
function render() {
  document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  const c = $("#content");
  if (tab==="proj")  c.innerHTML = activo ? "" : renderLista(), activo && renderDetalle();
  if (tab==="dash")  c.innerHTML = renderDash();
  if (tab==="desvios") c.innerHTML = renderDesvios();
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
      ${p.tarea_actual?`<div class="pc-actual"><span class="pc-actual-lbl">Etapa ${p.etapa_actual||'—'} ·</span> ${p.tarea_actual}</div>`:''}
      <div class="pc-prog">${barra(p.avance_pct)}<span class="pc-pct">${p.avance_pct}%</span></div>
    </div>`).join("");
  if (!PROYECTOS.length) cards = `<p class="empty">No hay proyectos todavía. Creá uno con “Nuevo proyecto”.</p>`;
  return `<div class="lista-top">${btn}</div>${cards}`;
}

function nodoTarea(t, depth) {
  const hijos = hijosDe(t.id).sort((a,b)=>a.orden-b.orden);
  const tieneHijos = hijos.length > 0;
  const blo = gateBloqueado(t);
  const esGate = t.tipo === "modelado";
  const puedoTildarEsta = puedeTildar(t);

  // check solo en hojas (sin hijos). Las que tienen hijos muestran progreso.
  let checkHTML = "";
  if (!tieneHijos) {
    const gateLock = blo && !t.cumplido;
    const permLock = !puedoTildarEsta && !t.cumplido;   // no soy responsable ni coordinacion
    const iaLock   = t.auto_ia;                          // se tilda sola por IA
    const lock = gateLock || permLock || iaLock;
    let titleTxt = "";
    if (gateLock) titleTxt = "Bloqueado: " + blo;
    else if (iaLock) titleTxt = "Se tilda automaticamente con la auditoria IA";
    else if (permLock) titleTxt = "Solo " + (t.responsable||"el responsable") + " puede tildar";
    checkHTML = `<button class="chk ${t.cumplido?'on':''} ${lock&&!t.cumplido?'lock':''}" data-id="${t.id}" ${titleTxt?`title="${titleTxt}"`:''}>
      ${t.cumplido?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 6"/></svg>':(lock?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>':'')}
    </button>`;
  } else {
    const tot = hijos.length;
    const hechos = hijos.filter(h=>h.cumplido).length;
    checkHTML = `<span class="grp-count ${esGate?'gate':''}">${hechos}/${tot}</span>`;
  }

  // responsable: SOLO la coordinacion puede cambiarlo (desplegable);
  // el resto lo ve como texto. Si la tarea esta atada a un rol de proyecto,
  // lo indicamos con una etiqueta.
  const rolTag = t.rol ? `<span class="rol-tag" title="Asignado por rol de proyecto">${window.ROL_LABEL[t.rol]||t.rol}</span>` : "";
  const respSel = esCoord()
    ? `<select class="resp-sel" data-id="${t.id}">
         <option value="">(sin asignar)</option>
         ${window.RESPONSABLES.map(r=>`<option ${t.responsable===r?'selected':''}>${r}</option>`).join("")}
       </select>`
    : `<span class="resp-ro">${t.responsable||"(sin asignar)"}</span>`;

  // panel de asignacion de roles (solo en la tarea marcada asigna_roles)
  let rolesHTML = "";
  if (t.asigna_roles && esCoord()) {
    rolesHTML = `<div class="roles-asign">
      ${window.ROLES_PROYECTO.map(r=>`
        <div class="ra-row">
          <span class="ra-lbl">${r.label}</span>
          <select class="rol-sel" data-rol="${r.key}">
            <option value="">(sin asignar)</option>
            ${window.RESPONSABLES.map(p=>`<option ${activo[r.key]===p?'selected':''}>${p}</option>`).join("")}
          </select>
        </div>`).join("")}
      <div class="ra-help">Al asignar, cada persona se propaga a todas sus tareas en las etapas siguientes.</div>
    </div>`;
  } else if (t.asigna_roles) {
    rolesHTML = `<div class="roles-asign ro">
      ${window.ROLES_PROYECTO.map(r=>`<div class="ra-row"><span class="ra-lbl">${r.label}</span><span class="resp-ro">${activo[r.key]||"(sin asignar)"}</span></div>`).join("")}
    </div>`;
  }

  // panel de ANALISIS GENERAL: rubros a redibujar -> categoria automatica
  let analisisHTML = "";
  if (t.analisis_general) {
    const sel = (activo.rubros_redibujar || []);
    const cat = activo.categoria || window.categoriaPorRubros(sel.length);
    const totalCat = { 1:20, 2:15, 3:10 }[cat];
    if (esCoord()) {
      analisisHTML = `<div class="ag-panel">
        <div class="ag-tit">Rubros a redibujar</div>
        <div class="ag-rubros">
          ${window.RUBROS_REDIBUJO.map(r=>`
            <label class="ag-chk"><input type="checkbox" class="ag-rubro" value="${r}" ${sel.includes(r)?'checked':''}> ${r}</label>`).join("")}
        </div>
        <div class="ag-cat">
          <div class="ag-cat-badges">
            ${[1,2,3].map(c=>`<span class="ag-cat-b ${cat===c?'on':''}">Categoría ${c}</span>`).join("")}
          </div>
          <span class="ag-cat-info">Categoría <b>${cat}</b> · ${totalCat} días hábiles · ${sel.length} rubro(s)</span>
        </div>
        <div class="ag-rule">Regla: 3+ rubros → Cat 1 · 2 rubros → Cat 2 · 1 o menos → Cat 3. La categoría reparte los días en la Etapa 2.</div>
        <button class="btn sm" id="ag-replan" style="margin-top:10px">Recalcular planificación (Etapas 2 y 3)</button>
      </div>`;
    } else {
      analisisHTML = `<div class="ag-panel ro">
        <div class="ag-tit">Rubros a redibujar</div>
        <div class="ag-rubros-ro">${sel.length ? sel.join(" · ") : "(sin definir)"}</div>
        <span class="ag-cat-info">Categoría <b>${cat}</b> · ${totalCat} días hábiles</span>
      </div>`;
    }
  }

  // panel de MODO ETAPA 3 (en la tarea "Documentacion ejecutiva" padre)
  let modo3HTML = "";
  if (t.selecciona_modo3) {
    const modo = activo.modo_etapa3 || "ia";
    if (esCoord()) {
      modo3HTML = `<div class="ag-panel">
        <div class="ag-tit">Modo de documentación ejecutiva</div>
        <div class="m3-opts">
          ${window.MODOS_ETAPA3.map(m=>`
            <label class="m3-opt ${modo===m.key?'on':''}">
              <input type="radio" name="modo3" class="m3-radio" value="${m.key}" ${modo===m.key?'checked':''}>
              <b>${m.label}</b><span>${m.dias_total} día${m.dias_total>1?'s':''} hábil${m.dias_total>1?'es':''}</span>
            </label>`).join("")}
        </div>
        <div class="ag-rule">DWG: 19 días de documentación ejecutiva + 1 para el resto de la etapa. IA y BIM: 1 día. La Etapa 3 arranca al cerrar la Etapa 2.</div>
      </div>`;
    } else {
      const lbl = (window.MODOS_ETAPA3.find(m=>m.key===modo)||{}).label || modo;
      modo3HTML = `<div class="ag-panel ro"><div class="ag-tit">Modo de documentación</div><div class="ag-rubros-ro">${lbl}</div></div>`;
    }
  }

  // fechas por tarea con indicador de desvio vs linea base (no en rubros)
  const editFechas = esCoord();
  let fechasHTML = "";
  if (t.nivel !== "rubro") {
    const desvIni = desvioDias(t.base_inicio, t.fecha_inicio);
    const desvFin = desvioDias(t.base_fin, t.fecha_fin);
    const tagDesv = (d) => d===null ? "" : (d===0 ? `<span class="desv ok">en fecha</span>`
      : d>0 ? `<span class="desv late">+${d}d</span>` : `<span class="desv early">${d}d</span>`);
    fechasHTML = `<div class="fechas">
         <input type="date" class="f-ini" data-id="${t.id}" value="${t.fecha_inicio||''}" ${editFechas?'':'disabled'} title="Inicio">
         <span class="f-sep">-></span>
         <input type="date" class="f-fin" data-id="${t.id}" value="${t.fecha_fin||''}" ${editFechas?'':'disabled'} title="Fin">
         ${t.base_inicio||t.base_fin?`<span class="base-lbl" title="Linea base">base: ${t.base_inicio||'—'} / ${t.base_fin||'—'}</span>`:""}
         ${tagDesv(desvFin)}
       </div>`;
  }

  const delBtn = esCoord()
    ? `<button class="del-tarea" data-id="${t.id}" title="Eliminar tarea">×</button>` : "";
  const histBtn = `<button class="hist-btn" data-id="${t.id}" title="Historial de responsable"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/></svg></button>`;

  let html = `
    <div class="tnode lvl-${t.nivel} ${esGate?'is-gate':''}" style="margin-left:${depth*18}px">
      <div class="tnode-row">
        ${checkHTML}
        <div class="tnode-name">${t.nombre}${esGate?' <span class="gate-tag">gate · 6 rubros</span>':''}${t.auto_ia?' <span class="ia-tag">auto · IA</span>':''} ${rolTag}
          ${t.nota?`<div class="tnode-note">${t.nota}</div>`:''}
        </div>
        ${respSel}
        ${histBtn}
        ${delBtn}
      </div>
      ${rolesHTML}
      ${analisisHTML}
      ${modo3HTML}
      ${fechasHTML}
    </div>`;
  if (tieneHijos) html += hijos.map(h=>nodoTarea(h, depth+1)).join("");
  return html;
}

// desvio en dias entre linea base y fecha vigente (+ = atraso, - = adelanto)
function desvioDias(base, vig){
  if (!base || !vig) return null;
  const a = new Date(base), b = new Date(vig);
  return Math.round((b - a) / 86400000);
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

  const accionesProy = esCoord()
    ? `<div class="proy-actions">
         <button class="btn ghost sm" id="editar-proy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg> Editar</button>
         <button class="btn ghost sm" id="eliminar-proy" style="color:var(--red)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg> Eliminar</button>
       </div>` : "";

  // resumen de roles de proyecto asignados
  const rolesResumen = window.ROLES_PROYECTO.map(r=>
    `<div class="fld"><label>${r.label}</label><div class="val">${p[r.key]||'Sin asignar'}</div></div>`).join("");

  // ficha de inputs cargada (solo los que tienen valor)
  let fichaHTML = "";
  if (window.CAMPOS_INPUT && p.inputs && Object.keys(p.inputs).length) {
    const secs = window.CAMPOS_INPUT.map(sec=>{
      const filas = sec.campos.filter(c=>p.inputs[c.key]).map(c=>
        `<div class="fi-row"><span class="fi-lbl">${c.label}</span><span class="val">${fmtFichaValor(p.inputs[c.key])}</span></div>`).join("");
      return filas ? `<div class="fi-sec">${sec.seccion}</div>${filas}` : "";
    }).join("");
    fichaHTML = `<div class="ficha-inputs" style="margin-top:16px">
      <div class="ficha-head" id="det-ficha-toggle">
        <svg class="fi-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        <b>Requisitos / Ficha descriptiva</b>
      </div>
      <div class="ficha-body" id="det-ficha-body" style="display:none">${secs}</div>
    </div>`;
  }

  $("#content").innerHTML = `
    <button class="btn ghost sm" id="volver">← Volver a proyectos</button>
    <div class="det-head">
      <div>
        <h2 class="det-title">${p.nombre}</h2>
        <div class="det-sub">${p.nro_if} · ${p.cliente}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <div class="det-prog"><div class="det-pct">${p.avance_pct}%</div>${barra(p.avance_pct)}</div>
        ${accionesProy}
      </div>
    </div>
    <div class="det-fields">
      <div class="fld"><label>Cliente</label><div class="val">${p.cliente}</div></div>
      <div class="fld"><label>Fecha de inicio</label><div class="val">${p.plan_inicio||'—'}</div></div>
      <div class="fld"><label>Plazo de entrega <span class="auto-tag">auto</span></label><div class="val">${p.plazo_entrega||'—'}</div></div>
      <div class="fld"><label>Responsable</label><div class="val">${p.responsable||'Sin asignar'}</div></div>
      <div class="fld"><label>Estado</label>${estadoSel}</div>
      ${rolesResumen}
      <div class="fld fld-full"><label>Requisitos / Ficha descriptiva</label><div class="val">${p.ficha||'—'}</div></div>
    </div>
    ${fichaHTML}
    <div class="hoja-ruta">${etapasHTML}</div>`;
  bind();
  bindFichaToggle("det-ficha-toggle", "det-ficha-body");
}

function renderDash() {
  const t = PROYECTOS.length||1;
  const enEj = PROYECTOS.filter(p=>p.estado==="en_ejecucion").length;
  const term = PROYECTOS.filter(p=>p.estado==="terminado").length;
  const prom = Math.round(PROYECTOS.reduce((a,p)=>a+(p.avance_pct||0),0)/t);

  // mapa de proyecto activo (no terminado) para filtrar tareas relevantes
  const proyById = {}; PROYECTOS.forEach(p=>proyById[p.id]=p);
  const proyActivo = id => proyById[id] && proyById[id].estado !== "terminado";

  // fechas
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const manana = new Date(hoy); manana.setDate(manana.getDate()+1);
  const en7 = new Date(hoy); en7.setDate(en7.getDate()+7);
  const fmtD = d => d.toISOString().slice(0,10);
  const HOY = fmtD(hoy), MAN = fmtD(manana);

  // hojas (tareas sin hijos) = las que realmente se ejecutan/tildan
  const idsConHijos = new Set(TAREAS_ALL.filter(x=>x.parent_id).map(x=>x.parent_id));
  const hojas = TAREAS_ALL.filter(x => !idsConHijos.has(x.id));

  // ----- ALERTAS A NIVEL PROYECTO (performance de plazos) -----
  // a) plazo de entrega vencido o proximo con avance bajo
  // b) acumulado de dias de atraso de sus tareas vs linea base
  const desvioProy = {}; // proyecto_id -> dias de atraso acumulado (solo positivos)
  TAREAS_ALL.forEach(x=>{
    if (!x.base_fin || !x.fecha_fin) return;
    const d = Math.round((new Date(x.fecha_fin) - new Date(x.base_fin))/86400000);
    if (d > 0) desvioProy[x.proyecto_id] = (desvioProy[x.proyecto_id]||0) + d;
  });
  const proyAlerta = PROYECTOS.filter(p => p.estado!=="terminado").map(p=>{
    const diasAlPlazo = p.plazo_entrega ? Math.round((new Date(p.plazo_entrega)-hoy)/86400000) : null;
    let nivel = null; // 'rojo' | 'amber'
    let motivo = "";
    if (diasAlPlazo !== null && diasAlPlazo < 0) { nivel="rojo"; motivo=`Plazo vencido hace ${Math.abs(diasAlPlazo)}d · ${p.avance_pct}%`; }
    else if (diasAlPlazo !== null && diasAlPlazo <= 7 && p.avance_pct < 90) { nivel="amber"; motivo=`Entrega en ${diasAlPlazo}d con ${p.avance_pct}%`; }
    else if ((desvioProy[p.id]||0) >= 5) { nivel="amber"; motivo=`+${desvioProy[p.id]}d de atraso vs. plan`; }
    return nivel ? { p, nivel, motivo, diasAlPlazo, desvio: desvioProy[p.id]||0 } : null;
  }).filter(Boolean).sort((a,b)=> (a.nivel==="rojo"?-1:1) - (b.nivel==="rojo"?-1:1));

  const proyAlertaHTML = proyAlerta.length ? proyAlerta.map(a=>`
    <div class="al-row" data-goto="${a.p.id}">
      <span class="al-dot ${a.nivel}"></span>
      <span class="al-name">${a.p.nombre}</span>
      <span class="al-proy">${a.motivo}</span>
      <span class="al-fecha">${a.p.plazo_entrega||'—'}</span>
    </div>`).join("") : `<p class="empty">Todos los proyectos en plazo.</p>`;

  // ----- ALERTAS: vencidas y por vencer (tareas hoja, no cumplidas, en proyectos activos) -----
  const pend = hojas.filter(x => !x.cumplido && proyActivo(x.proyecto_id) && x.fecha_fin);
  const vencidas = pend.filter(x => x.fecha_fin < HOY);
  const porVencer = pend.filter(x => x.fecha_fin >= HOY && new Date(x.fecha_fin) <= en7);

  // ----- CARGA LABORAL: tareas pendientes asignadas por persona (proyectos activos) -----
  const carga = {};
  (window.RESPONSABLES||[]).forEach(r=>carga[r]=0);
  hojas.filter(x => !x.cumplido && proyActivo(x.proyecto_id) && x.responsable)
       .forEach(x => { carga[x.responsable] = (carga[x.responsable]||0)+1; });
  const cargaArr = Object.entries(carga).sort((a,b)=>b[1]-a[1]);
  const maxCarga = Math.max(1, ...cargaArr.map(c=>c[1]));

  // ----- OBJETIVOS DEL DÍA: tareas con fecha (inicio o fin) hoy / mañana -----
  const objHoy = hojas.filter(x => !x.cumplido && (x.fecha_inicio===HOY || x.fecha_fin===HOY));
  const objMan = hojas.filter(x => !x.cumplido && (x.fecha_inicio===MAN || x.fecha_fin===MAN));

  // tarjetas superiores
  const proyRojos = proyAlerta.filter(a=>a.nivel==="rojo").length;
  const cards = [
    ["Proyectos en ejecución", enEj, "var(--olive-deep)"],
    ["Proyectos en riesgo", proyAlerta.length, proyRojos? "var(--red)":(proyAlerta.length?"var(--amber)":"var(--green)")],
    ["Avance promedio", prom+"%", "var(--olive-deep)"],
    ["Tareas en alerta", vencidas.length+porVencer.length, vencidas.length? "var(--red)":"var(--amber)"],
  ].map(([k,v,c])=>`<div class="stat"><div class="k">${k}</div><div class="v" style="color:${c}">${v}</div></div>`).join("");

  // ----- ATRASOS REALES: tareas hoja cuya fecha vigente supera su linea base -----
  // (mide el atraso contra el plan; la base de Etapa 3 ya es estable)
  const atrasadas = hojas
    .filter(x => !x.cumplido && proyActivo(x.proyecto_id) && x.base_fin && x.fecha_fin)
    .map(x => ({ ...x, dias: Math.round((new Date(x.fecha_fin) - new Date(x.base_fin))/86400000) }))
    .filter(x => x.dias > 0)
    .sort((a,b)=> b.dias - a.dias);

  // bloque alertas
  const itemTarea = x => {
    const p = proyById[x.proyecto_id]||{};
    return `<div class="al-row" data-goto="${x.proyecto_id}">
      <span class="al-name">${x.nombre}</span>
      <span class="al-proy">${p.nombre||''}</span>
      <span class="al-fecha">${x.fecha_fin||x.fecha_inicio||''}</span></div>`;
  };
  const itemAtraso = x => {
    const p = proyById[x.proyecto_id]||{};
    return `<div class="al-row" data-goto="${x.proyecto_id}">
      <span class="al-dot rojo"></span>
      <span class="al-name">${x.nombre}</span>
      <span class="al-proy">E${x.etapa} · ${p.nombre||''} · ${x.responsable||'sin asignar'}</span>
      <span class="al-dias">+${x.dias}d</span></div>`;
  };
  const alertasHTML = (atrasadas.length||vencidas.length||porVencer.length) ? `
    ${atrasadas.length?`<div class="al-grp"><div class="al-tit red">Atrasadas vs. plan (${atrasadas.length})</div>${atrasadas.map(itemAtraso).join("")}</div>`:""}
    ${vencidas.length?`<div class="al-grp"><div class="al-tit red">Vencidas (${vencidas.length})</div>${vencidas.map(itemTarea).join("")}</div>`:""}
    ${porVencer.length?`<div class="al-grp"><div class="al-tit amber">Por vencer · 7 días (${porVencer.length})</div>${porVencer.map(itemTarea).join("")}</div>`:""}
  ` : `<p class="empty">Sin atrasos ni tareas próximas a vencer.</p>`;

  // bloque carga laboral (barras horizontales)
  const cargaHTML = cargaArr.map(([persona,n])=>`
    <div class="cl-row">
      <span class="cl-name">${persona}</span>
      <div class="cl-bar"><div class="cl-fill" style="width:${Math.round(n/maxCarga*100)}%"></div></div>
      <span class="cl-num">${n}</span>
    </div>`).join("") || '<p class="empty">Sin tareas asignadas.</p>';

  // bloque objetivos del día / mañana
  const objItem = x => {
    const p = proyById[x.proyecto_id]||{};
    return `<div class="al-row" data-goto="${x.proyecto_id}">
      <span class="al-name">${x.nombre}</span>
      <span class="al-proy">${p.nombre||''}</span>
      <span class="al-fecha">${x.responsable||'—'}</span></div>`;
  };
  const objHTML = `
    <div class="al-grp"><div class="al-tit">Hoy (${objHoy.length})</div>${objHoy.map(objItem).join("")||'<p class="empty sm">Nada planificado para hoy.</p>'}</div>
    <div class="al-grp"><div class="al-tit">Mañana (${objMan.length})</div>${objMan.map(objItem).join("")||'<p class="empty sm">Nada planificado para mañana.</p>'}</div>`;

  // avance por proyecto (clickeable) con tarea actual
  const filas = PROYECTOS.map(p=>`
    <div class="dash-row clickable" data-goto="${p.id}">
      <div style="flex:1;min-width:0">
        <span class="dr-n">${p.nombre}</span>
        ${p.tarea_actual?`<div class="dr-actual">Etapa ${p.etapa_actual||'—'} · ${p.tarea_actual}</div>`:'<div class="dr-actual done">Completado</div>'}
      </div>
      ${barra(p.avance_pct)}<span class="dr-p">${p.avance_pct}%</span>
      <svg class="dr-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
    </div>`).join("");

  return `
    <div class="stats">${cards}</div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-h">Performance de plazos · proyectos en riesgo</div>
      <div class="card-b">${proyAlertaHTML}</div>
    </div>
    <div class="dash-grid">
      <div class="card">
        <div class="card-h">Alertas de atraso</div>
        <div class="card-b">${alertasHTML}</div>
      </div>
      <div class="card">
        <div class="card-h">Carga laboral por persona</div>
        <div class="card-b">${cargaHTML}</div>
      </div>
      <div class="card">
        <div class="card-h">Objetivos según planificación</div>
        <div class="card-b">${objHTML}</div>
      </div>
      <div class="card">
        <div class="card-h">Avance por proyecto</div>
        <div class="card-b">${filas||'<p class="empty">Sin datos</p>'}</div>
      </div>
    </div>`;
}

// ============================================================
// DESVIOS & NC D&D
// Registros de desvios y no conformidades que le competen al sector.
// Estados: pendiente / en_tratamiento / cerrado. Indicadores graficos.
// Datos: carga manual y/o webhook desde SharePoint (Power Automate).
// ============================================================
let DESVIOS = [];

async function cargarDesvios() {
  const { data } = await sb.from("desvios_nc").select("*").order("creado_en",{ascending:false});
  DESVIOS = data || [];
}

const EST_NC_LBL = { pendiente:"Pendiente", en_tratamiento:"En tratamiento", cerrado:"Cerrado" };

async function cambiarEstadoDesvio(id, estado){
  if (!esCoord()) { toast("Solo la coordinacion cambia el estado"); return; }
  await sb.from("desvios_nc").update({ estado, actualizado_en:new Date().toISOString() }).eq("id", id);
  await cargarDesvios(); render();
}

function renderDesvios(){
  const tot = DESVIOS.length;
  const porEstado = { pendiente:0, en_tratamiento:0, cerrado:0 };
  const porTipo = { desvio:0, nc:0 };
  DESVIOS.forEach(d=>{ porEstado[d.estado]=(porEstado[d.estado]||0)+1; porTipo[d.tipo]=(porTipo[d.tipo]||0)+1; });

  // tarjetas
  const cards = [
    ["Total registros", tot, "var(--olive-deep)"],
    ["Pendientes", porEstado.pendiente, porEstado.pendiente? "var(--red)":"var(--green)"],
    ["En tratamiento", porEstado.en_tratamiento, "var(--amber)"],
    ["Cerrados", porEstado.cerrado, "var(--green)"],
  ].map(([k,v,c])=>`<div class="stat"><div class="k">${k}</div><div class="v" style="color:${c}">${v}</div></div>`).join("");

  // grafico de torta (estados) via conic-gradient
  const segs = [
    ["pendiente", porEstado.pendiente, "var(--red)"],
    ["en_tratamiento", porEstado.en_tratamiento, "var(--amber)"],
    ["cerrado", porEstado.cerrado, "var(--green)"],
  ];
  let acc = 0; const stops = [];
  segs.forEach(([k,n,c])=>{ const frac = tot? n/tot*100:0; stops.push(`${c} ${acc}% ${acc+frac}%`); acc+=frac; });
  const torta = tot ? `
    <div class="pie-wrap">
      <div class="pie" style="background:conic-gradient(${stops.join(",")})"></div>
      <div class="pie-leg">
        ${segs.map(([k,n,c])=>`<div class="pl-row"><span class="pl-dot" style="background:${c}"></span>${EST_NC_LBL[k]} <b>${n}</b></div>`).join("")}
      </div>
    </div>` : `<p class="empty">Sin registros.</p>`;

  // barras por tipo
  const maxTipo = Math.max(1, porTipo.desvio, porTipo.nc);
  const barras = `
    <div class="cl-row"><span class="cl-name">Desvios</span><div class="cl-bar"><div class="cl-fill" style="width:${porTipo.desvio/maxTipo*100}%"></div></div><span class="cl-num">${porTipo.desvio}</span></div>
    <div class="cl-row"><span class="cl-name">No conformidades</span><div class="cl-bar"><div class="cl-fill" style="width:${porTipo.nc/maxTipo*100}%;background:var(--amber)"></div></div><span class="cl-num">${porTipo.nc}</span></div>`;

  // tabla de registros
  const filas = DESVIOS.map(d=>{
    const estSel = esCoord()
      ? `<select class="nc-estado inp" data-id="${d.id}">${Object.keys(EST_NC_LBL).map(k=>`<option value="${k}" ${d.estado===k?'selected':''}>${EST_NC_LBL[k]}</option>`).join("")}</select>`
      : `<span class="badge badge-${d.estado==='cerrado'?'terminado':(d.estado==='pendiente'?'sin_iniciar':'pausado')}">${EST_NC_LBL[d.estado]}</span>`;
    return `<div class="nc-row">
      <span class="nc-tipo ${d.tipo}">${d.tipo==='nc'?'NC':'Desvío'}</span>
      <div class="nc-main"><b>${d.titulo}</b>${d.descripcion?`<div class="help">${d.descripcion}</div>`:''}<div class="help">${d.sector||''} ${d.fecha_registro?'· '+d.fecha_registro:''}</div></div>
      ${estSel}
    </div>`;
  }).join("") || `<p class="empty">Todavía no hay desvíos ni no conformidades cargados.</p>`;

  const btnNuevo = esCoord()
    ? `<button class="btn sm" id="nc-nuevo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Cargar registro</button>` : "";

  return `
    <div class="stats">${cards}</div>
    <div class="dash-grid">
      <div class="card"><div class="card-h">Distribución por estado</div><div class="card-b">${torta}</div></div>
      <div class="card"><div class="card-h">Por tipo</div><div class="card-b">${barras}</div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-h" style="display:flex;justify-content:space-between;align-items:center">Registros ${btnNuevo}</div>
      <div class="card-b">${filas}</div>
    </div>
    <p class="help" style="margin-top:12px">Los registros llegan de los formularios FC-05.15 (desvíos) y FG-09.01 (no conformidades) de SharePoint. La integración automática se conecta vía Power Automate; por ahora podés cargarlos manualmente.</p>`;
}


let INVENTARIO = null;        // inventario.json cargado en memoria
let AUDITORIAS = [];          // auditorías guardadas

async function cargarAuditorias() {
  const { data } = await sb.from("auditorias")
    .select("id,nombre_modelo,resumen_rubros,informe_texto,estado,creado_en")
    .order("creado_en", { ascending:false }).limit(20);
  AUDITORIAS = data || [];
}

function fmtNum(n){ return (n ?? 0).toLocaleString("es-AR"); }

function renderAudit() {
  const editable = puedeEditar();

  // --- bloque de carga ---
  const dropHTML = editable ? `
    <div class="drop" id="aud-drop">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>
      <p><b>Arrastrá el inventario.json</b> o hacé clic para elegirlo</p>
      <p class="help">Liviano (~100-200 KB). Lo genera el parser en tu compu. El DXF pesado no se sube.</p>
    </div>
    <input type="file" id="aud-file" accept="application/json,.json" style="display:none">
  ` : `<p class="help">Tu rol es de solo lectura. Podés ver las auditorías guardadas abajo.</p>`;

  // --- preview del cómputo (si hay inventario cargado) ---
  let previewHTML = "";
  if (INVENTARIO) {
    const resumen = INVENTARIO.resumen_por_rubro || {};
    const sinClas = INVENTARIO.piezas_sin_clasificar || [];
    const filas = Object.entries(resumen).map(([r,d])=>`
      <div class="dash-row">
        <span class="dr-n">${r}</span>
        <span class="help" style="flex:1">${fmtNum(d.tipos)} tipos · ${fmtNum(d.piezas)} piezas</span>
        <span class="dr-p">${fmtNum(d.peso_kg)} kg</span>
      </div>`).join("") || `<p class="empty">Sin piezas computadas. Cargá el diccionario en el parser.</p>`;

    const warn = sinClas.length ? `
      <div class="hall hall-a" style="margin-top:10px"><b>${fmtNum(sinClas.length)} tipos sin clasificar</b><span>Cargalos en el diccionario del parser para mejorar el cómputo.</span></div>` : "";

    previewHTML = `
      <div class="card" style="margin-top:16px">
        <div class="card-h">Cómputo · ${INVENTARIO.meta?.archivo_origen || "modelo"}</div>
        <div class="card-b">
          ${filas}
          ${warn}
          <div class="aud-proy-wrap">
            <label class="aud-proy-lbl">Asociar a proyecto (para tildar Validación IA si está limpia):</label>
            <select id="aud-proy" class="inp">
              <option value="">(no asociar)</option>
              ${PROYECTOS.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join("")}
            </select>
          </div>
          <button class="btn" id="aud-run" style="margin-top:14px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
            Auditar con IA y guardar
          </button>
          <span class="help" id="aud-status" style="margin-left:10px"></span>
          <div id="aud-result"></div>
        </div>
      </div>`;
  }

  // --- lista de auditorías guardadas ---
  const listaHTML = AUDITORIAS.length ? AUDITORIAS.map(a=>{
    const fecha = new Date(a.creado_en).toLocaleString("es-AR");
    const rubros = a.resumen_rubros ? Object.keys(a.resumen_rubros).join(" · ") : "—";
    return `<div class="dash-row" style="align-items:flex-start">
      <div style="flex:1">
        <b>${a.nombre_modelo||"modelo"}</b> <span class="badge badge-${a.estado==='completada'?'terminado':'sin_iniciar'}">${a.estado}</span>
        <div class="help">${rubros}</div>
        ${a.informe_texto?`<div class="help" style="margin-top:3px">${a.informe_texto}</div>`:""}
      </div>
      <span class="help">${fecha}</span>
    </div>`;
  }).join("") : `<p class="empty">Todavía no hay auditorías.</p>`;

  return `
    <div class="card">
      <div class="card-h">Auditoría asistida por IA</div>
      <div class="card-b">
        <p class="help">Subí el <b>inventario.json</b> generado por el parser para computar y auditar el modelo.</p>
        ${dropHTML}
      </div>
    </div>
    ${previewHTML}
    <div class="card" style="margin-top:16px">
      <div class="card-h">Auditorías guardadas</div>
      <div class="card-b">${listaHTML}</div>
    </div>`;
}

function leerInventario(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const inv = JSON.parse(reader.result);
      if (!inv.piezas_computadas) throw new Error("No parece un inventario válido (falta piezas_computadas).");
      INVENTARIO = inv;
      render();
    } catch(e){ toast("No se pudo leer: " + e.message); }
  };
  reader.readAsText(file);
}

async function correrAuditoria() {
  const status = $("#aud-status");
  const btn = $("#aud-run");
  const result = $("#aud-result");
  const proySel = $("#aud-proy");
  const proyId = proySel ? (proySel.value || null) : null;
  if (btn) btn.disabled = true;
  if (status) status.textContent = "Consultando a la IA…";
  try {
    // 1) Edge Function (key protegida del lado servidor)
    const { data, error } = await sb.functions.invoke("auditoria-ia", {
      body: { inventario: INVENTARIO }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const h = data.hallazgos || {};

    // 2) determinar si esta LIMPIA (sin inconsistencias ni interferencias)
    const limpia = auditoriaLimpia(h);

    // 3) guardar en Supabase (asociada al proyecto si se eligio)
    if (status) status.textContent = "Guardando…";
    const { error:insErr } = await sb.from("auditorias").insert({
      proyecto_id: proyId,
      nombre_modelo: INVENTARIO.meta?.archivo_origen || null,
      inventario: INVENTARIO,
      resumen_rubros: INVENTARIO.resumen_por_rubro || null,
      hallazgos: h,
      informe_texto: data.informe_texto || h.resumen || null,
      estado: "completada"
    });
    if (insErr) throw insErr;

    // 4) AUTO-TILDADO de "Validacion por asistente IA" SOLO si esta limpia
    let msgIA = "";
    if (proyId && limpia) {
      const { data:tIA } = await sb.from("tareas").select("id,nombre")
        .eq("proyecto_id", proyId).eq("auto_ia", true).eq("eliminada", false);
      if (tIA && tIA.length) {
        await sb.from("tareas").update({ cumplido:true, cumplido_en:new Date().toISOString() })
          .in("id", tIA.map(x=>x.id));
        msgIA = " · Validacion IA tildada automaticamente.";
        await cargarProyectos();
        if (activo && activo.id===proyId){ await cargarTareas(proyId); activo=PROYECTOS.find(p=>p.id===proyId); }
      }
    } else if (proyId && !limpia) {
      msgIA = " · Hay hallazgos: la Validacion IA NO se tilda.";
    }

    if (status) status.textContent = "✓ Completada y guardada." + msgIA;
    if (result) result.innerHTML = renderHallazgos(h);
    await cargarAuditorias();
  } catch(e){
    if (status) status.textContent = "";
    if (result) result.innerHTML = `<div class="hall hall-r"><b>Error</b><span>${e.message||e}</span></div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Una auditoria esta "limpia" si no hay hallazgos de severidad alta/media
// (inconsistencias) ni interferencias reportadas. Ajustable segun el esquema
// que devuelva la Edge Function.
function auditoriaLimpia(h){
  if (!h) return false;
  const hall = h.hallazgos || [];
  const hayInconsistencias = hall.some(x => ["alta","media"].includes((x.severidad||"").toLowerCase()));
  const hayInterferencias = (h.interferencias && h.interferencias.length > 0)
    || hall.some(x => (x.tipo||"").toLowerCase().includes("interferencia"));
  return !hayInconsistencias && !hayInterferencias;
}

function renderHallazgos(h) {
  const cls = { alta:"hall-r", media:"hall-a", baja:"hall-g" };
  const items = (h.hallazgos||[]).map(x=>`
    <div class="hall ${cls[x.severidad]||'hall-a'}">
      <b>${(x.severidad||'—').toUpperCase()} · ${x.rubro||'General'}</b>
      <span>${x.detalle||''}</span>
      ${x.sugerencia?`<span style="opacity:.85">↳ ${x.sugerencia}</span>`:""}
    </div>`).join("") || `<p class="help">Sin hallazgos relevantes.</p>`;
  return `
    <div style="margin-top:14px">
      ${h.resumen?`<div class="motivo-info" style="margin-bottom:10px">${h.resumen}${h.completitud_estimada?` <b>· Completitud estimada: ${h.completitud_estimada}</b>`:""}</div>`:""}
      ${items}
    </div>`;
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
  document.querySelectorAll(".navbtn").forEach(b=>b.onclick=async()=>{
    if(b.dataset.tab==="proj") activo=null;
    tab=b.dataset.tab;
    if(tab==="dash"){ await cargarProyectos(); await cargarTareasTodas(); }
    if(tab==="desvios"){ await cargarDesvios(); }
    if(tab==="audit"){ await cargarAuditorias(); }
    render();
  });
  $("#logout") && ($("#logout").onclick = logout);

  const nuevo = $("#nuevo");
  if (nuevo) nuevo.onclick = ()=>{
    renderFichaInputs("ficha-body", {});
    $("#modal-nuevo").classList.add("open");
  };

  document.querySelectorAll(".proj-card").forEach(c=>c.onclick=async()=>{
    activo = PROYECTOS.find(p=>p.id===c.dataset.id);
    await cargarTareas(activo.id); render();
  });
  const volver = $("#volver");
  if (volver) volver.onclick = async()=>{ activo=null; await cargarProyectos(); render(); };

  // clic en cualquier fila con data-goto (dashboard) -> abre la hoja de ruta del proyecto
  document.querySelectorAll("[data-goto]").forEach(el=>el.onclick=async()=>{
    const p = PROYECTOS.find(x=>x.id===el.dataset.goto);
    if (!p) return;
    activo = p; tab = "proj";
    await cargarTareas(activo.id); render();
  });

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
    intentarGuardarFecha(t, "inicio", inp.value);
  });
  document.querySelectorAll(".f-fin").forEach(inp=>inp.onchange=()=>{
    const t=TAREAS.find(x=>x.id===inp.dataset.id);
    intentarGuardarFecha(t, "fin", inp.value);
  });
  // asignacion de roles de proyecto (cascada)
  document.querySelectorAll(".rol-sel").forEach(s=>s.onchange=()=> asignarRol(s.dataset.rol, s.value));
  // analisis general: rubros a redibujar -> categoria
  const agRubros = document.querySelectorAll(".ag-rubro");
  agRubros.forEach(c=>c.onchange=()=>{
    const sel = Array.from(document.querySelectorAll(".ag-rubro")).filter(x=>x.checked).map(x=>x.value);
    guardarRubrosRedibujo(sel);
  });
  const agReplan = $("#ag-replan");
  if (agReplan) agReplan.onclick = ()=> aplicarPlanificacion();
  // modo etapa 3
  document.querySelectorAll(".m3-radio").forEach(r=>r.onchange=()=>{ if(r.checked) guardarModoEtapa3(r.value); });
  // editar / eliminar proyecto
  const edP = $("#editar-proy");
  if (edP) edP.onclick = abrirEditarProyecto;
  const elP = $("#eliminar-proy");
  if (elP) elP.onclick = eliminarProyecto;
  // estado de desvios/NC
  document.querySelectorAll(".nc-estado").forEach(s=>s.onchange=()=> cambiarEstadoDesvio(s.dataset.id, s.value));
  const ncNuevo = $("#nc-nuevo");
  if (ncNuevo) ncNuevo.onclick = ()=> $("#modal-nc").classList.add("open");
  const estadoSel = $("#estado-sel");
  if (estadoSel) estadoSel.onchange = async()=>{
    await sb.from("proyectos").update({ estado: estadoSel.value }).eq("id", activo.id);
    await cargarProyectos(); activo = PROYECTOS.find(p=>p.id===activo.id); render();
  };
  // --- Auditoría IA ---
  const audDrop = $("#aud-drop");
  const audFile = $("#aud-file");
  if (audDrop && audFile) {
    audDrop.onclick = ()=> audFile.click();
    audDrop.ondragover = (e)=>{ e.preventDefault(); audDrop.style.borderColor="var(--olive)"; };
    audDrop.ondragleave = ()=>{ audDrop.style.borderColor=""; };
    audDrop.ondrop = (e)=>{ e.preventDefault(); audDrop.style.borderColor="";
      if (e.dataTransfer.files[0]) leerInventario(e.dataTransfer.files[0]); };
    audFile.onchange = ()=>{ if (audFile.files[0]) leerInventario(audFile.files[0]); };
  }
  const audRun = $("#aud-run");
  if (audRun) audRun.onclick = correrAuditoria;
}

// ---------- FICHA DE INPUTS (campos del Excel) ----------
// Tipos soportados:
//   (default)         texto libre
//   "ubicacion"       nombre del lugar + link de Google Maps (objeto {nombre, maps})
//   "artefacto"       marca + modelo, ambos requeridos (objeto {marca, modelo})
//   "lista_artefactos" N items, cada uno marca+modelo (array de {marca, modelo})
const esc = (s) => (s==null?'':String(s)).replace(/"/g,'&quot;').replace(/</g,'&lt;');

function renderFichaInputs(containerId, valores) {
  const cont = document.getElementById(containerId);
  if (!cont || !window.CAMPOS_INPUT) return;
  const v = valores || {};
  cont.innerHTML = window.CAMPOS_INPUT.map(sec=>`
    <div class="fi-sec">${sec.seccion}</div>
    ${sec.campos.map(c=>renderFichaCampo(c, v[c.key])).join("")}
  `).join("");
  bindFichaCampos(cont);
}

function renderFichaCampo(c, val) {
  const tipo = c.tipo || "texto";
  const hint = c.hint ? `<div class="fi-hint">${c.hint}</div>` : "";

  if (tipo === "ubicacion") {
    const o = (val && typeof val === "object") ? val : { nombre: typeof val === "string" ? val : "", maps: "" };
    return `<div class="fi-block" data-key="${c.key}" data-tipo="ubicacion">
      <span class="fi-lbl-full">${c.label}</span>
      <div class="fi-sub">
        <input type="text" class="fi-input fi-sub-in" data-sub="nombre" value="${esc(o.nombre)}" placeholder="Nombre del lugar / dirección">
        <input type="url" class="fi-input fi-sub-in" data-sub="maps" value="${esc(o.maps)}" placeholder="Link de Google Maps (https://…)">
      </div>${hint}
    </div>`;
  }

  if (tipo === "artefacto") {
    const o = (val && typeof val === "object") ? val : { marca: "", modelo: "" };
    return `<div class="fi-block" data-key="${c.key}" data-tipo="artefacto">
      <span class="fi-lbl-full">${c.label} <span class="fi-req">marca y modelo</span></span>
      <div class="fi-sub fi-sub-2">
        <input type="text" class="fi-input fi-sub-in" data-sub="marca" value="${esc(o.marca)}" placeholder="Marca">
        <input type="text" class="fi-input fi-sub-in" data-sub="modelo" value="${esc(o.modelo)}" placeholder="Modelo">
      </div>${hint}
    </div>`;
  }

  if (tipo === "lista_artefactos") {
    const arr = Array.isArray(val) ? val : [];
    const items = (arr.length ? arr : [{ marca:"", modelo:"" }]);
    return `<div class="fi-block" data-key="${c.key}" data-tipo="lista_artefactos">
      <span class="fi-lbl-full">${c.label}</span>
      <div class="fi-lista">
        ${items.map((it,i)=>fichaArtefactoCaja(it,i)).join("")}
      </div>
      <button type="button" class="fi-add" data-add="${c.key}">+ Agregar artefacto</button>
      ${hint}
    </div>`;
  }

  if (c.opciones && c.opciones.length) {
    return `<div class="fi-row"><span class="fi-lbl">${c.label}</span>
      <select class="fi-input" data-key="${c.key}">
        <option value="">(sin completar)</option>
        ${c.opciones.map(o=>`<option ${val===o?'selected':''}>${o}</option>`).join("")}
      </select></div>`;
  }

  return `<div class="fi-row"><span class="fi-lbl">${c.label}</span>
    <input type="text" class="fi-input" data-key="${c.key}" value="${esc(val)}" placeholder="—"></div>`;
}

function fichaArtefactoCaja(it, i) {
  it = it || { marca:"", modelo:"" };
  return `<div class="fi-art-caja">
    <span class="fi-art-n">#${i+1}</span>
    <input type="text" class="fi-input fi-art-in" data-sub="marca" value="${esc(it.marca)}" placeholder="Marca">
    <input type="text" class="fi-input fi-art-in" data-sub="modelo" value="${esc(it.modelo)}" placeholder="Modelo">
    <button type="button" class="fi-art-del" title="Quitar">×</button>
  </div>`;
}

// engancha los botones de agregar/quitar de las listas de artefactos
function bindFichaCampos(cont) {
  cont.querySelectorAll(".fi-add").forEach(b=>b.onclick=()=>{
    const block = b.closest(".fi-block");
    const lista = block.querySelector(".fi-lista");
    const i = lista.querySelectorAll(".fi-art-caja").length;
    const div = document.createElement("div");
    div.innerHTML = fichaArtefactoCaja({marca:"",modelo:""}, i);
    const caja = div.firstElementChild;
    lista.appendChild(caja);
    caja.querySelector(".fi-art-del").onclick = ()=> quitarArtefacto(caja);
  });
  cont.querySelectorAll(".fi-art-del").forEach(b=>b.onclick=()=> quitarArtefacto(b.closest(".fi-art-caja")));
}
function quitarArtefacto(caja){
  const lista = caja.parentElement;
  if (lista.querySelectorAll(".fi-art-caja").length <= 1) {
    // dejar al menos una caja, solo limpiarla
    caja.querySelectorAll("input").forEach(i=>i.value="");
    return;
  }
  caja.remove();
}

function leerFichaInputs(containerId) {
  const cont = document.getElementById(containerId);
  if (!cont) return {};
  const out = {};
  // campos simples (texto / select)
  cont.querySelectorAll(".fi-row .fi-input").forEach(el=>{
    const val = (el.value||"").trim();
    if (val) out[el.dataset.key] = val;
  });
  // bloques compuestos
  cont.querySelectorAll(".fi-block").forEach(block=>{
    const key = block.dataset.key, tipo = block.dataset.tipo;
    if (tipo === "ubicacion" || tipo === "artefacto") {
      const o = {};
      block.querySelectorAll(".fi-sub-in").forEach(i=>{ const v=(i.value||"").trim(); if(v) o[i.dataset.sub]=v; });
      if (Object.keys(o).length) out[key] = o;
    } else if (tipo === "lista_artefactos") {
      const arr = [];
      block.querySelectorAll(".fi-art-caja").forEach(caja=>{
        const o = {};
        caja.querySelectorAll(".fi-art-in").forEach(i=>{ const v=(i.value||"").trim(); if(v) o[i.dataset.sub]=v; });
        if (Object.keys(o).length) arr.push(o);
      });
      if (arr.length) out[key] = arr;
    }
  });
  return out;
}

// valida que los artefactos sanitarios tengan marca Y modelo (si se cargaron).
// Devuelve [] si todo ok, o un array de labels incompletos.
function validarFichaInputs(containerId) {
  const cont = document.getElementById(containerId);
  const faltan = [];
  if (!cont || !window.CAMPOS_INPUT) return faltan;
  const labelDe = {};
  window.CAMPOS_INPUT.forEach(s=>s.campos.forEach(c=>labelDe[c.key]=c.label));
  cont.querySelectorAll('.fi-block[data-tipo="artefacto"]').forEach(block=>{
    const marca = block.querySelector('[data-sub="marca"]').value.trim();
    const modelo = block.querySelector('[data-sub="modelo"]').value.trim();
    if ((marca && !modelo) || (!marca && modelo)) faltan.push(labelDe[block.dataset.key] || block.dataset.key);
  });
  return faltan;
}

// formatea un valor de ficha (de cualquier tipo) para mostrarlo en el detalle
function fmtFichaValor(val) {
  if (val == null) return "";
  if (typeof val === "string") return esc(val);
  if (Array.isArray(val)) {
    return val.map(o=>`${esc(o.marca||'')}${o.modelo?` · ${esc(o.modelo)}`:''}`).filter(Boolean).join("<br>");
  }
  if (typeof val === "object") {
    if (val.maps || val.nombre) { // ubicacion
      const n = esc(val.nombre||'');
      return val.maps ? `${n} <a href="${esc(val.maps)}" target="_blank" rel="noopener" class="fi-maps">ver en Maps ↗</a>` : n;
    }
    if (val.marca || val.modelo) return `${esc(val.marca||'')}${val.modelo?` · ${esc(val.modelo)}`:''}`;
  }
  return esc(JSON.stringify(val));
}
function bindFichaToggle(toggleId, bodyId) {
  const tgl = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);
  if (!tgl || !body) return;
  tgl.onclick = ()=>{
    const open = body.style.display !== "none";
    body.style.display = open ? "none" : "block";
    tgl.querySelector(".fi-chev")?.classList.toggle("open", !open);
  };
}

// ---------- MODAL NUEVO PROYECTO ----------
function bindModales() {
  $("#nuevo-guardar").onclick = async()=>{
    const nro = $("#n-if").value.trim(), cli = $("#n-cliente").value.trim(), nom = $("#n-nombre").value.trim();
    if (!nro||!cli||!nom){ $("#nuevo-err").textContent="Nro. IF, cliente y nombre son obligatorios."; return; }
    $("#nuevo-guardar").disabled = true; $("#nuevo-err").textContent = "Creando…";
    const faltan = validarFichaInputs("ficha-body");
    if (faltan.length) {
      $("#nuevo-err").textContent = "Completá marca Y modelo en: " + faltan.join(", ");
      $("#nuevo-guardar").disabled = false; return;
    }
    try {
      await crearProyecto({ nro_if:nro, cliente:cli, nombre:nom,
        ficha: $("#n-ficha").value.trim()||null, plan_inicio: $("#n-inicio").value||null,
        responsable: $("#n-resp").value||null, estado: $("#n-estado").value,
        inputs: leerFichaInputs("ficha-body") });
      $("#modal-nuevo").classList.remove("open");
      ["n-if","n-cliente","n-nombre","n-ficha","n-plazo","n-inicio"].forEach(id=>$("#"+id).value="");
      tab="proj"; activo=null; render();
    } catch(e){ $("#nuevo-err").textContent = e.message || "Error al crear."; }
    $("#nuevo-guardar").disabled = false;
  };
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>{
    $("#"+b.dataset.close).classList.remove("open");
  });
  $("#motivo-guardar").onclick = confirmarMotivo;
  $("#motivo-cancelar").onclick = ()=>{ $("#modal-motivo").classList.remove("open"); render(); };
  // editar proyecto
  const eg = $("#editar-guardar"); if (eg) eg.onclick = guardarEdicionProyecto;
  // desvio de fecha (planificacion)
  const dfg = $("#df-guardar"); if (dfg) dfg.onclick = confirmarDesvioFecha;
  const dfc = $("#df-cancelar"); if (dfc) dfc.onclick = ()=>{ $("#modal-fecha").classList.remove("open"); render(); };
  // nuevo desvio/NC
  const ncg = $("#nc-guardar"); if (ncg) ncg.onclick = crearDesvio;
  // toggle de la ficha de inputs
  bindFichaToggle("ficha-toggle", "ficha-body");
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
