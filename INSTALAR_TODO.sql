-- ============================================================
-- 4housing · Gestión de Diseño — INSTALACIÓN COMPLETA v2
-- Pegá TODO en el SQL Editor de Supabase y dale Run.
-- Crea tablas + jerarquía de tareas + responsables + historial.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- PERFILES Y ROLES ----------
create table if not exists public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nombre    text,
  rol       text not null default 'lectura' check (rol in ('coordinador','disenio','lectura')),
  creado_en timestamptz not null default now()
);

create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid();
$$;

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
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- PROYECTOS ----------
create table if not exists public.proyectos (
  id             uuid primary key default gen_random_uuid(),
  nro_if         text not null,
  cliente        text not null,
  nombre         text not null,
  ficha          text,
  plazo_entrega  date,
  responsable    text,
  estado         text not null default 'sin_iniciar'
                 check (estado in ('sin_iniciar','en_ejecucion','terminado','pausado')),
  creado_en      timestamptz not null default now()
);

-- ---------- TAREAS (jerárquicas: etapa -> tarea -> subitem -> rubro) ----------
-- nivel: 'tarea' | 'subitem' | 'rubro'
-- tipo:  'normal' | 'modelado' (modelado = gate de 6 rubros)
create table if not exists public.tareas (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references public.proyectos(id) on delete cascade,
  parent_id     uuid references public.tareas(id) on delete cascade,
  etapa         int not null,
  orden         int not null default 0,
  nivel         text not null default 'tarea',
  tipo          text not null default 'normal',
  nombre        text not null,
  responsable   text,
  nota          text,
  cumplido      boolean not null default false,
  cumplido_en   timestamptz,
  -- planificación por tarea
  fecha_inicio  date,
  fecha_fin     date,
  eliminada     boolean not null default false
);
create index if not exists idx_tareas_proyecto on public.tareas(proyecto_id);
create index if not exists idx_tareas_parent on public.tareas(parent_id);

-- ---------- HISTORIAL DE CAMBIOS DE RESPONSABLE ----------
create table if not exists public.historial_responsable (
  id            uuid primary key default gen_random_uuid(),
  tarea_id      uuid not null references public.tareas(id) on delete cascade,
  proyecto_id   uuid not null references public.proyectos(id) on delete cascade,
  resp_anterior text,
  resp_nuevo    text,
  motivo        text not null,
  cambiado_por  uuid references auth.users(id),
  cambiado_en   timestamptz not null default now()
);
create index if not exists idx_hist_tarea on public.historial_responsable(tarea_id);

-- ---------- AUDITORÍAS IA ----------
create table if not exists public.auditorias (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid references public.proyectos(id) on delete cascade,
  archivo     text,
  resumen     text,
  hallazgos   jsonb default '[]'::jsonb,
  creado_por  uuid references auth.users(id),
  creado_en   timestamptz not null default now()
);

-- ============================================================
-- VISTA: proyectos con avance y etapa actual
-- (avance = tareas/subitems/rubros cumplidos / total, sin eliminadas)
-- ============================================================
create or replace view public.v_proyectos as
with hojas as (
  -- contamos solo "hojas": rubros, y subitems/tareas sin hijos
  select t.proyecto_id, t.id, t.cumplido,
         not exists (select 1 from public.tareas c where c.parent_id = t.id and c.eliminada=false) as es_hoja
  from public.tareas t
  where t.eliminada = false
),
av as (
  select proyecto_id,
         count(*) filter (where es_hoja) as total,
         count(*) filter (where es_hoja and cumplido) as hechos
  from hojas group by proyecto_id
)
select p.*,
       coalesce(av.hechos,0) as checks_hechos,
       coalesce(av.total,0)  as checks_total,
       case when coalesce(av.total,0)=0 then 0
            else round(coalesce(av.hechos,0)::numeric / av.total * 100) end as avance_pct
from public.proyectos p
left join av on av.proyecto_id = p.id;

-- ============================================================
-- RLS
-- coordinador: todo. disenio: tilda checks de tareas asignadas + crea historial.
-- lectura: solo ve. (Para la etapa de prueba damos permisos amplios a
--          coordinador y disenio; afinamos después.)
-- ============================================================
alter table public.perfiles              enable row level security;
alter table public.proyectos             enable row level security;
alter table public.tareas                enable row level security;
alter table public.historial_responsable enable row level security;
alter table public.auditorias            enable row level security;

drop policy if exists perfiles_sel on public.perfiles;
create policy perfiles_sel on public.perfiles for select to authenticated using (true);
drop policy if exists perfiles_upd on public.perfiles;
create policy perfiles_upd on public.perfiles for update to authenticated using (id = auth.uid());

drop policy if exists proy_sel on public.proyectos;
create policy proy_sel on public.proyectos for select to authenticated using (true);
drop policy if exists proy_ins on public.proyectos;
create policy proy_ins on public.proyectos for insert to authenticated
  with check (public.rol_actual() in ('coordinador','disenio'));
drop policy if exists proy_upd on public.proyectos;
create policy proy_upd on public.proyectos for update to authenticated
  using (public.rol_actual() in ('coordinador','disenio'));
drop policy if exists proy_del on public.proyectos;
create policy proy_del on public.proyectos for delete to authenticated
  using (public.rol_actual() = 'coordinador');

drop policy if exists tar_sel on public.tareas;
create policy tar_sel on public.tareas for select to authenticated using (true);
drop policy if exists tar_ins on public.tareas;
create policy tar_ins on public.tareas for insert to authenticated
  with check (public.rol_actual() in ('coordinador','disenio'));
drop policy if exists tar_upd on public.tareas;
create policy tar_upd on public.tareas for update to authenticated
  using (public.rol_actual() in ('coordinador','disenio'));
drop policy if exists tar_del on public.tareas;
create policy tar_del on public.tareas for delete to authenticated
  using (public.rol_actual() = 'coordinador');

drop policy if exists hist_sel on public.historial_responsable;
create policy hist_sel on public.historial_responsable for select to authenticated using (true);
drop policy if exists hist_ins on public.historial_responsable;
create policy hist_ins on public.historial_responsable for insert to authenticated
  with check (public.rol_actual() in ('coordinador','disenio'));

drop policy if exists aud_sel on public.auditorias;
create policy aud_sel on public.auditorias for select to authenticated using (true);
drop policy if exists aud_ins on public.auditorias;
create policy aud_ins on public.auditorias for insert to authenticated
  with check (public.rol_actual() in ('coordinador','disenio'));
