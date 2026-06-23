-- ============================================================
-- 4housing · Gestión de Diseño
-- Esquema completo: tablas, roles, RLS y trigger Ventas->Diseño
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
-- ============================================================

-- ---------- 0. Extensiones ----------
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PERFILES Y ROLES
-- Cada usuario de Supabase Auth tiene un perfil con un rol.
-- Roles: 'ventas' | 'diseno' | 'lectura'
-- ============================================================
create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text,
  rol         text not null default 'lectura'
              check (rol in ('ventas','diseno','lectura')),
  creado_en   timestamptz not null default now()
);

-- Helper: devuelve el rol del usuario actual (evita recursión en RLS)
create or replace function public.rol_actual()
returns text
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid();
$$;

-- Al registrarse un usuario, se crea su perfil automáticamente
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', new.email), 'lectura')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. COTIZACIONES (entrada desde el equipo de Ventas)
-- Cuando el estado pasa a 'ganada' se dispara la creación
-- automática del proyecto de diseño.
-- ============================================================
create table if not exists public.cotizaciones (
  id              uuid primary key default gen_random_uuid(),
  nro_if          text not null,
  cliente         text not null,
  nombre_proyecto text not null,
  ficha           text,                          -- requisitos / ficha descriptiva
  plazo_entrega   date,
  estado          text not null default 'abierta'
                  check (estado in ('abierta','enviada','negociacion','ganada','perdida')),
  creado_por      uuid references auth.users(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- ============================================================
-- 3. ETAPAS (catálogo de la hoja de ruta, ordenado por fase)
-- ============================================================
create table if not exists public.etapas (
  id        int primary key,
  fase      int  not null,
  orden     int  not null,
  nombre    text not null
);

insert into public.etapas (id, fase, orden, nombre) values
  (1, 1, 1, 'Análisis general de proyecto'),
  (2, 1, 2, 'Asignación de responsable de diseño'),
  (3, 1, 3, 'Planificación de proyecto'),
  (4, 2, 1, 'Reunión inicial de traspaso de información'),
  (5, 2, 2, 'Revisión de planificación'),
  (6, 2, 3, 'Modelado 3D')
on conflict (id) do nothing;

-- ============================================================
-- 4. PROYECTOS (área de Diseño)
-- ============================================================
create table if not exists public.proyectos (
  id              uuid primary key default gen_random_uuid(),
  cotizacion_id   uuid references public.cotizaciones(id),
  nro_if          text not null,
  cliente         text not null,
  nombre          text not null,
  ficha           text,
  plazo_entrega   date,
  responsable     text,                          -- responsable de diseño
  estado          text not null default 'sin_iniciar'
                  check (estado in ('sin_iniciar','en_ejecucion','terminado','pausado')),
  -- planificación (se completa en Fase 1)
  plan_inicio     date,
  plan_fin_f1     date,
  plan_fin_f2     date,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- ============================================================
-- 5. CHECKLIST POR PROYECTO (una fila por etapa)
-- ============================================================
create table if not exists public.proyecto_checklist (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references public.proyectos(id) on delete cascade,
  etapa_id      int  not null references public.etapas(id),
  cumplido      boolean not null default false,
  cumplido_en   timestamptz,
  unique (proyecto_id, etapa_id)
);

-- ============================================================
-- 6. AUDITORÍAS IA (registro de cargas de planos y hallazgos)
-- ============================================================
create table if not exists public.auditorias (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid references public.proyectos(id) on delete cascade,
  archivo       text,                            -- ruta en storage
  resumen       text,
  hallazgos     jsonb default '[]'::jsonb,        -- [{tipo, titulo, detalle}]
  creado_por    uuid references auth.users(id),
  creado_en     timestamptz not null default now()
);

-- ============================================================
-- 7. TRIGGER: cotización 'ganada' -> crea proyecto + checklist
-- Solo se dispara cuando el estado CAMBIA a 'ganada'.
-- ============================================================
create or replace function public.crear_proyecto_desde_cotizacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nuevo_id uuid;
begin
  if new.estado = 'ganada' and (old.estado is distinct from 'ganada') then
    -- evita duplicados si ya existe un proyecto para esta cotización
    if not exists (select 1 from public.proyectos where cotizacion_id = new.id) then
      insert into public.proyectos (cotizacion_id, nro_if, cliente, nombre, ficha, plazo_entrega)
      values (new.id, new.nro_if, new.cliente, new.nombre_proyecto, new.ficha, new.plazo_entrega)
      returning id into nuevo_id;

      -- crea las filas de checklist (una por etapa)
      insert into public.proyecto_checklist (proyecto_id, etapa_id)
      select nuevo_id, id from public.etapas;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_cotizacion_ganada on public.cotizaciones;
create trigger trg_cotizacion_ganada
  after update on public.cotizaciones
  for each row execute function public.crear_proyecto_desde_cotizacion();

-- ============================================================
-- 8. VISTA: proyectos con avance, etapa actual y salud de plazo
-- ============================================================
create or replace view public.v_proyectos as
with avance as (
  select c.proyecto_id,
         count(*)                                   as total,
         count(*) filter (where c.cumplido)         as hechos
  from public.proyecto_checklist c
  group by c.proyecto_id
),
etapa_actual as (
  select c.proyecto_id, e.nombre as etapa
  from public.proyecto_checklist c
  join public.etapas e on e.id = c.etapa_id
  where c.cumplido = false
  and c.etapa_id = (
    select min(c2.etapa_id) from public.proyecto_checklist c2
    where c2.proyecto_id = c.proyecto_id and c2.cumplido = false
  )
)
select p.*,
       coalesce(a.hechos,0)                                          as checks_hechos,
       coalesce(a.total,0)                                           as checks_total,
       case when coalesce(a.total,0)=0 then 0
            else round(a.hechos::numeric / a.total * 100) end        as avance_pct,
       coalesce(ea.etapa, 'Completado')                              as etapa_actual
from public.proyectos p
left join avance a   on a.proyecto_id = p.id
left join etapa_actual ea on ea.proyecto_id = p.id;
