// ============================================================
// 4housing - Gestion de Diseno
// CAMPOS DE INPUT DEL PROYECTO (Ficha descriptiva)
// Generado desde Ficha_de_input_requeridos_para_proyectos.xlsx
// Cada campo: { key, label }. La seccion agrupa en el formulario.
// A futuro, un campo puede pasar de texto libre a desplegable
// agregando "opciones: [...]" -> el front lo renderiza como <select>.
// ============================================================
window.CAMPOS_INPUT = [
  {
    seccion: "GENERALES",
    campos: [
      { key: "gene_ubicacion", label: "Ubicación" },
      { key: "gene_cimentacion", label: "Cimentación" },
      { key: "gene_sistema", label: "Sistema" },
      { key: "gene_estructura_gral", label: "Estructura gral" },
      { key: "gene_aberturas_aluminio", label: "aberturas aluminio" },
      { key: "gene_aberturas_madera", label: "aberturas madera" },
      { key: "gene_aislacion_muros", label: "aislación muros" },
      { key: "gene_aislacion_muros_2", label: "aislación muros" },
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
    seccion: "ARTEFACTOS ELÉCTRICOS",
    campos: [
      { key: "arte_electricos", label: "eléctricos" },
    ],
  },
  {
    seccion: "ARTEFACTOS SANITARIOS",
    campos: [
      { key: "arte_inodoro", label: "inodoro" },
      { key: "arte_bidet", label: "bidet" },
      { key: "arte_griferia_bacha", label: "grifería bacha" },
      { key: "arte_griferia_ducha", label: "grifería ducha" },
      { key: "arte_griferia_bidet", label: "grifería bidet" },
      { key: "arte_bacha", label: "bacha" },
      { key: "arte_mesada", label: "mesada" },
      { key: "arte_toallero", label: "toallero" },
      { key: "arte_portarrollos", label: "portarrollos" },
      { key: "arte_espejo", label: "espejo" },
      { key: "arte_mampara_cortina", label: "mampara/cortina" },
      { key: "arte_zocalo_plato_ducha", label: "zocalo/plato ducha" },
      { key: "arte_extractor", label: "extractor" },
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
      { key: "reve_mueble_de_bano", label: "mueble de baño" },
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
