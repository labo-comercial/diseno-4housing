// ============================================================================
//  Edge Function: auditoria-ia
//  Recibe un inventario.json, llama a la API de Claude y devuelve hallazgos.
//  La API key vive como secret del lado servidor (NUNCA en el front).
//
//  Nombre EXACTO de la función: auditoria-ia
//  Secret requerido: ANTHROPIC_API_KEY
//
//  Desde 2026-07 se deploya en el proyecto del PORTAL (wcpkpwxhqdcdljfwzcmy).
//  No accede a la base: la app inserta el resultado en diseno_auditorias.
// ============================================================================

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-4-6";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function construirSystemPrompt(): string {
  return [
    "Sos un auditor tecnico de documentacion constructiva para 4housing,",
    "empresa de vivienda modular. Recibis el inventario estructurado de un",
    "modelo 3D (piezas computadas por rubro, piezas sin clasificar, y la",
    "ubicacion de los modulos). Tu trabajo es detectar INCONSISTENCIAS y",
    "puntos a revisar, NO inventar datos.",
    "",
    "Rubros de 4housing: Herreria, Instalaciones, Revestimientos, Aberturas,",
    "Equipamiento, Arquitectura.",
    "",
    "Revisa y reporta:",
    "1. Rubros vacios o con muy pocas piezas (posible faltante de modelado).",
    "2. Cantidad alta de 'piezas_sin_clasificar' (faltan en el diccionario;",
    "   eso degrada el computo).",
    "3. Piezas con cantidades anomalas (cientos/miles de una misma pieza suele",
    "   indicar malla 3D contada como pieza, no pieza real).",
    "4. Coherencia entre modulos: si hay varios MODULO_TIPO_A, deberian tener",
    "   computos similares entre si.",
    "5. Cualquier patron raro que un arquitecto deberia validar.",
    "",
    "Respondé UNICAMENTE con un JSON valido, sin texto adicional ni backticks:",
    "{",
    '  "resumen": "2-3 frases del estado general del modelo",',
    '  "hallazgos": [',
    '    {"severidad":"alta|media|baja","rubro":"...","detalle":"...","sugerencia":"..."}',
    "  ],",
    '  "completitud_estimada": "porcentaje aproximado de cuan completo esta el computo"',
    "}",
  ].join("\n");
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "Falta ANTHROPIC_API_KEY en los secrets de la función." }, 500);
    }

    const body = await req.json().catch(() => null);
    const inventario = body?.inventario;
    if (!inventario) {
      return json({ error: "Falta 'inventario' en el body." }, 400);
    }

    const compacto = {
      meta: inventario.meta,
      resumen_por_rubro: inventario.resumen_por_rubro,
      piezas_computadas: inventario.piezas_computadas,
      piezas_sin_clasificar: (inventario.piezas_sin_clasificar || []).slice(0, 40),
      cant_modulos: (inventario.modulos_ubicacion || []).length,
    };

    const userMsg =
      "Audita este inventario y devolve el JSON pedido:\n\n" +
      JSON.stringify(compacto);

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: construirSystemPrompt(),
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: "Error de la API de Claude", detalle: t }, 502);
    }

    const data = await resp.json();
    const texto = (data.content || [])
      .map((b: any) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    let hallazgos: any = null;
    try {
      const limpio = texto.replace(/```json|```/g, "").trim();
      hallazgos = JSON.parse(limpio);
    } catch (_e) {
      hallazgos = { resumen: texto, hallazgos: [], completitud_estimada: null };
    }

    return json({ ok: true, hallazgos, informe_texto: hallazgos.resumen || texto });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
