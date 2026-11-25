# NetRebalance — Contrato de integración Frontend ↔ Supabase

**Versión:** 1.0 · **Destinataria:** Mafer · **Frontend:** Vue 3 + TypeScript + Vite · **SDK:** `@supabase/supabase-js` v2

> Este documento describe la interfaz de la base Supabase existente. Los ejemplos deben cotejarse con el esquema remoto antes de la entrega final: los archivos `001`–`004` fueron reconstruidos a partir de las pruebas y capturas, y todavía no se compararon columna por columna con un `supabase db pull` del proyecto activo.

## 1. Qué te debe proporcionar Andre

- **Project URL**, con forma `https://<project-ref>.supabase.co`.
- **Publishable Key**, con forma `sb_publishable_...`.
- Este contrato y acceso a un usuario de pruebas propio, según el mecanismo acordado por el equipo.

En el panel de Supabase: **Connect** → copiar Project URL y Publishable Key; alternativamente, **Project Settings → API Keys**. No se necesitan scripts SQL ni acceso a la contraseña de PostgreSQL para desarrollar la interfaz.

La Publishable Key viaja al navegador. Antes del login las solicitudes usan el rol `anon`, que no tiene acceso a las tablas de esta aplicación; tras el login usan `authenticated` y las políticas RLS limitan los datos de cada usuario. No incorporar `sb_secret_...`, `service_role`, contraseña de BD ni cadena de conexión en Vue.

## 2. Arranque en Vue + Vite

```bash
npm install @supabase/supabase-js
```

Crear `.env.local` en la raíz del proyecto Vue:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR
```

Vite expone al navegador las variables con prefijo `VITE_`; `PUBLIC_` era para Astro y **no funciona por defecto en Vue + Vite**. Reiniciar `npm run dev` después de editar el archivo. Agregar `.env.local` a `.gitignore`; versionar un `.env.example` con valores vacíos. En el despliegue, configurar las mismas dos variables públicas en el proveedor de hosting.

`src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('Falta la configuración pública de Supabase');
}

export const supabase = createClient(url, publishableKey);
```

Usar **una instancia** de este cliente en los servicios de la aplicación. Si el proyecto usa SSR o Nuxt en lugar de Vue con Vite en el navegador, revisar el manejo de sesiones antes de trasladar este ejemplo.

## 3. Mapa de recursos y operaciones

Todos los accesos indicados requieren un usuario autenticado.

| Recurso | Lectura | Creación | Edición | Eliminación | Regla relevante |
| --- | --- | --- | --- | --- | --- |
| `profiles` | Propio | No | Propio | No | El registro crea el perfil con `on_auth_user_created` |
| `brokers` | Propios | Propio | Propio | Propio | `user_id = auth.uid()` |
| `portfolios` | Propios | Propio | Propio | Propio | Propiedad por RLS; broker del mismo usuario por trigger |
| `portfolio_assets` | De portafolios propios | Sí, en portafolio propio | Sí, en portafolio propio | Sí, en portafolio propio | `UNIQUE(portfolio_id, asset_id)` |
| `assets` | Catálogo global | No | No | No | El backend mantiene los tickers; se normalizan al guardar |
| `asset_prices` | Precios globales | No | No | No | Jair/backend actualiza precios |
| `latest_asset_prices` | Último precio por activo | No | No | No | Vista de solo lectura |
| `activate_portfolio(uuid)` | Ejecutable para portafolio propio | — | — | — | Valida suma 100; error `42501` si no es propio |

El rol `service_role` de los procesos internos puede saltar RLS y no corresponde al frontend. Un `SELECT` sobre recursos propios suele devolver **cero filas** cuando se consulta un ID de otro usuario. Una RPC puede devolver explícitamente `42501`.

### Entidades y campos principales

Los identificadores son UUID (`string` en TypeScript), los timestamps son cadenas ISO y las fechas de cotización son cadenas `YYYY-MM-DD`. Para importes y cantidades, PostgreSQL usa `numeric`: comprobar el tipo devuelto por el cliente y evitar cálculos monetarios de precisión estricta con `number` sin una política de redondeo.

| Recurso | Campos para el frontend |
| --- | --- |
| `profiles` | `id`, `full_name`, `created_at`, `updated_at` |
| `brokers` | `id`, `user_id`, `name`, `fixed_commission`, `percentage_commission`, `spread_percentage`, `currency`, `created_at`, `updated_at` |
| `portfolios` | `id`, `user_id`, `broker_id` (nullable), `name`, `currency`, `status` (`draft`, `active`, `archived`), `created_at`, `updated_at` |
| `assets` | `id`, `ticker`, `name` (nullable), `asset_type` (nullable), `exchange` (nullable), `currency`, `is_active`, `created_at` |
| `portfolio_assets` | `id`, `portfolio_id`, `asset_id`, `target_weight`, `quantity`, `average_cost` (nullable), `created_at`, `updated_at` |
| `asset_prices` | `id`, `asset_id`, `price`, `price_date`, `source`, `created_at` |
| `latest_asset_prices` | `asset_id`, `price`, `price_date`, `source` |

Generar tipos desde el proyecto Supabase cuando se conecte el repositorio; hasta entonces estas interfaces son una guía de integración, no un sustituto del esquema remoto real.

## 4. Autenticación y perfil

`src/services/auth.ts`:

```ts
import { supabase } from '../lib/supabase';

