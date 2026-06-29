// ============================================================
// 4housing - Gestion de Diseno
// CAMPOS DE INPUT DEL PROYECTO  ->  "Requisitos / Ficha descriptiva"
// Generado desde Ficha_de_input_requeridos_para_proyectos.xlsx
//
// Cada campo: { key, label, tipo? , hint? , opciones? }
//   tipo (opcional):
//     - undefined / "texto"  -> input de texto libre (default)
//     - "ubicacion"          -> nombre del lugar + link de Google Maps
//     - "artefacto"          -> exige marca y modelo (dos campos)
//     - "lista_artefactos"   -> N cajas (varios modelos), agregar/quitar
//   opciones: [...]          -> a futuro lo vuelve un <select>
//
// NOTA: el listado completo es por ahora de TEXTO LIBRE. Mas adelante
// se migra a desplegables agregando "opciones" a cada campo.
// ============================================================
window.CAMPOS_INPUT = [
  {
    seccion: "GENERALES",
    campos: [
      { key: "gene_ubicacion", label: "Ubicación", tipo: "ubicacion" },
      { key: "gene_cimentacion", label: "Cimentación" },
      { key: "gene_sistema", label: "Sistema" },
      { key: "gene_estructura_gral", label: "Estructura gral" },
      { key: "gene_aberturas_aluminio", label: "aberturas aluminio" },
      { key: "gene_aberturas_madera", label: "aberturas madera" },
      { key: "gene_aislacion_muros", label: "aislación muros" },
      { key: "gene_aislacion_cubierta", label: "aislación cubierta" },
      { key: "gene_pometina", label: "pometina" },
    ],
  },
  {
    seccion: "INSTALACIONES (NO incluye tendido externo)",
    campos: [
      { key: "inst_aire_acondicionado", label: "aire acondicionado" },
      { key: "inst_losa_radiante", label: "losa radiante" },
      { key: "inst_electrica", label: "eléctrica" },
      { key: "inst_gas", label: "gas" },
      { key: "inst_sanitaria", label: "sanitaria" },
    ],
  },
  {
    seccion: "ARTEFACTOS DE ILUMINACIÓN",
    campos: [
      {
        key: "ilum_artefactos",
        label: "Artefactos de iluminación",
        tipo: "lista_artefactos",
        hint: "Detallá cada artefacto incluido (marca y modelo). Agregá una caja por cada modelo distinto.",
      },
    ],
  },
  {
    seccion: "ARTEFACTOS SANITARIOS",
    // Todos exigen MARCA y MODELO con precisión.
    campos: [
      { key: "arte_inodoro", label: "inodoro", tipo: "artefacto" },
      { key: "arte_bidet", label: "bidet", tipo: "artefacto" },
      { key: "arte_griferia_bacha", label: "grifería bacha", tipo: "artefacto" },
      { key: "arte_griferia_ducha", label: "grifería ducha", tipo: "artefacto" },
      { key: "arte_griferia_bidet", label: "grifería bidet", tipo: "artefacto" },
      { key: "arte_bacha", label: "bacha", tipo: "artefacto" },
      { key: "arte_mesada", label: "mesada", tipo: "artefacto" },
      { key: "arte_toallero", label: "toallero", tipo: "artefacto" },
      { key: "arte_portarrollos", label: "portarrollos", tipo: "artefacto" },
      { key: "arte_espejo", label: "espejo", tipo: "artefacto" },
      { key: "arte_mampara_cortina", label: "mampara/cortina", tipo: "artefacto" },
      { key: "arte_zocalo_plato_ducha", label: "zocalo/plato ducha", tipo: "artefacto" },
      { key: "arte_extractor", label: "extractor", tipo: "artefacto" },
    ],
  },
  {
    seccion: "REVESTIMIENTOS",
    campos: [
      { key: "reve_revestimiento_interior", label: "revestimiento interior" },
      { key: "reve_revestimiento_bano", label: "revestimiento baño" },
      { key: "reve_piso_general", label: "piso general" },
      { key: "reve_rev_exterior", label: "rev exterior" },
      { key: "reve_revestimiento_cielorraso", label: "revestimiento cielorraso" },
      { key: "reve_rev_cielorraso_bano", label: "rev cielorraso baño" },
    ],
  },
  {
    seccion: "EQUIPAMIENTO COCINA",
    campos: [
      { key: "equi_mueble", label: "mueble" },
      { key: "equi_mesada", label: "mesada" },
      { key: "equi_bacha", label: "bacha" },
      { key: "equi_griferia", label: "grifería" },
      { key: "equi_extractor", label: "extractor" },
      { key: "equi_heladera", label: "heladera" },
      { key: "equi_horno", label: "horno" },
      { key: "equi_anafe", label: "anafe" },
      { key: "equi_termotanque_caldera", label: "termotanque/caldera" },
    ],
  },
  {
    seccion: "EQUIPAMIENTO LAVADERO",
    campos: [
      { key: "equi_mueble_2", label: "mueble" },
      { key: "equi_mesada_2", label: "mesada" },
      { key: "equi_griferia_2", label: "grifería" },
      { key: "equi_lavarropas", label: "lavarropas" },
      { key: "equi_secarropas", label: "secarropas" },
    ],
  },
  {
    seccion: "EQUIPAMIENTO GENERAL",
    campos: [
      { key: "reve_mueble_de_bano", label: "mueble de baño" },
      { key: "equi_mueble_dormitorio", label: "mueble dormitorio" },
      { key: "equi_sillones", label: "sillones" },
      { key: "equi_estantes", label: "estantes" },
      { key: "equi_cortinas", label: "cortinas" },
      { key: "equi_mesa", label: "mesa" },
      { key: "equi_cama", label: "cama" },
      { key: "equi_estufa", label: "estufa" },
      { key: "equi_deck", label: "deck" },
    ],
  },
];
