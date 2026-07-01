// ============================================================
// 4housing · Gestión de Diseño
// PLANTILLA DE HOJA DE RUTA (se clona en cada proyecto nuevo)
// ------------------------------------------------------------
// Estructura: Etapas -> Tareas -> (opcional) Subitems / Rubros
// Un "grupo de modelado" es un set de 6 checks (rubros) que
// deben completarse TODOS para habilitar la tarea siguiente (gate).
//
// v4 — PLANIFICACION AUTOMATICA POR CATEGORIA
//   - Se elimina el hito "Planificacion de proyecto"; su logica se
//     concentra en "Analisis general del proyecto":
//       * Ileana selecciona cuales de los 6 RUBROS hay que redibujar.
//       * Segun la cantidad seleccionada se determina la CATEGORIA:
//           3 o mas rubros -> Categoria 1 (20 dias habiles)
//           exactamente 2  -> Categoria 2 (15 dias habiles)
//           1 o menos      -> Categoria 3 (10 dias habiles)
//       * La categoria reparte automaticamente los dias en los
//         procesos de la Etapa 2 (ver REPARTO_CATEGORIA mas abajo).
//   - Etapa 2 arranca al terminar la Etapa 1; Etapa 3 al terminar la 2.
//   - Etapa 3 (Documentacion ejecutiva) tiene un MODO seleccionable:
//       IA  -> 1 dia habil
//       BIM -> 1 dia habil
//       DWG -> 20 dias habiles (19 documentacion ejecutiva + 1 el resto)
// ============================================================

// Personas del area (desplegable de responsables y de roles de proyecto)
window.RESPONSABLES = [
  "Emiliana Alvarez",
  "Milagros Cortinas",
  "Juan Callero",
  "Ileana Callero",
  "Nicolas Komina",
  "Nicolas Mendoza",
  "Ana Julia Bustillo",
  "Alejo Zuchelli",
];

// ------------------------------------------------------------
// ROLES DE PROYECTO (cascada)
// ------------------------------------------------------------
window.ROLES_PROYECTO = [
  { key: "resp_diseno",        label: "Responsable de diseno" },
  { key: "resp_documentacion", label: "Responsable de documentacion" },
  { key: "resp_tecnico",       label: "Responsable tecnico" },
  { key: "coord_produccion",   label: "Coordinador de produccion" },
];
window.ROL_LABEL = window.ROLES_PROYECTO.reduce((a, r) => (a[r.key] = r.label, a), {});

// Rubros de cada grupo de modelado
const RUBROS = [
  "01 - Herreria",
  "02 - Instalaciones",
  "03 - Revestimientos",
  "04 - Aberturas",
  "05 - Equipamiento",
  "06 - Arquitectura",
];

// ------------------------------------------------------------
// RUBROS QUE DOCUMENTA EL EQUIPO (para "Analisis general del proyecto")
// Ileana tilda cuales hay que REDIBUJAR. La cantidad define la categoria.
// ------------------------------------------------------------
window.RUBROS_REDIBUJO = [
  "01 - Herreria",
  "02 - Instalaciones",
  "03 - Revestimientos",
  "04 - Aberturas",
  "05 - Equipamiento",
  "06 - Arquitectura",
];

// Regla de categoria segun cantidad de rubros a redibujar
window.categoriaPorRubros = function (cant) {
  if (cant >= 3) return 1;
  if (cant === 2) return 2;
  return 3; // 1 o menos
};

// ------------------------------------------------------------
// REPARTO DE DIAS HABILES POR CATEGORIA EN LA ETAPA 2
// La clave es el "slug" del proceso; el valor, los dias habiles.
// El total por categoria: Cat1=20, Cat2=15, Cat3=10.
// ------------------------------------------------------------
window.REPARTO_CATEGORIA = {
  1: {
    "modelado_1": 8,
    "reunion_validacion_1": 1,
    "modelado_2": 5,
    "validacion_produccion": 1,
    "reunion_validacion_2": 1,
    "modelado_3": 2,
    "validacion_ia": 1,
    "presentacion_final": 1,
  }, // total 20
  2: {
    "modelado_1": 5,
    "reunion_validacion_1": 1,
    "modelado_2": 3,
    "validacion_produccion": 1,
    "reunion_validacion_2": 1,
    "modelado_3": 2,
    "validacion_ia": 1,
    "presentacion_final": 1,
  }, // total 15
  3: {
    "modelado_1": 3,
    "reunion_validacion_1": 1,
    "modelado_2": 1,
    "validacion_produccion": 1,
    "reunion_validacion_2": 1,
    "modelado_3": 1,
    "validacion_ia": 1,
    "presentacion_final": 1,
  }, // total 10
};

// ------------------------------------------------------------
// ETAPA 3 — modos de documentacion ejecutiva y su duracion (dias habiles)
// ------------------------------------------------------------
window.MODOS_ETAPA3 = [
  { key: "ia",  label: "Por IA",  dias_total: 1  },
  { key: "bim", label: "En BIM",  dias_total: 1  },
  { key: "dwg", label: "En DWG",  dias_total: 20 },
];
// En DWG: 19 dias para "Documentacion ejecutiva" + 1 para el resto de la etapa.
window.ETAPA3_DWG_EJECUTIVA = 19;

