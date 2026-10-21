# CRM Comercial — Sales Performance Manager

Aplicación web para el trabajo diario de un comercial de cosmética, maquillaje y cera depilatoria: prospección a puerta fría, clientes, visitas, seguimientos, pedidos, comisiones, objetivos y estadísticas. Pensada para usarse desde el móvil durante la jornada y desde el ordenador para el análisis.

Interfaz en español · euros · zona horaria Europe/Madrid · fechas DD/MM/AAAA.

---

## Índice

1. [Puesta en marcha rápida](#puesta-en-marcha-rápida)
2. [Configurar Supabase](#configurar-supabase)
3. [Comandos](#comandos)
4. [Qué incluye](#qué-incluye)
5. [Arquitectura](#arquitectura)
6. [Base de datos](#base-de-datos)
7. [Definición de las métricas](#definición-de-las-métricas)
8. [Comisiones](#comisiones)
9. [Seguridad](#seguridad)
10. [Pruebas](#pruebas)
11. [Datos de demostración](#datos-de-demostración)
12. [Copias de seguridad](#copias-de-seguridad)
13. [Despliegue](#despliegue)
14. [Decisiones tomadas](#decisiones-tomadas)
15. [Pendiente y siguientes pasos](#pendiente-y-siguientes-pasos)

---

## Puesta en marcha rápida

Requisitos: **Node.js 20 o superior** y una cuenta gratuita de **Supabase**.

```bash
git clone https://github.com/davidpinoP/crm-comercial.git
cd crm-comercial
npm install
cp .env.example .env.local      # y rellena las dos variables (ver abajo)
npm run dev                      # http://localhost:3000
```

Sin las variables de Supabase la aplicación arranca, pero muestra la pantalla **«Conecta la base de datos»**: no se simula ningún guardado.

## Configurar Supabase

1. **Crea el proyecto** en [supabase.com](https://supabase.com) → *New project*. Región recomendada: Europa (Frankfurt o París).
2. **Aplica las migraciones** (carpeta `supabase/migrations`, en orden):
   - Con la CLI:
     ```bash
     npx supabase login
     npx supabase link --project-ref TU_REF_DE_PROYECTO
     npx supabase db push
     ```
   - O sin CLI: abre *SQL Editor* y ejecuta el contenido de cada archivo de `supabase/migrations` por orden de nombre.
3. **Copia las claves** en *Project Settings → API*: la *Project URL* y la clave *anon public* → pégalas en `.env.local`.
4. **Autenticación** (*Authentication → Providers → Email*):
   - Deja activado el proveedor Email.
   - Para uso personal puedes desactivar *Confirm email* (entrar sin confirmar el correo) o dejarlo activo y confirmar desde el enlace recibido.
   - En *Authentication → URL Configuration* añade `http://localhost:3000/auth/callback` (y la URL de producción) a *Redirect URLs*.
   - Cuando ya tengas tu cuenta creada, puedes desactivar *Allow new users to sign up* para que nadie más se registre.
5. **Reinicia** `npm run dev`. Las variables `NEXT_PUBLIC_*` se incorporan al compilar: si las cambias, vuelve a ejecutar `npm run build` antes de `npm start`.

Al crear tu cuenta se generan automáticamente (disparador en `auth.users`) tu configuración, los 8 tipos de establecimiento, los 8 resultados de prospección, las 4 categorías de producto y la escala de comisiones inicial.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en `http://localhost:3000` |
| `npm run build` | Compilación de producción (incluye comprobación de tipos y lint) |
| `npm start` | Sirve la compilación de producción |
| `npm test` | Pruebas unitarias y de base de datos (Vitest + Postgres en memoria) |
| `npm run typecheck` | TypeScript en modo estricto |
| `npm run lint` | ESLint |

## Qué incluye

| Sección | Funcionalidad |
|---|---|
| **Inicio (Dashboard)** | Selector de periodo (hoy, semana, mes, mes anterior, personalizado); 9 indicadores del periodo con variación frente al periodo equivalente anterior; resumen del mes (puertas, visitas comerciales, nuevos clientes, reactivados, pedidos, facturación, ticket medio, comisión, objetivo y distancia al siguiente tramo); 6 gráficos; próximas acciones; actividad reciente. |
| **Prospección** | Botón «Nueva prospección» (modo rápido y completo), **«+1 puerta fría»** de un toque (actividad provisional, con «Deshacer»), recuento del día con marcas de recuento frente al objetivo de la zona, listado por días con filtros, completar/editar/eliminar actividades. |
| **Calendario y rutas** | Vistas mes, semana, día y agenda (FullCalendar), zona del día, seguimientos como eventos de día completo; estados programado / realizado / cancelado / reprogramado / no realizado; marcar como realizado registra resultado y crea **una única** visita; reprogramación enlazada; planificación semanal con zona, objetivo, citas, seguimientos y tiempo libre estimado. |
| **Clientes** | Listado con búsqueda y filtros (tabla en escritorio, tarjetas en móvil), cambio de estado en línea, ficha con contacto, historial de prospecciones, visitas, pedidos, seguimientos, productos comprados, facturación acumulada, ticket medio e historial de estados; archivar/restaurar; **detección y fusión de duplicados**; candidatos a reactivación. |
| **Seguimientos** | Bandeja vencidos / hoy / 7 días / sin fecha / completados; completar y programar el siguiente; indicadores (pendientes, vencidos, % completados, conversión posterior). |
| **Ventas** | Pedidos con catálogo o líneas libres, descuentos, IVA por línea con desglose, instantánea de precio e IVA; estados; **devoluciones parciales y totales** sin borrar el pedido; métricas separadas (registrado, confirmado, entregado, facturado, cobrado, devoluciones); panel de comisión con tramo, distancia al siguiente, proyección al ritmo actual y comparativa de 6 meses; historial de cálculos y registro explícito de liquidaciones. |
| **Estadísticas** | Filtros por periodo, zona, población, tipo de establecimiento, estado, resultado, tipo de visita y categoría de producto; actividad, conversión y cierre, ventas, productividad; gráficos diarios, semanales y mensuales; facturación por zona, cliente y tipo; motivos de rechazo; rendimiento por tipo de negocio; categorías de producto; exportación CSV. |
| **Objetivos** | Objetivos diarios, semanales y mensuales (por defecto o para el periodo actual) de 8 métricas; resultado, diferencia, % de cumplimiento, ritmo diario necesario y estimación al cierre; **calendario laboral** (vacaciones, festivos, días extra, horas trabajadas). |
| **Configuración** | Perfil y tema (claro/oscuro), horario y días laborables, umbrales de reactivación y maduración, zonas (poblaciones, color, objetivo, asignación semanal), tipos de establecimiento, resultados de prospección y su significado en las métricas, catálogo y categorías, escala y método de comisiones con simulador, estados de pedido computables, datos de demostración y exportaciones. |
| **Global** | Buscador (Ctrl/Cmd + K) por nombre, población, teléfono o tipo; botón «Crear» con todas las acciones rápidas; navegación inferior y botón flotante en móvil; hojas inferiores para formularios en móvil. |

## Arquitectura

- **Next.js 15 (App Router) + React 19 + TypeScript estricto**. Páginas como *Server Components* que leen de Supabase con la sesión del usuario; mutaciones con *Server Actions* validadas con **Zod**.
- **Supabase**: PostgreSQL, autenticación por correo y contraseña, **Row Level Security** en todas las tablas. Las operaciones que tocan varias tablas son **funciones SQL transaccionales** (`register_prospecting`, `save_order`, `set_event_status`, `reschedule_event`, `register_return`, `merge_customers`, `delete_demo_data`).
- **Tailwind CSS 4** con tokens propios y componentes al estilo **shadcn/ui** sobre Radix (`src/components/ui`). `components.json` permite añadir más componentes con la CLI de shadcn.
- **Recharts** (gráficos), **FullCalendar** (calendario), **React Hook Form** (formulario de clientes), **date-fns + @date-fns/tz** (fechas en Madrid), **Lucide** (iconos), **Sonner** (avisos).
- **Vitest** + **PGlite** (Postgres real en memoria) para probar lógica y base de datos sin servicios externos.

```
src/
  app/
    (app)/            páginas autenticadas: inicio, prospeccion, calendario, clientes,
                      seguimientos, ventas, estadisticas, objetivos, configuracion
    api/exportar/     exportación CSV
    login, registro, configurar, auth/callback
  components/
    ui/               componentes base (botón, diálogo/hoja, tabs, …)
    app/              componentes de la aplicación (formularios, gráficos, navegación…)
  lib/
    domain/           LÓGICA PURA Y PROBADA: dinero, fechas, comisiones, métricas,
                      facturación, objetivos, agregados, CSV
    data/             lectura de datos en servidor (paginada, con RLS)
    actions/          Server Actions (validación + escritura)
    supabase/         clientes de servidor/navegador y middleware de sesión
supabase/migrations/  esquema, RLS y funciones SQL versionadas
tests/                pruebas de dominio y de base de datos
```

Principio clave: **ningún contador se almacena**. Todos los indicadores se recalculan a partir de los registros originales (actividades, visitas, pedidos, devoluciones, historial de estados), de modo que editar o eliminar algo se refleja de inmediato y las estadísticas no pueden desincronizarse.

## Base de datos

Importes en **céntimos** (`bigint`), porcentajes en **puntos básicos** (`2100` = 21 %). Todas las tablas tienen `user_id`, `created_at` y RLS.

| Tabla | Contenido |
|---|---|
| `profiles`, `app_settings` | Perfil y configuración (días laborables, horario, umbrales, estados computables, tema) |
| `establishment_types`, `prospecting_results`, `product_categories` | Catálogos configurables. Los resultados llevan las banderas *contacto efectivo*, *interés* y *rechazo* que alimentan las métricas |
| `commercial_zones`, `zone_populations`, `zone_weekday_assignments`, `zone_date_overrides` | Zonas, poblaciones, zona por día de la semana y por fecha |
| `customers`, `customer_status_history` | Clientes/prospectos y su historial de estados (escrito por disparador, de solo lectura para el usuario) |
| `prospecting_activities` | Cada puerta fría. Puede ser provisional (sin establecimiento). Instantánea del nombre y población |
| `visits` | Una fila = una visita física realizada. Índice único por evento del calendario y por prospección |
| `calendar_events` | Agenda con estado y enlace de reprogramación |
| `follow_ups` | Seguimientos con encadenamiento al anterior |
| `products`, `orders`, `order_items`, `order_returns`, `order_status_history` | Catálogo, pedidos, líneas con instantánea de precio/IVA/descuento, devoluciones y su historial |
| `order_totals` (vista) | Totales derivados de las líneas y devoluciones (no se almacenan) |
| `commission_settings`, `commission_tiers`, `commission_calculations` | Método, tramos y cálculos guardados con instantánea de la escala y registro de liquidación |
| `sales_goals`, `workdays` | Objetivos y excepciones del calendario laboral |

Integridad adicional:
- `client_request_id` + índice único: **reenviar un formulario no duplica** registros.
- Las líneas de pedido tienen *checks* que garantizan `base = round(cant × precio × (1 − dto))`, `IVA = round(base × tipo)` y `total = base + IVA`. El cálculo SQL es idéntico al de TypeScript (probado con 300 casos aleatorios).
- Disparadores impiden enlazar un registro propio con uno de otro usuario.
- Eliminación lógica (`deleted_at` / `archived_at`) en actividades, visitas, eventos, pedidos y clientes.

## Definición de las métricas

Todas en días civiles de Madrid. Si el denominador es 0 se muestra **«Datos insuficientes»**; si el periodo anterior es 0, la variación se muestra como «+N (antes 0)» en lugar de un porcentaje engañoso.

| Métrica | Numerador / denominador y criterios |
|---|---|
| Puertas frías | Actividades de prospección no eliminadas (incluye provisionales) |
| Tasa de contacto efectivo | Actividades con resultado marcado «contacto efectivo» / puertas frías × 100 |
| Tasa de interés | Actividades con resultado «interés» / contactos efectivos × 100 |
| Nuevos prospectos | Establecimientos creados en el periodo cuyo primer estado fue de prospecto |
| Visitas | Filas de `visits` no eliminadas; por tipo: a prospecto o a cliente actual |
| Nuevos clientes | Paso de un estado de prospecto a «cliente nuevo» o «cliente activo» en el periodo |
| Clientes reactivados | Paso de «cliente inactivo» a activo/nuevo en el periodo |
| Conversión por cohorte | Prospectos con primer contacto en el periodo que ya son clientes / tamaño de la cohorte. Se muestran aparte los que aún no han tenido tiempo de madurar (días configurables) y la conversión solo sobre maduros |
| Tasa de cierre | Visitas **comerciales** con al menos un pedido válido (vinculado o del mismo cliente el mismo día) / visitas comerciales; por separado prospectos, clientes y todas. Las visitas de reposición o administrativas no cuentan |
| Pedido válido | Ni borrador ni cancelado |
| Facturación computable | Base de pedidos del periodo con estado computable − devoluciones registradas en el periodo (base imponible por defecto; configurable a total con IVA) |
| Ticket medio | Facturación computable / nº de pedidos computables |
| Productividad | Puertas, contactos y visitas por día laborable trabajado; puertas por hora (solo con horas registradas); pedidos y facturación por visita comercial; nuevos clientes por cada 100 puertas |
| Frecuencia de recompra | Media de días entre pedidos válidos consecutivos del mismo cliente |
| Tiempo hasta el primer pedido | Media de días entre el primer contacto y el primer pedido válido |
| Seguimientos completados | Completados en 30 días / (completados + vencidos en ese plazo) |
| Conversión posterior a seguimiento | Clientes con un seguimiento completado que después hicieron un pedido válido |

## Comisiones

Escala inicial indicada: < 6.000 € → 0 %; 6.000 – < 8.000 € → 4 %; 8.000 – 10.000 € → 6 %; > 10.000 € → 8 %.

Cada tramo tiene un **límite inferior** y si ese importe exacto está **incluido**. Por defecto: 6.000 € → 4 %, 8.000 € → 6 %, **10.000 € exactos → 6 %** (el 8 % es «más de 10.000»), 10.000,01 € → 8 %. Todo es editable en *Configuración → Comisiones*, con un simulador que compara:

- **Modo A**: el porcentaje del tramo alcanzado sobre toda la base.
- **Modo B (marginal)**: cada porcentaje solo sobre la porción de su tramo.

Hasta que marques «He confirmado con mi empresa este método», la comisión se muestra como **«Estimación provisional»**. Una comisión solo figura como liquidada si registras la liquidación en el historial de cálculos. Las devoluciones se descuentan del mes en que se registran; una base negativa no genera comisión negativa.

## Seguridad

- Autenticación de Supabase; el *middleware* renueva la sesión y protege todas las páginas.
- **RLS forzado** en todas las tablas: cada usuario solo lee y escribe sus filas (`user_id = auth.uid()`); el rol anónimo no tiene acceso a ninguna tabla.
- Validación en servidor con Zod en todas las acciones (además de la del navegador) y *checks* en la base de datos.
- Solo se usa la clave pública `anon`; no hay claves privadas en el código ni en el navegador.
- Operaciones destructivas con confirmación; eliminación lógica para preservar el historial.
- Si una operación falla, se informa y el cambio no se muestra como guardado.
- Exportación CSV protegida contra inyección de fórmulas.

## Pruebas

```bash
npm test
```

86 pruebas en dos bloques:

- **Dominio** (`tests/domain`): formato e interpretación de importes, cálculo de líneas, descuentos e IVA múltiple, redondeo; comisiones con 5.999,99 €, 6.000 €, 8.000 €, 10.000 €, > 10.000 €, ambos métodos, devoluciones, meses sin ventas y cambios de configuración; tasas con denominador cero, periodos sin datos, cohortes, comparativas entre meses, filtrado por zona, tasas de cierre, recompra; fechas en Madrid y cambio de hora; objetivos (incluido el ejemplo 12.000 € / 8.500 € / 7 días → 500 €/día) y calendario laboral; CSV.
- **Base de datos** (`tests/db`): aplica las migraciones reales sobre Postgres en memoria (PGlite) y comprueba RLS (aislamiento entre usuarios, rechazo de escrituras ajenas, anónimos sin acceso), prospecciones (creación, idempotencia, provisionales, edición, varias por cliente), historial de estados, fusión de duplicados, visitas sin doble cómputo, cancelación y reprogramación, pedidos atómicos e idempotentes, instantánea de precios, devoluciones parciales y totales, y borrado seguro de datos de demostración.

Además, durante el desarrollo se verificaron los flujos completos en un navegador real contra un stack local equivalente a Supabase (PostgreSQL 16 + Supabase Auth + PostgREST): registro, prospección rápida y completa, doble envío, completar provisionales, ficha y edición de cliente, cita marcada como realizada → programada → realizada (1 sola visita), pedido con descuento e IVA del 21 % y 10 % (total 169,13 € verificado), devolución parcial, objetivos, datos de demostración, búsqueda global, vistas móviles sin desbordamiento y aislamiento entre dos usuarios a través de la API.

## Datos de demostración

*Configuración → Datos → Generar datos de demostración* crea zonas, productos, 32 establecimientos, 260 puertas frías, 70 visitas, 40 pedidos, seguimientos y citas, todos con la marca `[DEMO]` (nombres y poblaciones claramente ficticios, sin teléfonos). *Eliminar datos de demostración* borra únicamente esos registros. La aplicación funciona con la base de datos vacía.

## Copias de seguridad

- Supabase hace copias diarias automáticas en los planes de pago (*Database → Backups*).
- Copia manual completa (desde tu ordenador, con la cadena de conexión de *Project Settings → Database*):
  ```bash
  pg_dump "postgresql://postgres:[CONTRASEÑA]@db.[REF].supabase.co:5432/postgres" \
    --schema=public --no-owner --format=custom -f crm-$(date +%F).dump
  ```
- Exportaciones CSV en *Configuración → Datos* para trabajar en Excel.

## Despliegue

En **Vercel**: importa el repositorio, añade `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en *Environment Variables* y despliega. Añade `https://TU-DOMINIO/auth/callback` a las *Redirect URLs* de Supabase. Puedes instalarla en el móvil como app («Añadir a pantalla de inicio»).

## Decisiones tomadas

- **Resultado ≠ estado**: el resultado se guarda en la actividad; el estado del cliente solo cambia si lo confirmas (casilla sugerida en el formulario, que nunca retrocede un estado). Un pedido convierte al prospecto en «cliente nuevo» solo si dejas marcada la casilla correspondiente.
- **Puerta fría ≠ visita**: las prospecciones no generan visitas. Las visitas salen de citas marcadas como realizadas o del registro «visita realizada». El resultado de una visita se guarda en la propia visita (no crea una puerta fría adicional).
- **Visitas que cuentan para el cierre**: visitas a cliente, a prospecto y reuniones comerciales. Las reposiciones y las visitas marcadas como administrativas quedan fuera.
- **Devoluciones** en el mes en que se registran; el pedido original conserva su importe y estado histórico.
- **Edición de pedidos** bloqueada cuando ya tienen devoluciones (para no reescribir lo devuelto).
- **Calendario en hora de Madrid** sea cual sea la zona del dispositivo.
- **Componentes de shadcn/ui escritos a mano** (mismo patrón y Radix) porque el registro de shadcn no estaba accesible desde el entorno de desarrollo.
- **Tipografía local** (Instrument Sans vía `@fontsource`), sin dependencia de Google Fonts.
- **Mapa**: la ficha enlaza la dirección a OpenStreetMap; el esquema ya guarda latitud/longitud opcionales para un mapa con proveedor configurable más adelante. No se inventan coordenadas.

## Pendiente y siguientes pasos

- Mapa interactivo de establecimientos y optimización de rutas (requiere elegir proveedor de mapas/geocodificación).
- Recordatorios: el campo existe en los eventos, pero el envío de avisos (correo o notificaciones push) necesita un servicio externo.
- Aplicación sin conexión (registrar puertas sin cobertura y sincronizar después).
- Varios usuarios con roles (la estructura por `user_id` y RLS ya lo permite).
- Importación de clientes desde Excel/CSV.
