-- ============================================================
-- 4housing · Gestión de Diseño — Políticas RLS
-- Ejecutar DESPUÉS de 01_schema.sql
-- Reglas:
--   ventas  -> gestiona cotizaciones (incl. pasarlas a 'ganada')
--   diseno  -> edita proyectos, checklist y auditorías (NO crea/borra proyectos)
--   lectura -> solo ve
--   todos los autenticados pueden leer
-- ============================================================

alter table public.perfiles            enable row level security;
alter table public.cotizaciones        enable row level security;
alter table public.proyectos           enable row level security;
alter table public.proyecto_checklist  enable row level security;
alter table public.auditorias          enable row level security;
alter table public.etapas              enable row level security;

-- ---------- PERFILES ----------
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles
  for select to authenticated using (true);

drop policy if exists perfiles_update_self on public.perfiles;
create policy perfiles_update_self on public.perfiles
  for update to authenticated using (id = auth.uid());

-- ---------- ETAPAS (catálogo, solo lectura) ----------
drop policy if exists etapas_select on public.etapas;
create policy etapas_select on public.etapas
  for select to authenticated using (true);

-- ---------- COTIZACIONES ----------
drop policy if exists cot_select on public.cotizaciones;
create policy cot_select on public.cotizaciones
  for select to authenticated using (true);

drop policy if exists cot_insert on public.cotizaciones;
create policy cot_insert on public.cotizaciones
  for insert to authenticated with check (public.rol_actual() = 'ventas');

drop policy if exists cot_update on public.cotizaciones;
create policy cot_update on public.cotizaciones
  for update to authenticated using (public.rol_actual() = 'ventas');

drop policy if exists cot_delete on public.cotizaciones;
create policy cot_delete on public.cotizaciones
  for delete to authenticated using (public.rol_actual() = 'ventas');

-- ---------- PROYECTOS ----------
-- Lectura: todos. Edición: diseño. Inserción/borrado: NO manual
-- (los proyectos nacen del trigger; el trigger es security definer
--  y por eso puede insertar sin chocar con estas políticas).
drop policy if exists proy_select on public.proyectos;
create policy proy_select on public.proyectos
  for select to authenticated using (true);

drop policy if exists proy_update on public.proyectos;
create policy proy_update on public.proyectos
  for update to authenticated using (public.rol_actual() = 'diseno');

-- ---------- CHECKLIST ----------
drop policy if exists chk_select on public.proyecto_checklist;
create policy chk_select on public.proyecto_checklist
  for select to authenticated using (true);

drop policy if exists chk_update on public.proyecto_checklist;
create policy chk_update on public.proyecto_checklist
  for update to authenticated using (public.rol_actual() = 'diseno');

-- ---------- AUDITORÍAS ----------
drop policy if exists aud_select on public.auditorias;
create policy aud_select on public.auditorias
  for select to authenticated using (true);

drop policy if exists aud_insert on public.auditorias;
create policy aud_insert on public.auditorias
  for insert to authenticated with check (public.rol_actual() = 'diseno');

drop policy if exists aud_delete on public.auditorias;
create policy aud_delete on public.auditorias
  for delete to authenticated using (public.rol_actual() = 'diseno');
