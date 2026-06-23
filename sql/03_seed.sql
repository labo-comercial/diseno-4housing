-- ============================================================
-- 4housing · Gestión de Diseño — Datos de ejemplo (opcional)
-- Ejecutar para tener proyectos de prueba.
-- Inserta cotizaciones y luego las pasa a 'ganada' para que el
-- trigger genere los proyectos + checklist automáticamente.
-- ============================================================

insert into public.cotizaciones (nro_if, cliente, nombre_proyecto, ficha, plazo_entrega, estado) values
  ('IF-2026-0188','Inmobiliaria Sur SA','Conjunto Las Lomas','12 módulos, 2 conjuntos. Cubierta chapa, revestimiento muro tipo A.','2026-08-15','abierta'),
  ('IF-2026-0190','Grupo Patagonia','Vivienda MAR-PL0090','Tipologías M1-M3-M4-M6 y M2-M5. Pase sanitario en M2.','2026-09-02','abierta'),
  ('IF-2026-0185','Desarrollos Norte','Dúplex Costanera','Dúplex 2 plantas, aberturas premium.','2026-05-30','abierta');

-- Pasarlas a ganada -> dispara la creación de proyectos
update public.cotizaciones set estado = 'ganada'
where nro_if in ('IF-2026-0188','IF-2026-0190','IF-2026-0185');

-- Cargar algo de avance / planificación a modo demo
update public.proyectos set estado='en_ejecucion', responsable='M. Alarcón',
  plan_inicio='2026-06-01', plan_fin_f1='2026-06-20', plan_fin_f2='2026-08-10'
where nro_if='IF-2026-0188';

update public.proyectos set estado='en_ejecucion', responsable='J. Ferreyra',
  plan_inicio='2026-06-05', plan_fin_f1='2026-06-18', plan_fin_f2='2026-08-28'
where nro_if='IF-2026-0190';

update public.proyectos set estado='terminado', responsable='L. Quiroga',
  plan_inicio='2026-05-01', plan_fin_f1='2026-05-10', plan_fin_f2='2026-05-28'
where nro_if='IF-2026-0185';

-- Marcar algunos checks como cumplidos (demo)
-- Las Lomas: primeras 4 etapas
update public.proyecto_checklist set cumplido=true, cumplido_en=now()
where proyecto_id=(select id from public.proyectos where nro_if='IF-2026-0188')
  and etapa_id in (1,2,3,4);

-- MAR-PL0090: primeras 2 etapas
update public.proyecto_checklist set cumplido=true, cumplido_en=now()
where proyecto_id=(select id from public.proyectos where nro_if='IF-2026-0190')
  and etapa_id in (1,2);

-- Costanera: todas
update public.proyecto_checklist set cumplido=true, cumplido_en=now()
where proyecto_id=(select id from public.proyectos where nro_if='IF-2026-0185');
