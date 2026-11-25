# NetRebalance — Contrato de integración para Jair

**Módulo:** ingesta diaria de precios · **Stack previsto:** AWS Lambda, EventBridge, Node.js/TypeScript o Python · **Versión:** 1.0

## 1. Tu responsabilidad

1. Obtener los tickers únicos presentes en portafolios que se deben monitorear.
2. Consultar un proveedor de datos de mercado una sola vez por ticker y fecha de cierre.
3. Guardar cotizaciones históricas en `public.asset_prices`.
4. Informar a María que una ejecución terminó satisfactoriamente, incluyendo fecha y resultado.

La base real utiliza `assets` como **catálogo** y `asset_prices` como **historial**. El enunciado original hablaba de actualizar `precio_actual` dentro de `assets`, pero **esa columna no existe en el modelo actual**. La consulta de precio reciente se hace mediante `latest_asset_prices`. No agregues `precio_actual` ni cambies la estructura por tu cuenta.

## 2. Acceso de servicio

Usar exclusivamente desde Lambda o un proceso backend controlado:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_REEMPLAZAR
```

La nueva Secret Key actúa como rol PostgreSQL `service_role` y **omite RLS**: puede leer datos de todos los usuarios. Almacenar la clave en un gestor de secretos del entorno de ejecución, cargarla en runtime, nunca escribirla en código, logs, frontend, URL ni en este documento. Preferir **una clave nombrada específica para Jair y otra para María** para poder rotarlas por separado; esto no limita los privilegios SQL de cada clave. Andre entrega acceso por un canal privado y conserva su control.

`service_role` tiene CRUD sobre `profiles`, `brokers`, `portfolios`, `portfolio_assets`, `assets` y `asset_prices`; sobre `latest_asset_prices` solo `SELECT`. **El módulo de Jair debe limitar voluntariamente sus escrituras a `asset_prices`** y, solo si Andre le asigna mantener el catálogo, a `assets`. La clave no impone esa restricción por sí sola.

Ejemplo de cliente para Lambda Node.js:

```ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Falta configuración Supabase de Lambda');

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
```

Esta conexión mediante API de Supabase usa la Project URL y Secret Key. Si eliges conexión SQL directa necesitarás credenciales PostgreSQL y un diseño de conexiones aparte, que Andre deberá aprobar y configurar. No uses la contraseña de la BD como sustituto de la Secret Key en `createClient`.

## 3. Modelo que consumes

| Tabla o vista | Campos relevantes | Operación de Jair |
| --- | --- | --- |
| `portfolio_assets` | `portfolio_id`, `asset_id` | `SELECT` para conocer activos utilizados |
| `portfolios` | `id`, `status` | `SELECT` para elegir portafolios a monitorear |
| `assets` | `id`, `ticker`, `currency`, `exchange`, `is_active` | `SELECT`; mantenimiento solo si se acuerda |
| `asset_prices` | `id`, `asset_id`, `price`, `price_date`, `source`, `created_at` | `INSERT`/`UPSERT` |
| `latest_asset_prices` | `asset_id`, `price`, `price_date`, `source` | `SELECT` para comprobación |

`asset_prices` tiene la restricción única `(asset_id, price_date, source)`. `price` debe ser mayor que cero. `price_date` es fecha `YYYY-MM-DD` del mercado; no es el instante de ejecución de Lambda. `source` identifica al proveedor (usar un valor estable). `created_at` es generado por PostgreSQL. `assets.ticker` se almacena normalizado con el trigger `assets_normalize_ticker` cuando alguien con permiso crea o actualiza un activo; el frontend no crea tickers. El índice único de `assets.ticker` evita duplicados.

## 4. Elegir tickers sin llamadas duplicadas

Para el MVP propongo monitorear posiciones de portafolios `active`. Esa política de selección debe confirmarse con Andre y María: el esquema permite portafolios `draft` y `archived`, pero no decide por sí solo cuáles se cotizan. La siguiente consulta lee relaciones desde `portfolio_assets`, filtra activos vigentes y deduplica por `asset_id`:

```ts
type UsedAsset = { id: string; ticker: string; currency: string };