export async function register(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('AUTH_REQUIRED');
  return user;
}
```

Con confirmación por correo activada, `signUp()` puede devolver `user` con `session: null`; mostrar «Revisa tu correo» y esperar una sesión antes de consultar tablas. El trigger `on_auth_user_created` crea `profiles` a partir de `auth.users` y `full_name` de los metadatos. **No insertar manualmente en `profiles`.**

```ts
const user = await requireUser();

const { data: profile, error } = await supabase
  .from('profiles')
  .select('id, full_name, created_at, updated_at')
  .eq('id', user.id)
  .single();
if (error) throw error;

const { error: updateError } = await supabase
  .from('profiles')
  .update({ full_name: 'Nombre actualizado' })
  .eq('id', user.id);
if (updateError) throw updateError;
```

RLS protege el perfil; el filtro por ID facilita comprender y depurar la consulta. El trigger `set_updated_at` actualiza el timestamp automáticamente. En Vue, guardar el usuario en un estado reactivo y sincronizarlo con `supabase.auth.onAuthStateChange(...)`; cancelar la suscripción al desmontar el componente o mantenerla en un store global. Proteger rutas consultando la sesión antes de mostrar datos privados.

## 5. Broker: comisiones y propiedad

La pantalla de broker solicita nombre, moneda, comisión fija y porcentajes de comisión/spread. **Conversión antes del `insert`:**

| Dato que escribe el usuario | Valor almacenado |
| --- | ---: |
| Comisión fija `1.50 USD` | `fixed_commission: 1.50` |
| Comisión porcentual `0.1 %` | `percentage_commission: 0.001` |
| Spread `0.05 %` | `spread_percentage: 0.0005` |

```ts
const user = await requireUser();
const percentageToFraction = (percent: number) => percent / 100;

const { data: broker, error } = await supabase
  .from('brokers')
  .insert({
    user_id: user.id,
    name: 'Interactive Brokers',
    fixed_commission: 1.5,
    percentage_commission: percentageToFraction(0.1),
    spread_percentage: percentageToFraction(0.05),
    currency: 'USD',
  })
  .select()
  .single();
if (error) throw error;
```

Para listar: `supabase.from('brokers').select('*').order('created_at')`. Para editar o borrar: agregar siempre `.eq('id', brokerId)` y mostrar un estado «no encontrado» si no devuelve filas. RLS garantiza que un usuario no pueda consultar, editar o borrar brokers ajenos. Los campos `updated_at` se mantienen con el trigger `set_updated_at`.

## 6. Portafolio y selección de activos

Crear primero un borrador (`draft`) asociado opcionalmente a un broker propio:

```ts
const user = await requireUser();

const { data: portfolio, error } = await supabase
  .from('portfolios')
  .insert({
    user_id: user.id,
    broker_id: brokerId, // o null si aún no seleccionó broker
    name: 'Core & Satellite',
    currency: 'USD',
    status: 'draft',
  })
  .select()
  .single();
