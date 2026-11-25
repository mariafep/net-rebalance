# NetRebalance — Contrato de Integración para n8n

Este documento define la interfaz técnica entre **n8n** (orquestador de evaluaciones, resúmenes con IA y notificaciones) y **Supabase** (base de datos PostgreSQL y motor matemático centralizado).

---

## 1. Contrato de Base de Datos y Motor (Supabase)

La lógica matemática de evaluación de portafolios, bandas de tolerancia (Regla 5/25), cálculo de comisiones y verificación de cooldown reside centralizada en PostgreSQL mediante el RPC `evaluate_portfolio_rebalance`. **n8n no debe recalcular pesos ni comisiones en nodos de código JavaScript**; debe invocar este RPC y consumir su respuesta.

### 1.1. Esquema de la tabla `public.rebalance_alerts`

| Columna | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, default `gen_random_uuid()` | Identificador único de la alerta. |
| `user_id` | `UUID` | `FK → auth.users(id)`, `NOT NULL` | Propietario del portafolio. |
| `portfolio_id` | `UUID` | `FK → public.portfolios(id)`, `NOT NULL` | Portafolio evaluado (`ON DELETE CASCADE`). |
| `run_id` | `UUID` | `NULL` | UUID de ejecución proveniente del webhook de la Lambda de ingesta. |
| `status` | `TEXT` | `NOT NULL`, default `'pending'`, `CHECK ('pending', 'executed', 'dismissed')` | Estado de gestión de la alerta por parte del usuario. |
| `trigger_reason` | `TEXT` | `NOT NULL` | Motivo de disparo (ej. `'rule_5_25'`, `'manual'`). |
| `max_deviation` | `NUMERIC` | `NOT NULL` | Máxima desviación absoluta observada (en puntos porcentuales). |
| `total_portfolio_value` | `NUMERIC` | `NOT NULL` | Valor total valorizado del portafolio al momento de la evaluación. |
| `estimated_cost` | `NUMERIC` | `NOT NULL` | Costo estimado total de transacción (fijo + variable + spread). |
| `cost_ratio` | `NUMERIC` | `NOT NULL` | Relación `estimated_cost / monto_operado` (en fracción, ej. `0.0085` = 0.85%). |
| `recommended_actions` | `JSONB` | `NOT NULL` | Arreglo `actions` devuelto por el RPC (`ticker`, `action`, `amount`, `current_weight`, `target_weight`, `deviation`). |
| `ai_summary` | `TEXT` | `NULL` | Resumen o recomendación redactada por IA generada en n8n. |
| `notified_at` | `TIMESTAMPTZ` | `NULL` | Marca de tiempo de envío del correo transaccional. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, default `now()` | Fecha de creación (usada para el índice de cooldown de 7 días). |

**Índice y Seguridad:**
- Índice compuesto `idx_rebalance_alerts_portfolio_created_at` sobre `(portfolio_id, created_at DESC)` para optimizar las consultas de cooldown e historial.
- **RLS:** Los usuarios autenticados (`authenticated`) solo pueden leer (`SELECT`) sus propias alertas y actualizar únicamente la columna `status` (`UPDATE (status)`). El rol `service_role` utilizado por n8n tiene acceso completo (`ALL`).

---

### 1.2. Invocación del RPC `evaluate_portfolio_rebalance` desde n8n

Para ejecutar el motor desde n8n usando la credencial **`service_role`** (`SUPABASE_SECRET_KEY`), utiliza un nodo **HTTP Request** o un nodo **Code (JavaScript)** con `@supabase/supabase-js`.

#### Vía HTTP Request (REST PostgREST)
- **Método:** `POST`
- **URL:** `https://<PROJECT_REF>.supabase.co/rest/v1/rpc/evaluate_portfolio_rebalance`
- **Headers:**
  ```json
  {
    "apikey": "{{ $env.SUPABASE_SECRET_KEY }}",
    "Authorization": "Bearer {{ $env.SUPABASE_SECRET_KEY }}",
    "Content-Type": "application/json"
  }
  ```
