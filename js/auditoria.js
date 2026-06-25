// ============================================================================
//  auditoria.js  ·  Seccion "Auditoria IA" (modulo autocontenido)
//
//  Integracion en app.js:
//    - incluir <script src="js/auditoria.js"></script> en index.html
//      DESPUES de supabase-js y config.js, y de app.js.
//    - cuando se hace click en la pestaña data-tab="audit", llamar:
//          AuditoriaIA.render(document.getElementById('screen'));
//      (ver nota de integracion al final del archivo)
//
//  Depende de:
//    - window.sb         -> cliente Supabase ya inicializado en config.js
//    - window.USER_ROL   -> rol del usuario ('coordinador'|'diseno'|'lectura')
//                           Si no existe, el modulo lo resuelve solo.
// ============================================================================

const AuditoriaIA = (() => {
  const FUNCTION_NAME = "auditoria-ia";
  let _inventario = null; // inventario.json cargado en memoria

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  async function rolUsuario() {
    if (window.USER_ROL) return window.USER_ROL;
    try {
      const { data: u } = await sb.auth.getUser();
      if (!u?.user) return "lectura";
      const { data } = await sb
        .from("perfiles")
        .select("rol")
        .eq("id", u.user.id)
        .single();
      return data?.rol || "lectura";
    } catch {
      return "lectura";
    }
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function fmt(n) {
    return (n ?? 0).toLocaleString("es-AR");
  }

  // --------------------------------------------------------------------------
  // Render principal
  // --------------------------------------------------------------------------
  async function render(container) {
    const rol = await rolUsuario();
    const puedeEditar = rol === "coordinador" || rol === "diseno";

    container.innerHTML = `
      <div class="aud-wrap">
        <div class="aud-head">
          <h2>Auditoría IA</h2>
          <p class="muted">Subí el <code>inventario.json</code> generado por el parser para computar y auditar el modelo.</p>
        </div>

        ${puedeEditar ? `
        <div class="aud-card aud-drop" id="aud-drop">
          <input type="file" id="aud-file" accept="application/json,.json" hidden>
          <div class="aud-drop-inner">
            <i class="ti ti-upload"></i>
            <p><strong>Arrastrá el inventario.json</strong> o hacé click para elegirlo</p>
            <p class="muted sm">Liviano (~100-200 KB). El DXF pesado no se sube.</p>
          </div>
        </div>` : `
        <div class="aud-card"><p class="muted">Tu rol es de solo lectura. Podés ver auditorías existentes abajo.</p></div>`}

        <div id="aud-preview"></div>

        <div class="aud-card">
          <div class="aud-card-head"><h3>Auditorías guardadas</h3></div>
          <div id="aud-list"><p class="muted">Cargando…</p></div>
        </div>
      </div>
    `;

    if (puedeEditar) wireUpload(container);
    cargarLista(container);
  }

  // --------------------------------------------------------------------------
  // Upload + parseo del inventario
  // --------------------------------------------------------------------------
  function wireUpload(container) {
    const drop = container.querySelector("#aud-drop");
    const file = container.querySelector("#aud-file");
    if (!drop) return;

    drop.addEventListener("click", () => file.click());
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault(); drop.classList.remove("over");
      if (e.dataTransfer.files[0]) leerArchivo(e.dataTransfer.files[0], container);
    });
    file.addEventListener("change", () => {
      if (file.files[0]) leerArchivo(file.files[0], container);
    });
  }

  function leerArchivo(f, container) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        _inventario = JSON.parse(reader.result);
        if (!_inventario.piezas_computadas) {
          throw new Error("El archivo no parece un inventario válido (falta piezas_computadas).");
        }
        renderPreview(container);
      } catch (err) {
        alert("No se pudo leer el inventario: " + err.message);
      }
    };
    reader.readAsText(f);
  }

  // --------------------------------------------------------------------------
  // Preview: computo + boton auditar
  // --------------------------------------------------------------------------
  function renderPreview(container) {
    const inv = _inventario;
    const prev = container.querySelector("#aud-preview");
    const resumen = inv.resumen_por_rubro || {};
    const piezas = inv.piezas_computadas || [];
    const sinClas = inv.piezas_sin_clasificar || [];

    const filasResumen = Object.entries(resumen).map(([r, d]) => `
      <tr><td>${esc(r)}</td><td>${fmt(d.tipos)}</td><td>${fmt(d.piezas)}</td><td>${fmt(d.peso_kg)} kg</td></tr>
    `).join("") || `<tr><td colspan="4" class="muted">Sin piezas computadas todavía.</td></tr>`;

    const filasPiezas = piezas.slice(0, 50).map((p) => `
      <tr>
        <td>${esc(p.bloque)}</td><td>${esc(p.rubro)}</td>
        <td>${esc(p.material || "")}</td><td>${fmt(p.cantidad)} ${esc(p.unidad || "")}</td>
        <td>${p.peso_total_kg ? fmt(p.peso_total_kg) + " kg" : "—"}</td>
      </tr>
    `).join("");

    prev.innerHTML = `
      <div class="aud-card">
        <div class="aud-card-head">
          <h3>Cómputo · ${esc(inv.meta?.archivo_origen || "modelo")}</h3>
          <span class="muted sm">${fmt(inv.meta?.inserts_modelspace)} inserts · ${fmt(sinClas.length)} sin clasificar</span>
        </div>

        <table class="aud-tbl">
          <thead><tr><th>Rubro</th><th>Tipos</th><th>Piezas</th><th>Peso</th></tr></thead>
          <tbody>${filasResumen}</tbody>
        </table>

        ${piezas.length ? `
        <details class="aud-det">
          <summary>Ver piezas computadas (${fmt(piezas.length)})</summary>
          <table class="aud-tbl">
            <thead><tr><th>Bloque</th><th>Rubro</th><th>Material</th><th>Cantidad</th><th>Peso</th></tr></thead>
            <tbody>${filasPiezas}</tbody>
          </table>
        </details>` : ""}

        ${sinClas.length ? `
        <p class="aud-warn"><i class="ti ti-alert-triangle"></i> ${fmt(sinClas.length)} tipos sin clasificar. Cargalos en el diccionario para mejorar el cómputo.</p>` : ""}

        <div class="aud-actions">
          <button class="btn-primary" id="aud-run"><i class="ti ti-robot"></i> Auditar con IA y guardar</button>
          <span id="aud-status" class="muted sm"></span>
        </div>
      </div>

      <div id="aud-result"></div>
    `;

    prev.querySelector("#aud-run").addEventListener("click", () => correrAuditoria(container));
  }

  // --------------------------------------------------------------------------
  // Llamada a la Edge Function + guardado en Supabase
  // --------------------------------------------------------------------------
  async function correrAuditoria(container) {
    const status = container.querySelector("#aud-status");
    const btn = container.querySelector("#aud-run");
    const result = container.querySelector("#aud-result");
    btn.disabled = true;
    status.textContent = "Consultando a la IA…";

    try {
      // 1. Edge Function (key protegida del lado servidor)
      const { data, error } = await sb.functions.invoke(FUNCTION_NAME, {
        body: { inventario: _inventario },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const hallazgos = data.hallazgos || {};
      status.textContent = "Guardando…";

      // 2. Guardar en Supabase
      const { error: insErr } = await sb.from("auditorias").insert({
        nombre_modelo: _inventario.meta?.archivo_origen || null,
        inventario: _inventario,
        resumen_rubros: _inventario.resumen_por_rubro || null,
        hallazgos: hallazgos,
        informe_texto: data.informe_texto || hallazgos.resumen || null,
        estado: "completada",
      });
      if (insErr) throw insErr;

      status.textContent = "✓ Auditoría completada y guardada.";
      renderResultado(result, hallazgos);
      cargarLista(container);
    } catch (err) {
      status.textContent = "";
      result.innerHTML = `<div class="aud-card aud-error"><strong>Error:</strong> ${esc(err.message || err)}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  // --------------------------------------------------------------------------
  // Render del resultado de la IA
  // --------------------------------------------------------------------------
  function renderResultado(container, h) {
    const sevColor = { alta: "#b3402a", media: "#c08a2d", baja: "#5a7d4f" };
    const items = (h.hallazgos || []).map((x) => `
      <div class="aud-finding" style="border-left-color:${sevColor[x.severidad] || "#999"}">
        <div class="aud-finding-top">
          <span class="aud-sev" style="background:${sevColor[x.severidad] || "#999"}">${esc(x.severidad || "—")}</span>
          <strong>${esc(x.rubro || "General")}</strong>
        </div>
        <p>${esc(x.detalle || "")}</p>
        ${x.sugerencia ? `<p class="muted sm"><i class="ti ti-bulb"></i> ${esc(x.sugerencia)}</p>` : ""}
      </div>
    `).join("") || `<p class="muted">Sin hallazgos relevantes.</p>`;

    container.innerHTML = `
      <div class="aud-card">
        <div class="aud-card-head"><h3>Resultado de la auditoría</h3>
          ${h.completitud_estimada ? `<span class="muted sm">Completitud estimada: ${esc(h.completitud_estimada)}</span>` : ""}
        </div>
        ${h.resumen ? `<p class="aud-resumen">${esc(h.resumen)}</p>` : ""}
        <div class="aud-findings">${items}</div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // Lista de auditorias guardadas
  // --------------------------------------------------------------------------
  async function cargarLista(container) {
    const list = container.querySelector("#aud-list");
    if (!list) return;
    try {
      const { data, error } = await sb
        .from("auditorias")
        .select("id,nombre_modelo,resumen_rubros,informe_texto,estado,creado_en")
        .order("creado_en", { ascending: false })
        .limit(20);
      if (error) throw error;

      if (!data?.length) {
        list.innerHTML = `<p class="muted">Todavía no hay auditorías.</p>`;
        return;
      }

      list.innerHTML = data.map((a) => {
        const fecha = new Date(a.creado_en).toLocaleString("es-AR");
        const rubros = a.resumen_rubros
          ? Object.keys(a.resumen_rubros).join(" · ")
          : "—";
        return `
          <div class="aud-row">
            <div>
              <strong>${esc(a.nombre_modelo || "modelo")}</strong>
              <span class="aud-badge aud-${esc(a.estado)}">${esc(a.estado)}</span>
              <p class="muted sm">${esc(rubros)}</p>
              ${a.informe_texto ? `<p class="sm">${esc(a.informe_texto)}</p>` : ""}
            </div>
            <span class="muted sm">${esc(fecha)}</span>
          </div>`;
      }).join("");
    } catch (err) {
      list.innerHTML = `<p class="aud-warn">No se pudo cargar la lista: ${esc(err.message || err)}</p>`;
    }
  }

  return { render };
})();

window.AuditoriaIA = AuditoriaIA;

// ============================================================================
//  NOTA DE INTEGRACION en app.js
//  ---------------------------------------------------------------------------
//  Buscá donde manejás el cambio de pestañas (el listener de .navbtn o el
//  switch por data-tab) y agregá el caso 'audit':
//
//      if (tab === 'audit') {
//        AuditoriaIA.render(document.getElementById('screen'));
//        return;
//      }
//
//  Si tu app guarda el rol en una variable global, exponelo como
//  window.USER_ROL = rol;  (opcional: si no, el modulo lo resuelve solo).
// ============================================================================