if (error) throw error;
```

El trigger `validate_portfolio_broker_owner` rechaza un `broker_id` de otro usuario (`23514`). El trigger `set_updated_at` actualiza `updated_at` al editar. Los valores válidos de `status` son `draft`, `active` y `archived`; **usar `activate_portfolio` para pasar a `active`**.

El frontend solo consulta `assets`; Jair o un proceso administrativo los crea/actualiza. El trigger `assets_normalize_ticker` convierte a mayúsculas y quita espacios cuando el backend guarda un activo; al buscar en la UI, normalizar también la entrada:

```ts
const ticker = searchText.trim().toUpperCase();
const { data: matches, error } = await supabase
  .from('assets')
  .select('id, ticker, name, currency')
  .eq('is_active', true)
  .ilike('ticker', `${ticker}%`)
  .limit(20);
if (error) throw error;
```

Usar `asset_id` del catálogo para agregar a `portfolio_assets`. La cantidad es la tenencia actual, no un importe monetario. El costo promedio puede ser `null`.

```ts
const { data: position, error } = await supabase
  .from('portfolio_assets')
  .insert({
    portfolio_id: portfolioId,
    asset_id: assetId,
    target_weight: 60, // 60 %, escala 0 a 100
    quantity: 10,
    average_cost: 500, // opcional
  })
  .select()
  .single();
if (error) throw error;
```

Cada activo aparece una vez por portafolio (`UNIQUE(portfolio_id, asset_id)`); un duplicado genera `23505`. Las políticas de `portfolio_assets` comprueban que el portafolio pertenezca al usuario tanto al crear como al modificar/eliminar. `target_weight` debe estar entre 0 y 100; `quantity` no puede ser negativa. Un borrador **sí puede guardar pesos incompletos**: la condición del 100 % aplica a la activación, no a cada guardado de un activo.

## 7. Suma de pesos y activación

La UI muestra suma y diferencia respecto de 100 %. Para porcentajes de hasta cuatro decimales, calcular en unidades de `0.0001 %` evita comparar floats directamente:

```ts
type WeightItem = { target_weight: number | string };

export function canActivate(items: WeightItem[]) {
  if (items.length === 0) return false;
  const sumUnits = items.reduce(
    (sum, item) => sum + Math.round(Number(item.target_weight) * 10_000),
    0,
  );
  return sumUnits === 1_000_000; // 100.0000 %
}
```

Esto es una ayuda de UX: **la base vuelve a validar** al ejecutar la RPC. Obtener los pesos guardados de Supabase antes de habilitar el botón si hay ediciones pendientes.

```ts
export async function activatePortfolio(portfolioId: string) {
  const { data, error } = await supabase.rpc('activate_portfolio', {
    p_portfolio_id: portfolioId,
  });
  if (error) throw error;
  return data; // fila del portafolio con status = 'active'
}
```

Para `VOO 60` y `QQQ 40`, la activación debe devolver `active`. Para `60 + 30`, la función arroja `23514`; si el ID es ajeno o inaccesible, `42501`. Evitar actualizar directamente `status: 'active'` desde la UI aunque el permiso SQL de `UPDATE` exista.

**Limitación real de la regla actual:** según el SQL reconstruido, un `UPDATE portfolios SET status = 'active'` directo también pasa por el trigger que valida pesos, pero no queda restringido exclusivamente a la RPC. Además, el trigger de pesos se dispara al insertar/editar `portfolios`, **no al modificar `portfolio_assets`**: después de activar, cambiar los pesos puede dejar un portafolio activo cuya suma ya no sea 100. Hasta endurecer esa regla en la base, la UI debe tratar posiciones de un portafolio activo como solo lectura; para editar la estrategia, usar un flujo de borrador validado por backend. Andre debe confirmar este comportamiento en el esquema remoto antes de prometer invariantes más fuertes.

## 8. Precios y pantalla de detalle

`asset_prices` guarda precios históricos por `asset_id`, `price_date` y `source`. El índice único evita duplicar una cotización para el mismo activo, día y fuente. Mafer consulta; Jair o el backend escriben. La vista `latest_asset_prices` contiene `asset_id`, `price`, `price_date` y `source`, y ofrece solo `SELECT`.

```ts
const { data: latest, error } = await supabase
  .from('latest_asset_prices')
  .select('asset_id, price, price_date, source')
  .in('asset_id', assetIds);