- **Body (JSON):**
  - Para rebalanceo tradicional (sin aporte de efectivo):
    ```json
    {
      "p_portfolio_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "p_cash_injection": 0
    }
    ```
  - Para rebalanceo por flujo de caja (solo compras con aporte nuevo):
    ```json
    {
      "p_portfolio_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "p_cash_injection": 500
    }
    ```

#### Vía SDK `@supabase/supabase-js` (Nodo Code)
```ts
const { data, error } = await supabase.rpc('evaluate_portfolio_rebalance', {
  p_portfolio_id: portfolioId,
  p_cash_injection: 0,
});
if (error) throw error;
```

---

### 1.3. Ejemplo de Respuesta JSON del RPC

```json
{
  "portfolio_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "mode": "traditional",
  "total_value": 10000.00,
  "cash_injection": 0.00,
  "has_significant_deviation": true,
  "estimated_cost": 14.50,
  "cost_ratio": 0.014500,
  "cost_acceptable": true,
  "in_cooldown": false,
  "should_notify": true,
  "max_deviation": 10.0000,
  "actions": [
    {
      "asset_id": "11111111-1111-1111-1111-111111111111",
      "ticker": "QQQ",
      "action": "SELL",
      "amount": 1000.00,
      "current_weight": 50.0000,
      "target_weight": 40.0000,
      "deviation": 10.0000,
      "is_deviated": true
    },
    {
      "asset_id": "22222222-2222-2222-2222-222222222222",
      "ticker": "VOO",
      "action": "BUY",
      "amount": 1000.00,
      "current_weight": 50.0000,
      "target_weight": 60.0000,
      "deviation": -10.0000,
      "is_deviated": true
    }
  ]
}
```

> **Interpretación clave:**
> - `should_notify` es `true` **únicamente** cuando `has_significant_deviation = true`, `cost_acceptable = true` (`cost_ratio <= 0.02`) y `in_cooldown = false` (sin alertas en los últimos 7 días).
> - Los campos `current_weight`, `target_weight` y `deviation` vienen en escala porcentual (`0` a `100`).

---

### 1.4. Persistencia de la Alerta y `ai_summary` desde n8n

Cuando el RPC devuelva `should_notify === true`:

1. **Generación de resumen con IA (opcional/recomendado):**
   n8n pasa el arreglo `actions`, el `risk_profile` y `investment_horizon` de `public.profiles` al nodo de LLM para redactar una explicación clara y personalizada en lenguaje natural.
2. **Envío de notificación:**
   Envía el correo transaccional (Amazon SES / Resend) con las instrucciones de compra/venta y el resumen generado.
3. **Registro en `public.rebalance_alerts`:**
   Realiza un `POST` hacia `/rest/v1/rebalance_alerts` usando `service_role` para persistir la alerta (lo cual también activa automáticamente la ventana de **cooldown de 7 días** para ese portafolio):

```json
{
  "user_id": "<portfolio.user_id>",
  "portfolio_id": "{{ $json.portfolio_id }}",
  "run_id": "<run_id_del_webhook_lambda>",
  "status": "pending",
  "trigger_reason": "rule_5_25",
  "max_deviation": "{{ $json.max_deviation }}",
  "total_portfolio_value": "{{ $json.total_value }}",
  "estimated_cost": "{{ $json.estimated_cost }}",
  "cost_ratio": "{{ $json.cost_ratio }}",
  "recommended_actions": "{{ $json.actions }}",
  "ai_summary": "<texto_generado_por_ia>",
  "notified_at": "{{ $now.toISO() }}"
}
```

---

## 2. Contrato de Webhook y Seguridad (AWS SAM → n8n)

Al finalizar la ingesta diaria de cotizaciones (EventBridge `cron(30 21 ? * MON-FRI *)`), la Lambda `MarketPriceIngestionFunction` de **OrbitPort SAM** notifica a n8n mediante una petición `HTTP POST` hacia `N8N_WEBHOOK_URL`.

### 2.1. Autenticación mediante Header `X-Webhook-Secret`

Todas las peticiones emitidas por la Lambda hacia n8n incluyen el header de seguridad compartido:

```http
Content-Type: application/json
User-Agent: OrbitPort-DataIngestion/1.0
X-Webhook-Secret: <N8N_WEBHOOK_SECRET>
```

