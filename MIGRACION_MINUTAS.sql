-- ============================================================
-- 4housing · Gestión de Diseño — Migración: minutas como historial
-- Pegá TODO en el SQL Editor de Supabase y dale Run.
--
-- Antes: la minuta vivía en tareas.minuta (jsonb), un solo valor que se
-- pisaba en cada "Guardar minuta" — sin rastro de versiones anteriores.
-- Ahora: cada guardado inserta una fila nueva en public.minutas. No hay
-- policy de update/delete, asi que una vez creada una minuta queda fija
-- (append-only). El panel muestra el historial completo.
-- ============================================================

create table if not exists public.minutas (
  id                uuid primary key default gen_random_uuid(),
  tarea_id          uuid not null references public.tareas(id) on delete cascade,
  proyecto_id       uuid not null references public.proyectos(id) on delete cascade,
  fecha_hora        timestamptz,
  temas             text,
  requiere_revision boolean not null default false,
  detalle           text,
  creado_por        uuid references auth.users(id),
  creado_por_nombre text,
  creado_en         timestamptz not null default now()
);
create index if not exists idx_minutas_tarea    on public.minutas(tarea_id);
create index if not exists idx_minutas_proyecto on public.minutas(proyecto_id);

alter table public.minutas enable row level security;

drop policy if exists min_sel on public.minutas;
create policy min_sel on public.minutas for select to authenticated using (true);

drop policy if exists min_ins on public.minutas;
create policy min_ins on public.minutas for insert to authenticated
  with check (public.rol_actual() in ('coordinador','disenio'));

-- Sin policies de update/delete a propósito: las minutas son inmutables
-- una vez cargadas.

-- ------------------------------------------------------------
-- Migración de datos existentes: si tareas.minuta ya tiene algo cargado
-- (columna agregada fuera de INSTALAR_TODO.sql), lo movemos como la
-- primera versión del historial. No falla si la columna no existe.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tareas' and column_name='minuta'
  ) then
    insert into public.minutas (tarea_id, proyecto_id, fecha_hora, temas, requiere_revision, detalle, creado_en)
    select
      t.id,
      t.proyecto_id,
      nullif(t.minuta->>'fecha_hora','')::timestamptz,
      t.minuta->>'temas',
      coalesce((t.minuta->>'requiere_revision')::boolean, false),
      t.minuta->>'detalle',
      now()
    from public.tareas t
    where t.minuta is not null and t.minuta::text <> '{}'
      and not exists (select 1 from public.minutas m where m.tarea_id = t.id);
  end if;
end $$;
