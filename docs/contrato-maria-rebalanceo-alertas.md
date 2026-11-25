# NetRebalance — Contrato de integración para María

**Módulo:** cálculo de rebalanceo y notificaciones · **Stack previsto:** n8n, JavaScript, Amazon SES o Resend · **Versión:** 1.0

## 1. Tu responsabilidad

1. Recibir la señal de finalización de la ingesta de precios de Jair.
2. Leer portafolios activos, posiciones, costos de brokers y último precio de cada activo.
3. Calcular valor y peso real de posiciones, compararlos con pesos objetivo y estimar operaciones/costos.
4. Evaluar una **regla de rentabilidad acordada** y enviar correo solo cuando `should_notify = true`.

La BD no contiene todavía una función SQL de rebalanceo, una tabla de recomendaciones, una tabla de notificaciones ni una regla definida para calcular `should_notify`. Tu flujo ejecuta esta lógica y necesita cerrar su fórmula con el equipo antes de presentar recomendaciones cuantitativas como resultado del producto.

## 2. Acceso desde n8n

Configurar credenciales en el almacén de credenciales/secretos de n8n, nunca en un nodo compartido, una URL, este archivo o el frontend:

```dotenv
SUPABASE_URL=https://qgcdnuoujlsdxblrdgqm.supabase.co
SUPABASE_SECRET_KEY=sb_secret_REEMPLAZAR
```

La Secret Key equivale al rol `service_role`: **omite RLS y ve portafolios de todos los usuarios**. Solicitar a Andre una clave nombrada exclusiva para el flujo de María, distinta de la de Jair, a fin de poder rotarla separadamente. Las dos seguirán teniendo el mismo alcance `service_role`; la separación de claves no crea permisos por tabla. Usar la clave solo en ejecuciones backend de n8n, nunca en una página Vue ni en solicitudes visibles en el navegador.

En n8n se puede usar una credencial Supabase compatible con Secret Key o una petición HTTP server-side a la API REST con `apikey: <SECRET_KEY>` y el esquema de autorización que requiera el nodo. Preferir el cliente `@supabase/supabase-js` en un servicio Node controlado si n8n no soporta claramente el formato nuevo `sb_secret_...`. **No poner la Secret Key como JWT Bearer:** las claves nuevas no son JWT. Probar la conexión desde un entorno de pruebas antes de configurar el flujo productivo.

El rol `service_role` tiene CRUD sobre tablas base y solo `SELECT` en `latest_asset_prices`. Para este módulo, **usar únicamente operaciones de lectura** sobre las tablas del contrato; el envío del correo sucede por el proveedor transaccional. Los GRANT de la BD no impiden que esta clave modifique datos; controles adicionales exigen otra arquitectura o credenciales de menor alcance.

## 3. Entradas para el cálculo

| Recurso | Campos necesarios | Uso |
| --- | --- | --- |
| `portfolios` | `id`, `user_id`, `broker_id`, `name`, `currency`, `status` | Seleccionar únicamente `active`; asociar usuario |
| `portfolio_assets` | `portfolio_id`, `asset_id`, `target_weight`, `quantity`, `average_cost` | Pesos objetivo y tenencias |
| `assets` | `id`, `ticker`, `currency`, `is_active` | Identidad del activo y moneda |
| `brokers` | `id`, `user_id`, `name`, `fixed_commission`, `percentage_commission`, `spread_percentage`, `currency` | Costos de transacción |
| `latest_asset_prices` | `asset_id`, `price`, `price_date`, `source` | Precio disponible más reciente |
| `asset_prices` | `asset_id`, `price`, `price_date`, `source` | Consulta histórica opcional; no es necesaria para el cálculo básico |
| `profiles` | `id`, `full_name` | Nombre opcional; **no contiene email** |

El enunciado inicial decía que Jair actualizaría `precio_actual` de `assets`; la base actual guarda precios en `asset_prices` y los expone por `latest_asset_prices`. El `target_weight` está en escala **0 a 100** (`60` = 60 %). `percentage_commission` y `spread_percentage` son **fracciones** (`0.001` = 0.1 %). `fixed_commission` es importe monetario en la moneda del broker. `quantity` es cantidad de unidades; `average_cost` es opcional y no sustituye el precio de mercado.

## 4. Lectura desde `supabase-js` en un proceso backend

El siguiente ejemplo representa las consultas que puede hacer n8n con sus nodos o un servicio Node. Necesita paginación si el proyecto supera los límites de filas por respuesta.

```ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Falta configuración Supabase del proceso');

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: portfolios, error } = await db
  .from('portfolios')
  .select(`
    id, user_id, broker_id, name, currency, status,
    brokers (id, user_id, name, currency, fixed_commission, percentage_commission, spread_percentage),
    portfolio_assets (
      id, asset_id, target_weight, quantity, average_cost,
      assets (id, ticker, currency, is_active)
    )
  `)
  .eq('status', 'active');
if (error) throw error;
```

En una segunda consulta, recuperar precios de los `asset_id` presentes:

```ts
const assetIds = [...new Set(
  (portfolios ?? []).flatMap(p => p.portfolio_assets.map(pa => pa.asset_id)),
)];

const prices = assetIds.length
  ? await db.from('latest_asset_prices')
      .select('asset_id,price,price_date,source')
      .in('asset_id', assetIds)
  : { data: [], error: null };
if (prices.error) throw prices.error;

const latestByAsset = new Map((prices.data ?? []).map(row => [row.asset_id, row]));
```