**Configuración obligatoria en el nodo Webhook de n8n:**
1. Configurar **Authentication** como **Header Auth**.
2. **Name:** `X-Webhook-Secret`
3. **Value:** El mismo secreto configurado en el parámetro `N8nWebhookSecret` del stack AWS SAM.
4. Cualquier petición sin este header o con un valor distinto debe ser rechazada con `401 Unauthorized` / `403 Forbidden`.

---

### 2.2. Payload JSON Exacto Enviado por la Lambda

```json
{
  "event_type": "market_prices_ingested",
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "price_date": "2026-11-25",
  "source": "massive,yahoo_bvl",
  "status": "completed",
  "assets_expected": 10,
  "assets_updated": 10,
  "assets_failed": 0,
  "finished_at": "2026-11-25T21:30:18.420Z"
}
```

#### Valores posibles de `source`
| Valor | Significado |
| :--- | :--- |
| `massive` | Cotizaciones obtenidas en batch desde **Massive.com API** (Grouped Daily para activos EE. UU.). |
| `yahoo_us` | Cotizaciones de respaldo obtenidas desde **Yahoo Finance** (sin sufijo) cuando Massive Grouped Daily falla por cuota/timeout/permiso o no incluye un ticker de EE. UU. |
| `yahoo_bvl` | Cotizaciones obtenidas desde **Yahoo Finance** con sufijo `.LM` para activos de la **Bolsa de Valores de Lima (`exchange = 'BVL'`)**. |
| `massive,yahoo_bvl` / `massive,yahoo_us` | Ejecución mixta en la que intervinieron múltiples fuentes en el mismo ciclo. |

*(Nota: También pueden aparecer `polygon` o `alphavantage` si se cambia el parámetro `MarketDataProvider` en `template.yaml`).*

---

### 2.3. Manejo de Fallos Parciales (`assets_failed > 0`) en n8n

La Lambda continúa su ejecución aunque un ticker individual falle en la consulta externa, registrando los conteos en el payload:

1. **Verificación inicial tras el Webhook (Nodo `IF`):**
   - **Si `assets_failed === 0`:** Proceder normalmente con la lectura de portafolios `active` y la invocación de `evaluate_portfolio_rebalance`.
   - **Si `assets_failed > 0` y `assets_updated > 0` (Degradación parcial):**
     - **No cancelar todo el flujo**, pero **marcar la ejecución como degradada** en logs / alerta operativa al equipo técnico (incluyendo `run_id` y `price_date`).
     - Antes de emitir alertas a un usuario, verificar que el RPC `evaluate_portfolio_rebalance` no falle por precio faltante (si falta el precio de un activo perteneciente a un portafolio específico, el RPC lanzará error `22023` solo para ese portafolio; n8n debe capturar el error por portafolio con *Continue On Fail* para no bloquear la evaluación de los demás portafolios que sí tienen sus precios al día).
   - **Si `assets_updated === 0` y `assets_expected > 0` (Fallo total de fuentes de datos):**
     - Abortar la evaluación de portafolios para evitar recomendaciones con precios desactualizados y enviar una alerta técnica interna de incidente.

---

### 2.4. Resiliencia y Dead Letter Queue (AWS)

En caso de error no controlado o indisponibilidad temporal de red/Supabase:
- La invocación asíncrona desde EventBridge reintenta automáticamente hasta **2 veces** (`MaximumRetryAttempts: 2`) dentro de una ventana máxima de **1 hora** (`MaximumEventAgeInSeconds: 3600`).
- Si tras los reintentos la ejecución sigue fallando, el evento se deriva a la cola SQS **`PriceIngestionDLQ`** (retención de 14 días) para inspección y reprocesamiento manual.

---

## 3. Expectativas de UI para Alertas y Análisis IA (n8n → Frontend)