async function loadUsedAssets(): Promise<UsedAsset[]> {
  const batchSize = 500;
  const byId = new Map<string, UsedAsset>();

  for (let start = 0; ; start += batchSize) {
    const { data, error } = await db
      .from('portfolio_assets')
      .select('asset_id, portfolios!inner(status), assets!inner(id,ticker,currency,is_active)')
      .eq('portfolios.status', 'active')
      .eq('assets.is_active', true)
      .range(start, start + batchSize - 1);
    if (error) throw error;

    for (const row of data ?? []) {
      // La relación es singular porque portfolio_assets.asset_id apunta a assets.id.
      const asset = row.assets;
      if (asset) byId.set(asset.id, { id: asset.id, ticker: asset.ticker, currency: asset.currency });
    }
    if ((data?.length ?? 0) < batchSize) break;
  }

  return [...byId.values()];
}
```

La consulta relacional es un ejemplo: confirmar los nombres de relaciones que expone PostgREST en la base remota; si hay ambigüedad, consultar las tablas por separado. Para volúmenes grandes conviene una consulta SQL o una RPC dedicada que devuelva tickers únicos, pero **esa RPC no existe hoy**. Evitar obtener solo la primera página. Ordenar las páginas por una columna estable en la implementación final si se ejecutan mientras cambian posiciones.

## 5. Escritura de precios e idempotencia

```ts
type ClosingPrice = {
  asset_id: string;
  price: number;
  price_date: string; // YYYY-MM-DD del cierre, no fecha del servidor
  source: string;     // por ejemplo, nombre estable del proveedor
};

async function savePrices(prices: ClosingPrice[]) {
  const { error } = await db
    .from('asset_prices')
    .upsert(prices, { onConflict: 'asset_id,price_date,source' });
  if (error) throw error;
}
```

Esto permite reintentar el mismo día sin crear filas repetidas. **Decisión pendiente:** con `upsert`, una corrección del proveedor sustituye el precio anterior de ese día/fuente. Si la política deseada es conservar el primer cierre inalterable, usar `insert` y tratar `23505` como duplicado esperado. Elegir una sola política con Andre y registrarla. Procesar en lotes para no exceder límites del proveedor o de la API. Descartar `null`, `NaN`, precios no positivos, símbolos no resueltos y fechas inválidas; registrar por ticker el motivo sin exponer credenciales.

Después de insertar, consultar `latest_asset_prices` para una muestra y verificar `price`, `price_date` y `source`. La vista elige una fila por activo usando la fecha más reciente; si hay varias fuentes para la misma fecha, el desempate depende de `created_at`, por lo que la prioridad entre proveedores todavía debe definirse.

## 6. Ejecución y entrega a María

EventBridge debe invocar la Lambda al cierre de la bolsa elegida; confirmar zona horaria y cambios de horario estacional del mercado. No asumir que 16:30 EST equivale a la misma hora UTC todo el año. La Lambda debe emitir una señal **solo después** de terminar todas las escrituras requeridas; ante una ejecución parcial debe reportar fallo o degradación.

Carga mínima sugerida para el evento de finalización:

```json
{
  "event_type": "market_prices_ingested",
  "run_id": "uuid-del-ejecutor",
  "price_date": "2026-09-22",
  "source": "proveedor_acordado",
  "status": "completed",
  "assets_expected": 2,
  "assets_updated": 2,
  "assets_failed": 0,
  "finished_at": "2026-09-22T21:30:00Z"
}
```

**No existe hoy una tabla, webhook ni RPC de orquestación en Supabase.** Andre y María deben acordar si esta señal será EventBridge, un webhook autenticado de n8n u otro mecanismo. El evento no debe incluir la Secret Key ni datos personales. Acordar si `assets_failed > 0` bloquea el cálculo o permite un procesamiento parcial explícito. Usar `run_id` para evitar repetir efectos al reintentar.

## 7. Validación de integración

1. Seleccionar dos portafolios con un ticker compartido: se hace **una consulta al proveedor** para ese ticker.
2. Guardar un cierre y repetir la misma corrida: una sola fila por activo/fecha/fuente.
3. Confirmar que `latest_asset_prices` muestra la fecha y precio esperados.
4. Simular un ticker sin precio: reportar `assets_failed`, evitar señalar una ejecución totalmente correcta.
5. Confirmar que el evento a María solo se emite después de escrituras completadas y verificadas.

## 8. Pendientes que Andre debe cerrar

- Entregar Project URL y una **Secret Key propia de este componente** por un medio privado.
- Comparar estas columnas, restricciones, políticas y vista con el `db pull` del proyecto real: las migraciones `001`–`004` son una reconstrucción y aún no se validaron contra un volcado remoto.
- Confirmar selección de portafolios `active` y proveedor/currency para cada ticker.
- Acordar política de corrección de precios, señal hacia María y manejo de ejecuciones parciales.

**Referencias:** [API keys de Supabase](https://supabase.com/docs/guides/getting-started/api-keys) · [Upsert con supabase-js](https://supabase.com/docs/reference/javascript/upsert).
