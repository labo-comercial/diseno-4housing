# Gestión de Diseño · 4housing (v2)

Herramienta interna del área de Diseño, con el mismo lenguaje visual que las apps
de 4housing (sidebar oliva, paleta crema/olivo). Stack: Supabase + HTML/JS + Vercel.

## Qué hace

- Proyectos con carga manual (Nro. IF, cliente, nombre, ficha, plazo, responsable, estado).
- Hoja de ruta en 3 Etapas con tareas, subitems y grupos de modelado, todo
  precargado por defecto al crear el proyecto.
- Cada tarea trae responsable por defecto (editable) y check propio.
- Planificación por tarea: fecha de inicio y fin en cada tarea/subitem.
- Bloqueo (gate): un grupo de modelado (6 rubros) debe completarse entero antes
  de habilitar la tarea siguiente.
- Cambio de responsable: pide un motivo obligatorio y queda historiado (ícono de reloj).
- El coordinador puede eliminar tareas que un proyecto no necesite.
- Dashboard con indicadores y avance por proyecto.
- Sección de Auditoría IA (pantalla lista; el motor de planos se conecta aparte).

## Instalación

### 1. Supabase
1. Crear proyecto en https://supabase.com (región São Paulo).
2. SQL Editor → pegar TODO `sql/INSTALAR_TODO.sql` → Run.
3. Settings → API → copiar Project URL y anon/publishable key.
4. Authentication → Users → crear los usuarios.
5. Asignar roles (coordinador / disenio / lectura). Para tu usuario:

   ```sql
   insert into public.perfiles (id, nombre, rol)
   select id, email, 'coordinador'
   from auth.users where email = 'TU-MAIL'
   on conflict (id) do update set rol = 'coordinador';
   ```

   Roles: `coordinador` (todo, incl. eliminar tareas/proyectos),
   `disenio` (tilda checks, cambia responsables, planifica),
   `lectura` (solo ve).

### 2. config.js
Editar `public/js/config.js` con la URL y la anon key.

### 3. GitHub + Vercel
Subir el repo a GitHub e importarlo en Vercel (output dir `public`, ya está en
`vercel.json`). Cada push redespliega.

## Editar la plantilla de tareas

Toda la estructura de etapas/tareas/responsables vive en `public/js/plantilla.js`.
Cambiar ahí (agregar/quitar tareas, cambiar responsables por defecto) se refleja
en los proyectos nuevos. Los proyectos ya creados no se modifican retroactivamente.

## Pendiente

- Conectar el disparador "cotización ganada" desde la app de Ventas (hoy la carga
  es manual, ideal para la etapa de prueba).
- Motor de auditoría de planos (lectura de DXF y detección de interferencias).