if (error) throw error;
```

La vista selecciona una fila por activo; la elección entre distintas fuentes del mismo día depende de `created_at`. Mostrar siempre la fecha y fuente, y un estado «precio pendiente» si no hay cotización. No presentar una variación o recomendación como si hubiera precios disponibles cuando faltan datos.

Para obtener el detalle del portafolio y sus relaciones:

```ts
const { data, error } = await supabase
  .from('portfolios')
  .select(`
    id, name, currency, status, broker_id,
    brokers (id, name, fixed_commission, percentage_commission, spread_percentage),
    portfolio_assets (
      id, target_weight, quantity, average_cost,
      assets (id, ticker, name, currency)
    )
  `)
  .eq('id', portfolioId)
  .single();
if (error) throw error;
```

Si PostgREST considera ambigua alguna relación en el esquema remoto, usar el nombre de la clave foránea que muestre la API o hacer las consultas por separado. RLS se aplica a las tablas relacionadas.

## 9. Errores que la interfaz debe mostrar

| Situación | Señal probable | Mensaje para usuario |
| --- | --- | --- |
| Sin sesión | `requireUser()` → `AUTH_REQUIRED`, o error de permisos al consultar | «Inicia sesión para continuar» |
| Registro que requiere confirmación | `signUp().session === null` | «Revisa tu correo para confirmar la cuenta» |
| Broker de otro usuario | `23514` al crear/editar portafolio | «Selecciona uno de tus brokers» |
| Pesos distintos de 100 | `23514` al llamar la RPC | «Los pesos objetivo deben sumar 100 %» |
| Portafolio ajeno o inaccesible | 0 filas en lectura; `42501` en RPC | «Portafolio no disponible» |
| Activo repetido | `23505` al agregar posición | «Ese activo ya está en el portafolio» |
| Ticker sin coincidencias | 0 filas en catálogo | «No encontramos ese activo» |
| Precio aún no cargado | 0 filas en vista | «Precio pendiente de actualización» |
| Red o servicio no disponible | Error del SDK / fetch | «No se pudo conectar. Intenta de nuevo» |

Inspeccionar `error.code` y, si es `23514`, también `error.message` para distinguir broker y pesos. El código HTTP concreto puede cambiar según la operación; no tratar `401` como único indicador de ausencia de sesión. No mostrar el texto técnico completo de PL/pgSQL al usuario.

## 10. Orden de trabajo y comprobaciones

1. Configurar URL y Publishable Key; confirmar que el cliente arranca.
2. Registrar e iniciar sesión; contemplar confirmación de correo. Verificar `auth.users` y `profiles` en Supabase.
3. Leer y editar perfil propio. Confirmar que al cerrar sesión ya no se leen tablas.
4. Crear, listar y editar broker; probar porcentajes con la conversión indicada.
5. Crear portafolio `draft` con broker propio; probar rechazo de broker ajeno.
6. Consultar catálogo, agregar dos activos y guardar un borrador con pesos incompletos.
7. Probar activación `60 + 30` → error; `60 + 40` → `active`.
8. Mostrar detalle del portafolio; mostrar fecha/fuente o «precio pendiente».

Para la entrega funcional, repetir al menos una prueba con **dos usuarios diferentes**: User B no debe ver ni modificar datos de User A, y la RPC sobre un portafolio de User A debe rechazarse.

## 11. Alcance del MVP y siguientes módulos

La interfaz de Mafer cubre registro/login, perfil, configuración de broker, portafolios, selección de activos, pesos y estado/precio. La ingesta de precios corresponde a Jair; el cálculo de rebalanceo y correo corresponden a María. Este esquema no define todavía tablas ni endpoints para un historial de recomendaciones: no inventar una pantalla que prometa esos datos. `average_cost` es opcional; el cálculo del peso actual necesita `quantity × último precio` y debe contemplar precios faltantes.

## 12. Referencias técnicas

- [Supabase: API keys y roles](https://supabase.com/docs/guides/getting-started/api-keys).
- [Supabase: guía para Vue](https://supabase.com/docs/guides/getting-started/quickstarts/vue).
- [Vite: variables de entorno](https://vite.dev/guide/env-and-mode).
- Migraciones de referencia del proyecto: `database/migrations/001_initial_schema.sql` a `004_harden_view_permissions.sql`.