El componente [`AlertsView.vue`](file:///c:/Universidad/Agile/net-rebalance/src/views/AlertsView.vue) consume directamente `public.rebalance_alerts` y renderiza el análisis generado por n8n junto con las operaciones sugeridas.

### 3.1. Formato esperado en `ai_summary`

El campo `ai_summary` se renderiza dentro de la tarjeta **"Análisis IA"** respetando saltos de línea (`whitespace-pre-line`). Para asegurar legibilidad sin etiquetas HTML sin procesar:

- **Formato recomendado:** Texto plano limpio o párrafos cortos separados por `\n\n` (máximo 3–5 líneas o viñetas simples con `-` / `•`). Evitar HTML crudo (`<p>`, `<b>`, etc.).
- **Contenido sugerido en el prompt del LLM (n8n):**
  1. Diagnóstico breve del motivo de la alerta (mencionando la desviación máxima y el perfil de riesgo del usuario: `conservative`, `moderate` o `aggressive`).
  2. Resumen accionable de las operaciones sugeridas y el impacto del costo estimado (`<= 2%`).
  3. Recordatorio informativo de que NetRebalance no ejecuta órdenes automáticas.

**Ejemplo ideal de `ai_summary`:**
```text
Tu portafolio Moderado superó la banda de tolerancia (desviación máxima de 10.00 pp en QQQ).

Acción sugerida: Vender USD 1,000.00 de QQQ y comprar USD 1,000.00 de VOO para restaurar tu estrategia 75% Core / 25% Satellite. El costo estimado es de USD 14.50 (1.45%), dentro del límite rentable del 2%.

*Nota: Recomendación informativa; ejecuta las órdenes directamente en tu broker.*
```

*(Si n8n guarda `ai_summary` como `null`, la UI muestra automáticamente `"Pendiente de análisis contextual."`)*

---

### 3.2. Esquema JSON de `recommended_actions` que renderiza la tabla

El arreglo `recommended_actions` almacenado en `rebalance_alerts` debe corresponder exactamente al arreglo `actions` devuelto por `evaluate_portfolio_rebalance`:

```json
[
  {
    "asset_id": "11111111-1111-1111-1111-111111111111",
    "ticker": "QQQ",
    "action": "SELL",
    "amount": 1000.00,
    "current_weight": 50.0000,
    "target_weight": 40.0000,
    "deviation": 10.0000,
    "is_deviated": true
  }
]
```

| Campo | Tipo | Uso en `AlertsView.vue` |
| :--- | :--- | :--- |
| `ticker` | `string` | Columna **Ticker** |
| `action` | `'BUY' \| 'SELL' \| 'HOLD'` | Badge **Comprar** / **Vender** / **Mantener** |
| `amount` | `number` | Columna **Monto** (formateado a 2 decimales con moneda del portafolio) |
| `current_weight` | `number` | Columna **Peso actual** (`%`) |
| `target_weight` | `number` | Columna **Peso objetivo** (`%`) |
| `deviation` | `number` | Columna **Desviación** (en puntos porcentuales `pp`) |

---

### 3.3. Checklist de Validación End-to-End (Workflow n8n)

- [ ] **Seguridad Webhook:** El nodo Webhook de n8n valida el header `X-Webhook-Secret` contra `N8nWebhookSecret`.
- [ ] **Manejo de degradación:** Si `assets_failed > 0`, n8n registra advertencia y continúa evaluando portafolios con *Continue On Fail* por portafolio.
- [ ] **Evaluación centralizada:** n8n invoca `POST /rest/v1/rpc/evaluate_portfolio_rebalance` con `p_portfolio_id` y `p_cash_injection = 0` usando `service_role`.
- [ ] **Filtro de notificación:** Solo continúa si `should_notify === true` (desviación 5/25 activa, costo `<= 2%` y `in_cooldown === false`).
- [ ] **Contexto de Perfil:** Lee `risk_profile` e `investment_horizon` desde `public.profiles` para enriquecer el prompt de `ai_summary`.
- [ ] **Persistencia e Idempotencia:** Inserta el registro en `public.rebalance_alerts` con `status: 'pending'`, `recommended_actions: $json.actions`, `ai_summary` y `notified_at`.
- [ ] **Verificación en Frontend:** El contador de alertas pendientes en `DashboardView.vue` incrementa, la tarjeta aparece en `/alerts` y el usuario puede marcarla como `executed` o `dismissed`.
