// ============================================================
// 4housing · Gestión de Diseño
// PLANTILLA DE HOJA DE RUTA (se clona en cada proyecto nuevo)
// ------------------------------------------------------------
// Estructura: Etapas -> Tareas -> (opcional) Subitems
// Un "grupo de modelado" es un set de 6 checks (rubros) que
// deben completarse TODOS para habilitar la tarea siguiente (gate).
// ============================================================

// Personas del área de diseño (desplegable de responsables)
window.RESPONSABLES = [
  "Emiliana Alvarez",
  "Milagros Cortinas",
  "Juan Callero",
  "Ileana Callero",
  "Nicolás Komina",
];

// Rubros de cada grupo de modelado
const RUBROS = [
  "01 - Herrería",
  "02 - Instalaciones",
  "03 - Revestimientos",
  "04 - Aberturas",
  "05 - Equipamiento",
  "06 - Arquitectura",
];

// helper para construir subitems de modelado (los 6 rubros)
function modelado(nombre, respDefault) {
  return {
    nombre,
    responsable: respDefault,
    tipo: "modelado",          // su check se habilita al completar los 6 rubros
    rubros: RUBROS.map(r => ({ nombre: r, responsable: respDefault })),
  };
}

// PLANTILLA COMPLETA
window.PLANTILLA = [
  {
    etapa: 1,
    titulo: "Etapa 1",
    duracion_dias: 2,           // por defecto, editable
    tareas: [
      {
        nombre: "Generación / Recepción de planos comerciales",
        responsable: "Juan Callero",
        nota: "Viene de la venta ganada (4housing). Si no viene, lo hace Juan.",
      },
      { nombre: "Análisis general del proyecto", responsable: "Ileana Callero" },
      { nombre: "Asignación de responsable de diseño", responsable: "Ileana Callero" },
      { nombre: "Planificación de proyecto", responsable: "Ileana Callero" },
    ],
  },
  {
    etapa: 2,
    titulo: "Etapa 2",
    tareas: [
      {
        nombre: "Desarrollo de proyecto",
        responsable: "",         // a designar por el coordinador
        subitems: [
          { nombre: "Presentación de proyecto", responsable: "Ileana Callero" },
          { nombre: "Validación de la planificación", responsable: "Ileana Callero" },
          modelado("Modelado 1", ""),
          { nombre: "Reunión de validación de modelado 1", responsable: "Ileana Callero" },
          modelado("Modelado 2", ""),
          { nombre: "Validación por producción", responsable: "Nicolás Komina" },
          { nombre: "Validación por asistente IA", responsable: "" },
          modelado("Modelado 3", ""),
          { nombre: "Presentación final", responsable: "Ileana Callero" },
        ],
      },
    ],
  },
  {
    etapa: 3,
    titulo: "Etapa 3",
    tareas: [
      {
        nombre: "Documentación ejecutiva",
        responsable: "",
        subitems: [
          { nombre: "Listado de documentos", responsable: "Ileana Callero" },
          { nombre: "Asignación de responsable de documentación", responsable: "Ileana Callero" },
          { nombre: "Validación de planificación", responsable: "Ileana Callero" },
          { nombre: "Documentación ejecutiva", responsable: "" },
          { nombre: "Control de documentación", responsable: "" },
          { nombre: "Cómputo (asistente IA)", responsable: "" },
          { nombre: "Presentación a responsable técnico", responsable: "" },
        ],
      },
    ],
  },
];