Para muchos activos, dividir `.in(...)` en lotes y paginar las consultas de portafolios y posiciones. Comprobar la forma de relaciones en la API remota antes de llevar esta consulta a producción; las consultas separadas son una opción si una relación resulta ambigua.

**El email del destinatario no figura en `public.profiles`.** `auth.users` es un esquema administrado, no una tabla pública para consultar con `.from('profiles')`. Andre debe definir un método backend autorizado para resolver `user_id → email` (por ejemplo, un componente controlado que use Admin Auth) y entregarlo antes de configurar los correos. No asumir que el correo llega desde `profiles` ni agregarlo en silencio al mensaje de salida.

## 5. Cálculo base y controles previos

Para cada portafolio activo, usar precios con fecha y fuente:

```text
valor_activo_i = quantity_i × price_i
valor_total = suma(valor_activo_i)
peso_real_i (%) = 100 × valor_activo_i / valor_total
desviación_i = peso_real_i − target_weight_i
```

Antes de calcular una recomendación, comprobar:

- Todos los activos necesarios tienen un precio y su `price_date` cumple la política de vigencia acordada.
- `valor_total > 0`; si todas las cantidades son cero, el peso real no está definido.
- La suma de pesos objetivo sigue siendo 100. El trigger actual valida la activación, pero **no vuelve a validarla si cambian posiciones después**.
- Monedas compatibles: `assets.currency`, `portfolios.currency` y `brokers.currency` pueden diferir; el esquema no guarda tipos de cambio. Acordar si se excluyen portafolios multimoneda o se añade conversión externa.
- Broker asociado cuando el cálculo requiere comisiones. `broker_id` admite `null` en el modelo.

**No está definida aún la fórmula que convierte desviaciones en operaciones ni el criterio de “rentabilidad positiva”.** Antes de implementar `should_notify`, acordar con Andre/negocio: umbral, capital objetivo, compras/ventas permitidas, cantidad mínima, tratamiento de posiciones con cantidad cero, costo fijo por orden, comisión variable, spread, divisa, redondeo y qué significa margen positivo. La existencia de los campos de broker no resuelve por sí sola esta decisión financiera.

Para cálculos y dinero, usar una biblioteca decimal o enteros escalados con reglas explícitas de redondeo; `number` de JavaScript puede introducir errores de coma flotante.

## 6. Señal de Jair y correo

Jair debe avisar **después de completar** las escrituras de precios. Acordar si el transporte será EventBridge, un webhook autenticado de n8n o un proceso intermedio. Hoy no hay una tabla/función de Supabase que emita automáticamente ese aviso.

Ejemplo de entrada deseada al flujo:

```json
{
  "event_type": "market_prices_ingested",
  "run_id": "uuid-del-ejecutor",
  "price_date": "2026-09-22",
  "status": "completed",
  "assets_expected": 2,
  "assets_updated": 2,
  "assets_failed": 0
}
```

Evitar enviar correos si la corrida es parcial o hay precios faltantes, salvo que el equipo defina una política explícita. Procesar cada `run_id` de manera idempotente. **La BD actual no tiene tabla de corridas ni envíos:** antes de prometer que un mismo usuario no recibirá dos correos tras un reintento, implementar deduplicación persistente en el orquestador u otro almacén acordado. Un estado temporal de un nodo n8n no basta para deduplicar entre ejecuciones.

Contenido mínimo del correo una vez aprobada la fórmula: nombre del portafolio, fecha/fuente de precios, activos afectados, cantidades o importes calculados, comisiones/spread estimados, supuestos y resultado neto. Presentarlo como cálculo informativo del MVP; no confundir estimación con una operación ejecutada en broker. El proyecto no realiza trades automáticos.

## 7. Casos de prueba de integración

1. Portafolio `draft` y `archived`: no genera cálculo ni correo.
2. Portafolio `active` con `VOO 60` y `QQQ 40`, precios vigentes y cantidades positivas: genera métricas verificables manualmente.
3. Un activo sin precio o precio desactualizado: no genera recomendación silenciosamente.
4. Broker `null` o moneda distinta: aplicación explícita de la política aprobada, nunca comisión cero por defecto sin decisión.
5. Repetir `run_id`: no duplicar correo.
6. Una corrida parcial de Jair: no etiquetarla como éxito completo.
7. Revisar al menos dos usuarios: el rol servicio puede leer ambos; los resultados y destinatarios nunca deben mezclarse.

## 8. Pendientes para Andre y el equipo

- Entregar a María Project URL y **su Secret Key dedicada**, mediante un canal privado.
- Confirmar con `db pull` que los campos/relaciones de este contrato coinciden con la base real.
- Definir resolución segura de email, canal de señal de Jair, vigencia de precios y deduplicación de envíos.
- Aprobar fórmula de rebalanceo, costos y umbral de `should_notify`, incluida política de divisas.
- Endurecer o definir edición de posiciones activas para preservar el 100 % en la base.

**Referencias:** [API keys de Supabase](https://supabase.com/docs/guides/getting-started/api-keys) · [Conexión PostgreSQL de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