// helper: grupo de modelado (6 rubros), todos con el mismo rol/responsable
function modelado(nombre, opts) {
  const base = opts || {};
  return {
    nombre,
    slug: base.slug || null,
    rol: base.rol || null,
    responsable: base.responsable || null,
    tipo: "modelado",          // su check se habilita al completar los 6 rubros
    rubros: RUBROS.map(r => ({ nombre: r, rol: base.rol || null, responsable: base.responsable || null })),
  };
}

// PLANTILLA COMPLETA
window.PLANTILLA = [
  // ----------------------------------------------------------
  // ETAPA 1 — Analisis y planificacion
  // ----------------------------------------------------------
  {
    etapa: 1,
    titulo: "Etapa 1 - Analisis y planificacion",
    duracion_dias: 2,
    tareas: [
      {
        nombre: "Generacion / Recepcion de planos comerciales",
        responsable: "Juan Callero",
      },
      {
        // Aca vive ahora la planificacion: seleccion de rubros a redibujar
        // y categoria resultante (que reparte los dias de la Etapa 2).
        nombre: "Analisis general del proyecto",
        responsable: "Ileana Callero",
        analisis_general: true,
      },
      {
        // La coordinadora define los 4 responsables de proyecto.
        nombre: "Asignacion de responsables",
        responsable: "Ileana Callero",
        asigna_roles: true,
      },
      // "Planificacion de proyecto" ELIMINADA (su logica pasó a Analisis general).
      { nombre: "Validacion de la planificacion", responsable: "Ileana Callero" },
      { nombre: "Presentacion de proyecto", responsable: "Ileana Callero" },
    ],
  },

  // ----------------------------------------------------------
  // ETAPA 2 — Modelado  (los dias se reparten por categoria)
  // ----------------------------------------------------------
  {
    etapa: 2,
    titulo: "Etapa 2 - Modelado",
    tareas: [
      modelado("Modelado 1", { rol: "resp_diseno", slug: "modelado_1" }),
      { nombre: "Reunion de validacion de modelado 1", responsable: "Ileana Callero", slug: "reunion_validacion_1", minuta: true },
      modelado("Modelado 2", { rol: "resp_diseno", slug: "modelado_2" }),
      { nombre: "Validacion por produccion", rol: "coord_produccion", slug: "validacion_produccion", minuta: true },
      { nombre: "Reunion de validacion de modelo 2", responsable: "Ileana Callero", slug: "reunion_validacion_2", minuta: true },
      modelado("Modelado 3", { rol: "resp_diseno", slug: "modelado_3" }),
      {
        nombre: "Validacion por asistente IA",
        rol: "resp_diseno",
        slug: "validacion_ia",
        auto_ia: true,           // se tilda SOLO cuando la auditoria IA no tiene inconsistencias ni interferencias
      },
      { nombre: "Presentacion final", rol: "resp_diseno", slug: "presentacion_final" },
    ],
  },

  // ----------------------------------------------------------
  // ETAPA 3 — Documentacion ejecutiva (modo IA / DWG / BIM)
  // Arranca al terminar la Etapa 2.
  // ----------------------------------------------------------
  {
    etapa: 3,
    titulo: "Etapa 3 - Documentacion ejecutiva",
    tareas: [
      {
        nombre: "Documentacion ejecutiva",
        responsable: "Ileana Callero",
        selecciona_modo3: true,   // el front muestra el selector IA/DWG/BIM
        subitems: [
          { nombre: "Listado de documentos", responsable: "Ileana Callero", slug: "e3_listado" },
          { nombre: "Documentacion ejecutiva", rol: "resp_documentacion", slug: "e3_ejecutiva" },
          { nombre: "Control de documentacion", rol: "resp_tecnico", slug: "e3_control" },
          { nombre: "Computo a generar por asistente IA", rol: "resp_diseno", slug: "e3_computo" },
        ],
      },
    ],
  },

  // ----------------------------------------------------------
  // ETAPA 4 — Seguimiento de diseno en produccion
  // 6 hitos de "Revision en planta": cada uno con fecha y persona.
  // Si la persona ya tiene una tarea ese dia (en cualquier proyecto),
  // se corre esa tarea y su cadena, con confirmacion + desvio.
  // ----------------------------------------------------------
  {
    etapa: 4,
    titulo: "Etapa 4 - Seguimiento de diseno en produccion",
    tareas: [
      { nombre: "Revision en planta 1", tipo: "revision_planta", revision_planta: true },
      { nombre: "Revision en planta 2", tipo: "revision_planta", revision_planta: true },
      { nombre: "Revision en planta 3", tipo: "revision_planta", revision_planta: true },
      { nombre: "Revision en planta 4", tipo: "revision_planta", revision_planta: true },
      { nombre: "Revision en planta 5", tipo: "revision_planta", revision_planta: true },
      { nombre: "Revision en planta 6", tipo: "revision_planta", revision_planta: true },
    ],
  },
];

// Motivos para justificar cambios de fecha en la planificacion
window.MOTIVOS_DESVIO = ["Planificacion", "Cliente", "Desarrollo", "Revision en planta"];
