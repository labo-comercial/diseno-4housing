# Gestión de Diseño · 4housing

Herramienta interna para el área de Diseño. Los proyectos entran automáticamente
cuando el equipo de Ventas pasa una cotización a **Ganada**. Cada proyecto trae
Nro. IF, cliente, nombre, ficha descriptiva y plazo, una **hoja de ruta** (Fase 1
y Fase 2) con checklist de avance, seguimiento de **plazos plan vs. real**, una
sección de **Auditoría asistida por IA** y un **Dashboard**.

Stack: Supabase (DB + Auth + RLS) · HTML/JS vanilla · Vercel.

---

## 1. Supabase

1. Crear un proyecto en https://supabase.com
2. En **SQL Editor**, ejecutar en orden:
   - `sql/01_schema.sql` — tablas, vista, trigger Ventas→Diseño
   - `sql/02_rls.sql` — políticas por rol
   - `sql/03_seed.sql` — datos de ejemplo (opcional; borralo cuando vaya a producción)
3. En **Project Settings → API**, copiar **Project URL** y **anon public key**.
4. Crear usuarios en **Authentication → Users** (Add user). Al crearse, cada uno
   queda con rol `lectura`. Para asignar roles, en SQL Editor:

   ```sql
   update public.perfiles set rol='ventas' where id =
     (select id from auth.users where email='ventas@4housing.com');
   update public.perfiles set rol='diseno' where id =
     (select id from auth.users where email='diseno@4housing.com');
   ```

   Roles: `ventas` (gestiona cotizaciones), `diseno` (edita proyectos/checklist/
   auditorías), `lectura` (solo ve).

---

## 2. Configurar credenciales

Editar `public/js/config.js` y reemplazar:

```js
window.SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
window.SUPABASE_ANON_KEY = "TU-ANON-KEY";
```

La anon key es pública por diseño; la seguridad la dan las políticas RLS.

---

## 3. GitHub

```bash
cd diseno-app
git init
git add .
git commit -m "App gestión de diseño 4housing"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/diseno-4housing.git
git push -u origin main
```

---

## 4. Vercel

1. https://vercel.com → **Add New → Project** → importar el repo.
2. Framework preset: **Other**. Output directory: `public` (ya está en `vercel.json`).
3. Deploy. La app queda online; cualquier push a `main` redespliega.

---

## Cómo funciona el flujo automático

`cotizaciones.estado` pasa a `'ganada'` → el trigger `trg_cotizacion_ganada`
crea la fila en `proyectos` y genera las 6 filas de `proyecto_checklist`
(una por etapa). El proyecto aparece solo en la app, sin carga manual.

Para conectar tu app de Ventas real: que escriba/actualice la tabla
`cotizaciones` (o adaptamos el trigger a tu tabla existente).

## Notas

- El **avance** se calcula como checks cumplidos / total (vista `v_proyectos`).
- La **etapa actual** es el primer ítem no cumplido de la hoja de ruta.
- La **salud de plazo** (En fecha / Adelantado / Atrasado) compara el avance real
  contra el esperado según el tiempo transcurrido entre inicio y fin de Fase 2.
- La pantalla de **Auditoría IA** registra cargas y hallazgos. El motor que lee
  los DXF y detecta interferencias geométricas corre como servicio aparte
  (a definir según alcance de la v1).
