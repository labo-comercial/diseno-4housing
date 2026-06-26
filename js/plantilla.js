// ============================================================
// 4housing · Gestión de Diseño
// PLANTILLA DE HOJA DE RUTA (se clona en cada proyecto nuevo)
// ------------------------------------------------------------
// Estructura: Etapas -> Tareas -> (opcional) Subitems / Rubros
// Un "grupo de modelado" es un set de 6 checks (rubros) que
// deben completarse TODOS para habilitar la tarea siguiente (gate).
//
// NOVEDAD v3 — RESPONSABLES POR ROL (cascada automatica):
//   Cada tarea puede llevar:
//     - responsable: persona FIJA (texto), p.ej. "Juan Callero"
//     - rol: uno de los 4 roles de proyecto. La persona concreta la
//       define la coordinadora en Etapa 1 y se propaga (cascada) a
//       TODAS las tareas con ese mismo rol.
//   Si una tarea tiene `rol`, su `responsable` se completa solo al
//   asignar ese rol en el proyecto. Si tiene `responsable` fijo, no
//   depende de la asignacion de roles.
// ============================================================

// Personas del area (desplegable de responsables y de roles de proyecto)
window.RESPONSABLES = [
  "Emiliana Alvarez",
  "Milagros Cortinas",
  "Juan Callero",
  "Ileana Callero",
  "Nicolas Komina",
];

// ------------------------------------------------------------
// ROLES DE PROYECTO
// La coordinadora asigna UNA persona a cada uno de estos roles en
// la tarea "Asignacion de responsables" (Etapa 1). Esa asignacion
// cae en cascada a todas las tareas marcadas con el rol correspondiente.
// La clave (key) se guarda en proyectos; el label se muestra en UI.
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

// helper: grupo de modelado (6 rubros), todos con el mismo rol/responsable
function modelado(nombre, opts) {
  const base = opts || {};
  return {
    nombre,
    rol: base.rol || null,
    responsable: base.responsable || null,
    tipo: "modelado",          // su check se habilita al completar los 6 rubros
    rubros: RUBROS.map(r => ({ nombre: r, rol: base.rol || null, responsable: base.responsable || null })),
  };
}

// PLANTILLA COMPLETA
window.PLANTILLA = [
  // ----------------------------------------------------------
  // ETAPA 1
  // ----------------------------------------------------------
  {
    etapa: 1,
    titulo: "Etapa 1 - Analisis y planificacion",
    duracion_dias: 2,           // por defecto, editable
    tareas: [
      {
        nombre: "Generacion / Recepcion de planos comerciales",
        responsable: "Juan Callero",
        // (nota gris eliminada a pedido)
      },
      { nombre: "Analisis general del proyecto", responsable: "Ileana Callero" },
      {
        // Tarea clave: aca la coordinadora define los 4 responsables de proyecto.
        // La marcamos con `asigna_roles:true` para que el front muestre los
        // desplegables de asignacion de roles en lugar de un responsable simple.
        nombre: "Asignacion de responsables",
        responsable: "Ileana Callero",
        asigna_roles: true,
      },
      { nombre: "Planificacion de proyecto", responsable: "Ileana Callero" },
      // --- subidas a Etapa 1 a pedido (antes estaban en Etapa 2) ---
      { nombre: "Validacion de la planificacion", responsable: "Ileana Callero" },
      { nombre: "Presentacion de proyecto", responsable: "Ileana Callero" },
    ],
  },

  // ----------------------------------------------------------
  // ETAPA 2 - Modelado
  // "Desarrollo de proyecto" (contenedor) ELIMINADO: sus tareas
  // pasan a ser tareas directas de la etapa.
  // ----------------------------------------------------------
  {
    etapa: 2,
    titulo: "Etapa 2 - Modelado",
    tareas: [
      modelado("Modelado 1", { rol: "resp_diseno" }),
      { nombre: "Reunion de validacion de modelado 1", responsable: "Ileana Callero" },
      modelado("Modelado 2", { rol: "resp_diseno" }),
      { nombre: "Validacion por produccion", rol: "coord_produccion" },
      { nombre: "Reunion de validacion de modelo 2", responsable: "Ileana Callero" },
      modelado("Modelado 3", { rol: "resp_diseno" }),
      {
        nombre: "Validacion por asistente IA",
        rol: "resp_diseno",
        auto_ia: true,           // se tilda SOLO cuando la auditoria IA no tiene inconsistencias ni interferencias
      },
      { nombre: "Presentacion final", rol: "resp_diseno" },
    ],
  },

  // ----------------------------------------------------------
  // ETAPA 3 - Documentacion ejecutiva
  // ----------------------------------------------------------
  {
    etapa: 3,
    titulo: "Etapa 3 - Documentacion ejecutiva",
    tareas: [
      {
        nombre: "Documentacion ejecutiva",
        responsable: "Ileana Callero",
        subitems: [
          { nombre: "Listado de documentos", responsable: "Ileana Callero" },
          { nombre: "Documentacion ejecutiva", rol: "resp_documentacion" },
          { nombre: "Control de documentacion", rol: "resp_tecnico" },
          { nombre: "Computo a generar por asistente IA", rol: "resp_diseno" },
        ],
      },
    ],
  },

  // ----------------------------------------------------------
  // ETAPA 4 - Seguimiento de diseno en produccion (a definir)
  // ----------------------------------------------------------
  {
    etapa: 4,
    titulo: "Etapa 4 - Seguimiento de diseno en produccion",
    tareas: [
      {
        nombre: "Seguimiento de diseno en produccion",
        responsable: "Nicolas Komina",
        nota: "Etapa en definicion - el detalle de tareas se completara mas adelante.",
      },
    ],
  },
];

// Motivos para justificar cambios de fecha en la planificacion
window.MOTIVOS_DESVIO = ["Planificacion", "Cliente", "Desarrollo"];
